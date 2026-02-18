"""
AES-256-GCM encryption/decryption byte-compatible with the Go API
(helpers.go Encrypt) and the former Rust service (database.rs encrypt/decrypt).

Wire format:  base64( 12-byte-nonce || ciphertext || 16-byte-GCM-tag )

Go's cipher.NewGCM Seal() prepends the nonce to (ciphertext+tag) because
it is called as `gcm.Seal(nonce, nonce, plaintext, nil)` — the first arg
is the dst prefix.  Python's cryptography library appends the tag to the
ciphertext, so we assemble: nonce + ciphertext + tag, then base64-encode.
"""

from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


_NONCE_SIZE = 12  # GCM standard nonce size
_KEY_SIZE = 32    # AES-256


def _get_key() -> bytes:
    key_b64 = os.environ.get("ENCRYPTION_KEY", "")
    if not key_b64:
        raise RuntimeError("ENCRYPTION_KEY environment variable must be set")

    key = base64.b64decode(key_b64)
    if len(key) != _KEY_SIZE:
        raise RuntimeError(
            f"ENCRYPTION_KEY must be {_KEY_SIZE} bytes after base64 decoding, "
            f"got {len(key)}"
        )
    return key


def encrypt(plaintext: str) -> str:
    """Encrypt a plaintext string and return base64(nonce + ciphertext + tag)."""
    key = _get_key()
    nonce = os.urandom(_NONCE_SIZE)
    aesgcm = AESGCM(key)

    # AESGCM.encrypt returns ciphertext + tag (16 bytes appended)
    ct_with_tag = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)

    # Wire format: nonce || ciphertext || tag
    combined = nonce + ct_with_tag
    return base64.b64encode(combined).decode("ascii")


def decrypt(encrypted: str) -> str:
    """Decrypt base64(nonce + ciphertext + tag) back to plaintext string."""
    key = _get_key()
    raw = base64.b64decode(encrypted)

    if len(raw) < _NONCE_SIZE:
        raise ValueError("Encrypted data too short")

    nonce = raw[:_NONCE_SIZE]
    ct_with_tag = raw[_NONCE_SIZE:]

    aesgcm = AESGCM(key)
    plaintext_bytes = aesgcm.decrypt(nonce, ct_with_tag, None)
    return plaintext_bytes.decode("utf-8")
