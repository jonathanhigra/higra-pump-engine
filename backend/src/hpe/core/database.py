"""Database engine and session management."""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from hpe.core.config import settings

engine = create_engine(settings.database_url, echo=settings.debug)
SessionLocal = sessionmaker(bind=engine)


def get_session() -> Session:
    """Create a new database session."""
    return SessionLocal()
