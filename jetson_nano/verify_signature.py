#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
读取 fetch_signature.py 生成的 last_verify.json，用公钥对签名做 Ed25519 验签。
消息格式与官网一致: f"{device_id}|{issued_at}"（UTF-8 字节）。
用法：
  python3 verify_signature.py
  python3 verify_signature.py /path/to/last_verify.json
"""
from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

OUTPUT_NAME = "last_verify.json"


def verify_payload(data: dict) -> tuple[bool, str]:
    device_id = data.get("device_id")
    issued_at = data.get("issued_at")
    signature_b64 = data.get("signature")
    public_key_b64 = data.get("public_key")

    if not all(
        [
            isinstance(device_id, str),
            issued_at is not None,
            isinstance(signature_b64, str),
            isinstance(public_key_b64, str),
        ]
    ):
        return False, "JSON 缺少 device_id / issued_at / signature / public_key 或类型不对"

    message = f"{device_id}|{issued_at}".encode("utf-8")
    try:
        sig = base64.b64decode(signature_b64, validate=True)
        pub_bytes = base64.b64decode(public_key_b64, validate=True)
    except Exception as e:
        return False, f"Base64 解码失败: {e}"

    if len(pub_bytes) != 32:
        return False, f"公钥长度应为 32 字节，实际 {len(pub_bytes)}"

    try:
        pub = Ed25519PublicKey.from_public_bytes(pub_bytes)
        pub.verify(sig, message)
    except Exception as e:
        return False, f"验签失败: {e}"

    return True, "验签通过"


def main() -> int:
    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
    else:
        path = Path(__file__).resolve().parent / OUTPUT_NAME

    if not path.is_file():
        print(f"[错误] 找不到文件: {path}，请先运行 fetch_signature.py", file=sys.stderr)
        return 1

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"[错误] JSON 解析失败: {e}", file=sys.stderr)
        return 1

    ok, msg = verify_payload(data)
    if ok:
        print(f"[成功] {msg}")
        print(f"  device_id: {data.get('device_id')}")
        print(f"  issued_at: {data.get('issued_at')}")
        # 模拟：验签通过后做一个简单“业务动作”
        print("\n[模拟业务] 验签通过，允许执行本地任务（例如启动传感器采集脚本）")
        return 0

    print(f"[失败] {msg}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
