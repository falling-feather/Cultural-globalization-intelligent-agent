import pytest

from src.services.url_safety import UnsafeUrlError, assert_url_safe_for_fetch


def test_blocks_private_ip():
    with pytest.raises(UnsafeUrlError):
        assert_url_safe_for_fetch("http://192.168.1.1/")


def test_blocks_loopback():
    with pytest.raises(UnsafeUrlError):
        assert_url_safe_for_fetch("http://127.0.0.1/test")


def test_blocks_non_http():
    with pytest.raises(UnsafeUrlError):
        assert_url_safe_for_fetch("file:///etc/passwd")


def test_allows_public_https():
    u = assert_url_safe_for_fetch("https://example.com/path")
    assert "example.com" in u
