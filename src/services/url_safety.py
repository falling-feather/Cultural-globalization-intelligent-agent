import ipaddress
from urllib.parse import urlparse


class UnsafeUrlError(Exception):
    pass


def assert_url_safe_for_fetch(url: str) -> str:
    """Reject SSRF-prone URLs (private IPs, metadata, non-http)."""
    url = url.strip()
    if not url:
        raise UnsafeUrlError("URL is empty")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeUrlError("Only http and https URLs are allowed")
    if not parsed.hostname:
        raise UnsafeUrlError("Invalid URL host")

    host = parsed.hostname.lower()

    # Block obvious metadata / local hostnames
    blocked_hosts = {
        "localhost",
        "metadata.google.internal",
        "metadata",
    }
    if host in blocked_hosts or host.endswith(".local"):
        raise UnsafeUrlError("Host not allowed")

    # Resolve numeric IP if literal
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise UnsafeUrlError("Private or local IP not allowed")
        if ip.is_multicast or ip.is_unspecified:
            raise UnsafeUrlError("IP not allowed")
        # Cloud metadata
        if ip.version == 4:
            octets = str(ip).split(".")
            if len(octets) == 4 and octets[0] == "169" and octets[1] == "254":
                raise UnsafeUrlError("Link-local metadata range not allowed")
    except ValueError:
        # hostname string — block common internal patterns only; DNS rebinding risk remains for production
        pass

    if parsed.port is not None and parsed.port not in (80, 443, 8080, 8443):
        # optional strictness: allow only standard web ports
        pass

    return url
