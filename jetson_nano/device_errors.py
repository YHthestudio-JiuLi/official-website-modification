"""设备验证 API 错误码与用户播报文案（契约源：device_verification_codes.json）。"""
from __future__ import annotations

import json

from yh_manifest import ERROR_CODES

# 退出码：0 成功；1 失败；2 未启用/未录入/鉴权问题；3 次数用尽
EXIT_RETRYABLE = 2
EXIT_QUOTA = 3
EXIT_FATAL = 1

CODE_TO_EXIT: dict[str, int] = {
    code: int(meta.get("jetson_exit") or EXIT_FATAL)
    for code, meta in ERROR_CODES.items()
}

# 编排层固定播报（拉签/验签/下载/启动流程）
BROADCAST_DEVICE_NOT_VERIFIED = "[播报] 设备未启用或无法验证，请联系平台管理员"
BROADCAST_AUTH_INVALID = "[播报] 设备未启用或签名失效，请联系平台管理员"
BROADCAST_BINDING_INCOMPLETE = "[播报] 设备未绑定系统程序，请联系平台管理员"
BROADCAST_VERIFY_PASSED = "[播报] 设备验证通过，正在自动构建系统。请稍候！！！"
BROADCAST_SYNC_COMPLETE = "[播报] 系统构建完成，正在启动程序。首次启动需要一定时间，请耐心等待！！！"
BROADCAST_FETCH_FAILED = "[播报] 拉取验证签名失败，请检查网络后重试"
BROADCAST_VERIFY_FAILED = "[播报] 设备验证失败，请检查网络或联系平台管理员"
BROADCAST_SYNC_FAILED = "[播报] 资源下载失败，请检查网络后重试"

# API code → 用户可见播报（结构化错误）
ERROR_BROADCASTS: dict[str, str] = {
    "FINGERPRINT_REQUIRED": "[播报] 设备未预置指纹，请联系管理员录入后重试",
    "FINGERPRINT_ALGO_MISMATCH": "[播报] 设备指纹不匹配，请联系管理员核对设备信息",
    "FINGERPRINT_BINDING_INVALID": "[播报] 平台指纹配置异常，请联系管理员处理",
    "FINGERPRINT_NOT_ENROLLED": BROADCAST_DEVICE_NOT_VERIFIED,
    "DEVICE_DISABLED": BROADCAST_DEVICE_NOT_VERIFIED,
    "DEVICE_NOT_FOUND": BROADCAST_DEVICE_NOT_VERIFIED,
    "SIGNATURE_INVALID": BROADCAST_AUTH_INVALID,
    "QUOTA_EXHAUSTED": "[播报] 设备验证次数已达上限，请联系管理员",
    "INVALID_FINGERPRINT": "[播报] 设备指纹算法版本不受支持，请升级设备端程序",
}


def broadcast_message_for_fetch(api_code: str, exit_code: int) -> str:
    """拉签失败时编排层使用的单次播报文案（子模块不直接 TTS）。"""
    code = (api_code or "").strip()
    if code in ERROR_BROADCASTS:
        return ERROR_BROADCASTS[code]
    if exit_code == EXIT_QUOTA:
        return ERROR_BROADCASTS["QUOTA_EXHAUSTED"]
    if exit_code == EXIT_RETRYABLE:
        return BROADCAST_DEVICE_NOT_VERIFIED
    return BROADCAST_FETCH_FAILED


def broadcast_message_for_verify(verify_rc: int) -> str:
    """验签/服务器确认失败时编排层播报文案。"""
    if verify_rc == EXIT_QUOTA:
        return ERROR_BROADCASTS["QUOTA_EXHAUSTED"]
    if verify_rc == EXIT_RETRYABLE:
        return BROADCAST_AUTH_INVALID
    return BROADCAST_VERIFY_FAILED


def broadcast_message_for_sync(sync_rc: int) -> str:
    """下载同步失败时编排层播报文案。"""
    if sync_rc == 4:
        return BROADCAST_BINDING_INCOMPLETE
    if sync_rc == 2:
        return BROADCAST_AUTH_INVALID
    return BROADCAST_SYNC_FAILED


def exit_code_from_api_error(http_code: int, payload: dict | None) -> int:
    """从 HTTP 状态与 JSON 体解析退出码。"""
    if isinstance(payload, dict):
        code = str(payload.get("code") or "").strip()
        if code in CODE_TO_EXIT:
            return CODE_TO_EXIT[code]
    if http_code == 403:
        return EXIT_RETRYABLE
    if http_code == 404:
        return EXIT_RETRYABLE
    return EXIT_FATAL


def parse_error_json(raw: str) -> dict | None:
    """尝试解析错误响应 JSON。"""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


class DeviceApiHttpError(RuntimeError):
    """设备 API HTTP 错误（携带结构化 code）。"""

    def __init__(self, http_code: int, body: str = "", payload: dict | None = None) -> None:
        self.http_code = http_code
        self.body = body
        self.payload = payload if isinstance(payload, dict) else parse_error_json(body)
        self.code = str((self.payload or {}).get("code") or "").strip()
        message = str((self.payload or {}).get("error") or body or self.code or http_code)
        super().__init__(message)


def is_auth_retryable_api_error(http_code: int, payload: dict | None) -> bool:
    """是否为设备未启用/鉴权失败等可轮询等待的错误。"""
    if isinstance(payload, dict):
        code = str(payload.get("code") or "").strip()
        if code in CODE_TO_EXIT and CODE_TO_EXIT[code] == EXIT_RETRYABLE:
            return True
    return http_code in (403, 404)


def is_not_found_api_error(error: DeviceApiHttpError) -> bool:
    """资源未绑定或不存在（可跳过下载）。"""
    if error.http_code == 404:
        return True
    return error.code == "DEVICE_NOT_FOUND"
