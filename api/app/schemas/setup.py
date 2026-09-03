"""Pydantic schemas for the first-run setup wizard"""

import re
from typing import List, Optional

from pydantic import BaseModel, field_validator

_DOMAIN_RE = re.compile(
    r'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
)


class SetupStatus(BaseModel):
    initialized: bool


class SetupCompleteRequest(BaseModel):
    """Request body for completing the first-run setup wizard."""
    domains: List[str]
    hostname: str
    admin_token: Optional[str] = None
    address_lifetime_hours: Optional[int] = None
    max_storage_mb: Optional[int] = None
    allow_custom_usernames: Optional[bool] = None

    @field_validator('domains')
    @classmethod
    def validate_domains(cls, v: List[str]) -> List[str]:
        if not v:
            raise ValueError('至少需要配置一个域名')
        cleaned = []
        for d in v:
            d = d.strip().lower()
            if not _DOMAIN_RE.match(d):
                raise ValueError(f'域名格式无效: {d}')
            cleaned.append(d)
        return cleaned

    @field_validator('hostname')
    @classmethod
    def validate_hostname(cls, v: str) -> str:
        v = v.strip().lower()
        if not _DOMAIN_RE.match(v):
            raise ValueError('邮件服务器主机名格式无效')
        return v

    @field_validator('admin_token')
    @classmethod
    def validate_admin_token(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if len(v) < 8:
                raise ValueError('管理令牌至少 8 个字符')
        return v


class SetupCompleteResponse(BaseModel):
    initialized: bool
    admin_token: str
    domains: List[str]
    hostname: str
