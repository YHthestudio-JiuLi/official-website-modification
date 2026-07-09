"""设备验证契约清单（与平台 shared/device_verification_codes.json 同步）。"""
from __future__ import annotations

import json
from pathlib import Path

from yh_runtime import resource_path

_MANIFEST_PATH = resource_path("device_verification_codes.json")

with _MANIFEST_PATH.open(encoding="utf-8") as _f:
    MANIFEST = json.load(_f)

FINGERPRINT_ALGO_VERSION: str = str(MANIFEST["fingerprint_algo_version"])
FINGERPRINT_HEX_LENGTH: int = int(MANIFEST["fingerprint_hex_length"])
ERROR_CODES: dict = MANIFEST["errors"]
