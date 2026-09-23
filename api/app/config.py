"""Configuration management using YAML file"""

import os
from typing import List
import yaml


class Config:
    """Application configuration loaded from YAML file"""

    def __init__(self, config_path: str):
        self.CONFIG_PATH: str = config_path
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f) or {}
        self._apply(config)

    def _apply(self, config: dict) -> None:
        """Apply a parsed YAML dict onto this instance.

        Used both at startup and by reload_settings() for hot reload: the
        attributes are updated in place because other modules bind the
        instance via `from app.config import settings`.
        """
        # Domains
        self.DOMAINS: List[str] = config.get('domains', [])

        # Admin
        admin_config = config.get('admin', {})
        self.ADMIN_TOKEN: str = admin_config.get('token', '')

        # First-run setup wizard flag
        setup_config = config.get('setup', {})
        self.SETUP_INITIALIZED: bool = setup_config.get('initialized', False)

        # Database
        db_config = config.get('database', {})
        self.DATABASE_URL: str = db_config.get('url', '')
        self.DB_POOL_SIZE: int = db_config.get('pool_size', 10)
        self.DB_MAX_OVERFLOW: int = db_config.get('max_overflow', 20)

        # Server
        server_config = config.get('server', {})
        self.API_HOST: str = server_config.get('api_host', '127.0.0.1')
        self.API_PORT: int = server_config.get('api_port', 8000)
        self.MX_PORT: int = server_config.get('mx_port', 25)
        self.MAX_MESSAGE_SIZE_MB: int = server_config.get('max_message_size_mb', 10)
        self.HOSTNAME: str = server_config.get('hostname', 'mail.tempmail.local')
        self.DOCS_ENABLED: bool = server_config.get('docs_enabled', True)

        # Tempmail settings
        tempmail_config = config.get('tempmail', {})
        self.ADDRESS_LIFETIME_HOURS: int = tempmail_config.get('address_lifetime_hours', 24)
        self.MAX_EMAILS_PER_ADDRESS: int = tempmail_config.get('max_emails_per_address', 100)
        self.CLEANUP_INTERVAL_HOURS: int = tempmail_config.get('cleanup_interval_hours', 1)
        self.ADDRESS_FORMAT: str = tempmail_config.get('address_format', 'random')
        self.ALLOW_CUSTOM_USERNAMES: bool = tempmail_config.get('allow_custom_usernames', True)
        self.MIN_USERNAME_LENGTH: int = tempmail_config.get('min_username_length', 3)
        self.MAX_USERNAME_LENGTH: int = tempmail_config.get('max_username_length', 64)
        # Global storage cap in MB (0 = unlimited). When total email size
        # exceeds this, the cleanup loop deletes oldest emails first.
        self.MAX_STORAGE_MB: int = tempmail_config.get('max_storage_mb', 1024)
        self.RESERVED_USERNAMES: List[str] = tempmail_config.get('reserved_usernames', [
            'admin', 'postmaster', 'abuse', 'noreply', 'no-reply',
            'root', 'webmaster', 'hostmaster', 'mailer-daemon',
            'info', 'support', 'security', 'sales', 'contact'
        ])

        # Validation
        validation_config = config.get('validation', {})
        self.CHECK_DKIM: bool = validation_config.get('check_dkim', True)
        self.CHECK_SPF: bool = validation_config.get('check_spf', True)
        self.CHECK_DMARC: bool = validation_config.get('check_dmarc', True)
        self.STORE_VALIDATION_RESULTS: bool = validation_config.get('store_results', True)

        # TLS
        tls_config = config.get('tls', {})
        self.TLS_ENABLED: bool = tls_config.get('enabled', False)
        self.TLS_CERT_FILE: str = tls_config.get('cert_file', '/config/certs/cert.pem')
        self.TLS_KEY_FILE: str = tls_config.get('key_file', '/config/certs/key.pem')

        # Web panel access domain (used for the panel HTTPS certificate)
        web_config = config.get('web', {})
        self.WEB_HOSTNAME: str = web_config.get('hostname', '')
        self.WEB_ALLOW_IP_ACCESS: bool = web_config.get('allow_ip_access', True)

        # Integration API key (for creating permanent mailboxes via API)
        integration_config = config.get('integration', {})
        self.INTEGRATION_API_KEY: str = integration_config.get('api_key', '')

        # Email retention for permanent mailboxes (days; address itself is kept forever)
        self.PERMANENT_EMAIL_RETENTION_DAYS: int = tempmail_config.get('permanent_email_retention_days', 30)
        # Cap on how many permanent mailboxes may exist (0 = unlimited). Keeps
        # the public creation endpoint from filling the database forever.
        self.MAX_PERMANENT_ADDRESSES: int = tempmail_config.get('max_permanent_addresses', 0)

        # Logging
        logging_config = config.get('logging', {})
        self.LOG_LEVEL: str = logging_config.get('level', 'info')
        self.LOG_FORMAT: str = logging_config.get('format', 'json')

        # CORS - safe by default: no cross-origin access unless the operator
        # opts in. A wildcard combined with credentials is never produced
        # (browsers reject that pair, and it would expose the API to any site).
        cors_config = config.get('cors', {})
        self.CORS_ALLOW_ORIGINS: List[str] = cors_config.get('allow_origins', [])
        self.CORS_ALLOW_CREDENTIALS: bool = cors_config.get('allow_credentials', False)
        self.CORS_ALLOW_METHODS: List[str] = cors_config.get('allow_methods', ['*'])
        self.CORS_ALLOW_HEADERS: List[str] = cors_config.get('allow_headers', ['*'])
        if '*' in self.CORS_ALLOW_ORIGINS and self.CORS_ALLOW_CREDENTIALS:
            # Refuse the unsafe combination instead of silently shipping it.
            self.CORS_ALLOW_CREDENTIALS = False

        # One-time key required by the setup wizard while the instance is
        # uninitialized. Generated by setup.sh / the first container start.
        self.SETUP_KEY: str = setup_config.get('key', '')

        # Rate limits, per client IP, in requests per minute (0 disables the
        # limit). Values are read on every request, so the admin panel can tune
        # them without a restart. Creation limits are deliberately roomy: they
        # are per IP, and several people can share one (office NAT, mobile
        # carrier), while abuse is already bounded by the mailbox/address caps.
        rl = config.get('rate_limits', {})
        self.RL_ADDRESS_CREATE: int = rl.get('address_create_per_minute', 30)
        self.RL_PERMANENT_CREATE: int = rl.get('permanent_create_per_minute', 20)
        self.RL_API_CREATE: int = rl.get('api_create_per_minute', 60)
        self.RL_SETUP: int = rl.get('setup_per_minute', 5)
        self.RL_ADMIN: int = rl.get('admin_per_minute', 120)
        self.RL_EMAIL_READ: int = rl.get('email_read_per_minute', 300)


def load_config() -> Config:
    """Load configuration from YAML file"""
    # In test mode, return a minimal test configuration
    if os.getenv('TESTING'):
        return create_test_config()

    config_path = os.getenv('CONFIG_PATH', '/config/config.yaml')

    # For local development, try relative path
    if not os.path.exists(config_path):
        config_path = os.path.join(os.path.dirname(__file__), '..', '..', 'config.yaml')

    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    return Config(config_path)


def reload_settings() -> Config:
    """Re-read config.yaml and update the global settings singleton in place.

    Raises ValueError if the file is missing or the parsed config is invalid.
    """
    if os.getenv('TESTING'):
        return settings

    with open(settings.CONFIG_PATH, 'r') as f:
        config = yaml.safe_load(f) or {}

    if not isinstance(config, dict):
        raise ValueError('config.yaml must be a YAML mapping')

    if not config.get('domains'):
        raise ValueError('config.yaml must contain at least one domain')

    settings._apply(config)
    return settings


def create_test_config() -> Config:
    """Create a minimal configuration for testing"""
    # Create a mock config object without requiring a file
    config = Config.__new__(Config)

    config.CONFIG_PATH = '/tmp/test-config.yaml'

    # Set minimal test values
    config.DOMAINS = ['tempmail.example.com']
    config.ADMIN_TOKEN = 'test-admin-token'
    config.SETUP_INITIALIZED = True
    config.SETUP_KEY = ''
    config.RL_ADDRESS_CREATE = 30
    config.RL_PERMANENT_CREATE = 20
    config.RL_API_CREATE = 60
    config.RL_SETUP = 5
    config.RL_ADMIN = 120
    config.RL_EMAIL_READ = 300
    config.DATABASE_URL = 'sqlite:///:memory:'
    config.DB_POOL_SIZE = 5
    config.DB_MAX_OVERFLOW = 10
    config.API_HOST = '127.0.0.1'
    config.API_PORT = 8000
    config.MX_PORT = 25
    config.MAX_MESSAGE_SIZE_MB = 10
    config.HOSTNAME = 'mail.test.local'
    config.DOCS_ENABLED = True
    config.ADDRESS_LIFETIME_HOURS = 24
    config.MAX_EMAILS_PER_ADDRESS = 100
    config.CLEANUP_INTERVAL_HOURS = 1
    config.ADDRESS_FORMAT = 'random'
    config.ALLOW_CUSTOM_USERNAMES = True
    config.MIN_USERNAME_LENGTH = 3
    config.MAX_USERNAME_LENGTH = 64
    config.MAX_STORAGE_MB = 0
    config.RESERVED_USERNAMES = [
        'admin', 'postmaster', 'abuse', 'noreply', 'no-reply',
        'root', 'webmaster', 'hostmaster', 'mailer-daemon',
        'info', 'support', 'security', 'sales', 'contact'
    ]
    config.CHECK_DKIM = False
    config.CHECK_SPF = False
    config.CHECK_DMARC = False
    config.STORE_VALIDATION_RESULTS = False
    config.TLS_ENABLED = False
    config.TLS_CERT_FILE = '/tmp/nonexistent-cert.pem'
    config.TLS_KEY_FILE = '/tmp/nonexistent-key.pem'
    config.WEB_HOSTNAME = ''
    config.WEB_ALLOW_IP_ACCESS = True
    config.INTEGRATION_API_KEY = 'test-integration-key'
    config.PERMANENT_EMAIL_RETENTION_DAYS = 30
    config.MAX_PERMANENT_ADDRESSES = 0
    config.LOG_LEVEL = 'info'
    config.LOG_FORMAT = 'json'
    config.CORS_ALLOW_ORIGINS = ['*']
    config.CORS_ALLOW_CREDENTIALS = True
    config.CORS_ALLOW_METHODS = ['*']
    config.CORS_ALLOW_HEADERS = ['*']

    return config


# Global config instance
settings = load_config()
