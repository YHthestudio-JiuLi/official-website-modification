#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从官网 API 拉取设备验证签名，并写入同目录下的 last_verify.json。
device_id 默认自动取本机网卡 MAC（小写冒号分隔，如 aa:bb:cc:dd:ee:ff）。
拉签失败、未授权、次数用尽或其它错误时，会删除本地 YH/（固件与题库）。

退出码：0 成功；1 失败；2 设备未加入白名单（可由 yh_background_sync 轮询等待管理员授权）；
3 验证次数已达上限（需管理员在后台重置次数或提高上限）。

用法：
  export API_BASE=http://192.168.2.12:3000
  python3 fetch_signature.py
  # 如需手动指定（调试）: export DEVICE_ID=my-custom-id
  # run_demo.sh 会设置 YH_RUN_DEMO=1，此时成功拉签后不打印「已写入」等详情。
"""
from __future__ import annotations

import json
import os
import re
import sys
import uuid
import urllib.error
import urllib.request
from pathlib import Path

OUTPUT_NAME = "last_verify.json"

# 与 api-server 返回的英文 error 文案一致，用于识别次数用尽（不向前台打印原始 HTTP 403）
_QUOTA_EXHAUSTED_MARKERS = ("quota exhausted", "verification quota exhausted")


def _purge_binding_artifacts() -> None:
    """拉签失败或未获有效签名时删除本地 YH（与验签失败策略一致）。"""
    try:
        from verify_signature import purge_binding_artifacts_dir
    except ImportError:
        return
    purge_binding_artifacts_dir()


def _is_quota_exhausted_response(http_code: int, err_body: str) -> bool:
    """是否为「设备验证次数已达上限」类 403。"""
    if http_code != 403:
        return False
    low = err_body.lower()
    return any(m in low for m in _QUOTA_EXHAUSTED_MARKERS)


# Jetson / Linux 上常见有线网卡优先顺序
_PREFERRED_IFACES = ("eth0", "enP8p1s0", "enp0s3", "wlan0", "wlP1s0")


def _normalize_mac(addr: str) -> str | None:
    """将 sysfs 读到的地址规范为小写 aa:bb:cc:dd:ee:ff。"""
    addr = addr.strip().lower()
    if not addr or addr == "00:00:00:00:00:00":
        return None
    if re.fullmatch(r"([0-9a-f]{2}:){5}[0-9a-f]{2}", addr):
        return addr
    return None


def get_local_mac_device_id() -> str:
    """
    获取本机 MAC 作为 device_id。
    Linux：优先读 /sys/class/net；其它系统或失败时用 uuid.getnode()。
    """
    sys_net = "/sys/class/net"
    if os.path.isdir(sys_net):
        for name in _PREFERRED_IFACES:
            path = os.path.join(sys_net, name, "address")
            if os.path.isfile(path):
                try:
                    raw = Path(path).read_text(encoding="utf-8")
                    mac = _normalize_mac(raw)
                    if mac:
                        return mac
                except OSError:
                    continue
        try:
            for name in sorted(os.listdir(sys_net)):
                if name == "lo":
                    continue
                path = os.path.join(sys_net, name, "address")
                if not os.path.isfile(path):
                    continue
                raw = Path(path).read_text(encoding="utf-8")
                mac = _normalize_mac(raw)
                if mac:
                    return mac
        except OSError:
            pass

    node = uuid.getnode()
    if (node >> 40) % 2:
        # 随机/多播位为 1 时 uuid 可能不是稳定硬件 MAC，仍格式化返回避免崩溃
        pass
    mac_hex = f"{node & 0xFFFFFFFFFFFF:012x}"
    return ":".join(mac_hex[i : i + 2] for i in range(0, 12, 2))


def main() -> int:
    # 部署到局域网时示例: export API_BASE=http://192.168.2.12:3000
    base = os.environ.get("API_BASE", "https://yhthestudio.com").rstrip("/")
    env_id = os.environ.get("DEVICE_ID", "").strip()
    device_id = env_id or get_local_mac_device_id()
    if env_id:
        print(f"[信息] device_id = {device_id}（来自环境变量 DEVICE_ID）")
    else:
        print(f"[信息] device_id = {device_id}（本机 MAC 自动检测）")
    url = f"{base}/api/device/verify"
    body = json.dumps({"device_id": device_id}).encode("utf-8")

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
        # 未加入白名单：不打印原始 JSON，由 run_demo.sh 统一中文提示
        if e.code == 403 and "not whitelisted" in err_body.lower():
            _purge_binding_artifacts()
            return 2
        # 验证次数用尽：友好提示，不打印原始 JSON 403
        if _is_quota_exhausted_response(e.code, err_body):
            print("[播报] 设备验证次数已达上限，请联系管理员", file=sys.stderr)
            _purge_binding_artifacts()
            return 3
        print(f"[错误] HTTP {e.code}: {err_body}", file=sys.stderr)
        _purge_binding_artifacts()
        return 1
    except urllib.error.URLError as e:
        print(f"[错误] 网络失败: {e.reason}", file=sys.stderr)
        _purge_binding_artifacts()
        return 1

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        print(f"[错误] 响应不是 JSON: {raw[:200]}", file=sys.stderr)
        _purge_binding_artifacts()
        return 1

    if "error" in data:
        print(f"[错误] 服务端: {data.get('error')}", file=sys.stderr)
        _purge_binding_artifacts()
        return 1

    # 记录当前 API_BASE，便于 run_demo 在冷却期跳过拉签时仍能用正确地址下载
    to_save = dict(data)
    to_save["api_base"] = base

    out_dir = Path(__file__).resolve().parent
    out_path = out_dir / OUTPUT_NAME
    out_path.write_text(json.dumps(to_save, ensure_ascii=False, indent=2), encoding="utf-8")

    # run_demo 流程下不刷屏，由 run_demo 统一验签后提示
    if os.environ.get("YH_RUN_DEMO") == "1":
        return 0

    print(f"[成功] 已写入: {out_path}")
    print(f"  device_id: {data.get('device_id')}")
    print(f"  issued_at: {data.get('issued_at')}")
    print(f"  signature: {str(data.get('signature', ''))[:48]}...")
    print(f"  public_key: {str(data.get('public_key', ''))[:32]}...")
    print("\n下一步: python3 verify_signature.py（run_demo.sh 会在验签通过后下载绑定资源到 YH/）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
