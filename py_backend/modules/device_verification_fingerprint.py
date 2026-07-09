"""设备指纹规范化与绑定完整性校验。"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional

from .device_verification_errors import (
    DeviceVerificationError,
    DEVICE_DISABLED,
    FINGERPRINT_ALGO_MISMATCH,
    FINGERPRINT_BINDING_INVALID,
    FINGERPRINT_ALGO_VERSION,
    FINGERPRINT_HEX_LENGTH,
    FINGERPRINT_REQUIRED,
    INVALID_FINGERPRINT,
    QUOTA_EXHAUSTED,
)

_FINGERPRINT_HEX_RE = re.compile(rf"^[0-9a-f]{{{FINGERPRINT_HEX_LENGTH}}}$")


def normalize_fingerprint(fingerprint: Any) -> Optional[str]:
    if fingerprint is None:
        return None
    raw = str(fingerprint).strip().lower()
    if raw == "":
        return None
    if _FINGERPRINT_HEX_RE.fullmatch(raw) is None:
        raise ValueError("Invalid device_fingerprint format")
    return raw


def normalize_fingerprint_algo_version(version: Any) -> Optional[str]:
    if version is None:
        return FINGERPRINT_ALGO_VERSION
    raw = str(version).strip()
    if raw == "":
        return FINGERPRINT_ALGO_VERSION
    if len(raw) > 16:
        raise ValueError("Invalid fingerprint_algo_version format")
    if re.fullmatch(r"[A-Za-z0-9._-]+", raw) is None:
        raise ValueError("Invalid fingerprint_algo_version format")
    if raw != FINGERPRINT_ALGO_VERSION:
        raise ValueError(f"Unsupported fingerprint_algo_version, expected {FINGERPRINT_ALGO_VERSION}")
    return raw


def require_fingerprint(fingerprint: Any) -> str:
    try:
        normalized = normalize_fingerprint(fingerprint)
    except ValueError as exc:
        raise DeviceVerificationError(INVALID_FINGERPRINT) from exc
    if not normalized:
        raise DeviceVerificationError(FINGERPRINT_REQUIRED)
    return normalized


def assert_binding_row_integrity(row: Dict[str, Any]) -> None:
    try:
        stored_fp = normalize_fingerprint(row.get("device_fingerprint"))
        normalize_fingerprint_algo_version(row.get("fingerprint_algo_version"))
    except ValueError as exc:
        raise DeviceVerificationError(FINGERPRINT_BINDING_INVALID) from exc
    if not stored_fp:
        raise DeviceVerificationError(FINGERPRINT_BINDING_INVALID)


def assert_algo_version(fingerprint_algo_version: Any) -> None:
    try:
        provided = normalize_fingerprint_algo_version(fingerprint_algo_version)
    except ValueError as exc:
        raise DeviceVerificationError(FINGERPRINT_ALGO_MISMATCH) from exc
    expected = normalize_fingerprint_algo_version(FINGERPRINT_ALGO_VERSION)
    if provided != expected:
        raise DeviceVerificationError(FINGERPRINT_ALGO_MISMATCH)


def assert_enabled(row: Dict[str, Any]) -> None:
    if int(row.get("is_whitelisted") or 0) != 1:
        raise DeviceVerificationError(DEVICE_DISABLED)


def assert_quota(row: Dict[str, Any]) -> None:
    if int(row["verification_count"]) >= int(row["max_verifications"]):
        raise DeviceVerificationError(QUOTA_EXHAUSTED)
