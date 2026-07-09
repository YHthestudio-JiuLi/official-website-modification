#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""启动已下载的 YHTheStudio 应用。"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from yh_runtime import app_root

STUDIO_REL = Path("YH/dist/YHTheStudio")


def launch_yh_studio(extra_args: list[str] | None = None) -> int:
    """在 YH/dist/YHTheStudio 目录下 exec YHTheStudio。"""
    root = app_root()
    studio_dir = root / STUDIO_REL
    run_demo = os.environ.get("YH_RUN_DEMO", "") == "1"

    if not studio_dir.is_dir():
        if run_demo:
            return 0
        print(f"[错误] 应用目录不存在: {studio_dir}（请先完成下载与解压）", file=sys.stderr)
        return 1

    binary = studio_dir / "YHTheStudio"
    if not binary.is_file():
        if run_demo:
            return 0
        print(f"[错误] 未找到 {binary}（请先完成下载与解压）", file=sys.stderr)
        return 1

    if not run_demo:
        print(f"[信息] 工作目录: {studio_dir.resolve()}")
        print(f"[信息] 启动: {binary.resolve()}")

    os.chdir(studio_dir)
    argv = [str(binary), *(extra_args if extra_args is not None else sys.argv[1:])]
    os.execv(str(binary), argv)
    return 0  # unreachable
