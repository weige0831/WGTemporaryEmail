"""Tempmail Server FastAPI application"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import faulthandler
import threading
import logging
import os
import time

from app.config import settings
from app.database import check_db_connection
from app.routers import addresses_router, emails_router, admin_router, setup_router, permanent_router
from app.routers.setup import ensure_setup_key
from app.cleanup import run_cleanup_loop
from app.runtime_config import read_config, write_web_config

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Optional stack dumps: when FAULTHANDLER_SECONDS is set (e.g. 120), Python
# prints the stack of every thread to stderr at that interval. If the service
# ever hangs again (pool exhaustion, deadlock), `docker logs` then shows exactly
# where the threads are stuck instead of leaving us to guess.
_faulthandler_seconds = int(os.getenv('FAULTHANDLER_SECONDS', '0') or 0)
if _faulthandler_seconds > 0:
    faulthandler.enable()
    faulthandler.dump_traceback_later(_faulthandler_seconds, repeat=True)

# Create FastAPI app
app = FastAPI(
    title="Tempmail Server API",
    description="Tempmail backend API - receive and manage temporary email addresses",
    version="1.1.9",
    docs_url="/docs" if settings.DOCS_ENABLED else None,
    redoc_url="/redoc" if settings.DOCS_ENABLED else None,
    openapi_url="/openapi.json" if settings.DOCS_ENABLED else None
)

# CORS middleware - configured via config.yaml
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOW_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
)


@app.on_event("startup")
async def startup_event():
    """Run on application startup"""
    # Skip startup tasks in test mode
    if os.getenv("TESTING"):
        logger.info("Running in test mode - skipping startup tasks")
        return

    logger.info("Tempmail Server API starting...")

    # A config copied from the example still carries the placeholder password.
    if 'CHANGE_THIS' in settings.DATABASE_URL or 'change_this' in settings.DATABASE_URL:
        raise Exception(
            "Database password is still the example placeholder - set a real one in config.yaml / .env"
        )

    # Check database connection
    if not check_db_connection():
        logger.error("Failed to connect to database!")
        raise Exception("Database connection failed")

    logger.info("Database connection successful")
    logger.info(f"Configured domains: {settings.DOMAINS}")
    logger.info(f"Address lifetime: {settings.ADDRESS_LIFETIME_HOURS}h")
    logger.info(f"CORS allowed origins: {settings.CORS_ALLOW_ORIGINS}")

    # While the instance is uninitialized the setup wizard is reachable
    # unauthenticated, so it is gated by a one-time key. Make sure one exists
    # and print it where only someone with server access can read it.
    if not settings.SETUP_INITIALIZED:
        try:
            key = ensure_setup_key(read_config())
            logger.warning("=" * 62)
            logger.warning("First-run setup is pending. Setup key: %s", key)
            logger.warning("Enter it in the setup wizard (/setup) to finish initialization.")
            logger.warning("=" * 62)
        except Exception as e:  # never block startup on this
            logger.error("Could not prepare the setup key: %s", e)

    # Publish the handful of settings nginx needs (panel hostname, IP-access
    # policy, TLS/docs switches) into a separate file, so the web container no
    # longer needs config.yaml with its DB password and admin token.
    try:
        write_web_config()
        logger.info("Published web-config.env for the nginx container")
    except Exception as e:
        logger.error("Could not publish web-config.env: %s", e)

    # Start cleanup thread
    cleanup_thread = threading.Thread(target=run_cleanup_loop, daemon=True)
    cleanup_thread.start()
    logger.info("Cleanup thread started")

    # Pool watchdog: a request that hangs keeps its connection until the client
    # gives up, and if enough of them pile up the pool starves and every later
    # request fails. Watching the checked-out count turns that silent failure
    # into a log line (with thread stacks) while it is still developing.
    threading.Thread(target=_pool_watchdog, daemon=True).start()

    logger.info("Tempmail Server API ready!")


def _pool_watchdog(interval_seconds: int = 30) -> None:
    """Log a warning (and dump thread stacks) when the DB pool runs low."""
    import re as _re
    import time as _time

    warned = False
    while True:
        _time.sleep(interval_seconds)
        try:
            from app.database import engine

            if not hasattr(engine, "pool") or not hasattr(engine.pool, "status"):
                continue
            status = engine.pool.status()
            match = _re.search(r"Checked out connections: (\d+)", status)
            if not match:
                continue
            checked_out = int(match.group(1))
            capacity = getattr(engine.pool, "size", lambda: 0)() + getattr(engine.pool, "_max_overflow", 0)
            if capacity and checked_out >= max(1, int(capacity * 0.8)):
                logger.warning("DB pool nearly exhausted (%d/%d): %s", checked_out, capacity, status)
                faulthandler.dump_traceback()
                warned = True
            elif warned:
                logger.info("DB pool back to normal: %s", status)
                warned = False
        except Exception as exc:  # never let the watchdog kill the app
            logger.debug("Pool watchdog error: %s", exc)


@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown"""
    logger.info("Tempmail Server API shutting down...")


# Health check endpoint with rate limiting
_last_health_check = {"time": 0, "result": None}
_health_check_cache_seconds = 5

@app.get("/api/v1/health")
def health_check():
    """Health check endpoint for monitoring (cached for 5 seconds).

    Deliberately unauthenticated and therefore kept free of configuration
    detail: it reports only service liveness.
    """
    now = time.time()

    # Use cached result if less than 5 seconds old
    if now - _last_health_check["time"] < _health_check_cache_seconds and _last_health_check["result"]:
        return _last_health_check["result"]

    # Perform actual health check
    db_ok = check_db_connection()

    result = JSONResponse(
        status_code=200 if db_ok else 503,
        content={
            "status": "healthy" if db_ok else "unhealthy",
            "database": "connected" if db_ok else "disconnected"
        }
    )

    # Update cache
    _last_health_check["time"] = now
    _last_health_check["result"] = result

    return result


# Include routers
# The admin router must be registered first: the emails router exposes
# /{token}/emails patterns that would otherwise shadow /admin/emails.
app.include_router(setup_router)
app.include_router(admin_router)
app.include_router(permanent_router)
app.include_router(addresses_router)
app.include_router(emails_router)


# Error handlers
@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={"detail": "Not found"}
    )


@app.exception_handler(500)
async def internal_error_handler(request, exc):
    logger.error(f"Internal error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=True,  # For development
        log_level=settings.LOG_LEVEL.lower()
    )
