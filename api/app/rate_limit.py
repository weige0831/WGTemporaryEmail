"""In-memory sliding-window rate limiting.

Used to protect the public API and the admin API from brute-force and
resource-exhaustion abuse. The limiter is process-local: it is correct for
the single-uvicorn-worker deployment this project uses (see docker-compose),
but would need a shared store (e.g. Redis) if scaled horizontally.
"""

import os
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from app.config import settings

# A window holds monotonic timestamps of recent requests per key.
_WINDOWS: "defaultdict[str, deque]" = defaultdict(deque)
_LOCK = threading.Lock()
_LAST_SWEEP = 0.0
# Sweep at most this often, and only do the work when the table is large
# enough for it to matter (keeps the common path O(1)).
_SWEEP_INTERVAL_SECONDS = 60
_SWEEP_MIN_KEYS = 512


def _sweep_locked(now: float) -> None:
    """Drop keys whose window is empty. Caller must hold _LOCK."""
    global _LAST_SWEEP
    if now - _LAST_SWEEP < _SWEEP_INTERVAL_SECONDS:
        return
    _LAST_SWEEP = now
    if len(_WINDOWS) < _SWEEP_MIN_KEYS:
        return
    stale = [key for key, q in _WINDOWS.items() if not q or now - q[-1] >= 3600]
    for key in stale:
        del _WINDOWS[key]


def _is_allowed(key: str, limit: int, window_seconds: int) -> bool:
    """Return True if the request should be allowed, False if rate-limited."""
    now = time.monotonic()
    with _LOCK:
        q = _WINDOWS[key]
        # Drop timestamps older than the window.
        while q and now - q[0] >= window_seconds:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        _sweep_locked(now)
        return True


def get_client_ip(request: Request) -> str:
    """Resolve the client IP, trusting nginx's X-Forwarded-For override.

    The nginx config sets `proxy_set_header X-Forwarded-For $remote_addr`
    (overwrite, not append), so the header carries the single real client IP.
    When the API is hit directly (local dev), fall back to the socket peer.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def ip_rate_limit(
    limit: int,
    window_seconds: int = 60,
    scope: str = "",
    setting_name: str = "",
):
    """Return a FastAPI dependency enforcing a per-IP request budget.

    `limit` is the built-in default; when `setting_name` is given the value is
    read from the config (settings.<setting_name>) on every request, so the
    operator can adjust it from the admin panel without a restart. A value of 0
    disables the limit entirely.

    Disabled when TESTING is set so the test suite is unaffected.
    """

    def dependency(request: Request) -> None:
        if os.getenv("TESTING"):
            return

        effective = limit
        if setting_name:
            try:
                effective = int(getattr(settings, setting_name, limit))
            except (TypeError, ValueError):
                effective = limit
        if effective <= 0:
            return

        ip = get_client_ip(request)
        key = f"{scope}:{ip}"
        if not _is_allowed(key, effective, window_seconds):
            raise HTTPException(
                status_code=429,
                detail="Too many requests",
                headers={"Retry-After": str(window_seconds)},
            )

    return dependency
