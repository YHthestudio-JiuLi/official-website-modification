#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
可选后台轮询：仅在显式设置 YH_DAEMON=1 并由 run_demo.sh 拉起时才会运行。
默认 run_demo.sh 不启动本脚本，设备不会自动反复请求官网 API。

说明：网页端无法主动向 NAT 后的设备「推送」；若需无人值守，管理员授权后由本脚本
周期性请求官网 API（与 fetch_signature / download_bound_artifacts 相同），实现准实时拉取。

环境变量：
  YH_POLL_INTERVAL  轮询间隔秒数，默认 45
  API_BASE / DEVICE_ID  与 fetch_signature.py 一致
  YH_SKIP_LAUNCH      设为 1 时同步完成后不启动 YHTheStudio

用法：
  YH_DAEMON=1 ./run_demo.sh   # 未授权或下载失败时会 nohup 启动本脚本
  python3 yh_background_sync.py   # 也可手动单独运行（调试用）
"""
from __future__ import annotations

import fcntl
import os
import subprocess
import sys
import time
from pathlib import Path

# 与 verify_signature / download_bound_artifacts 一致
ROOT = Path(__file__).resolve().parent
LAST_VERIFY = ROOT / "last_verify.json"
PID_FILE = ROOT / "yh_background_sync.pid"
LOCK_FILE = ROOT / ".yh_background_sync.lock"

POLL_INTERVAL = max(15, int(os.environ.get("YH_POLL_INTERVAL", "45")))


def _another_instance_running() -> bool:
    """若 pid 文件指向仍存活的进程，则认为已有实例在跑。"""
    if not PID_FILE.is_file():
        return False
    try:
        pid = int(PID_FILE.read_text(encoding="utf-8").strip())
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
    # 其它进程占用中
    return pid != os.getpid()


def _write_pid() -> None:
    PID_FILE.write_text(str(os.getpid()), encoding="utf-8")


def _clear_pid() -> None:
    try:
        if PID_FILE.is_file() and PID_FILE.read_text(encoding="utf-8").strip() == str(os.getpid()):
            PID_FILE.unlink(missing_ok=True)
    except OSError:
        pass


def _one_cycle() -> str:
    """
    执行一轮：拉签名 -> 本地验签 -> 同步下载。
    返回 "done" | "retry" | "fatal"（fatal：验证次数用尽等，不应无限轮询）
    """
    import fetch_signature  # noqa: WPS433 同目录脚本，延迟导入避免循环

    fetch_rc = fetch_signature.main()
    if fetch_rc == 2:
        # 仍未授权，继续睡
        return "retry"
    if fetch_rc == 3:
        # 验证次数已达上限，轮询无意义
        return "fatal"
    if fetch_rc != 0:
        # 网络或其它错误，稍后重试
        return "retry"

    import verify_signature  # noqa: WPS433

    if verify_signature.main() != 0:
        return "retry"

    from download_bound_artifacts import run_sync

    sync_rc = run_sync(LAST_VERIFY)
    if sync_rc == 0:
        return "done"
    # 1 缺文件 2 验签失败 3 下载失败 4 绑定不完整 — 除 fatal 外均可下一轮重试
    return "retry"


def main() -> int:
    if _another_instance_running():
        print("[信息] yh_background_sync 已在运行，跳过重复启动", flush=True)
        return 0

    # 非阻塞互斥锁，避免短时间连续 nohup 启动两个实例
    try:
        lock_fp = LOCK_FILE.open("a+", encoding="utf-8")
        fcntl.flock(lock_fp.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print("[信息] 另一实例正在获取锁，跳过重复启动", flush=True)
        return 0

    if _another_instance_running():
        try:
            fcntl.flock(lock_fp.fileno(), fcntl.LOCK_UN)
        except OSError:
            pass
        lock_fp.close()
        print("[信息] yh_background_sync 已在运行，跳过重复启动", flush=True)
        return 0

    _write_pid()
    print(
        f"[信息] yh_background_sync 已启动，pid={os.getpid()}，每 {POLL_INTERVAL}s 轮询一次；"
        "管理员在网页授权并绑定资源后将自动同步到 YH/",
        flush=True,
    )

    try:
        while True:
            try:
                phase = _one_cycle()
            except Exception as e:
                print(f"[警告] 单轮同步异常（将重试）: {e}", file=sys.stderr, flush=True)
                phase = "retry"

            if phase == "done":
                print("[成功] YH 绑定资源已同步完成", flush=True)
                _clear_pid()
                try:
                    fcntl.flock(lock_fp.fileno(), fcntl.LOCK_UN)
                except OSError:
                    pass
                lock_fp.close()
                # 同步完成后启动主程序（与 run_demo.sh 行为一致）
                if os.environ.get("YH_SKIP_LAUNCH") == "1":
                    print("[信息] YH_SKIP_LAUNCH=1，不启动 YHTheStudio", flush=True)
                    return 0
                launcher = ROOT / "launch_yh_studio.sh"
                if launcher.is_file():
                    # 与 run_demo.sh 在下载完成后启动行为一致
                    print("系统构建完成，正在启动程序。请稍后！！！", flush=True)
                    return subprocess.run(["bash", str(launcher)], cwd=str(ROOT)).returncode
                print("[警告] 未找到 launch_yh_studio.sh，跳过启动", flush=True)
                return 0

            if phase == "fatal":
                print("[信息] 验证次数已达上限，后台同步退出（请管理员处理后重新运行 run_demo.sh）", flush=True)
                _clear_pid()
                try:
                    fcntl.flock(lock_fp.fileno(), fcntl.LOCK_UN)
                except OSError:
                    pass
                lock_fp.close()
                return 1

            time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        print("[信息] 收到中断，退出后台同步", flush=True)
        _clear_pid()
        try:
            fcntl.flock(lock_fp.fileno(), fcntl.LOCK_UN)
        except OSError:
            pass
        lock_fp.close()
        return 130


if __name__ == "__main__":
    sys.exit(main())
