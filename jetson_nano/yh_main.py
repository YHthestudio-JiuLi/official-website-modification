#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""设备验证、同步与启动主入口（源码与单文件打包共用，替代 run_demo.sh）。"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

from device_errors import BROADCAST_VERIFY_PASSED
from yh_demo_log import broadcast
from yh_launch import launch_yh_studio
from yh_runtime import app_root, ensure_app_root_on_path
from yh_verify_cycle import (
    CycleOutcome,
    broadcast_message_for_cycle,
    run_verify_cycle,
)

LAST_FILE = "last_verify.json"

_FETCH_OUTCOMES = frozenset({
    CycleOutcome.FETCH_RETRY,
    CycleOutcome.FETCH_FATAL,
    CycleOutcome.FETCH_FAILED,
})


def map_sync_exit(rc: int) -> int:
    """同步脚本退出码：默认可恢复场景（2/4）映射为 0。"""
    if os.environ.get("YH_STRICT_EXIT") == "1":
        return rc
    if rc in (2, 4):
        return 0
    return rc


def runner_argv(*extra: str) -> list[str]:
    """源码模式用 yh_main.py 子进程，打包模式复用当前可执行文件。"""
    if getattr(sys, "frozen", False):
        return [sys.executable, *extra]
    main_script = Path(__file__).resolve().parent / "yh_main.py"
    return [sys.executable, str(main_script), *extra]


def start_yh_background_sync() -> bool:
    """可选后台轮询（YH_DAEMON=1 时）。"""
    if os.environ.get("YH_DAEMON") != "1":
        return False

    root = app_root()
    pid_file = root / "yh_background_sync.pid"
    if pid_file.is_file():
        try:
            old_pid = int(pid_file.read_text(encoding="utf-8").strip())
            os.kill(old_pid, 0)
            return True
        except (ValueError, ProcessLookupError, PermissionError):
            pass

    log_path = root / "yh_background_sync.log"
    with log_path.open("a", encoding="utf-8") as log_fp:
        subprocess.Popen(
            runner_argv("--background-sync"),
            cwd=str(root),
            stdout=log_fp,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )

    if os.environ.get("YH_RUN_DEMO", "") != "1":
        print(
            f"[信息] 已启动后台同步（pid 见 yh_background_sync.pid），日志: {log_path}",
            flush=True,
        )
        print(
            "[信息] 请在网页后台将该设备设为「启用」并绑定题库/固件；启用后本机将自动创建 YH 并解压同步",
            flush=True,
        )
    return True


def run_demo_pipeline(extra_args: list[str] | None = None) -> int:
    """完整验证流程：冷却判断 → 拉签 → 验签 → 下载 → 启动应用。"""
    os.environ.setdefault("YH_RUN_DEMO", "1")
    ensure_app_root_on_path()
    root = app_root()
    os.chdir(root)

    verify_interval = float(os.environ.get("VERIFY_INTERVAL_HOURS", "0.1"))
    last_path = root / LAST_FILE

    from yh_cooldown import should_run_full_verify

    if not should_run_full_verify(last_path, verify_interval):
        return launch_yh_studio(extra_args)

    yh_dir = root / "YH"
    if not last_path.is_file() and yh_dir.is_dir():
        print("[信息] 未找到 last_verify.json，先删除本地 YH 目录（固件与题库）", flush=True)
        shutil.rmtree(yh_dir, ignore_errors=True)

    def on_verify_passed() -> None:
        broadcast(BROADCAST_VERIFY_PASSED, root=root)

    result = run_verify_cycle(last_path, on_verify_passed=on_verify_passed)

    announce = broadcast_message_for_cycle(result)
    if announce:
        broadcast(announce, root=root)

    if result.outcome in _FETCH_OUTCOMES:
        if result.outcome == CycleOutcome.FETCH_RETRY:
            start_yh_background_sync()
            return 0
        if result.outcome == CycleOutcome.FETCH_FATAL:
            return 1
        return result.fetch_rc

    if result.outcome == CycleOutcome.VERIFY_FAILED:
        return result.verify_rc if result.verify_rc > 0 else 1

    if result.outcome == CycleOutcome.SYNC_FAILED:
        if result.sync_rc not in (2, 4):
            if os.environ.get("YH_RUN_DEMO", "") != "1":
                print("[信息] 同步未完成。", flush=True)
            start_yh_background_sync()
            if os.environ.get("YH_DAEMON") != "1" and os.environ.get("YH_RUN_DEMO", "") != "1":
                print("[信息] 网络或资源就绪后请再次执行", flush=True)
        return map_sync_exit(result.sync_rc)

    if result.outcome != CycleOutcome.SYNC_DONE:
        print(f"[错误] 未知验证周期结果: {result.outcome}", file=sys.stderr)
        return 1

    return launch_yh_studio(extra_args)


def cmd_fingerprint() -> int:
    from device_fingerprint import build_device_fingerprint

    fp = build_device_fingerprint()
    if not fp:
        print("[错误] 指纹采集失败", file=sys.stderr)
        return 1
    print(fp)
    return 0


def cmd_background_sync() -> int:
    from yh_background_sync import main as background_main

    return background_main()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="YH 设备验证、资源同步与启动",
    )
    parser.add_argument(
        "--fingerprint",
        action="store_true",
        help="仅输出设备指纹后退出",
    )
    parser.add_argument(
        "--background-sync",
        action="store_true",
        help="后台轮询同步（通常由主程序在 YH_DAEMON=1 时自动拉起）",
    )
    parser.add_argument(
        "studio_args",
        nargs=argparse.REMAINDER,
        help="传递给 YHTheStudio 的参数",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    ensure_app_root_on_path()
    if argv is None:
        argv = sys.argv[1:]

    parser = build_parser()
    args = parser.parse_args(argv)

    if args.fingerprint:
        return cmd_fingerprint()
    if args.background_sync:
        return cmd_background_sync()

    extra = args.studio_args
    if extra and extra[0] == "--":
        extra = extra[1:]
    return run_demo_pipeline(extra)


if __name__ == "__main__":
    raise SystemExit(main())
