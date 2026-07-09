#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从官网 API 拉取设备验证签名，并写入同目录下的 last_verify.json。
仅使用设备指纹鉴权；设备 ID 由管理员在后台维护，设备端不上报。
拉签失败、设备停用、次数用尽或其它错误时，会删除本地 YH/（固件与题库）及缓存签名。

退出码：0 成功；1 失败；2 设备未启用/未录入（可由 yh_background_sync 轮询等待管理员启用）；
3 验证次数已达上限（需管理员在后台重置次数或提高上限）。
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

from device_errors import (
    ERROR_BROADCASTS,
    exit_code_from_api_error,
    parse_error_json,
)
from device_fingerprint import FINGERPRINT_ALGO_VERSION, build_device_fingerprint, normalize_fingerprint
from yh_config import resolve_api_base
from yh_demo_log import demo_info
from yh_runtime import app_root, ensure_app_root_on_path

OUTPUT_NAME = "last_verify.json"


def _purge_binding_artifacts() -> None:
    """拉签失败、设备停用或未获有效签名时删除本地 YH 与缓存签名。"""
    try:
        from verify_signature import purge_binding_artifacts_dir
    except ImportError:
        purge_binding_artifacts_dir = None
    if purge_binding_artifacts_dir is not None:
        purge_binding_artifacts_dir()
    cache = app_root() / OUTPUT_NAME
    if cache.is_file():
        cache.unlink(missing_ok=True)


def _handle_api_error(http_code: int, err_body: str) -> tuple[int, str]:
    """根据结构化错误码决定退出码（播报由编排层统一处理）。"""
    payload = parse_error_json(err_body)
    code = str((payload or {}).get("code") or "").strip()
    exit_code = exit_code_from_api_error(http_code, payload)

    if code not in ERROR_BROADCASTS:
        # 兜底输出，避免后端未返回结构化 code 时用户只看到静默退出
        brief = str((payload or {}).get("error") or err_body or "").strip()
        if brief:
            print(f"[错误] HTTP {http_code}: {brief}", file=sys.stderr)
        else:
            print(f"[错误] HTTP {http_code}: 请求被拒绝", file=sys.stderr)

    _purge_binding_artifacts()
    return exit_code, code


def run_fetch() -> tuple[int, str]:
    """拉签核心逻辑。返回 (exit_code, api_error_code)。"""
    ensure_app_root_on_path()
    base = resolve_api_base()
    fingerprint = normalize_fingerprint(build_device_fingerprint())
    if not fingerprint:
        print("[错误] 设备指纹采集失败，无法请求验证签名", file=sys.stderr)
        _purge_binding_artifacts()
        return 1, ""

    demo_info(f"[信息] 识别到设备指纹：{fingerprint[:24]}...（algo v{FINGERPRINT_ALGO_VERSION}）")
    url = f"{base}/api/device/verify"
    body = json.dumps({
        "fingerprint": fingerprint,
        "fingerprint_algo_version": FINGERPRINT_ALGO_VERSION,
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        exit_code, code = _handle_api_error(e.code, err_body)
        return exit_code, code
    except urllib.error.URLError as e:
        print(f"[错误] 网络失败: {e.reason}", file=sys.stderr)
        _purge_binding_artifacts()
        return 1, ""

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        print(f"[错误] 响应不是 JSON: {raw[:200]}", file=sys.stderr)
        _purge_binding_artifacts()
        return 1, ""

    if "error" in data:
        exit_code, code = _handle_api_error(int(data.get("http_status") or 403), json.dumps(data))
        return exit_code, code

    to_save = dict(data)
    to_save["api_base"] = base

    out_dir = app_root()
    out_path = out_dir / OUTPUT_NAME
    out_path.write_text(json.dumps(to_save, ensure_ascii=False, indent=2), encoding="utf-8")

    demo_info(f"[成功] 已写入: {out_path}")
    demo_info(f"  fingerprint: {str(data.get('fingerprint', ''))[:24]}...")
    demo_info(f"  issued_at: {data.get('issued_at')}")
    demo_info(f"  signature: {str(data.get('signature', ''))[:48]}...")
    demo_info(
        "\n下一步: python3 verify_signature.py（验签通过后 yh-device 将下载绑定资源到 YH/）"
    )
    return 0, ""


def main() -> int:
    exit_code, _api_code = run_fetch()
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
