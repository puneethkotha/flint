"""Rate limiter for Flint API — 60/minute per IP on /api/v1/*, exempt /health."""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
