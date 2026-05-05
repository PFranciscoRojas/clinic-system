"""AES-256-GCM envelope encryption — mirrors Go's shared/crypto package.

Wire format: nonce (12 bytes) || ciphertext || GCM tag (16 bytes).
This is the same layout produced by Go's crypto.Seal / crypto.Open.
"""
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

NONCE_SIZE = 12
KEY_SIZE = 32


def seal(key: bytes, plaintext: bytes) -> bytes:
    if len(key) != KEY_SIZE:
        raise ValueError(f"key must be {KEY_SIZE} bytes for AES-256-GCM")
    nonce = os.urandom(NONCE_SIZE)
    aesgcm = AESGCM(key)
    ciphertext_tag = aesgcm.encrypt(nonce, plaintext, None)
    return nonce + ciphertext_tag


def open_(key: bytes, ciphertext: bytes) -> bytes:
    if len(key) != KEY_SIZE:
        raise ValueError(f"key must be {KEY_SIZE} bytes for AES-256-GCM")
    if len(ciphertext) < NONCE_SIZE:
        raise ValueError("ciphertext too short")
    nonce, body = ciphertext[:NONCE_SIZE], ciphertext[NONCE_SIZE:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, body, None)
