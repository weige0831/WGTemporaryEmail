"""Background cleanup job for expired addresses and storage cap enforcement"""

import time
import logging
from sqlalchemy import text

from app.database import SessionLocal
from app.config import settings

logger = logging.getLogger(__name__)


def cleanup_expired_addresses():
    """
    Delete expired addresses and their associated emails.

    This is run periodically as a background task and can also be triggered
    manually from the admin API. Returns the number of deleted addresses.
    """
    db = None
    try:
        db = SessionLocal()
        # Call the database function to cleanup
        result = db.execute(text("SELECT cleanup_expired_addresses()"))
        deleted_count = result.scalar()

        if deleted_count and deleted_count > 0:
            logger.info(f"Cleanup: Deleted {deleted_count} expired addresses")
        else:
            logger.debug("Cleanup: No expired addresses to delete")

        db.commit()
        return deleted_count or 0

    except Exception as e:
        logger.error(f"Cleanup error: {e}")
        if db:
            db.rollback()
        return 0

    finally:
        if db:
            db.close()


def get_storage_usage_bytes(db) -> int:
    """Return total size of all stored emails (raw message incl. attachments)."""
    result = db.execute(text("SELECT COALESCE(SUM(size_bytes), 0) FROM emails"))
    return int(result.scalar() or 0)


def enforce_storage_limit():
    """
    Enforce the global storage cap (tempmail.max_storage_mb).

    Deletes the oldest emails across all addresses until total email size
    falls below the cap. Returns the number of deleted emails. A value of 0
    for max_storage_mb disables the cap.
    """
    if settings.MAX_STORAGE_MB <= 0:
        return 0

    limit_bytes = settings.MAX_STORAGE_MB * 1024 * 1024
    db = None
    try:
        db = SessionLocal()

        usage = get_storage_usage_bytes(db)
        if usage <= limit_bytes:
            return 0

        # Keep the newest emails whose cumulative size fits within the cap;
        # delete everything older. Cumulative sum runs from newest to oldest,
        # so emails with cum > limit are the oldest tail to remove.
        result = db.execute(text("""
            WITH ranked AS (
                SELECT id,
                       SUM(size_bytes) OVER (
                           ORDER BY received_at DESC, id DESC
                       ) AS cum
                FROM emails
            )
            DELETE FROM emails
            WHERE id IN (SELECT id FROM ranked WHERE cum > :limit_bytes)
        """), {"limit_bytes": limit_bytes})

        deleted = result.rowcount or 0
        db.commit()

        if deleted > 0:
            logger.info(
                f"Storage cleanup: deleted {deleted} oldest emails "
                f"(was {usage / 1024 / 1024:.1f} MB, cap {settings.MAX_STORAGE_MB} MB)"
            )

        return deleted

    except Exception as e:
        logger.error(f"Storage cleanup error: {e}")
        if db:
            db.rollback()
        return 0

    finally:
        if db:
            db.close()


def run_cleanup_loop():
    """
    Run cleanup in an infinite loop.

    This is meant to be run in a separate thread or process.
    """
    interval_seconds = settings.CLEANUP_INTERVAL_HOURS * 3600

    logger.info(f"Starting cleanup loop (interval: {settings.CLEANUP_INTERVAL_HOURS}h)")

    while True:
        try:
            cleanup_expired_addresses()
            enforce_storage_limit()
        except Exception as e:
            logger.error(f"Cleanup loop error: {e}")

        # Sleep until next run
        time.sleep(interval_seconds)


if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    # Run cleanup loop
    run_cleanup_loop()
