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

# A window holds monotonic timestamps of recent requests per key.
_WINDOWS: "defaultdict[str, deque]" = defaultdict(deque)
_LOCK = threading.Lock()


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
        return True


def get_client_ip(request: Request) -> str:
    """Resolve the client IP, trusting nginx's X-Forwarded-For override.

    The web/nginx.conf sets `proxy_set_header X-Forwarded-For $remote_addr`
    (overwrite, not append), so the header carries the single real client IP.
    When the API is hit directly (local dev), fall back to the socket peer.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def ip_rate_limit(limit: int, window_seconds: int = 60, scope: str = ""):
    """Return a FastAPI dependency enforcing `limit` requests per window per IP.

    Disabled when TESTING is set so the test suite is unaffected.
    """

    def dependency(request: Request) -> None:
        if os.getenv("TESTING"):
            return
        ip = get_client_ip(request)
        key = f"{scope}:{ip}"
        if not _is_allowed(key, limit, window_seconds):
            raise HTTPException(
                status_code=429,
                detail="请求过于频繁，请稍后再试",
                headers={"Retry-After": str(window_seconds)},
            )

    return dependency
