"""
SSRF guard for outbound HTTP/webhook tasks.

``http`` and ``webhook`` tasks fetch fully user-controlled URLs. Without a guard,
a workflow could reach internal services, localhost, or the cloud metadata
endpoint (169.254.169.254) and exfiltrate credentials. This module resolves the
target host and blocks private / loopback / link-local / reserved addresses.

Self-hosters who genuinely need to call internal services can opt out with
``FLINT_ALLOW_PRIVATE_URLS=true``.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urlparse

from flint.config import get_settings


class BlockedURLError(Exception):
    """Raised when a URL targets a disallowed (internal/private) address."""


# Hostnames that are always blocked regardless of DNS.
_BLOCKED_HOSTNAMES = {"localhost", "metadata.google.internal"}


def _is_disallowed_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True  # unparseable → treat as unsafe
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local     # includes 169.254.0.0/16 (cloud metadata)
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


async def assert_safe_url(url: str) -> None:
    """
    Validate that ``url`` uses http(s) and resolves to a public address.

    Raises BlockedURLError if the scheme is unsupported or the host resolves to
    a private/loopback/link-local/reserved address. No-op when
    FLINT_ALLOW_PRIVATE_URLS is enabled.
    """
    settings = get_settings()
    if settings.allow_private_urls:
        return

    parsed = urlparse(url)
    scheme = (parsed.scheme or "").lower()
    if scheme not in ("http", "https"):
        raise BlockedURLError(
            f"Blocked URL scheme '{scheme or '(none)'}': only http and https are allowed."
        )

    host = parsed.hostname
    if not host:
        raise BlockedURLError("Blocked URL: no host.")

    if host.lower() in _BLOCKED_HOSTNAMES:
        raise BlockedURLError(f"Blocked host '{host}': internal/loopback addresses are not allowed.")

    # If the host is already a literal IP, check it directly.
    try:
        ipaddress.ip_address(host)
        if _is_disallowed_ip(host):
            raise BlockedURLError(f"Blocked address '{host}': private/internal ranges are not allowed.")
        return
    except ValueError:
        pass  # hostname, needs DNS resolution

    # Resolve the hostname off the event loop; block if ANY resolved address is internal.
    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, host, None)
    except socket.gaierror as exc:
        raise BlockedURLError(f"Could not resolve host '{host}': {exc}") from exc

    for info in infos:
        addr = info[4][0]
        if _is_disallowed_ip(addr):
            raise BlockedURLError(
                f"Blocked host '{host}' → {addr}: resolves to a private/internal address."
            )
