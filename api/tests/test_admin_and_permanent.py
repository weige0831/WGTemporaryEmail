"""Tests for the admin API, the integration-key endpoint, the setup wizard and
the permanent-mailbox lifecycle - the surface that previously had no coverage.

These run against the in-memory SQLite test config (TESTING=1), so the
PostgreSQL-only trigger behaviour is not involved: the application performs the
orphan cleanup explicitly instead.
"""

import io
import os
import uuid

import pytest
import yaml

from app.models import Address, Email, EmailRecipient
from app.config import settings


@pytest.fixture
def config_file():
    """Provide a real config.yaml for the endpoints that read/write it.

    The admin config API and the setup wizard operate on settings.CONFIG_PATH,
    which points at a temporary path in test mode.
    """
    path = settings.CONFIG_PATH
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    original = None
    if os.path.exists(path):
        original = io.open(path, encoding="utf-8").read()
    data = {
        "domains": ["tempmail.example.com"],
        "admin": {"token": settings.ADMIN_TOKEN},
        "integration": {"api_key": settings.INTEGRATION_API_KEY},
        "server": {"hostname": "mx.tempmail.example.com", "docs_enabled": True},
        "database": {"url": "sqlite:///:memory:"},
        "tempmail": {"address_lifetime_hours": 24, "permanent_email_retention_days": 30},
        "setup": {"initialized": True, "key": "expected-key"},
    }
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        yaml.safe_dump(data, f, sort_keys=False)
    yield path
    if original is None:
        if os.path.exists(path):
            os.remove(path)
    else:
        with io.open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(original)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def _admin_headers():
    return {"Authorization": f"Bearer {settings.ADMIN_TOKEN}"}


def create_permanent(db, username="permuser", token=None):
    addr = Address(
        email=f"{username}@tempmail.example.com",
        token=token or f"perm-token-{uuid.uuid4().hex}",
        address_type="permanent",
        expires_at=None,
    )
    db.add(addr)
    db.commit()
    db.refresh(addr)
    return addr


# --------------------------------------------------------------------------
# public permanent-mailbox creation
# --------------------------------------------------------------------------

class TestPermanentAddresses:
    def test_create_permanent_address(self, client):
        res = client.post(
            "/api/v1/permanent-addresses",
            json={"username": "longterm", "domain": "tempmail.example.com"},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["email"] == "longterm@tempmail.example.com"
        assert data["address_type"] == "permanent"
        assert data["expires_at"] is None
        assert data["token"]

    def test_permanent_address_is_never_expired(self, client, db_session):
        res = client.post(
            "/api/v1/permanent-addresses",
            json={"username": "neverexpires", "domain": "tempmail.example.com"},
        )
        assert res.status_code == 200
        addr = db_session.query(Address).filter(
            Address.email == "neverexpires@tempmail.example.com"
        ).first()
        assert addr is not None
        assert addr.is_expired() is False

    def test_duplicate_username_conflicts(self, client):
        body = {"username": "taken", "domain": "tempmail.example.com"}
        assert client.post("/api/v1/permanent-addresses", json=body).status_code == 200
        assert client.post("/api/v1/permanent-addresses", json=body).status_code == 409

    def test_reserved_username_rejected(self, client):
        res = client.post(
            "/api/v1/permanent-addresses",
            json={"username": "postmaster", "domain": "tempmail.example.com"},
        )
        assert res.status_code == 400

    def test_unknown_domain_rejected(self, client):
        res = client.post(
            "/api/v1/permanent-addresses",
            json={"username": "somedomain", "domain": "not-configured.example"},
        )
        assert res.status_code == 400


# --------------------------------------------------------------------------
# integration API key
# --------------------------------------------------------------------------

class TestIntegrationApiKey:
    def test_missing_key_is_unauthorized(self, client):
        res = client.post(
            "/api/v1/api/addresses",
            json={"username": "apiuser", "domain": "tempmail.example.com"},
        )
        assert res.status_code == 401

    def test_wrong_key_is_unauthorized(self, client):
        res = client.post(
            "/api/v1/api/addresses",
            json={"username": "apiuser", "domain": "tempmail.example.com"},
            headers={"X-API-Key": "definitely-not-the-key"},
        )
        assert res.status_code == 401

    def test_valid_key_creates_permanent_mailbox(self, client):
        res = client.post(
            "/api/v1/api/addresses",
            json={"username": "apiuser", "domain": "tempmail.example.com"},
            headers={"X-API-Key": settings.INTEGRATION_API_KEY},
        )
        assert res.status_code == 200, res.text
        assert res.json()["address_type"] == "permanent"

    def test_key_is_never_returned_by_config_endpoint(self, client, config_file):
        """The admin config endpoint must not echo secret values."""
        res = client.get("/api/v1/admin/config", headers=_admin_headers())
        assert res.status_code == 200
        body = res.text
        assert settings.INTEGRATION_API_KEY not in body
        assert settings.ADMIN_TOKEN not in body


# --------------------------------------------------------------------------
# token info endpoint used by the /mailbox login
# --------------------------------------------------------------------------

class TestAddressInfo:
    def test_info_returns_permanent_mailbox(self, client, db_session):
        addr = create_permanent(db_session, "infomailbox")
        res = client.get(f"/api/v1/{addr.token}/info")
        assert res.status_code == 200
        data = res.json()
        assert data["email"] == addr.email
        assert data["address_type"] == "permanent"
        assert data["expires_at"] is None

    def test_unknown_token_is_404(self, client):
        assert client.get("/api/v1/not-a-real-token/info").status_code == 404


# --------------------------------------------------------------------------
# health endpoint must not leak configuration
# --------------------------------------------------------------------------

class TestHealthPayload:
    def test_health_hides_domains(self, client):
        res = client.get("/api/v1/health")
        assert res.status_code in (200, 503)
        assert set(res.json().keys()) == {"status", "database"}


# --------------------------------------------------------------------------
# deleting one mailbox's copy must not destroy the shared message
# --------------------------------------------------------------------------

class TestSharedMessageDeletion:
    def test_delete_keeps_other_recipients_copy(self, client, db_session):
        a1 = create_permanent(db_session, "first", token="token-first")
        a2 = create_permanent(db_session, "second", token="token-second")

        email = Email(
            message_id="<shared@example.com>",
            subject="shared",
            from_address="sender@example.com",
            to_address=a1.email,
            raw_headers="",
            raw_message=b"raw",
            size_bytes=3,
        )
        db_session.add(email)
        db_session.commit()
        db_session.add_all([
            EmailRecipient(email_id=email.id, address_id=a1.id),
            EmailRecipient(email_id=email.id, address_id=a2.id),
        ])
        db_session.commit()

        res = client.delete(f"/api/v1/{a1.token}/emails/{email.id}")
        assert res.status_code == 204

        remaining = db_session.query(Email).filter(Email.id == email.id).first()
        assert remaining is not None, "the other mailbox's copy must survive"
        assert db_session.query(EmailRecipient).filter(
            EmailRecipient.email_id == email.id
        ).count() == 1

        # When the second mailbox deletes it too, the message goes away.
        assert client.delete(f"/api/v1/{a2.token}/emails/{email.id}").status_code == 204
        assert db_session.query(Email).filter(Email.id == email.id).first() is None


# --------------------------------------------------------------------------
# setup wizard
# --------------------------------------------------------------------------

class TestSetupWizard:
    def test_status_exposes_retention_days(self, client, config_file):
        res = client.get("/api/v1/setup/status")
        assert res.status_code == 200
        data = res.json()
        assert "permanent_email_retention_days" in data
        assert data["initialized"] is True

    def test_complete_requires_setup_key_when_uninitialized(self, client, monkeypatch, config_file):
        monkeypatch.setattr(settings, "SETUP_INITIALIZED", False)
        monkeypatch.setattr(settings, "SETUP_KEY", "expected-key")

        res = client.post(
            "/api/v1/setup/complete",
            json={"domains": ["tempmail.example.com"], "hostname": "mx.tempmail.example.com"},
        )
        assert res.status_code == 403

        res = client.post(
            "/api/v1/setup/complete",
            json={
                "domains": ["tempmail.example.com"],
                "hostname": "mx.tempmail.example.com",
                "setup_key": "wrong-key",
            },
        )
        assert res.status_code == 403

    def test_complete_is_forbidden_once_initialized(self, client, config_file):
        res = client.post(
            "/api/v1/setup/complete",
            json={"domains": ["tempmail.example.com"], "hostname": "mx.tempmail.example.com"},
        )
        assert res.status_code == 403
        assert "already been completed" in res.text


# --------------------------------------------------------------------------
# admin API surface
# --------------------------------------------------------------------------

class TestAdminSurface:
    def test_requires_auth(self, client):
        for path in ("/api/v1/admin/stats", "/api/v1/admin/addresses", "/api/v1/admin/apikey/status"):
            assert client.get(path).status_code == 401, path

    def test_stats_counts_permanent_mailboxes_as_active(self, client, db_session):
        create_permanent(db_session, "activeperm")
        res = client.get("/api/v1/admin/stats", headers=_admin_headers())
        assert res.status_code == 200
        assert res.json()["active_addresses"] >= 1

    def test_address_list_handles_null_expiry(self, client, db_session):
        create_permanent(db_session, "nullmailbox")
        res = client.get(
            "/api/v1/admin/addresses",
            params={"search": "nullmailbox"},
            headers=_admin_headers(),
        )
        assert res.status_code == 200, res.text
        items = res.json()["items"]
        assert items and items[0]["address_type"] == "permanent"
        assert items[0]["expires_at"] is None
        assert items[0]["is_expired"] is False

    def test_config_rejects_invalid_hostname(self, client, config_file):
        res = client.put(
            "/api/v1/admin/config",
            json={"server": {"hostname": "evil.example.com --server=https://attacker"}},
            headers=_admin_headers(),
        )
        assert res.status_code == 400

    def test_config_rejects_non_whitelisted_key(self, client, config_file):
        res = client.put(
            "/api/v1/admin/config",
            json={"database": {"url": "postgresql://x:y@z/db"}},
            headers=_admin_headers(),
        )
        assert res.status_code == 400


# --------------------------------------------------------------------------
# permanent-address management (admin panel page)
# --------------------------------------------------------------------------

class TestPermanentManagement:
    def test_stats_shape(self, client, db_session):
        create_permanent(db_session, "statbox")
        res = client.get("/api/v1/admin/permanent-addresses/stats", headers=_admin_headers())
        assert res.status_code == 200, res.text
        data = res.json()
        for key in ("total", "with_emails", "total_emails", "size_bytes",
                    "retention_days", "max_allowed"):
            assert key in data
        assert data["total"] >= 1
        assert data["retention_days"] == settings.PERMANENT_EMAIL_RETENTION_DAYS

    def test_list_only_returns_permanent(self, client, db_session):
        create_permanent(db_session, "listedbox")
        # a temporary address must not show up here
        db_session.add(Address(email="tempbox@tempmail.example.com", token="temp-token-x",
                               address_type="temp", expires_at=None))
        db_session.commit()

        res = client.get("/api/v1/admin/permanent-addresses", headers=_admin_headers())
        assert res.status_code == 200
        emails = [i["email"] for i in res.json()["items"]]
        assert "listedbox@tempmail.example.com" in emails
        assert "tempbox@tempmail.example.com" not in emails

    def test_search_filters(self, client, db_session):
        create_permanent(db_session, "findme")
        res = client.get("/api/v1/admin/permanent-addresses",
                         params={"search": "findme"}, headers=_admin_headers())
        assert res.status_code == 200
        assert [i["email"] for i in res.json()["items"]] == ["findme@tempmail.example.com"]

    def test_admin_create_returns_token_once(self, client):
        res = client.post("/api/v1/admin/permanent-addresses",
                          json={"username": "adminmade", "domain": "tempmail.example.com"},
                          headers=_admin_headers())
        assert res.status_code == 201, res.text
        data = res.json()
        assert data["email"] == "adminmade@tempmail.example.com"
        assert len(data["token"]) > 30

        # the token actually works
        info = client.get(f"/api/v1/{data['token']}/info")
        assert info.status_code == 200
        assert info.json()["address_type"] == "permanent"

    def test_admin_create_requires_auth(self, client):
        res = client.post("/api/v1/admin/permanent-addresses", json={"username": "nope"})
        assert res.status_code == 401

    def test_admin_create_respects_cap(self, client, monkeypatch):
        monkeypatch.setattr(settings, "MAX_PERMANENT_ADDRESSES", 1)
        first = client.post("/api/v1/admin/permanent-addresses",
                            json={"username": "capone", "domain": "tempmail.example.com"},
                            headers=_admin_headers())
        assert first.status_code == 201
        second = client.post("/api/v1/admin/permanent-addresses",
                             json={"username": "captwo", "domain": "tempmail.example.com"},
                             headers=_admin_headers())
        assert second.status_code == 403

    def test_purge_emails_keeps_the_address(self, client, db_session):
        addr = create_permanent(db_session, "purgebox")
        email = Email(message_id="<p@example.com>", subject="s", from_address="a@example.com",
                      to_address=addr.email, raw_headers="", raw_message=b"x", size_bytes=1)
        db_session.add(email)
        db_session.commit()
        db_session.add(EmailRecipient(email_id=email.id, address_id=addr.id))
        db_session.commit()

        # Read the ids while the objects are still attached: the request deletes
        # the row through its own session, after which these instances are stale.
        addr_id, email_id = addr.id, email.id

        res = client.post(f"/api/v1/admin/permanent-addresses/{addr_id}/purge-emails",
                          headers=_admin_headers())
        assert res.status_code == 200, res.text
        assert res.json()["deleted_emails"] == 1

        db_session.expunge_all()
        assert db_session.query(Address).filter(Address.id == addr_id).first() is not None
        assert db_session.query(Email).filter(Email.id == email_id).first() is None

    def test_purge_rejects_temporary_address(self, client, db_session):
        temp = Address(email="temp-target@tempmail.example.com", token="temp-token-y",
                       address_type="temp", expires_at=None)
        db_session.add(temp)
        db_session.commit()
        res = client.post(f"/api/v1/admin/permanent-addresses/{temp.id}/purge-emails",
                          headers=_admin_headers())
        assert res.status_code == 404

    def test_run_retention_endpoint(self, client):
        res = client.post("/api/v1/admin/permanent-addresses/run-retention", headers=_admin_headers())
        assert res.status_code == 200
        assert "retention_deleted_emails" in res.json()

    def test_management_endpoints_require_auth(self, client):
        for path in ("/api/v1/admin/permanent-addresses",
                     "/api/v1/admin/permanent-addresses/stats"):
            assert client.get(path).status_code == 401, path
