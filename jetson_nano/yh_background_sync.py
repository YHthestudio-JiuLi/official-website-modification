#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
可选后台轮询：仅在显式设置 YH_DAEMON=1 并由 yh_main 拉起时才会运行。
默认不会自动反复请求官网 API。

说明：网页端无法主动向 NAT 后的设备「推送」；若需无人值守，管理员启用设备后由本脚本
周期性请求官网 API，实现准实时拉取。

环境变量：
  YH_POLL_INTERVAL  轮询间隔秒数，默认 45
  API_BASE          见 yh_config.DEFAULT_API_BASE / resolve_api_base

用法：
  YH_DAEMON=1 ./yh-device   # 未启用或下载失败时会后台启动本脚本
  python3 yh_background_sync.py   # 也可手动单独运行（调试用）
"""
from __future__ import annotations

import fcntl
import os
import sys
import time
from pathlib import Path

from yh_demo_log import broadcast
from yh_launch import launch_yh_studio
from yh_runtime import app_root, ensure_app_root_on_path
from yh_verify_cycle import CycleOutcome, CycleResult, broadcast_message_for_cycle, run_verify_cycle

POLL_INTERVAL = max(15, int(os.environ.get("YH_POLL_INTERVAL", "45")))


def _paths(root: Path) -> tuple[Path, Path, Path]:
    return (
        root / "last_verify.json",
        root / "yh_background_sync.pid",
        root / ".yh_background_sync.lock",
    )


def _another_instance_running(pid_file: Path) -> bool:
    """若 pid 文件指向仍存活的进程，则认为已有实例在跑。"""
    if not pid_file.is_file():
        return False
    try:
        pid = int(pid_file.read_text(encoding="utf-8").strip())
    except ValueError:
        return False
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return pid != os.getpid()


def _write_pid(pid_file: Path) -> None:
    pid_file.write_text(str(os.getpid()), encoding="utf-8")


def _clear_pid(pid_file: Path) -> None:
    try:
        if pid_file.is_file() and pid_file.read_text(encoding="utf-8").strip() == str(os.getpid()):
            pid_file.unlink(missing_ok=True)
    except OSError:
        pass


def _release_lock(lock_fp) -> None:
    try:
        fcntl.flock(lock_fp.fileno(), fcntl.LOCK_UN)
    except OSError:
        pass
    lock_fp.close()


def _cycle_phase(root: Path) -> CycleOutcome:
    """执行一轮共享验证周期（轮询模式不播报中间失败，避免 TTS 刷屏）。"""
    last_verify, _, _ = _paths(root)
    return run_verify_cycle(last_verify).outcome


def main() -> int:
    ensure_app_root_on_path()
    root = app_root()
    _, pid_file, lock_file = _paths(root)

    if _another_instance_running(pid_file):
        print("[信息] yh_background_sync 已在运行，跳过重复启动", flush=True)
        return 0

    try:
        lock_fp = lock_file.open("a+", encoding="utf-8")
        fcntl.flock(lock_fp.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print("[信息] 另一实例正在获取锁，跳过重复启动", flush=True)
        return 0

    if _another_instance_running(pid_file):
        _release_lock(lock_fp)
        print("[信息] yh_background_sync 已在运行，跳过重复启动", flush=True)
        return 0

    _write_pid(pid_file)
    print(
        f"[信息] yh_background_sync 已启动，pid={os.getpid()}，每 {POLL_INTERVAL}s 轮询一次；"
        "管理员在网页启用设备并绑定资源后将自动同步到 YH/",
        flush=True,
    )

    try:
        while True:
            try:
                outcome = _cycle_phase(root)
            except Exception as e:
                print(f"[警告] 单轮同步异常（将重试）: {e}", file=sys.stderr, flush=True)
                outcome = CycleOutcome.SYNC_FAILED

            if outcome == CycleOutcome.SYNC_DONE:
                print("[成功] YH 绑定资源已同步完成", flush=True)
                _clear_pid(pid_file)
                _release_lock(lock_fp)
                announce = broadcast_message_for_cycle(
                    CycleResult(CycleOutcome.SYNC_DONE),
                )
                if announce:
                    broadcast(announce, root=root)
                launcher_rc = launch_yh_studio()
                return 0 if launcher_rc == 0 else launcher_rc

            if outcome == CycleOutcome.FETCH_FATAL:
                print("[信息] 验证次数已达上限，后台同步退出（请管理员处理后重新运行 yh-device）", flush=True)
                _clear_pid(pid_file)
                _release_lock(lock_fp)
                return 1

            time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        print("[信息] 收到中断，退出后台同步", flush=True)
        _clear_pid(pid_file)
        _release_lock(lock_fp)
        return 130


if __name__ == "__main__":
    sys.exit(main())
