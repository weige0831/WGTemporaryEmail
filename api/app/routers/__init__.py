"""Routers package"""

from app.routers.addresses import router as addresses_router
from app.routers.emails import router as emails_router
from app.routers.admin import router as admin_router
from app.routers.setup import router as setup_router

__all__ = ["addresses_router", "emails_router", "admin_router", "setup_router"]
