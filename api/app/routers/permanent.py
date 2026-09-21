"""Permanent (long-term) mailbox endpoints.

The address itself is kept forever; its emails are retained for
tempmail.permanent_email_retention_days (30 days by default) and cleaned up
by the background cleanup loop.

- POST /api/v1/permanent-addresses  public creation from the web UI
  (rate-limited, no auth)
- POST /api/v1/api/addresses         programmatic creation, requires the
  integration API key in the X-API-Key header
"""

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional

from app.database import get_db
from app.models import Address
from app.rate_limit import ip_rate_limit
from app.schemas.address import PermanentAddressCreate, PermanentAddressResponse
from app.config import settings
from app.utils import generate_token

router = APIRouter(prefix='/api/v1', tags=['permanent'])

public_create_rate_limit = ip_rate_limit(limit=5, window_seconds=60, scope='permanent_create')
api_create_rate_limit = ip_rate_limit(limit=30, window_seconds=60, scope='permanent_create_api')


def _create_permanent_address(request: PermanentAddressCreate, db: Session) -> Address:
    """Shared creation logic. Raises HTTPException on conflicts."""
    domain = request.domain
    if domain is None:
        if not settings.DOMAINS:
            raise HTTPException(status_code=500, detail='No domains configured')
        domain = settings.DOMAINS[0]
    else:
        if domain not in settings.DOMAINS:
            raise HTTPException(
                status_code=400,
                detail=f"Domain '{domain}' is not available. Use GET /api/v1/domains to see available domains",
            )

    # Optional cap: without it the public endpoint can create mailboxes (kept
    # forever) without limit. 0 disables the cap.
    if settings.MAX_PERMANENT_ADDRESSES > 0:
        current = db.query(Address).filter(Address.address_type == 'permanent').count()
        if current >= settings.MAX_PERMANENT_ADDRESSES:
            raise HTTPException(
                status_code=403,
                detail='Permanent mailbox limit reached (tempmail.max_permanent_addresses)',
            )

    if not settings.ALLOW_CUSTOM_USERNAMES:
        raise HTTPException(
            status_code=403,
            detail='Custom usernames are disabled (tempmail.allow_custom_usernames is false)',
        )

    username = request.username.strip().lower()
    if len(username) < settings.MIN_USERNAME_LENGTH or len(username) > settings.MAX_USERNAME_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f'用户名长度需在 {settings.MIN_USERNAME_LENGTH}-{settings.MAX_USERNAME_LENGTH} 字符之间',
        )
    if username in [name.lower() for name in settings.RESERVED_USERNAMES]:
        raise HTTPException(status_code=400, detail=f"用户名 '{username}' 是保留名称，无法使用")

    email = f'{username}@{domain}'

    existing = db.query(Address).filter(Address.email == email).first()
    if existing:
        # 释放已过期的临时地址占用的名称
        if existing.address_type == 'temp' and existing.is_expired():
            db.delete(existing)
            db.commit()
        else:
            raise HTTPException(status_code=409, detail=f"邮箱地址 '{email}' 已被占用")

    token = generate_token()
    address = Address(
        email=email,
        token=token,
        address_type='permanent',
        created_at=datetime.utcnow(),
        expires_at=None,
    )
    db.add(address)
    db.commit()
    db.refresh(address)
    return address


@router.post('/permanent-addresses', response_model=PermanentAddressResponse)
def create_permanent_address_public(
    request: PermanentAddressCreate,
    db: Session = Depends(get_db),
    _: None = Depends(public_create_rate_limit),
):
    """Create a permanent mailbox from the web UI (no auth, rate-limited)."""
    return _create_permanent_address(request, db)


@router.post('/api/addresses', response_model=PermanentAddressResponse)
def create_permanent_address_api(
    request: PermanentAddressCreate,
    x_api_key: Optional[str] = Header(None),
    db: Session = Depends(get_db),
    _: None = Depends(api_create_rate_limit),
):
    """Create a permanent mailbox via the integration API.

    Requires the integration API key (managed in the admin panel) in the
    X-API-Key header.
    """
    expected = settings.INTEGRATION_API_KEY
    if not expected:
        raise HTTPException(
            status_code=503,
            detail='Integration API key not configured - generate one in the admin panel',
        )
    if not x_api_key or not hmac.compare_digest(x_api_key.encode('utf-8'), expected.encode('utf-8')):
        raise HTTPException(status_code=401, detail='Invalid X-API-Key')

    return _create_permanent_address(request, db)
