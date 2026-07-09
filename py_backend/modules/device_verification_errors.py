"""设备验证结构化错误码（契约源：shared/device_verification_codes.json）。"""
from __future__ import annotations

import json
from pathlib import Path

_MANIFEST_PATH = Path(__file__).resolve().parents[2] / "shared" / "device_verification_codes.json"
with _MANIFEST_PATH.open(encoding="utf-8") as _f:
    _MANIFEST = json.load(_f)

FINGERPRINT_ALGO_VERSION: str = str(_MANIFEST["fingerprint_algo_version"])
FINGERPRINT_HEX_LENGTH: int = int(_MANIFEST["fingerprint_hex_length"])
_ERROR_DEFS: dict[str, dict] = _MANIFEST["errors"]

# 错误码常量（与 JSON 键一致）
for _code in _ERROR_DEFS:
    globals()[_code] = _code

_DEFAULT_MESSAGES: dict[str, str] = {
    code: str(meta.get("message") or code) for code, meta in _ERROR_DEFS.items()
}


def error_http_status(code: str, fallback: int = 403) -> int:
    meta = _ERROR_DEFS.get(code)
    if not meta:
        return fallback
    return int(meta.get("http_status") or fallback)


class DeviceVerificationError(Exception):
    """设备验证业务错误，由 RPC 层序列化为 { ok, code, detail, http_status }。"""

    def __init__(self, code: str, detail: str | None = None, http_status: int | None = None) -> None:
        self.code = code
        self.detail = detail or _DEFAULT_MESSAGES.get(code, code)
        self.http_status = error_http_status(code) if http_status is None else http_status
        super().__init__(self.detail)
