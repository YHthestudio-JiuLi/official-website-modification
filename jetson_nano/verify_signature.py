#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
读取 fetch_signature.py 生成的 last_verify.json，用公钥对签名做 Ed25519 验签。
消息格式与官网一致: f"{fingerprint}|{issued_at}"（UTF-8 字节）。
验签失败或校验文件异常时，会删除本地 YH/（固件与题库），防止使用失效内容。

用法：
  python3 verify_signature.py
  python3 verify_signature.py /path/to/last_verify.json
"""
from __future__ import annotations

import base64
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from device_errors import exit_code_from_api_error, parse_error_json
from yh_config import resolve_api_base
from yh_demo_log import demo_info, demo_timestamp, demo_warn
from yh_runtime import app_root, ensure_app_root_on_path

OUTPUT_NAME = "last_verify.json"


def _resolve_public_key_b64() -> str:
    """读取平台公钥（打包后从内置模块加载，源码模式从同目录 platform_public_key.py）。"""
    ensure_app_root_on_path()
    from platform_public_key import PLATFORM_PUBLIC_KEY_B64

    return (PLATFORM_PUBLIC_KEY_B64 or "").strip()


def _load_ed25519_public_bytes(public_key_b64: str) -> bytes:
    """解析 Ed25519 公钥：支持 32 字节原始 Base64 或 SPKI DER Base64。"""
    decoded = base64.b64decode(public_key_b64.strip(), validate=True)
    if len(decoded) == 32:
        return decoded
    key = serialization.load_der_public_key(decoded)
    if not isinstance(key, Ed25519PublicKey):
        raise ValueError("公钥必须是 Ed25519 类型")
    return key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )


def purge_binding_artifacts_dir() -> None:
    """未通过验证时删除本地 YH（固件与题库）；目录不存在则忽略。"""
    yh = app_root() / "YH"
    if yh.is_dir():
        shutil.rmtree(yh, ignore_errors=True)
        demo_warn("[警告] 验证未通过，已删除本地 YH 目录（固件与题库）")


def verify_payload(data: dict) -> tuple[bool, str]:
    fingerprint = data.get("fingerprint")
    # 兼容旧版 last_verify.json（曾用 device_id 签名）
    if not isinstance(fingerprint, str) or not fingerprint.strip():
        fingerprint = data.get("device_id")
    issued_at = data.get("issued_at")
    signature_b64 = data.get("signature")
    public_key_b64 = _resolve_public_key_b64()

    if not all(
        [
            isinstance(fingerprint, str) and fingerprint.strip(),
            issued_at is not None,
            isinstance(signature_b64, str),
            public_key_b64 != "",
        ]
    ):
        return False, "JSON 缺少 fingerprint / issued_at / signature，或 platform_public_key.py 未配置公钥"

    message = f"{fingerprint.strip()}|{issued_at}".encode("utf-8")
    try:
        sig = base64.b64decode(signature_b64, validate=True)
        pub_bytes = _load_ed25519_public_bytes(public_key_b64)
    except Exception as e:
        return False, f"公钥或签名解码失败: {e}"

    try:
        pub = Ed25519PublicKey.from_public_bytes(pub_bytes)
        pub.verify(sig, message)
    except Exception as e:
        err_name = type(e).__name__
        if err_name == "InvalidSignature":
            return (
                False,
                "验签失败：签名与 platform_public_key.py 公钥不匹配。"
                "请核对后台上传的平台签名私钥是否与设备端公钥为同一密钥对。",
            )
        err = str(e).strip() or err_name
        return False, f"验签失败: {err}"

    return True, "验签通过"


def confirm_verification_on_server(data: dict) -> tuple[bool, str, int]:
    """本地验签通过后向服务器确认，此时才扣减 verification_count。"""
    base = resolve_api_base(verify_data=data)
    fingerprint = data.get("fingerprint")
    if not isinstance(fingerprint, str) or not fingerprint.strip():
        fingerprint = data.get("device_id")
    issued_at = data.get("issued_at")
    signature_b64 = data.get("signature")

    if not all(
        [
            isinstance(fingerprint, str) and fingerprint.strip(),
            issued_at is not None,
            isinstance(signature_b64, str) and signature_b64.strip(),
        ]
    ):
        return False, "无法确认：JSON 缺少 fingerprint / issued_at / signature", 1

    url = f"{base}/api/device/verify-confirm"
    body = json.dumps(
        {
            "fingerprint": fingerprint.strip(),
            "issued_at": int(issued_at),
            "signature": signature_b64,
        }
    ).encode("utf-8")
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
        payload = parse_error_json(err_body)
        exit_code = exit_code_from_api_error(e.code, payload)
        message = str((payload or {}).get("error") or err_body or e.code)
        return False, f"服务器确认失败: {message}", exit_code
    except urllib.error.URLError as e:
        return False, f"服务器确认网络失败: {e.reason}", 1

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        return False, f"服务器确认响应不是 JSON: {raw[:200]}", 1

    if isinstance(result, dict) and result.get("error"):
        payload = result if isinstance(result, dict) else None
        exit_code = exit_code_from_api_error(int(result.get("http_status") or 400), payload)
        return False, f"服务器确认失败: {result.get('error')}", exit_code

    return True, "服务器已确认验证次数", 0


def mark_verification_success(path: Path, data: dict) -> int:
    """验签与服务器确认成功后写入 verified_at，并打印时间戳。"""
    verified_at = int(time.time())
    payload = dict(data)
    payload["verified_at"] = verified_at
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    verified_text = datetime.fromtimestamp(verified_at).strftime("%Y-%m-%d %H:%M:%S")
    demo_timestamp(f"[成功] 验证完成 verified_at={verified_at} ({verified_text})")
    return verified_at


def run_verify(path: Path | None = None) -> int:
    """验签并服务器确认。path 默认 app_root()/last_verify.json。"""
    ensure_app_root_on_path()
    if path is None:
        path = app_root() / OUTPUT_NAME

    if not path.is_file():
        print(f"[错误] 找不到文件: {path}，请先运行 fetch_signature.py", file=sys.stderr)
        purge_binding_artifacts_dir()
        return 1

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"[错误] JSON 解析失败: {e}", file=sys.stderr)
        purge_binding_artifacts_dir()
        return 1

    ok, msg = verify_payload(data)
    if ok:
        demo_info(f"[成功] {msg}")
        fp = data.get("fingerprint") or data.get("device_id")
        demo_info(f"  fingerprint: {str(fp)[:24]}...")
        demo_info(f"  issued_at: {data.get('issued_at')}")
        confirmed, confirm_msg, confirm_rc = confirm_verification_on_server(data)
        if not confirmed:
            print(f"[失败] {confirm_msg}", file=sys.stderr)
            purge_binding_artifacts_dir()
            return confirm_rc if confirm_rc > 0 else 1
        demo_info(f"[成功] {confirm_msg}")
        mark_verification_success(path, data)
        demo_info(
            "\n[提示] 验签与服务器确认通过后 yh-device 将核对网站绑定并同步题库与固件到 YH/"
        )
        return 0

    print(f"[失败] {msg}", file=sys.stderr)
    purge_binding_artifacts_dir()
    return 2


def main() -> int:
    if len(sys.argv) > 1:
        verify_path = Path(sys.argv[1])
    else:
        verify_path = None
    return run_verify(verify_path)


if __name__ == "__main__":
    sys.exit(main())
