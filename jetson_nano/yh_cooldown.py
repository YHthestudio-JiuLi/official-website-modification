#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""根据上次验证成功时间戳判断是否处于冷却期。"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime
from pathlib import Path


def format_ts(ts: int) -> str:
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")


def check_cooldown(path: Path, threshold_hours: float) -> int:
    """
    判断是否需要重新验证。

    退出码：0 需重新验证；2 冷却期内；1 参数无效（仅 CLI 使用）
    """
    threshold_seconds = int(threshold_hours * 3600)
    now_ts = int(time.time())

    print(f"[信息] 本次运行时间戳 run_at={now_ts} ({format_ts(now_ts)})", flush=True)

    if not path.is_file():
        print("[信息] 未找到 last_verify.json，将执行完整验证。", flush=True)
        return 0

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print("[信息] last_verify.json 损坏，将执行完整验证。", flush=True)
        return 0

    verified_at = int(data.get("verified_at") or 0)
    if verified_at <= 0:
        verified_at = int(data.get("issued_at") or 0)
    if verified_at <= 0:
        print("[信息] 缺少 verified_at，将执行完整验证。", flush=True)
        return 0

    delta = now_ts - verified_at
    print(
        f"[信息] 上次验证成功 verified_at={verified_at} ({format_ts(verified_at)})，"
        f"距今约 {delta // 3600} 小时 {(delta % 3600) // 60} 分钟",
        flush=True,
    )
    print(f"[信息] 冷却阈值 {threshold_hours:g} 小时（{threshold_seconds} 秒）", flush=True)

    if delta >= threshold_seconds:
        print("[信息] 冷却已过期，将重新向服务器请求验证。", flush=True)
        return 0

    remaining = threshold_seconds - delta
    print(
        f"[信息] 冷却未过期（剩余约 {remaining // 3600} 小时 {(remaining % 3600) // 60} 分钟），"
        "跳过拉签/验签/下载，直接启动程序。",
        flush=True,
    )
    return 2


def main() -> int:
    """CLI：yh_cooldown.py <last_verify.json> <hours>"""
    if len(sys.argv) < 3:
        print("[错误] 用法: yh_cooldown.py <last_verify.json> <hours>", file=sys.stderr)
        return 1

    return check_cooldown(Path(sys.argv[1]), float(sys.argv[2]))


def should_run_full_verify(path: Path, threshold_hours: float) -> bool:
    """冷却未过期且缓存有效时返回 False（跳过拉签/验签/下载）。"""
    return check_cooldown(path, threshold_hours) != 2 or not path.is_file()


if __name__ == "__main__":
    raise SystemExit(main())
