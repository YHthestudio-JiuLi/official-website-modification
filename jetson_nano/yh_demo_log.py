"""run_demo 静默模式与统一播报出口。"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from yh_runtime import app_root
from yh_tts import speak


def run_demo_quiet() -> bool:
    return os.environ.get("YH_RUN_DEMO", "").strip() == "1"


def demo_info(message: str, *, file=None, flush: bool = True) -> None:
    """[信息]/[跳过]/[成功]/[提示] 类日志；静默模式下不输出。"""
    if run_demo_quiet():
        return
    print(message, file=file or sys.stdout, flush=flush)


def demo_warn(message: str, *, file=None, flush: bool = True) -> None:
    """[警告] 类日志；静默模式下不输出。"""
    if run_demo_quiet():
        return
    print(message, file=file or sys.stderr, flush=flush)


def demo_stdout(message: str, *, end: str = "\n", flush: bool = True) -> None:
    """普通 stdout；静默模式下不输出（用于下载进度等）。"""
    if run_demo_quiet():
        return
    sys.stdout.write(message + end)
    if flush:
        sys.stdout.flush()


def demo_endline() -> None:
    """进度行结束后换行；静默模式下不输出。"""
    demo_stdout("", end="")


def demo_timestamp(message: str) -> None:
    """关键时间戳信息：静默模式下也输出。"""
    print(message, flush=True)


def broadcast(message: str, *, root: Path | None = None) -> None:
    """统一播报：终端输出 + 可选 TTS（所有 [播报] 文案须经此出口）。"""
    print(message, flush=True)
    speak(message, app_root=root or app_root())
