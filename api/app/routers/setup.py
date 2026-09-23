"""First-run setup wizard endpoints.

The setup endpoint is usable only while the service is uninitialized
(setup.initialized: false in config.yaml). Because the instance is reachable
from the internet before the wizard runs, completing it additionally requires
the one-time setup key that the server generates at first start (printed in
the API container log and shown by setup.sh). After the wizard completes,
further configuration changes go through the authenticated admin panel.
"""

import hmac
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request

from app.config import reload_settings, settings
from app.rate_limit import ip_rate_limit
from app.runtime_config import read_config, write_config, write_web_config
from app.schemas.setup import SetupCompleteRequest, SetupCompleteResponse, SetupStatus

router = APIRouter(prefix='/api/v1/setup', tags=['setup'])

# Tight limit: this endpoint writes the server config while unauthenticated.
setup_rate_limit = ip_rate_limit(limit=5, window_seconds=60, scope='setup', setting_name='RL_SETUP')


def ensure_setup_key(config: dict) -> str:
    """Return the setup key, generating and persisting one when missing.

    Called at startup so an uninitialized instance always has a key that only
    someone with server access (docker logs / setup.sh output) can read.
    """
    setup_section = config.setdefault('setup', {})
    key = setup_section.get('key') or ''
    if not key:
        key = secrets.token_urlsafe(24)
        setup_section['key'] = key
        write_config(config)
    return key


@router.get('/status', response_model=SetupStatus)
def setup_status():
    """Return whether the first-run setup wizard has been completed and the
    configured panel access domain (used by the frontend to prompt users
    accessing via the MX hostname or an IP)."""
    return SetupStatus(
        initialized=settings.SETUP_INITIALIZED,
        web_hostname=settings.WEB_HOSTNAME,
        setup_key_required=bool(settings.SETUP_KEY),
        permanent_email_retention_days=settings.PERMANENT_EMAIL_RETENTION_DAYS,
    )


@router.post('/complete', response_model=SetupCompleteResponse)
def complete_setup(
    request: SetupCompleteRequest,
    req: Request,
    _: None = Depends(setup_rate_limit),
):
    """Write the initial configuration and mark the wizard complete.

    Only callable while uninitialized, and only with the server's one-time
    setup key. Generates a random admin token when none is supplied and
    returns it (it is only shown this once).
    """
    if settings.SETUP_INITIALIZED:
        raise HTTPException(
            status_code=403,
            detail='Setup has already been completed; use the admin panel to change configuration',
        )

    config = read_config()
    expected_key = (config.get('setup') or {}).get('key') or settings.SETUP_KEY
    supplied_key = (request.setup_key or '').strip()
    if not expected_key:
        expected_key = ensure_setup_key(config)
    if not supplied_key or not hmac.compare_digest(supplied_key, expected_key):
        raise HTTPException(
            status_code=403,
            detail='Invalid or missing setup key (see the api container log or setup.sh output)',
        )

    config['domains'] = request.domains
    config.setdefault('server', {})['hostname'] = request.hostname

    if request.web_hostname:
        config.setdefault('web', {})['hostname'] = request.web_hostname

    admin_token = (request.admin_token or secrets.token_urlsafe(18)).strip()
    config.setdefault('admin', {})['token'] = admin_token

    tempmail = config.setdefault('tempmail', {})
    if request.address_lifetime_hours is not None:
        if request.address_lifetime_hours < 1:
            raise HTTPException(status_code=400, detail='address_lifetime_hours must be >= 1')
        tempmail['address_lifetime_hours'] = request.address_lifetime_hours
    if request.max_storage_mb is not None:
        if request.max_storage_mb < 0:
            raise HTTPException(status_code=400, detail='max_storage_mb must be >= 0 (0 = unlimited)')
        tempmail['max_storage_mb'] = request.max_storage_mb
    if request.allow_custom_usernames is not None:
        tempmail['allow_custom_usernames'] = request.allow_custom_usernames

    config['setup'] = {'initialized': True, 'key': expected_key}

    write_config(config)
    try:
        reload_settings()
        write_web_config()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Failed to apply configuration: {e}')

    return SetupCompleteResponse(
        initialized=True,
        admin_token=admin_token,
        domains=settings.DOMAINS,
        hostname=settings.HOSTNAME,
    )
