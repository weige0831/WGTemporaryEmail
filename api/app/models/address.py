"""Address model - temporary email addresses and permanent mailboxes"""

from sqlalchemy import Column, String, DateTime
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime

from app.database import Base
from app.types import GUID


class Address(Base):
    __tablename__ = "addresses"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    address_type = Column(String(10), nullable=False, default='temp')  # temp | permanent
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True, index=True)  # NULL = permanent

    # Relationships
    email_recipients = relationship("EmailRecipient", back_populates="address", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Address {self.email}>"

    def is_expired(self) -> bool:
        """Check if this address has expired (permanent mailboxes never do)."""
        if self.address_type == 'permanent':
            return False
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at
