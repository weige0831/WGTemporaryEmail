"""Database connection and session management"""

from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from app.config import settings

# Create database engine with appropriate settings for the database type
engine_kwargs = {
    "echo": False,  # Set to True for SQL debugging
}

# SQLite (used in tests) doesn't support pool settings
if not settings.DATABASE_URL.startswith('sqlite'):
    engine_kwargs.update({
        "pool_size": settings.DB_POOL_SIZE,
        "max_overflow": settings.DB_MAX_OVERFLOW,
        "pool_pre_ping": True,  # Verify connections before using them
        "pool_recycle": 1800,  # Recycle connections after 30 minutes
        # Fail fast instead of piling up 30-second waits: a request that cannot
        # get a connection should surface the error while the client is still
        # waiting, not after it gave up.
        "pool_timeout": 10,
        # Explicit (this is also the default): a connection goes back to the
        # pool only after a rollback, so nothing is ever handed out dirty.
        "pool_reset_on_return": "rollback",
    })

engine = create_engine(settings.DATABASE_URL, **engine_kwargs)

# Create session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# Base class for SQLAlchemy models
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    Dependency for getting database session.

    Usage in FastAPI:
        @app.get("/items")
        def read_items(db: Session = Depends(get_db)):
            ...

    Yields:
        Database session that is automatically closed when done
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_connection() -> bool:
    """Check if database connection is working"""
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        db.commit()
        return True
    except Exception as e:
        print(f"Database connection error: {e}")
        return False
    finally:
        db.close()
