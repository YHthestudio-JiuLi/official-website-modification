# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller 规格：单文件可执行（onefile）。"""
from __future__ import annotations

import os
from pathlib import Path

from PyInstaller.building.build_main import EXE, PYZ, Analysis

BUILD_DIR = Path(SPECPATH).resolve()
CYTHON_DIR = Path(os.environ["YH_CYTHON_DIR"]).resolve()
ENTRIES = BUILD_DIR / "entries"

# Cython 产物为 .so，PyInstaller 无法静态分析其 import，需显式声明标准库依赖
STDLIB_HIDDENIMPORTS = [
    "urllib",
    "urllib.error",
    "urllib.request",
    "urllib.parse",
    "urllib.response",
    "http",
    "http.client",
    "ssl",
    "email",
    "email.utils",
    "json",
    "gzip",
    "tarfile",
    "zipfile",
    "hashlib",
    "base64",
    "fcntl",
    "concurrent.futures",
    "threading",
    "datetime",
    "collections.abc",
    "importlib.metadata",
]

datas = [
    (str(CYTHON_DIR / "device_verification_codes.json"), "."),
]

for rt_dir in CYTHON_DIR.glob("pyarmor_runtime_*"):
    if rt_dir.is_dir():
        datas.append((str(rt_dir), rt_dir.name))

binaries: list[tuple[str, str]] = []
for so_file in sorted(CYTHON_DIR.glob("*.so")):
    binaries.append((str(so_file), "."))

for rt_dir in CYTHON_DIR.glob("pyarmor_runtime_*"):
    if not rt_dir.is_dir():
        continue
    for item in rt_dir.rglob("*.so"):
        rel_parent = item.parent.relative_to(CYTHON_DIR)
        binaries.append((str(item), str(rel_parent)))

hiddenimports = [
    *STDLIB_HIDDENIMPORTS,
    "pyarmor_runtime_000000",
    "cryptography",
    "cryptography.hazmat.primitives.serialization",
    "cryptography.hazmat.primitives.asymmetric.ed25519",
    "cryptography.hazmat.backends.openssl",
    "platform_public_key",
    "yh_main",
    "yh_launch",
    "yh_runtime",
    "yh_cooldown",
    "fetch_signature",
    "verify_signature",
    "download_bound_artifacts",
    "yh_background_sync",
    "device_fingerprint",
    "device_errors",
    "yh_demo_log",
    "yh_config",
    "yh_verify_cycle",
    "yh_tts",
    "yh_manifest",
    "yh_paths",
    "artifact_firmware",
    "artifact_http",
]
for so_file in CYTHON_DIR.glob("*.so"):
    mod_name = so_file.name.split(".", 1)[0]
    if mod_name not in hiddenimports:
        hiddenimports.append(mod_name)

a = Analysis(
    [str(ENTRIES / "yh_main_entry.py")],
    pathex=[str(CYTHON_DIR)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[str(BUILD_DIR / "pyi_rth_pyarmor.py")],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="yh-device",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
