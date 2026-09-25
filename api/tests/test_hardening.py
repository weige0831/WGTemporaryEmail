"""Tests for the second audit pass: caps, guards, robustness.

Covers the items that were still open after the first round of fixes:
permanent-mailbox cap, CORS defaults, rate-limiter eviction, non-ASCII
attachment filenames, the restart-required signal and the IP-access guard.
"""

import io
import os
import time
import uuid

import pytest
import yaml

from app.config import settings
from app.models import Address, Attachment, Email, EmailRecipient
from app.rate_limit import _WINDOWS, _is_allowed


@pytest.fixture
def config_file():
    """A writable config.yaml at settings.CONFIG_PATH (test mode points at /tmp)."""
    path = settings.CONFIG_PATH
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    original = io.open(path, encoding="utf-8").read() if os.path.exists(path) else None
    data = {
        "domains": ["tempmail.example.com"],
        "admin": {"token": settings.ADMIN_TOKEN},
        "integration": {"api_key": settings.INTEGRATION_API_KEY},
        "server": {"hostname": "mx.tempmail.example.com", "docs_enabled": True},
        "database": {"url": "sqlite:///:memory:", "pool_size": 5},
        "tempmail": {"address_lifetime_hours": 24, "permanent_email_retention_days": 30},
        "cors": {"allow_origins": [], "allow_credentials": False},
        "web": {"hostname": "web.tempmail.example.com", "allow_ip_access": True},
        "setup": {"initialized": True, "key": "expected-key"},
    }
    with io.open(path, "w", encoding="utf-8", newline=chr(10)) as f:
        yaml.safe_dump(data, f, sort_keys=False)
    yield path
    if original is None:
        if os.path.exists(path):
            os.remove(path)
        if os.path.exists(path + ".bak"):
            os.remove(path + ".bak")
    else:
        with io.open(path, "w", encoding="utf-8", newline=chr(10)) as f:
            f.write(original)


def admin_headers():
    return {"Authorization": f"Bearer {settings.ADMIN_TOKEN}"}


# --------------------------------------------------------------------------
# permanent mailbox cap
# --------------------------------------------------------------------------

class TestPermanentMailboxCap:
    def test_cap_blocks_creation(self, client, db_session, monkeypatch):
        monkeypatch.setattr(settings, "MAX_PERMANENT_ADDRESSES", 1)
        first = client.post(
            "/api/v1/permanent-addresses",
            json={"username": "capfirst", "domain": "tempmail.example.com"},
        )
        assert first.status_code == 200

        second = client.post(
            "/api/v1/permanent-addresses",
            json={"username": "capsecond", "domain": "tempmail.example.com"},
        )
        assert second.status_code == 403
        assert "limit" in second.text.lower()

    def test_zero_means_unlimited(self, client, monkeypatch):
        monkeypatch.setattr(settings, "MAX_PERMANENT_ADDRESSES", 0)
        for name in ("unlimited1", "unlimited2"):
            assert client.post(
                "/api/v1/permanent-addresses",
                json={"username": name, "domain": "tempmail.example.com"},
            ).status_code == 200


# --------------------------------------------------------------------------
# CORS defaults and rate limiter housekeeping
# --------------------------------------------------------------------------

class TestSafeDefaults:
    def test_wildcard_with_credentials_is_refused(self):
        from app.config import Config

        cfg = Config.__new__(Config)
        cfg._apply({
            "domains": ["example.com"],
            "cors": {"allow_origins": ["*"], "allow_credentials": True},
        })
        assert cfg.CORS_ALLOW_CREDENTIALS is False

    def test_missing_cors_section_allows_nothing(self):
        from app.config import Config

        cfg = Config.__new__(Config)
        cfg._apply({"domains": ["example.com"]})
        assert cfg.CORS_ALLOW_ORIGINS == []
        assert cfg.CORS_ALLOW_CREDENTIALS is False


class TestRateLimiterHousekeeping:
    def test_windows_are_evicted(self, monkeypatch):
        """Stale keys must not accumulate forever (memory exhaustion)."""
        import app.rate_limit as rl

        monkeypatch.setattr(rl, "_SWEEP_MIN_KEYS", 4)
        monkeypatch.setattr(rl, "_SWEEP_INTERVAL_SECONDS", 0)
        _WINDOWS.clear()

        # Five distinct keys in the past, then a fresh call triggers the sweep.
        for i in range(5):
            _WINDOWS[f"old:{i}"].append(time.monotonic() - 7200)
        _is_allowed("fresh:1.2.3.4", 10, 60)

        assert "fresh:1.2.3.4" in _WINDOWS
        assert not any(k.startswith("old:") for k in _WINDOWS), "stale keys were not evicted"

    def test_limit_is_enforced(self):
        _WINDOWS.clear()
        assert all(_is_allowed("k:1", 3, 60) for _ in range(3))
        assert _is_allowed("k:1", 3, 60) is False


# --------------------------------------------------------------------------
# attachments with non-ASCII / hostile filenames
# --------------------------------------------------------------------------

class TestAttachmentFilenames:
    def _attach(self, db, filename):
        addr = Address(
            email=f"att-{uuid.uuid4().hex[:8]}@tempmail.example.com",
            token=f"tok-{uuid.uuid4().hex}",
            address_type="permanent",
            expires_at=None,
        )
        db.add(addr)
        db.commit()
        email = Email(
            message_id=f"<{uuid.uuid4().hex}@example.com>",
            subject="with attachment",
            from_address="sender@example.com",
            to_address=addr.email,
            raw_headers="",
            raw_message=b"raw",
            size_bytes=3,
        )
        db.add(email)
        db.commit()
        att = Attachment(
            email_id=email.id,
            filename=filename,
            content_type="application/pdf",
            size_bytes=4,
            data=b"data",
        )
        db.add(att)
        db.commit()
        db.add(EmailRecipient(email_id=email.id, address_id=addr.id))
        db.commit()
        return addr, email, att

    def test_non_ascii_filename_downloads(self, client, db_session):
        addr, email, att = self._attach(db_session, "报价单.pdf")
        res = client.get(f"/api/v1/{addr.token}/emails/{email.id}/attachments/{att.id}")
        assert res.status_code == 200, res.text
        disposition = res.headers["content-disposition"]
        assert "filename*=UTF-8''" in disposition
        assert "%E6%8A%A5%E4%BB%B7%E5%8D%95.pdf" in disposition

    def test_quote_in_filename_cannot_break_the_header(self, client, db_session):
        addr, email, att = self._attach(db_session, 'in"jected.txt')
        res = client.get(f"/api/v1/{addr.token}/emails/{email.id}/attachments/{att.id}")
        assert res.status_code == 200
        disposition = res.headers["content-disposition"]
        assert disposition.count('"') == 2, disposition  # only the quotes we emit
        assert 'in_jected.txt' in disposition

    def test_unknown_mime_type_is_served_as_binary(self, client, db_session):
        addr, email, att = self._attach(db_session, "page.html")
        db_session.query(Attachment).filter(Attachment.id == att.id).update(
            {"content_type": "text/html"}
        )
        db_session.commit()
        res = client.get(f"/api/v1/{addr.token}/emails/{email.id}/attachments/{att.id}")
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("application/octet-stream")
        assert res.headers.get("x-content-type-options") == "nosniff"


# --------------------------------------------------------------------------
# config API guards
# --------------------------------------------------------------------------

class TestConfigGuards:
    def test_restart_required_flag(self, client, config_file):
        res = client.put(
            "/api/v1/admin/config",
            json={"cors": {"allow_origins": ["https://example.com"]}},
            headers=admin_headers(),
        )
        assert res.status_code == 200, res.text
        assert res.json()["restart_required"] is True

        res = client.put(
            "/api/v1/admin/config",
            json={"tempmail": {"permanent_email_retention_days": 14}},
            headers=admin_headers(),
        )
        assert res.status_code == 200
        assert res.json()["restart_required"] is False

    def test_ip_access_cannot_be_disabled_without_hostname(self, client, config_file):
        res = client.put(
            "/api/v1/admin/config",
            json={"web": {"hostname": "", "allow_ip_access": False}},
            headers=admin_headers(),
        )
        assert res.status_code == 400
        assert "allow_ip_access" in res.text

    def test_config_write_keeps_a_backup(self, client, config_file):
        client.put(
            "/api/v1/admin/config",
            json={"tempmail": {"max_storage_mb": 512}},
            headers=admin_headers(),
        )
        assert os.path.exists(config_file + ".bak")
        backup = yaml.safe_load(io.open(config_file + ".bak", encoding="utf-8"))
        assert isinstance(backup, dict)

    def test_corrupt_config_falls_back_to_backup(self, client, config_file):
        from app.runtime_config import read_config

        # Write a good file, take a backup, then corrupt the live file.
        client.put(
            "/api/v1/admin/config",
            json={"tempmail": {"max_storage_mb": 256}},
            headers=admin_headers(),
        )
        with io.open(config_file, "w", encoding="utf-8") as f:
            f.write("domains: [broken\n")  # invalid YAML
        recovered = read_config()
        assert recovered.get("domains"), "should have recovered from the backup"

    def test_max_permanent_addresses_is_patchable(self, client, config_file):
        res = client.put(
            "/api/v1/admin/config",
            json={"tempmail": {"max_permanent_addresses": 25}},
            headers=admin_headers(),
        )
        assert res.status_code == 200
        assert res.json()["config"]["tempmail"]["max_permanent_addresses"] == 25


# --------------------------------------------------------------------------
# username bounds come from the configuration
# --------------------------------------------------------------------------

class TestUsernameBounds:
    def test_configured_min_length_is_enforced(self, client, monkeypatch):
        monkeypatch.setattr(settings, "MIN_USERNAME_LENGTH", 6)
        too_short = client.post(
            "/api/v1/permanent-addresses",
            json={"username": "abc", "domain": "tempmail.example.com"},
        )
        assert too_short.status_code == 400
        assert "6" in too_short.text


# --------------------------------------------------------------------------
# configurable rate limits
# --------------------------------------------------------------------------

class TestConfigurableRateLimits:
    def test_limit_comes_from_settings(self, monkeypatch):
        """The limiter reads the configured value on every call."""
        import app.rate_limit as rl
        from fastapi import HTTPException

        from app.config import settings

        _WINDOWS.clear()
        monkeypatch.setattr(settings, "RL_PERMANENT_CREATE", 2)
        monkeypatch.delenv("TESTING", raising=False)
        try:
            dependency = rl.ip_rate_limit(20, 60, scope="test_rl", setting_name="RL_PERMANENT_CREATE")

            class _Req:
                headers = {"x-forwarded-for": "203.0.113.9"}
                client = None

            dependency(_Req())          # 1
            dependency(_Req())          # 2
            with pytest.raises(HTTPException) as err:
                dependency(_Req())      # 3 -> over the configured value of 2
            assert err.value.status_code == 429
            assert err.value.headers["Retry-After"] == "60"
        finally:
            os.environ["TESTING"] = "1"
            _WINDOWS.clear()

    def test_zero_disables_the_limit(self, monkeypatch):
        import app.rate_limit as rl

        from app.config import settings

        _WINDOWS.clear()
        monkeypatch.setattr(settings, "RL_PERMANENT_CREATE", 0)
        monkeypatch.delenv("TESTING", raising=False)
        try:
            dependency = rl.ip_rate_limit(20, 60, scope="test_rl0", setting_name="RL_PERMANENT_CREATE")

            class _Req:
                headers = {"x-forwarded-for": "203.0.113.10"}
                client = None

            for _ in range(50):
                dependency(_Req())  # never raises
        finally:
            os.environ["TESTING"] = "1"
            _WINDOWS.clear()

    def test_limits_are_patchable_through_the_admin_api(self, client, config_file):
        res = client.put(
            "/api/v1/admin/config",
            json={"rate_limits": {"permanent_create_per_minute": 45}},
            headers=admin_headers(),
        )
        assert res.status_code == 200, res.text
        assert res.json()["config"]["rate_limits"]["permanent_create_per_minute"] == 45
        # instant effect, no restart
        assert res.json()["restart_required"] is False

    def test_negative_limit_is_rejected(self, client, config_file):
        res = client.put(
            "/api/v1/admin/config",
            json={"rate_limits": {"address_create_per_minute": -1}},
            headers=admin_headers(),
        )
        assert res.status_code == 400


# --------------------------------------------------------------------------
# requested default limits (operator preference)
# --------------------------------------------------------------------------

class TestConfiguredLimitDefaults:
    def test_temporary_creation_default_is_50_per_minute(self):
        from app.config import Config

        cfg = Config.__new__(Config)
        cfg._apply({"domains": ["example.com"]})
        assert cfg.RL_ADDRESS_CREATE == 50

    def test_api_key_creation_is_unlimited_by_default(self):
        from app.config import Config

        cfg = Config.__new__(Config)
        cfg._apply({"domains": ["example.com"]})
        assert cfg.RL_API_CREATE == 0, "API-key creation must not be rate limited by default"

    def test_api_key_route_with_zero_limit_never_rejects(self, monkeypatch):
        import app.rate_limit as rl

        from app.config import settings

        _WINDOWS.clear()
        monkeypatch.setattr(settings, "RL_API_CREATE", 0)
        monkeypatch.delenv("TESTING", raising=False)
        try:
            dependency = rl.ip_rate_limit(0, 60, scope="test_api_create", setting_name="RL_API_CREATE")

            class _Req:
                headers = {"x-forwarded-for": "198.51.100.7"}
                client = None

            for _ in range(200):
                dependency(_Req())  # never raises
        finally:
            os.environ["TESTING"] = "1"
            _WINDOWS.clear()

    def test_overriding_via_config_is_honoured(self):
        from app.config import Config

        cfg = Config.__new__(Config)
        cfg._apply({"domains": ["example.com"],
                    "rate_limits": {"address_create_per_minute": 120,
                                    "api_create_per_minute": 300}})
        assert cfg.RL_ADDRESS_CREATE == 120
        assert cfg.RL_API_CREATE == 300


# --------------------------------------------------------------------------
# domain flow: MX check when adding a domain
# --------------------------------------------------------------------------

class TestDomainMxCheck:
    def test_check_endpoint_reports_records(self, client, config_file, monkeypatch):
        import app.routers.admin as admin_router

        def fake_check(domain):
            return {"domain": domain, "expected": "mx.tempmail.example.com",
                    "records": ["mx.tempmail.example.com"], "matches": True, "error": None}

        monkeypatch.setattr(admin_router, "check_domain_mx", fake_check)
        res = client.get("/api/v1/admin/domains/check",
                         params={"domain": "example.com"}, headers=admin_headers())
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["matches"] is True
        assert body["records"] == ["mx.tempmail.example.com"]

    def test_add_domain_returns_the_check(self, client, config_file, monkeypatch):
        import app.routers.admin as admin_router

        monkeypatch.setattr(admin_router, "check_domain_mx", lambda d: {
            "domain": d, "expected": "mx.tempmail.example.com",
            "records": [], "matches": False, "error": None})

        res = client.post("/api/v1/admin/domains", json={"domain": "newdomain.test"},
                          headers=admin_headers())
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["added"] == "newdomain.test"
        # The operator sees immediately that DNS is not ready yet.
        assert body["check"]["matches"] is False
        # Persisted to config.yaml (settings.DOMAINS is only re-read outside
        # TESTING, so assert on the file itself).
        saved = yaml.safe_load(io.open(config_file, encoding="utf-8"))
        assert "newdomain.test" in saved["domains"]

    def test_check_survives_dns_failure(self, client, config_file, monkeypatch):
        import app.routers.admin as admin_router

        def boom(domain):
            return {"domain": domain, "expected": "mx.tempmail.example.com", "records": [],
                    "matches": False, "error": "dns unavailable"}

        monkeypatch.setattr(admin_router, "check_domain_mx", boom)
        res = client.get("/api/v1/admin/domains/check",
                         params={"domain": "example.com"}, headers=admin_headers())
        assert res.status_code == 200
        assert res.json()["error"] == "dns unavailable"
