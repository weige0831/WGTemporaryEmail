"""Admin management endpoints - protected by a bearer token.

All endpoints under /api/v1/admin require:
    Authorization: Bearer <admin.token from config.yaml>

The token is compared with a constant-time comparison. After a config hot
reload the new token takes effect immediately (settings is mutated in place).
"""

import hmac
import json
import logging

import requests
import os
import re
import secrets
import ssl
import subprocess
import time
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.cleanup import (
    cleanup_expired_addresses,
    cleanup_permanent_email_retention,
    enforce_storage_limit,
    get_storage_usage_bytes,
)
from app.routers.permanent import _create_permanent_address
from app.config import reload_settings, settings
from app.database import check_db_connection, get_db
from app.models import Address, Attachment, Email, EmailRecipient
from app.rate_limit import ip_rate_limit
from app.runtime_config import (
    RESTART_REQUIRED_KEYS,
    apply_patch,
    mask_config,
    read_config,
    write_config,
    write_web_config,
)
from app.utils import escape_like

logger = logging.getLogger(__name__)
from app.schemas.address import PermanentAddressCreate
from app.schemas.admin import (
    DomainCheckResult,
    AdminAddressDetail,
    AdminAddressList,
    AdminConfigResponse,
    AdminDomainList,
    AdminEmailDetail,
    AdminEmailList,
    AdminPermanentAddressList,
    AdminPermanentStats,
    CleanupResult,
    DomainAddRequest,
    DomainRemoveResponse,
    PermanentCreateRequest,
    PermanentCreateResponse,
    PermanentPurgeResponse,
    TlsIssueRequest,
    TlsStatus,
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
admin_rate_limit = ip_rate_limit(limit=120, window_seconds=60, scope="admin", setting_name="RL_ADMIN")

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
        'active_addresses': db.query(func.count(Address.id)).filter(
            or_(Address.expires_at > now, Address.expires_at.is_(None))
        ).scalar() or 0,
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
        'permanent_email_retention_days': settings.PERMANENT_EMAIL_RETENTION_DAYS,
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
            'address_type': a.address_type,
            'created_at': a.created_at,
            'expires_at': a.expires_at,
            'is_expired': a.is_expired(),
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
        'address_type': address.address_type,
        'created_at': address.created_at,
        'expires_at': address.expires_at,
        'is_expired': address.is_expired(),
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


def check_domain_mx(domain: str) -> dict:
    """Look the domain's MX records up over DNS-over-HTTPS.

    Never raises: a DNS problem must not break domain management. The result is
    what the panel shows, so an operator who just added a domain immediately
    sees whether mail can actually reach this server.
    """
    expected = (settings.HOSTNAME or '').strip().lower().rstrip('.')
    try:
        response = requests.get(
            'https://dns.google/resolve',
            params={'name': domain, 'type': 'MX'},
            headers={'Accept': 'application/dns-json'},
            timeout=5,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:  # network/DNS failure - report, do not raise
        return {'domain': domain, 'expected': expected, 'records': [],
                'matches': False, 'error': str(exc)[:200]}

    records = []
    for answer in payload.get('Answer') or []:
        if answer.get('type') == 15:  # MX
            parts = str(answer.get('data', '')).split()
            if parts:
                records.append(parts[-1].rstrip('.').lower())
    records = sorted(set(records))
    return {
        'domain': domain,
        'expected': expected,
        'records': records,
        'matches': bool(expected) and expected in records,
        'error': None,
    }


@router.get('/domains/check', response_model=DomainCheckResult)
def check_domain(domain: str = Query(..., min_length=3)):
    """Check whether a domain's MX records point at this server."""
    return check_domain_mx(_validate_domain_format(domain))


@router.post('/domains')
def add_domain(request: DomainAddRequest):
    """Add a domain.

    Takes effect for the API immediately and for the MX on the next incoming
    mail (the MX re-reads config.yaml before rejecting an unknown domain). The
    response carries an MX check so the operator learns right away if the DNS
    record is missing - mail would otherwise silently never arrive.
    """
    domain = _validate_domain_format(request.domain)

    config = read_config()
    domains = [d for d in (config.get('domains') or [])]
    if domain in domains:
        raise HTTPException(status_code=409, detail=f'域名已存在: {domain}')
    if len(domains) >= 100:
        raise HTTPException(status_code=400, detail='域名数量已达上限 (100)')

    config['domains'] = domains + [domain]
    _commit_config(config)
    return {'added': domain, 'domains': settings.DOMAINS, 'check': check_domain_mx(domain)}


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
    """Partially update whitelisted configuration keys and hot-reload.

    `restart_required` is set when the patch touched a value the running API
    only reads at startup (CORS, DB pool size, max message size): the change is
    saved, but the panel must tell the operator to restart the containers.
    """
    current = read_config()
    try:
        changed = apply_patch(current, patch)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    _commit_config(current)
    try:
        write_web_config()
    except Exception:
        pass
    return {
        'config': mask_config(read_config()),
        'config_path': settings.CONFIG_PATH,
        'restart_required': bool(changed & RESTART_REQUIRED_KEYS),
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
    retention_emails = cleanup_permanent_email_retention()
    storage_after = get_storage_usage_bytes(db)
    return {
        'deleted_addresses': deleted_addresses or 0,
        'deleted_emails': deleted_emails or 0,
        'retention_deleted_emails': retention_emails or 0,
        'storage_bytes_before': storage_before,
        'storage_bytes_after': storage_after,
    }


# ============================================================================
# TLS certificate management (Let's Encrypt via the certbot sidecar)
# ============================================================================

_CERTBOT_JOBS_DIR = os.getenv('CERTBOT_JOBS_DIR', '/certbot-data/jobs')


def _read_json(path: str) -> Optional[dict]:
    try:
        with open(path, 'r') as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _read_cert_info() -> dict:
    """Parse the TLS certificate file if present.

    Prefers the openssl CLI (stable interface) and falls back to CPython's
    private decoder, which is not guaranteed to survive a base-image upgrade.
    Any failure degrades to an empty dict instead of erroring the endpoint.
    """
    info: dict = {}
    if not os.path.exists(settings.TLS_CERT_FILE):
        return info

    try:
        out = subprocess.run(
            ['openssl', 'x509', '-in', settings.TLS_CERT_FILE, '-noout', '-enddate', '-issuer'],
            capture_output=True, text=True, timeout=5,
        )
        if out.returncode == 0:
            for line in out.stdout.splitlines():
                if line.startswith('notAfter='):
                    info['not_after'] = line.split('=', 1)[1].strip()
                elif line.startswith('issuer='):
                    match = re.search(r'O\s*=\s*([^,/]+)', line)
                    info['issuer'] = match.group(1).strip() if match else None
            if info:
                return info
    except Exception:
        pass

    try:
        decoded = ssl._ssl._test_decode_cert(settings.TLS_CERT_FILE)  # type: ignore[attr-defined]
        info['not_after'] = decoded.get('notAfter')
        issuer = decoded.get('issuer')
        if isinstance(issuer, (list, tuple)):
            for field, value in issuer:
                if field == 'organizationName':
                    info['issuer'] = value
                    break
        else:
            info['issuer'] = None
    except Exception:
        pass
    return info


@router.get('/tls/status', response_model=TlsStatus)
def tls_status():
    """Return TLS configuration and certificate status."""
    cert_info = _read_cert_info()
    job_path = os.path.join(_CERTBOT_JOBS_DIR, 'issue.json')
    return {
        'enabled': settings.TLS_ENABLED,
        'hostname': settings.HOSTNAME,
        'web_hostname': settings.WEB_HOSTNAME,
        'cert_exists': os.path.exists(settings.TLS_CERT_FILE),
        'not_after': cert_info.get('not_after'),
        'issuer': cert_info.get('issuer'),
        'cert_path': settings.TLS_CERT_FILE,
        'job_pending': os.path.exists(job_path),
        'job_result': _read_json(os.path.join(_CERTBOT_JOBS_DIR, 'result.json')),
        'last_renew': _read_json(os.path.join(_CERTBOT_JOBS_DIR, 'renew-result.json')),
    }


@router.post('/tls/issue')
def tls_issue(request: TlsIssueRequest):
    """Submit a certificate issuance job to the certbot sidecar.

    The certificate is issued for the configured mail server hostname plus
    the optional web panel hostname (SAN certificate, HTTP-01). Their A
    records must point to this server and port 80 must be publicly reachable.
    """
    # Both hostnames end up on the certbot command line, so they are checked
    # against the same strict DNS pattern used everywhere else (no spaces, no
    # leading dashes, no option-looking values).
    hostname = settings.HOSTNAME.strip().lower()
    if not hostname or not _DOMAIN_RE.match(hostname):
        raise HTTPException(status_code=400, detail='server.hostname 未配置有效的域名')

    domains = [hostname]
    web_hostname = settings.WEB_HOSTNAME.strip().lower()
    if web_hostname and web_hostname != hostname:
        if not _DOMAIN_RE.match(web_hostname):
            raise HTTPException(status_code=400, detail='web.hostname 格式无效')
        domains.append(web_hostname)

    job_path = os.path.join(_CERTBOT_JOBS_DIR, 'issue.json')
    if os.path.exists(job_path):
        raise HTTPException(status_code=409, detail='已有签发任务正在进行中，请稍候')

    os.makedirs(_CERTBOT_JOBS_DIR, exist_ok=True)
    job = {'id': str(int(time.time())), 'email': request.email, 'domains': domains}
    tmp = job_path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(job, f)
    os.replace(tmp, job_path)
    return {'submitted': True, 'hostname': hostname, 'domains': domains}


# ============================================================================
# Permanent mailbox management
# ============================================================================

@router.get('/permanent-addresses/stats', response_model=AdminPermanentStats)
def permanent_stats(db: Session = Depends(get_db)):
    """Aggregate numbers for the permanent-mailbox page."""
    base = db.query(Address).filter(Address.address_type == 'permanent')
    total = base.count()

    rows = (
        db.query(
            func.count(EmailRecipient.id),
            func.count(func.distinct(EmailRecipient.address_id)),
            func.coalesce(func.sum(Email.size_bytes), 0),
        )
        .select_from(EmailRecipient)
        .join(Address, Address.id == EmailRecipient.address_id)
        .join(Email, Email.id == EmailRecipient.email_id)
        .filter(Address.address_type == 'permanent')
        .one()
    )
    total_emails, with_emails, size_bytes = int(rows[0] or 0), int(rows[1] or 0), int(rows[2] or 0)

    unread = (
        db.query(func.count(EmailRecipient.id))
        .join(Address, Address.id == EmailRecipient.address_id)
        .filter(Address.address_type == 'permanent', EmailRecipient.is_read.is_(False))
        .scalar()
        or 0
    )

    bounds = base.with_entities(func.min(Address.created_at), func.max(Address.created_at)).one()

    return {
        'total': total,
        'with_emails': with_emails,
        'total_emails': total_emails,
        'unread_emails': int(unread),
        'size_bytes': size_bytes,
        'retention_days': settings.PERMANENT_EMAIL_RETENTION_DAYS,
        'max_allowed': settings.MAX_PERMANENT_ADDRESSES,
        'oldest_created_at': bounds[0],
        'newest_created_at': bounds[1],
    }


@router.get('/permanent-addresses', response_model=AdminPermanentAddressList)
def list_permanent_addresses(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    sort: str = Query('created', pattern='^(created|emails|email)$'),
    db: Session = Depends(get_db),
):
    """List permanent mailboxes with per-mailbox email counts and storage."""
    query = db.query(Address).filter(Address.address_type == 'permanent')
    if search:
        query = query.filter(Address.email.ilike(f'%{escape_like(search)}%', escape="\\"))

    total = query.count()

    counts_subq = (
        db.query(
            EmailRecipient.address_id.label('address_id'),
            func.count(EmailRecipient.id).label('email_count'),
            func.count(func.nullif(EmailRecipient.is_read, True)).label('unread_count'),
            func.coalesce(func.sum(Email.size_bytes), 0).label('size_bytes'),
            func.max(Email.received_at).label('last_email_at'),
        )
        .join(Email, Email.id == EmailRecipient.email_id)
        .group_by(EmailRecipient.address_id)
        .subquery()
    )

    rows = (
        db.query(
            Address,
            func.coalesce(counts_subq.c.email_count, 0),
            func.coalesce(counts_subq.c.unread_count, 0),
            func.coalesce(counts_subq.c.size_bytes, 0),
            counts_subq.c.last_email_at,
        )
        .outerjoin(counts_subq, counts_subq.c.address_id == Address.id)
        # Same filters as the count above: this query builds the rows, so it
        # needs them too (otherwise the page would list every address).
        .filter(Address.address_type == 'permanent')
    )
    if search:
        rows = rows.filter(Address.email.ilike(f'%{escape_like(search)}%', escape="\\"))

    if sort == 'emails':
        rows = rows.order_by(func.coalesce(counts_subq.c.email_count, 0).desc(), Address.created_at.desc())
    elif sort == 'email':
        rows = rows.order_by(Address.email.asc())
    else:
        rows = rows.order_by(Address.created_at.desc())

    items = rows.offset((page - 1) * per_page).limit(per_page).all()

    return {
        'items': [
            {
                'id': str(a.id),
                'email': a.email,
                'created_at': a.created_at,
                'email_count': int(email_count),
                'unread_count': int(unread_count),
                'size_bytes': int(size_bytes),
                'last_email_at': last_email_at,
            }
            for a, email_count, unread_count, size_bytes, last_email_at in items
        ],
        'total': total,
        'page': page,
        'per_page': per_page,
        'has_next': page * per_page < total,
    }


@router.post('/permanent-addresses', response_model=PermanentCreateResponse, status_code=201)
def create_permanent_address_admin(request: PermanentCreateRequest, db: Session = Depends(get_db)):
    """Create a permanent mailbox from the admin panel.

    Reuses the same validation as the public endpoint (reserved names, length
    bounds, configured domains, optional cap) and returns the access token,
    which is the only way to read the mailbox later - it is shown once here.
    """
    address = _create_permanent_address(
        PermanentAddressCreate(username=request.username, domain=request.domain), db
    )
    return {
        'id': address.id,
        'email': address.email,
        'token': address.token,
        'created_at': address.created_at,
    }


@router.post('/permanent-addresses/{address_id}/purge-emails', response_model=PermanentPurgeResponse)
def purge_permanent_emails(address_id: UUID, db: Session = Depends(get_db)):
    """Delete every email of one permanent mailbox, keeping the address itself."""
    address = db.query(Address).filter(
        Address.id == address_id, Address.address_type == 'permanent'
    ).first()
    if not address:
        raise HTTPException(status_code=404, detail='Permanent mailbox not found')

    deleted = (
        db.query(EmailRecipient)
        .filter(EmailRecipient.address_id == address.id)
        .delete(synchronize_session=False)
    )
    # Messages left without any recipient go away with their attachments.
    db.query(Email).filter(
        ~Email.email_recipients.any()
    ).delete(synchronize_session=False)
    db.commit()

    logger.info('Admin purged %d emails from permanent mailbox %s', deleted, address.email)
    return {'email': address.email, 'deleted_emails': int(deleted or 0)}


@router.post('/permanent-addresses/run-retention', response_model=PermanentPurgeResponse)
def run_permanent_retention():
    """Run the retention job immediately (emails older than the configured days)."""
    deleted = cleanup_permanent_email_retention()
    return {
        'email': '*',
        'deleted_emails': 0,
        'retention_deleted_emails': int(deleted or 0),
    }


# ============================================================================
# Integration API key (for creating permanent mailboxes via the API)
# ============================================================================

@router.get('/apikey/status')
def apikey_status():
    """Return whether an integration API key is configured (masked)."""
    key = settings.INTEGRATION_API_KEY
    # Never echo any part of the live key: the panel only needs to know
    # whether one is configured (regenerate to obtain a new one).
    return {'configured': bool(key), 'masked': '****' if key else ''}


@router.post('/apikey/regenerate')
def apikey_regenerate():
    """Generate a new integration API key and hot-reload the configuration.

    The key is returned only once - save it immediately.
    """
    new_key = secrets.token_urlsafe(24)
    config = read_config()
    config.setdefault('integration', {})['api_key'] = new_key
    _commit_config(config)
    return {'api_key': new_key}
