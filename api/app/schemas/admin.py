"""Pydantic schemas for the admin API"""

from pydantic import BaseModel, EmailStr, field_serializer
from datetime import datetime
from typing import Optional, List
from uuid import UUID


def _serialize_dt(dt: datetime, _info):
    return dt.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


class AdminStats(BaseModel):
    """System-wide statistics for the admin dashboard"""
    domains: List[str]
    total_addresses: int
    active_addresses: int
    total_emails: int
    unread_emails: int
    emails_24h: int
    total_attachments: int
    email_size_bytes: int
    attachment_size_bytes: int
    max_storage_mb: int
    db_ok: bool
    uptime_seconds: float
    address_lifetime_hours: int
    cleanup_interval_hours: int


class AdminAddressSummary(BaseModel):
    """Address row for the admin address list"""
    id: UUID
    email: str
    created_at: datetime
    expires_at: datetime
    is_expired: bool
    email_count: int
    unread_count: int
    last_email_at: Optional[datetime] = None

    @field_serializer('created_at', 'expires_at', 'last_email_at')
    def serialize_dt(self, dt: datetime, _info):
        return _serialize_dt(dt, _info) if dt else None


class AdminAddressList(BaseModel):
    """Paginated admin address list"""
    items: List[AdminAddressSummary]
    total: int
    page: int
    per_page: int
    has_next: bool


class AdminEmailSummary(BaseModel):
    """Email row for the admin email list"""
    id: UUID
    subject: Optional[str]
    from_address: str
    to_address: str
    addresses: List[str]
    received_at: datetime
    is_read: bool
    has_attachments: bool
    size_bytes: int
    spf_result: Optional[str] = None
    dmarc_result: Optional[str] = None

    @field_serializer('received_at')
    def serialize_dt(self, dt: datetime, _info):
        return _serialize_dt(dt, _info)


class AdminEmailList(BaseModel):
    """Paginated admin email list"""
    items: List[AdminEmailSummary]
    total: int
    page: int
    per_page: int
    has_next: bool


class AdminAttachmentInfo(BaseModel):
    id: UUID
    filename: str
    content_type: str
    size_bytes: int

    class Config:
        from_attributes = True


class AdminEmailDetail(BaseModel):
    """Full email detail (without raw message bytes)"""
    id: UUID
    message_id: Optional[str]
    subject: Optional[str]
    from_address: str
    to_address: str
    addresses: List[str]
    raw_headers: str
    body_plain: Optional[str]
    body_html: Optional[str]
    size_bytes: int
    dkim_valid: Optional[bool]
    spf_result: Optional[str]
    dmarc_result: Optional[str]
    has_attachments: bool
    received_at: datetime
    is_read: bool
    attachments: List[AdminAttachmentInfo]

    @field_serializer('received_at')
    def serialize_dt(self, dt: datetime, _info):
        return _serialize_dt(dt, _info)


class AdminAddressDetail(BaseModel):
    """Address detail plus its emails"""
    id: UUID
    email: str
    created_at: datetime
    expires_at: datetime
    is_expired: bool
    emails: List[AdminEmailSummary]

    @field_serializer('created_at', 'expires_at')
    def serialize_dt(self, dt: datetime, _info):
        return _serialize_dt(dt, _info)


class DomainAddRequest(BaseModel):
    domain: str


class DomainStats(BaseModel):
    domain: str
    address_count: int
    email_count: int


class AdminDomainList(BaseModel):
    domains: List[DomainStats]


class DomainRemoveResponse(BaseModel):
    removed: str
    affected_addresses: int
    domains: List[str]


class CleanupResult(BaseModel):
    deleted_addresses: int
    deleted_emails: int
    storage_bytes_before: int
    storage_bytes_after: int


class TlsIssueRequest(BaseModel):
    email: EmailStr


class TlsStatus(BaseModel):
    """TLS certificate status for the admin panel"""
    enabled: bool
    hostname: str
    cert_exists: bool
    not_after: Optional[str] = None
    issuer: Optional[str] = None
    cert_path: str
    job_pending: bool
    job_result: Optional[dict] = None
    last_renew: Optional[dict] = None


class AdminConfigResponse(BaseModel):
    config: dict
    config_path: str
