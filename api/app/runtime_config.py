"""Runtime config.yaml read/write helpers for the admin API.

The admin panel edits a whitelisted subset of config.yaml at runtime. The
file is a single-file Docker bind mount, so writes are done in place
(truncate + rewrite) rather than by atomic rename, which would break the
mount. Note: rewriting drops YAML comments - values are the source of truth.
"""

import copy
import os
import re
import shutil
import threading

import yaml

from app.config import settings

# Serializes read-modify-write cycles for config.yaml. Two concurrent PUTs
# would otherwise lose one of the updates, and a reader (or the MX/nginx
# watchers) could observe a half-written file.
_CONFIG_LOCK = threading.RLock()

# Sections whose values are only applied at process start: changing them is
# persisted and picked up by nginx/the next boot, but the running API keeps the
# old values. The panel tells the operator instead of pretending otherwise.
RESTART_REQUIRED_KEYS = {
    ('cors', 'allow_origins'), ('cors', 'allow_credentials'),
    ('cors', 'allow_methods'), ('cors', 'allow_headers'),
    ('database', 'pool_size'), ('database', 'max_overflow'),
    ('server', 'max_message_size_mb'),
}

# Sections and keys the admin panel may update via PUT /admin/config.
# Everything else (domains, database.url, server.api_*, server.mx_port,
# tempmail.permanent_email_retention_days, setup.*) is managed elsewhere or
# intentionally read-only here.
ALLOWED_PATCH_SECTIONS = {
    'server': {'max_message_size_mb', 'docs_enabled', 'hostname'},
    'tempmail': {
        'address_lifetime_hours', 'max_emails_per_address',
        'cleanup_interval_hours', 'address_format',
        'allow_custom_usernames', 'min_username_length',
        'max_username_length', 'reserved_usernames', 'max_storage_mb',
        'permanent_email_retention_days', 'max_permanent_addresses',
    },
    'validation': {'check_dkim', 'check_spf', 'check_dmarc', 'store_results'},
    'cors': {'allow_origins', 'allow_credentials', 'allow_methods', 'allow_headers'},
    'database': {'pool_size', 'max_overflow'},
    'admin': {'token'},
    'tls': {'enabled'},
    'web': {'hostname', 'allow_ip_access'},
    # Per-IP requests per minute; 0 disables that limit.
    'rate_limits': {
        'address_create_per_minute', 'permanent_create_per_minute',
        'api_create_per_minute', 'setup_per_minute',
        'admin_per_minute', 'email_read_per_minute',
    },
}

_INT_KEYS = {
    ('server', 'max_message_size_mb'),
    ('tempmail', 'address_lifetime_hours'),
    ('tempmail', 'max_emails_per_address'),
    ('tempmail', 'cleanup_interval_hours'),
    ('tempmail', 'min_username_length'),
    ('tempmail', 'max_username_length'),
    ('tempmail', 'max_storage_mb'),
    ('tempmail', 'permanent_email_retention_days'),
    ('tempmail', 'max_permanent_addresses'),
    ('database', 'pool_size'),
    ('database', 'max_overflow'),
    ('rate_limits', 'address_create_per_minute'),
    ('rate_limits', 'permanent_create_per_minute'),
    ('rate_limits', 'api_create_per_minute'),
    ('rate_limits', 'setup_per_minute'),
    ('rate_limits', 'admin_per_minute'),
    ('rate_limits', 'email_read_per_minute'),
}

_BOOL_KEYS = {
    ('server', 'docs_enabled'),
    ('tempmail', 'allow_custom_usernames'),
    ('validation', 'check_dkim'),
    ('validation', 'check_spf'),
    ('validation', 'check_dmarc'),
    ('validation', 'store_results'),
    ('cors', 'allow_credentials'),
    ('tls', 'enabled'),
    ('web', 'allow_ip_access'),
}

_LIST_KEYS = {
    ('tempmail', 'reserved_usernames'),
    ('cors', 'allow_origins'),
    ('cors', 'allow_methods'),
    ('cors', 'allow_headers'),
}

# Minimum values for integer settings (must be >= 1)
_POSITIVE_INT_KEYS = {
    ('server', 'max_message_size_mb'),
    ('tempmail', 'address_lifetime_hours'),
    ('tempmail', 'max_emails_per_address'),
    ('tempmail', 'cleanup_interval_hours'),
    ('tempmail', 'min_username_length'),
    ('tempmail', 'max_username_length'),
    ('tempmail', 'permanent_email_retention_days'),
    ('tempmail', 'max_permanent_addresses'),
    ('database', 'pool_size'),
    ('database', 'max_overflow'),
}

# Hostname syntax accepted for server.hostname / web.hostname. Kept in sync
# with the validation in api/app/routers/admin.py; the values end up in the
# generated nginx config and in the certbot command line, so anything that is
# not a plain DNS name must be rejected here.
_HOSTNAME_RE = re.compile(
    r'^(?=.{1,253}$)([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$'
)

# Keys whose values are secrets: masked (and never logged) wherever the config
# is echoed back to a client. Matching is by key name so a new secret key is
# covered automatically.
_SECRET_KEY_RE = re.compile(r'(password|passwd|secret|token|api_?key|private_?key)', re.I)


def _mask_secrets(node):
    """Recursively replace values of secret-looking keys with '***'."""
    if isinstance(node, dict):
        out = {}
        for key, value in node.items():
            if isinstance(key, str) and _SECRET_KEY_RE.search(key) and isinstance(value, (str, int, float)):
                out[key] = '***'
            else:
                out[key] = _mask_secrets(value)
        return out
    if isinstance(node, list):
        return [_mask_secrets(v) for v in node]
    return node


def read_config() -> dict:
    """Read the current config.yaml as a plain dict.

    Falls back to the previous good copy (`config.yaml.bak`) when the file is
    unreadable or corrupt, so a crash in the middle of a write cannot leave the
    service unable to start.
    """
    with _CONFIG_LOCK:
        try:
            with open(settings.CONFIG_PATH, 'r') as f:
                parsed = yaml.safe_load(f)
            if isinstance(parsed, dict) and parsed:
                return parsed
        except (OSError, yaml.YAMLError):
            pass

        backup = settings.CONFIG_PATH + '.bak'
        try:
            with open(backup, 'r') as f:
                parsed = yaml.safe_load(f)
            if isinstance(parsed, dict) and parsed:
                return parsed
        except (OSError, yaml.YAMLError):
            return {}


def write_config(config: dict) -> None:
    """Rewrite config.yaml (truncate + write) with a backup of the previous content.

    The file is a single-file bind mount, so it cannot be replaced by rename -
    the mount would keep pointing at the old inode. A copy of the current
    content is kept next to it as `config.yaml.bak` so a failed write (or a
    crash mid-write) leaves something to recover from.
    """
    with _CONFIG_LOCK:
        path = settings.CONFIG_PATH
        try:
            if os.path.exists(path) and os.path.getsize(path) > 0:
                shutil.copyfile(path, path + '.bak')
        except OSError:
            pass
        with open(path, 'w') as f:
            yaml.safe_dump(config, f, sort_keys=False, default_flow_style=False)
            f.flush()
            os.fsync(f.fileno())


def mask_config(config: dict) -> dict:
    """Return a copy of the config with every secret value masked.

    Masks by key name (token/api_key/secret/password/...) so newly added
    secrets are covered without touching this function, and additionally
    rewrites the password inside database.url, whose value is a DSN rather
    than a bare secret.
    """
    masked = copy.deepcopy(config)

    # Mask password inside database.url
    url = masked.get('database', {}).get('url')
    if isinstance(url, str):
        masked['database']['url'] = re.sub(
            r'://([^:/@]+):([^@]+)@', r'://\1:***@', url
        )

    return _mask_secrets(masked)


def apply_patch(config: dict, patch: dict) -> set:
    """Deep-merge whitelisted keys from `patch` into `config` in place.

    Returns the set of (section, key) pairs that actually changed. Raises
    ValueError with a human-readable message for invalid keys/values.
    """
    if not isinstance(patch, dict):
        raise ValueError('patch must be an object')

    changed: set = set()

    for section, values in patch.items():
        if section not in ALLOWED_PATCH_SECTIONS:
            raise ValueError(f'不允许修改的配置段: {section}')
        if not isinstance(values, dict):
            raise ValueError(f'配置段 {section} 必须是对象')

        for key, value in values.items():
            if key not in ALLOWED_PATCH_SECTIONS[section]:
                raise ValueError(f'不允许修改的配置项: {section}.{key}')

            k = (section, key)
            if k in _INT_KEYS:
                if isinstance(value, bool) or not isinstance(value, int):
                    raise ValueError(f'{section}.{key} 必须是整数')
                if k in _POSITIVE_INT_KEYS and value < 1:
                    raise ValueError(f'{section}.{key} 必须 >= 1')
                if section == 'rate_limits' and value < 0:
                    raise ValueError('限流值不能为负数（0 表示关闭该限制）')
                if k == ('tempmail', 'max_storage_mb') and value < 0:
                    raise ValueError('max_storage_mb 必须 >= 0（0 表示不限制）')
            if k in _BOOL_KEYS and not isinstance(value, bool):
                raise ValueError(f'{section}.{key} 必须是布尔值')
            if k in _LIST_KEYS and (
                not isinstance(value, list) or not all(isinstance(v, str) for v in value)
            ):
                raise ValueError(f'{section}.{key} 必须是字符串列表')
            if k == ('server', 'hostname') and (
                not isinstance(value, str) or not _HOSTNAME_RE.match(value.strip())
            ):
                raise ValueError('server.hostname 必须是合法主机名（如 mx.example.com）')
            if k == ('web', 'hostname') and (
                not isinstance(value, str)
                or (value.strip() and not _HOSTNAME_RE.match(value.strip()))
            ):
                raise ValueError('web.hostname 必须是合法主机名，或留空表示不单独配置面板域名')
            if k == ('admin', 'token') and (
                not isinstance(value, str) or not 8 <= len(value.strip()) <= 128
            ):
                raise ValueError('admin.token 必须是 8-128 字符的字符串')

            # Consistency: username length bounds
            if k == ('tempmail', 'min_username_length') and value > config.get('tempmail', {}).get('max_username_length', 64):
                raise ValueError('min_username_length 不能大于 max_username_length')
            if k == ('tempmail', 'max_username_length') and value < config.get('tempmail', {}).get('min_username_length', 3):
                raise ValueError('max_username_length 不能小于 min_username_length')

            if k in (('server', 'hostname'), ('web', 'hostname')) and isinstance(value, str):
                value = value.strip().lower()

            if config.get(section, {}).get(key) != value:
                changed.add(k)
            config.setdefault(section, {})[key] = value

    # Consistency: the restricted-panel mode only means anything when a panel
    # hostname is configured. Without it nginx would serve every host (fail
    # open) while the panel claimed access was restricted.
    web = config.get('web', {})
    if web.get('allow_ip_access') is False and not (web.get('hostname') or '').strip():
        raise ValueError(
            'web.allow_ip_access 不能在没有 web.hostname 时关闭（否则无法限制访问）'
        )

    return changed


# Where nginx reads its settings from. Kept in a shared volume so the web
# container never needs the full config.yaml (DB password, admin token).
WEB_CONFIG_PATH = os.getenv('WEB_CONFIG_PATH', '/web-config/web-config.env')


def write_web_config() -> None:
    """Write the nginx-relevant subset of the config as KEY=value lines.

    Sourcing a tiny generated file is both safer (no secrets reach the web
    container) and more robust than the previous sed-based YAML scraping.
    """
    config = read_config()
    web = config.get('web', {}) or {}
    server = config.get('server', {}) or {}
    tls = config.get('tls', {}) or {}

    hostname = str(web.get('hostname', '') or '').strip()
    allow_ip = web.get('allow_ip_access', True)
    lines = [
        '# Generated by the api container. Do not edit.',
        f'WEB_HOSTNAME={hostname}',
        f'ALLOW_IP={"true" if allow_ip is not False else "false"}',
        f'TLS_ENABLED={"true" if tls.get("enabled") else "false"}',
        f'DOCS_ENABLED={"true" if server.get("docs_enabled", True) else "false"}',
    ]

    directory = os.path.dirname(WEB_CONFIG_PATH)
    if directory:
        os.makedirs(directory, exist_ok=True)
    tmp = WEB_CONFIG_PATH + '.tmp'
    with open(tmp, 'w') as f:
        f.write(chr(10).join(lines) + chr(10))
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, WEB_CONFIG_PATH)
