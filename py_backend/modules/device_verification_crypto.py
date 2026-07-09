"""平台 Ed25519 签名私钥的解析、加密存储与验签。"""
from __future__ import annotations

import base64
import binascii
import hashlib
import os
import re
from typing import Callable

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .device_verification_errors import DeviceVerificationError, PLATFORM_SIGNING_KEY_MISSING


class PlatformSigningCrypto:
    """平台签名密钥：从库中加载加密私钥并完成签名/验签。"""

    def __init__(self, get_encrypted_setting: Callable[[], str]) -> None:
        self._get_encrypted_setting = get_encrypted_setting

    def _master_encryption_key(self) -> bytes:
        """平台私钥加密主密钥（生产环境必须设置 DEVICE_SIGNING_ENCRYPTION_SECRET）。"""
        secret = os.environ.get("DEVICE_SIGNING_ENCRYPTION_SECRET", "").strip()
        if not secret:
            node_env = os.environ.get("NODE_ENV", "development").strip().lower()
            if node_env == "production":
                raise DeviceVerificationError(
                    PLATFORM_SIGNING_KEY_MISSING,
                    "DEVICE_SIGNING_ENCRYPTION_SECRET is required when NODE_ENV=production.",
                    503,
                )
            secret = "yh-device-signing-dev-only-change-in-production"
        return hashlib.sha256(secret.encode("utf-8")).digest()

    def encrypt_platform_secret(self, key_bytes: bytes) -> str:
        aesgcm = AESGCM(self._master_encryption_key())
        nonce = os.urandom(12)
        ciphertext = aesgcm.encrypt(nonce, key_bytes, None)
        return base64.b64encode(nonce + ciphertext).decode("ascii")

    def _decrypt_platform_secret(self, encrypted: str) -> bytes:
        aesgcm = AESGCM(self._master_encryption_key())
        data = base64.b64decode(encrypted)
        nonce = data[:12]
        ciphertext = data[12:]
        return aesgcm.decrypt(nonce, ciphertext, None)

    def parse_ed25519_private_key(self, private_key_input: str) -> bytes:
        """解析 Ed25519 私钥：支持 PEM、Base64 原始 32 字节、十六进制。"""
        raw = private_key_input.strip()
        if raw == "":
            raise ValueError("signing_private_key cannot be empty")

        if "BEGIN" in raw:
            pem_bytes = raw.encode("utf-8")
            try:
                key = serialization.load_pem_private_key(pem_bytes, password=None)
            except TypeError as exc:
                raise ValueError("不支持加密私钥，请提供未加密的 PEM") from exc
            except Exception:
                try:
                    key = serialization.load_ssh_private_key(pem_bytes, password=None)
                except Exception as exc:
                    raise ValueError("无法解析 PEM / OpenSSH 私钥") from exc
            if not isinstance(key, Ed25519PrivateKey):
                raise ValueError("私钥必须是 Ed25519 类型")
            return self._ed25519_seed_from_key_object(key)

        compact = re.sub(r"\s+", "", raw)
        if re.fullmatch(r"[0-9a-fA-F]+", compact or ""):
            if len(compact) == 64:
                return self._normalize_ed25519_seed(bytes.fromhex(compact))
            if len(compact) == 128:
                return self._normalize_ed25519_seed(bytes.fromhex(compact)[:32])

        try:
            decoded = base64.b64decode(compact, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError(
                "无法识别私钥格式；支持完整 PEM、PKCS#8 Base64、32 字节种子 Base64 或十六进制"
            ) from exc
        try:
            der_key = serialization.load_der_private_key(decoded, password=None)
            return self._ed25519_seed_from_key_object(der_key)
        except Exception:
            pass
        return self._normalize_ed25519_seed(decoded)

    def _ed25519_seed_from_key_object(self, key: Ed25519PrivateKey) -> bytes:
        if not isinstance(key, Ed25519PrivateKey):
            raise ValueError("私钥必须是 Ed25519 类型")
        return key.private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption(),
        )

    def _normalize_ed25519_seed(self, data: bytes) -> bytes:
        if len(data) == 32:
            seed = data
        elif len(data) == 64:
            seed = data[:32]
        else:
            raise ValueError("Ed25519 私钥长度无效；需要 32 字节种子")
        Ed25519PrivateKey.from_private_bytes(seed)
        return seed

    @staticmethod
    def public_key_b64_from_private_bytes(private_bytes: bytes) -> str:
        """从 Ed25519 私钥种子导出公钥 Base64（与设备端 platform_public_key.py 一致）。"""
        private_key = Ed25519PrivateKey.from_private_bytes(private_bytes)
        public_bytes = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        return base64.b64encode(public_bytes).decode("ascii")

    def _public_bytes_from_private(self, private_bytes: bytes) -> bytes:
        private_key = Ed25519PrivateKey.from_private_bytes(private_bytes)
        return private_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )

    def load_platform_signing_private_bytes(self) -> bytes:
        encrypted = str(self._get_encrypted_setting() or "").strip()
        if not encrypted:
            raise DeviceVerificationError(PLATFORM_SIGNING_KEY_MISSING, http_status=503)
        try:
            return self._decrypt_platform_secret(encrypted)
        except Exception as exc:
            raise DeviceVerificationError(
                PLATFORM_SIGNING_KEY_MISSING,
                "Platform signing key is invalid or corrupted.",
                503,
            ) from exc

    def load_platform_signing_public_bytes(self) -> bytes:
        return self._public_bytes_from_private(self.load_platform_signing_private_bytes())

    @staticmethod
    def canonical_message(fingerprint: str, issued_at: int) -> bytes:
        """签名/验签消息：fingerprint|issued_at。"""
        return f"{fingerprint}|{issued_at}".encode("utf-8")

    def sign_payload(self, fingerprint: str, issued_at: int) -> str:
        private_bytes = self.load_platform_signing_private_bytes()
        private_key = Ed25519PrivateKey.from_private_bytes(private_bytes)
        signature = private_key.sign(self.canonical_message(fingerprint, issued_at))
        return base64.b64encode(signature).decode("ascii")

    def verify_signature(self, fingerprint: str, signature: str, issued_at: int) -> bool:
        try:
            public_bytes = self.load_platform_signing_public_bytes()
            public_key = Ed25519PublicKey.from_public_bytes(public_bytes)
            signature_bytes = base64.b64decode(signature)
            public_key.verify(signature_bytes, self.canonical_message(fingerprint, issued_at))
            return True
        except Exception:
            return False
