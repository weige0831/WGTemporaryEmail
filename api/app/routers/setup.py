"""First-run setup wizard endpoints.

The setup endpoint is usable only while the service is uninitialized
(setup.initialized: false in config.yaml). After the wizard completes,
further configuration changes go through the authenticated admin panel.
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException, Request

from app.config import reload_settings, settings
from app.rate_limit import ip_rate_limit
from app.runtime_config import read_config, write_config
from app.schemas.setup import SetupCompleteRequest, SetupCompleteResponse, SetupStatus

router = APIRouter(prefix='/api/v1/setup', tags=['setup'])

# Tight limit: this endpoint writes the server config while unauthenticated.
setup_rate_limit = ip_rate_limit(limit=5, window_seconds=60, scope='setup')


@router.get('/status', response_model=SetupStatus)
def setup_status():
    """Return whether the first-run setup wizard has been completed and the
    configured panel access domain (used by the frontend to prompt users
    accessing via the MX hostname or an IP)."""
    return SetupStatus(
        initialized=settings.SETUP_INITIALIZED,
        web_hostname=settings.WEB_HOSTNAME,
    )


@router.post('/complete', response_model=SetupCompleteResponse)
def complete_setup(
    request: SetupCompleteRequest,
    req: Request,
    _: None = Depends(setup_rate_limit),
):
    """Write the initial configuration and mark the wizard complete.

    Only callable while uninitialized. Generates a random admin token when
    none is supplied and returns it (it is only shown this once).
    """
    if settings.SETUP_INITIALIZED:
        raise HTTPException(
            status_code=403,
            detail='系统已完成初始化，请通过管理面板修改配置',
        )

    config = read_config()

    config['domains'] = request.domains
    config.setdefault('server', {})['hostname'] = request.hostname

    if request.web_hostname:
        config.setdefault('web', {})['hostname'] = request.web_hostname

    admin_token = (request.admin_token or secrets.token_urlsafe(18)).strip()
    config.setdefault('admin', {})['token'] = admin_token

    tempmail = config.setdefault('tempmail', {})
    if request.address_lifetime_hours is not None:
        if request.address_lifetime_hours < 1:
            raise HTTPException(status_code=400, detail='地址有效期必须 >= 1 小时')
        tempmail['address_lifetime_hours'] = request.address_lifetime_hours
    if request.max_storage_mb is not None:
        if request.max_storage_mb < 0:
            raise HTTPException(status_code=400, detail='存储上限必须 >= 0（0 表示不限制）')
        tempmail['max_storage_mb'] = request.max_storage_mb
    if request.allow_custom_usernames is not None:
        tempmail['allow_custom_usernames'] = request.allow_custom_usernames

    config['setup'] = {'initialized': True}

    write_config(config)
    try:
        reload_settings()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'配置写入失败: {e}')

    return SetupCompleteResponse(
        initialized=True,
        admin_token=admin_token,
        domains=settings.DOMAINS,
        hostname=settings.HOSTNAME,
    )
