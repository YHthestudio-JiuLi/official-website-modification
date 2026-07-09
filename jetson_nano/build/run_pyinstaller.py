#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在部分 macOS 终端环境下修补 platform.mac_ver，再调用 PyInstaller。"""
from __future__ import annotations

import os
import platform
import subprocess
import sys


def _patch_macos_dyld_expat() -> None:
    """Homebrew Python 3.13 的 pyexpat 需要 brew 版 libexpat，避免链接到旧版 /usr/lib。"""
    if sys.platform != "darwin":
        return
    expat_lib = "/opt/homebrew/opt/expat/lib"
    if not os.path.isdir(expat_lib):
        return
    current = os.environ.get("DYLD_LIBRARY_PATH", "")
    if expat_lib not in current.split(":"):
        os.environ["DYLD_LIBRARY_PATH"] = (
            f"{expat_lib}:{current}" if current else expat_lib
        )


def _patch_macos_platform_version() -> None:
    if sys.platform != "darwin":
        return

    original = platform.mac_ver

    def mac_ver() -> tuple[str, str, str]:
        release, versioninfo, machine = original()
        if release:
            return release, versioninfo, machine
        try:
            product = subprocess.check_output(
                ["sw_vers", "-productVersion"],
                text=True,
                stderr=subprocess.DEVNULL,
            ).strip()
        except (OSError, subprocess.SubprocessError):
            product = "14.0"
        if not product:
            product = "14.0"
        return product, versioninfo, machine

    platform.mac_ver = mac_ver  # type: ignore[method-assign]


def main() -> None:
    _patch_macos_dyld_expat()
    _patch_macos_platform_version()
    from PyInstaller.__main__ import run

    run()


if __name__ == "__main__":
    main()
