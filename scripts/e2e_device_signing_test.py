#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
设备验证签名链路联调（仅本地测试）。

安全约束：
  - 必须设置环境变量 E2E_DEVICE_TEST=1 才会执行
  - 不生成、不上传、不覆盖平台签名私钥（使用后台已配置的密钥）
  - 不修改 jetson_nano/platform_public_key.py（须与后台私钥配对）
  - 结束后自动删除测试设备

用法：
  E2E_DEVICE_TEST=1 API_BASE=http://127.0.0.1:3000 python3 scripts/e2e_device_signing_test.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JETSON = ROOT / "jetson_nano"
PY_DB_URL = os.environ.get("PY_DB_URL", "http://127.0.0.1:5100/rpc")
API_BASE = os.environ.get("API_BASE", "http://127.0.0.1:3000")
DEVICE_ID = "e2e-test-device-001"
TEST_FINGERPRINT = "a" * 128


def _require_e2e_gate() -> None:
    if os.environ.get("E2E_DEVICE_TEST", "").strip() != "1":
        print(
            "[拒绝] 联调脚本会写入测试设备，禁止误跑生产库。\n"
            "      若确认在本地测试环境执行，请: E2E_DEVICE_TEST=1 python3 scripts/e2e_device_signing_test.py",
            file=sys.stderr,
        )
        raise SystemExit(2)


def rpc(op: str, args: dict | None = None):
    payload = json.dumps({"op": op, "args": args or {}}).encode("utf-8")
    req = urllib.request.Request(
        PY_DB_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    if body.get("ok") is not True:
        code = body.get("code")
        detail = body.get("detail")
        if code:
            raise RuntimeError(f"RPC {op} failed: {code} - {detail}")
        raise RuntimeError(f"RPC {op} failed: {body}")
    return body.get("result")


def teardown_test_device() -> None:
    try:
        existing = rpc("deviceVerification.findByDeviceId", {"device_id": DEVICE_ID})
        if existing:
            rpc("deviceVerification.delete", {"device_id": DEVICE_ID})
            print(f"  [清理] 已删除测试设备 {DEVICE_ID}")
    except Exception as exc:
        print(f"  [清理] 删除测试设备失败: {exc}", file=sys.stderr)


def load_jetson_platform_public_key_b64() -> str:
    """读取 jetson_nano/platform_public_key.py 中的公钥。"""
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "platform_public_key",
        JETSON / "platform_public_key.py",
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("无法加载 jetson_nano/platform_public_key.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return str(getattr(mod, "PLATFORM_PUBLIC_KEY_B64", "") or "").strip()


def require_platform_signing_public_b64() -> str:
    """校验 platform_public_key.py 与后台已配置公钥一致。"""
    file_public = load_jetson_platform_public_key_b64()
    if not file_public:
        raise RuntimeError("jetson_nano/platform_public_key.py 未配置 PLATFORM_PUBLIC_KEY_B64")

    settings = rpc("deviceVerification.getSettings")
    if not settings.get("signing_key_configured"):
        raise RuntimeError(
            "平台未配置签名私钥。请先在管理后台上传离线准备的私钥，再运行联调；"
            "本脚本不会生成或写入密钥。"
        )
    db_public = str(settings.get("signing_public_key_b64") or "").strip()
    if not db_public:
        raise RuntimeError("平台已配置私钥但缺少 signing_public_key_b64，请重新保存私钥")
    if file_public != db_public:
        raise RuntimeError(
            "platform_public_key.py 与后台 signing_public_key_b64 不一致，"
            "请确保设备端公钥与后台私钥为同一密钥对"
        )
    return db_public


def post_json(url: str, data: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    _require_e2e_gate()
    public_b64 = require_platform_signing_public_b64()

    try:
        print("=== 1. 检查平台签名密钥（只读，不生成/不上传） ===")
        print(f"  ✓ 使用平台公钥验签（前 16 字符）: {public_b64[:16]}…")

        print("\n=== 2. 创建设备（预置指纹） ===")
        teardown_test_device()
        created = rpc(
            "deviceVerification.create",
            {
                "device_id": DEVICE_ID,
                "max_verifications": 5,
                "is_whitelisted": False,
                "device_fingerprint": TEST_FINGERPRINT,
                "fingerprint_algo_version": "3",
            },
        )
        print(f"  ✓ 创建设备: {created.get('device_id')}")

        print("\n=== 2b. 启用设备 ===")
        rpc("deviceVerification.patchDevice", {"device_id": DEVICE_ID, "payload": {"is_whitelisted": True}})
        print("  ✓ 设备已启用")

        print("\n=== 3. 设备拉签 POST /api/device/verify ===")
        verify_resp = post_json(
            f"{API_BASE}/api/device/verify",
            {
                "fingerprint": TEST_FINGERPRINT,
                "fingerprint_algo_version": "3",
            },
        )
        for key in ("fingerprint", "issued_at", "signature"):
            if key not in verify_resp:
                raise RuntimeError(f"验签响应缺少 {key}: {verify_resp}")
        print(f"  ✓ 拉签成功 issued_at={verify_resp['issued_at']}")

        row_before = rpc("deviceVerification.findByDeviceId", {"device_id": DEVICE_ID})
        count_before = int((row_before or {}).get("verification_count") or 0)
        if count_before != 0:
            raise RuntimeError(f"拉签后 verification_count 应为 0，实际为 {count_before}")

        last_verify = JETSON / "last_verify.json"
        payload = {**verify_resp, "api_base": API_BASE}
        last_verify.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

        print("\n=== 4. Jetson 本地验签 verify_signature.py ===")
        proc = subprocess.run(
            [sys.executable, str(JETSON / "verify_signature.py"), str(last_verify)],
            cwd=str(JETSON),
            capture_output=True,
            text=True,
        )
        print(proc.stdout.strip() or proc.stderr.strip())
        if proc.returncode != 0:
            raise RuntimeError(f"验签失败 exit={proc.returncode}")

        print("\n=== 4b. 服务器确认 POST /api/device/verify-confirm ===")
        confirm_resp = post_json(
            f"{API_BASE}/api/device/verify-confirm",
            {
                "fingerprint": TEST_FINGERPRINT,
                "issued_at": int(verify_resp["issued_at"]),
                "signature": verify_resp["signature"],
            },
        )
        if confirm_resp.get("already_counted") is True:
            print("  ✓ 确认幂等（already_counted）")
        else:
            count_after = int(confirm_resp.get("verification_count") or -1)
            if count_after != count_before + 1:
                raise RuntimeError(f"确认后 verification_count 应为 {count_before + 1}，实际为 {count_after}")
            print(f"  ✓ 确认扣次成功 verification_count={count_after}")

        print("\n=== 5. 平台 authenticateSignedRequest（下载鉴权） ===")
        row = rpc(
            "deviceVerification.authenticateSignedRequest",
            {
                "fingerprint": TEST_FINGERPRINT,
                "signature": verify_resp["signature"],
                "issued_at": int(verify_resp["issued_at"]),
            },
        )
        if not row or not row.get("device_id"):
            raise RuntimeError("平台 authenticateSignedRequest 未返回设备行")
        print("  ✓ 平台侧签名验证通过")

        print("\n✅ 全流程通过")
        return 0
    finally:
        teardown_test_device()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.HTTPError as e:
        print(f"[HTTP {e.code}] {e.read().decode('utf-8', errors='ignore')}", file=sys.stderr)
        raise SystemExit(1)
    except Exception as e:
        print(f"[错误] {e}", file=sys.stderr)
        raise SystemExit(1)
