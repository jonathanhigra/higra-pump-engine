"""API middleware — rate limiting, multitenancy, request logging."""

from __future__ import annotations

import time
from collections import defaultdict

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory rate limiter per IP address.

    Limits requests per minute to prevent abuse. In production,
    replace with Redis-backed rate limiting.

    Args:
        app: FastAPI application.
        requests_per_minute: Maximum requests per IP per minute.
    """

    def __init__(self, app, requests_per_minute: int = 60):  # type: ignore[no-untyped-def]
        super().__init__(app)
        self.rpm = requests_per_minute
        self._requests: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()

        # Clean old entries
        self._requests[client_ip] = [
            t for t in self._requests[client_ip] if now - t < 60.0
        ]

        if len(self._requests[client_ip]) >= self.rpm:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please try again later.",
            )

        self._requests[client_ip].append(now)
        response = await call_next(request)

        # Add rate limit headers
        remaining = self.rpm - len(self._requests[client_ip])
        response.headers["X-RateLimit-Limit"] = str(self.rpm)
        response.headers["X-RateLimit-Remaining"] = str(max(0, remaining))

        return response


class MultitenancyMiddleware(BaseHTTPMiddleware):
    """Extract user context from JWT and attach to request state.

    Enables per-user project isolation without changing endpoint code.
    """

    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        # Extract user_id from authorization header if present
        auth = request.headers.get("authorization", "")
        user_id = "anonymous"

        if auth.startswith("Bearer "):
            token = auth[7:]
            try:
                from hpe.api.auth import decode_token
                payload = decode_token(token)
                user_id = payload.get("sub", "anonymous")
            except Exception:
                pass

        request.state.user_id = user_id
        response = await call_next(request)
        return response
