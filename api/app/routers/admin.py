"""Admin management endpoints - protected by a bearer token.

All endpoints under /api/v1/admin require:
    Authorization: Bearer <admin.token from config.yaml>

The token is compared with a constant-time comparison. After a config hot
reload the new token takes effect immediately (settings is mutated in place).
"""

import hmac
import re
import time
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.cleanup import cleanup_expired_addresses, enforce_storage_limit, get_storage_usage_bytes
from app.config import reload_settings, settings
from app.database import check_db_connection, get_db
from app.models import Address, Attachment, Email, EmailRecipient
from app.rate_limit import ip_rate_limit
from app.runtime_config import apply_patch, mask_config, read_config, write_config
from app.utils import escape_like
from app.schemas.admin import (
    AdminAddressDetail,
    AdminAddressList,
    AdminConfigResponse,
    AdminDomainList,
    AdminEmailDetail,
    AdminEmailList,
    CleanupResult,
    DomainAddRequest,
    DomainRemoveResponse,
)

_START_TIME = time.time()

_DOMAIN_RE = re.compile(
    r'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
)


def require_admin(authorization: Optional[str] = Header(None)):
    """Validate the admin bearer token."""
    expected = settings.ADMIN_TOKEN
    if not expected:
        raise HTTPException(
            status_code=503,
            detail='Admin token not configured (set admin.token in config.yaml)',
        )
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='Unauthorized')

    token = authorization[len('Bearer '):]
    if not hmac.compare_digest(token.encode('utf-8'), expected.encode('utf-8')):
        raise HTTPException(status_code=401, detail='Unauthorized')


# Rate-limit the whole admin surface per IP to blunt brute-force attempts
# against the bearer token. 32-bit random tokens make brute force infeasible
# even at 30 req/min, while remaining generous for normal admin use.
admin_rate_limit = ip_rate_limit(limit=30, window_seconds=60, scope="admin")

router = APIRouter(
    prefix='/api/v1/admin',
    tags=['admin'],
    dependencies=[Depends(require_admin), Depends(admin_rate_limit)],
)


def _commit_config(new_config: dict) -> None:
    """Write config.yaml, reload settings, and roll back on failure."""
    previous = read_config()
    write_config(new_config)
    try:
        reload_settings()
    except Exception:
        # Roll back the file and settings so the service stays consistent
        try:
            write_config(previous)
            reload_settings()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail='配置重载失败，已回滚到修改前的配置')


def _validate_domain_format(domain: str) -> str:
    domain = domain.strip().lower()
    if not domain or len(domain) > 253 or not _DOMAIN_RE.match(domain):
        raise HTTPException(status_code=400, detail=f'域名格式无效: {domain}')
    return domain


# ============================================================================
# Statistics
# ============================================================================

@router.get('/stats')
def get_stats(db: Session = Depends(get_db)):
    """System-wide statistics for the dashboard."""
    now = datetime.utcnow()
    total_emails = db.query(func.count(Email.id)).scalar() or 0

    return {
        'domains': settings.DOMAINS,
        'total_addresses': db.query(func.count(Address.id)).scalar() or 0,
        'active_addresses': db.query(func.count(Address.id)).filter(Address.expires_at > now).scalar() or 0,
        'total_emails': total_emails,
        'unread_emails': db.query(func.count(EmailRecipient.id)).filter(EmailRecipient.is_read.is_(False)).scalar() or 0,
        'emails_24h': db.query(func.count(Email.id)).filter(Email.received_at >= now - timedelta(hours=24)).scalar() or 0,
        'total_attachments': db.query(func.count(Attachment.id)).scalar() or 0,
        'email_size_bytes': db.query(func.coalesce(func.sum(Email.size_bytes), 0)).scalar() or 0,
        'attachment_size_bytes': db.query(func.coalesce(func.sum(Attachment.size_bytes), 0)).scalar() or 0,
        'max_storage_mb': settings.MAX_STORAGE_MB,
        'db_ok': check_db_connection(),
        'uptime_seconds': round(time.time() - _START_TIME, 1),
        'address_lifetime_hours': settings.ADDRESS_LIFETIME_HOURS,
        'cleanup_interval_hours': settings.CLEANUP_INTERVAL_HOURS,
    }


# ============================================================================
# Address management
# ============================================================================

@router.get('/addresses', response_model=AdminAddressList)
def list_addresses(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """List all temporary addresses with per-address email counts."""
    query = db.query(Address)
    if search:
        query = query.filter(Address.email.ilike(f'%{escape_like(search)}%', escape='\\'))

    total = query.count()
    items = query.order_by(Address.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    now = datetime.utcnow()
    ids = [a.id for a in items]

    email_counts = {}
    unread_counts = {}
    last_email = {}
    if ids:
        email_counts = dict(
            db.query(EmailRecipient.address_id, func.count(EmailRecipient.id))
            .filter(EmailRecipient.address_id.in_(ids))
            .group_by(EmailRecipient.address_id).all()
        )
        unread_counts = dict(
            db.query(EmailRecipient.address_id, func.count(EmailRecipient.id))
            .filter(EmailRecipient.address_id.in_(ids), EmailRecipient.is_read.is_(False))
            .group_by(EmailRecipient.address_id).all()
        )
        last_email = dict(
            db.query(EmailRecipient.address_id, func.max(Email.received_at))
            .join(Email, EmailRecipient.email_id == Email.id)
            .filter(EmailRecipient.address_id.in_(ids))
            .group_by(EmailRecipient.address_id).all()
        )

    result = [
        {
            'id': str(a.id),
            'email': a.email,
            'created_at': a.created_at,
            'expires_at': a.expires_at,
            'is_expired': a.expires_at <= now,
            'email_count': email_counts.get(a.id, 0),
            'unread_count': unread_counts.get(a.id, 0),
            'last_email_at': last_email.get(a.id),
        }
        for a in items
    ]

    return {
        'items': result,
        'total': total,
        'page': page,
        'per_page': per_page,
        'has_next': page * per_page < total,
    }


@router.get('/addresses/{address_id}', response_model=AdminAddressDetail)
def get_address(address_id: UUID, db: Session = Depends(get_db)):
    """Get address details plus its emails."""
    address = db.query(Address).filter(Address.id == address_id).first()
    if not address:
        raise HTTPException(status_code=404, detail='地址不存在')

    emails = (
        db.query(Email)
        .join(EmailRecipient, EmailRecipient.email_id == Email.id)
        .filter(EmailRecipient.address_id == address_id)
        .order_by(Email.received_at.desc())
        .all()
    )

    recipients = {}
    if emails:
        rows = (
            db.query(EmailRecipient.email_id, EmailRecipient.is_read)
            .filter(EmailRecipient.address_id == address_id, EmailRecipient.email_id.in_([e.id for e in emails]))
            .all()
        )
        for email_id, is_read in rows:
            recipients.setdefault(email_id, is_read)

    return {
        'id': str(address.id),
        'email': address.email,
        'created_at': address.created_at,
        'expires_at': address.expires_at,
        'is_expired': address.expires_at <= datetime.utcnow(),
        'emails': [
            {
                'id': str(e.id),
                'subject': e.subject,
                'from_address': e.from_address,
                'to_address': e.to_address,
                'addresses': [address.email],
                'received_at': e.received_at,
                'is_read': recipients.get(e.id, False),
                'has_attachments': e.has_attachments,
                'size_bytes': e.size_bytes,
                'spf_result': e.spf_result,
                'dmarc_result': e.dmarc_result,
            }
            for e in emails
        ],
    }


@router.delete('/addresses/{address_id}')
def delete_address(address_id: UUID, db: Session = Depends(get_db)):
    """Delete an address and all of its emails."""
    address = db.query(Address).filter(Address.id == address_id).first()
    if not address:
        raise HTTPException(status_code=404, detail='地址不存在')

    email = address.email
    # ORM cascade deletes recipient rows; the database trigger then removes
    # orphaned emails (and their attachments) automatically.
    db.delete(address)
    db.commit()
    return {'deleted': True, 'email': email}


# ============================================================================
# Email management
# ============================================================================

def _email_summary(email: Email, recipients) -> dict:
    return {
        'id': str(email.id),
        'subject': email.subject,
        'from_address': email.from_address,
        'to_address': email.to_address,
        'addresses': [r.address.email for r in recipients if r.address],
        'received_at': email.received_at,
        'is_read': any(r.is_read for r in recipients),
        'has_attachments': email.has_attachments,
        'size_bytes': email.size_bytes,
        'spf_result': email.spf_result,
        'dmarc_result': email.dmarc_result,
    }


@router.get('/emails', response_model=AdminEmailList)
def list_emails(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """List all received emails across every address."""
    query = db.query(Email)
    if search:
        pattern = f'%{escape_like(search)}%'
        query = query.filter(or_(
            Email.subject.ilike(pattern, escape='\\'),
            Email.from_address.ilike(pattern, escape='\\'),
            Email.to_address.ilike(pattern, escape='\\'),
        ))

    total = query.count()
    items = (
        query.order_by(Email.received_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .options(selectinload(Email.email_recipients).selectinload(EmailRecipient.address))
        .all()
    )

    return {
        'items': [_email_summary(e, e.email_recipients) for e in items],
        'total': total,
        'page': page,
        'per_page': per_page,
        'has_next': page * per_page < total,
    }


@router.get('/emails/{email_id}', response_model=AdminEmailDetail)
def get_email(email_id: UUID, db: Session = Depends(get_db)):
    """Get full email details."""
    email = (
        db.query(Email)
        .filter(Email.id == email_id)
        .options(selectinload(Email.email_recipients).selectinload(EmailRecipient.address))
        .first()
    )
    if not email:
        raise HTTPException(status_code=404, detail='邮件不存在')

    return {
        'id': str(email.id),
        'message_id': email.message_id,
        'subject': email.subject,
        'from_address': email.from_address,
        'to_address': email.to_address,
        'addresses': [r.address.email for r in email.email_recipients if r.address],
        'raw_headers': email.raw_headers,
        'body_plain': email.body_plain,
        'body_html': email.body_html,
        'size_bytes': email.size_bytes,
        'dkim_valid': email.dkim_valid,
        'spf_result': email.spf_result,
        'dmarc_result': email.dmarc_result,
        'has_attachments': email.has_attachments,
        'received_at': email.received_at,
        'is_read': any(r.is_read for r in email.email_recipients),
        'attachments': [
            {
                'id': str(a.id),
                'filename': a.filename,
                'content_type': a.content_type,
                'size_bytes': a.size_bytes,
            }
            for a in email.attachments
        ],
    }


@router.delete('/emails/{email_id}')
def delete_email(email_id: UUID, db: Session = Depends(get_db)):
    """Delete an email (cascades to recipients and attachments)."""
    email = db.query(Email).filter(Email.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail='邮件不存在')

    db.delete(email)
    db.commit()
    return {'deleted': True, 'id': str(email_id)}


# ============================================================================
# Domain management (edits config.yaml and hot-reloads)
# ============================================================================

@router.get('/domains', response_model=AdminDomainList)
def list_domains(db: Session = Depends(get_db)):
    """List configured domains with usage counts."""
    result = []
    for domain in settings.DOMAINS:
        result.append({
            'domain': domain,
            'address_count': db.query(func.count(Address.id)).filter(Address.email.ilike(f'%@{domain}')).scalar() or 0,
            'email_count': db.query(func.count(Email.id)).filter(Email.to_address.ilike(f'%@{domain}')).scalar() or 0,
        })
    return {'domains': result}


@router.post('/domains')
def add_domain(request: DomainAddRequest):
    """Add a domain. Takes effect for the API immediately and for the MX
    server within its config reload interval (15s)."""
    domain = _validate_domain_format(request.domain)

    config = read_config()
    domains = [d for d in (config.get('domains') or [])]
    if domain in domains:
        raise HTTPException(status_code=409, detail=f'域名已存在: {domain}')
    if len(domains) >= 100:
        raise HTTPException(status_code=400, detail='域名数量已达上限 (100)')

    config['domains'] = domains + [domain]
    _commit_config(config)
    return {'added': domain, 'domains': settings.DOMAINS}


@router.delete('/domains/{domain}', response_model=DomainRemoveResponse)
def remove_domain(domain: str, db: Session = Depends(get_db)):
    """Remove a domain. Existing addresses keep their emails but the MX
    server stops accepting new mail for the domain within 15s."""
    domain = domain.strip().lower()

    config = read_config()
    domains = [d for d in (config.get('domains') or [])]
    if domain not in domains:
        raise HTTPException(status_code=404, detail=f'域名不存在: {domain}')
    if len(domains) <= 1:
        raise HTTPException(status_code=400, detail='不能删除最后一个域名')

    config['domains'] = [d for d in domains if d != domain]
    _commit_config(config)

    affected = db.query(func.count(Address.id)).filter(Address.email.ilike(f'%@{domain}')).scalar() or 0
    return {
        'removed': domain,
        'affected_addresses': affected,
        'domains': settings.DOMAINS,
    }


# ============================================================================
# Configuration view / hot update
# ============================================================================

@router.get('/config', response_model=AdminConfigResponse)
def get_config():
    """Return the current configuration (secrets masked)."""
    return {
        'config': mask_config(read_config()),
        'config_path': settings.CONFIG_PATH,
    }


@router.put('/config', response_model=AdminConfigResponse)
def update_config(patch: dict):
    """Partially update whitelisted configuration keys and hot-reload."""
    current = read_config()
    try:
        apply_patch(current, patch)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    _commit_config(current)
    return {
        'config': mask_config(read_config()),
        'config_path': settings.CONFIG_PATH,
    }


# ============================================================================
# Manual cleanup
# ============================================================================

@router.post('/cleanup/run', response_model=CleanupResult)
def run_cleanup_now(db: Session = Depends(get_db)):
    """Run both cleanup jobs immediately: expired-address purge and the
    global storage cap (oldest emails first)."""
    storage_before = get_storage_usage_bytes(db)
    deleted_addresses = cleanup_expired_addresses()
    deleted_emails = enforce_storage_limit()
    storage_after = get_storage_usage_bytes(db)
    return {
        'deleted_addresses': deleted_addresses or 0,
        'deleted_emails': deleted_emails or 0,
        'storage_bytes_before': storage_before,
        'storage_bytes_after': storage_after,
    }
