"""Runtime config.yaml read/write helpers for the admin API.

The admin panel edits a whitelisted subset of config.yaml at runtime. The
file is a single-file Docker bind mount, so writes are done in place
(truncate + rewrite) rather than by atomic rename, which would break the
mount. Note: rewriting drops YAML comments - values are the source of truth.
"""

import copy
import re

import yaml

from app.config import settings

# Sections and keys the admin panel may update via PUT /admin/config.
# Everything else (domains, admin.token, database.url, server.api_*,
# server.mx_port, server.hostname, tls.*) is managed elsewhere or
# intentionally read-only here.
ALLOWED_PATCH_SECTIONS = {
    'server': {'max_message_size_mb', 'docs_enabled', 'hostname'},
    'tempmail': {
        'address_lifetime_hours', 'max_emails_per_address',
        'cleanup_interval_hours', 'address_format',
        'allow_custom_usernames', 'min_username_length',
        'max_username_length', 'reserved_usernames', 'max_storage_mb',
    },
    'validation': {'check_dkim', 'check_spf', 'check_dmarc', 'store_results'},
    'cors': {'allow_origins', 'allow_credentials', 'allow_methods', 'allow_headers'},
    'database': {'pool_size', 'max_overflow'},
    'admin': {'token'},
    'tls': {'enabled'},
    'web': {'hostname', 'allow_ip_access'},
}

_INT_KEYS = {
    ('server', 'max_message_size_mb'),
    ('tempmail', 'address_lifetime_hours'),
    ('tempmail', 'max_emails_per_address'),
    ('tempmail', 'cleanup_interval_hours'),
    ('tempmail', 'min_username_length'),
    ('tempmail', 'max_username_length'),
    ('tempmail', 'max_storage_mb'),
    ('database', 'pool_size'),
    ('database', 'max_overflow'),
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
    ('database', 'pool_size'),
    ('database', 'max_overflow'),
}


def read_config() -> dict:
    """Read the current config.yaml as a plain dict."""
    with open(settings.CONFIG_PATH, 'r') as f:
        return yaml.safe_load(f) or {}


def write_config(config: dict) -> None:
    """Rewrite config.yaml in place (truncate + write)."""
    with open(settings.CONFIG_PATH, 'w') as f:
        yaml.safe_dump(config, f, sort_keys=False, default_flow_style=False)


def mask_config(config: dict) -> dict:
    """Return a copy of the config with secrets masked."""
    masked = copy.deepcopy(config)

    # Mask password inside database.url
    url = masked.get('database', {}).get('url')
    if isinstance(url, str):
        masked['database']['url'] = re.sub(
            r'://([^:/@]+):([^@]+)@', r'://\1:***@', url
        )

    # Mask admin token
    if isinstance(masked.get('admin'), dict):
        masked['admin']['token'] = '***'

    return masked


def apply_patch(config: dict, patch: dict) -> None:
    """Deep-merge whitelisted keys from `patch` into `config` in place.

    Raises ValueError with a human-readable message for invalid keys/values.
    """
    if not isinstance(patch, dict):
        raise ValueError('patch 必须是对象')

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
                if k == ('tempmail', 'max_storage_mb') and value < 0:
                    raise ValueError('max_storage_mb 必须 >= 0（0 表示不限制）')
            if k in _BOOL_KEYS and not isinstance(value, bool):
                raise ValueError(f'{section}.{key} 必须是布尔值')
            if k in _LIST_KEYS and (
                not isinstance(value, list) or not all(isinstance(v, str) for v in value)
            ):
                raise ValueError(f'{section}.{key} 必须是字符串列表')
            if k == ('server', 'hostname') and (
                not isinstance(value, str) or not value.strip()
            ):
                raise ValueError('server.hostname 不能为空')
            if k == ('web', 'hostname') and not isinstance(value, str):
                raise ValueError('web.hostname 必须是字符串（留空表示不单独配置面板域名）')
            if k == ('admin', 'token') and (
                not isinstance(value, str) or not 8 <= len(value.strip()) <= 128
            ):
                raise ValueError('admin.token 必须是 8-128 字符的字符串')

            # Consistency: username length bounds
            if k == ('tempmail', 'min_username_length') and value > config.get('tempmail', {}).get('max_username_length', 64):
                raise ValueError('min_username_length 不能大于 max_username_length')
            if k == ('tempmail', 'max_username_length') and value < config.get('tempmail', {}).get('min_username_length', 3):
                raise ValueError('max_username_length 不能小于 min_username_length')

            config.setdefault(section, {})[key] = value
