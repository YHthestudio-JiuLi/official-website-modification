"""打包与源码双模式下的路径解析。"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def app_root() -> Path:
    """部署根目录：last_verify.json、YH/ 等工作数据所在位置（运行时可执行文件所在目录）。"""
    override = os.environ.get("YH_APP_ROOT", "").strip()
    if override:
        return Path(override).resolve()
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def bundle_root() -> Path:
    """打包资源目录（PyInstaller _MEIPASS 或源码目录）。"""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS).resolve()
    return Path(__file__).resolve().parent


def ensure_app_root_on_path() -> Path:
    """将打包资源目录与部署根加入 sys.path。"""
    root = app_root()
    bundle = bundle_root()
    for candidate in (bundle, root):
        path_str = str(candidate)
        if path_str not in sys.path:
            sys.path.insert(0, path_str)
    return root


def resource_path(name: str) -> Path:
    """读取打包内置资源（如 device_verification_codes.json）。"""
    bundled = bundle_root() / name
    if bundled.is_file():
        return bundled
    return app_root() / name
