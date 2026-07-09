#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""将 staging 目录中的 Python 模块编译为 Cython 扩展（.so）。"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

from Cython.Build import cythonize
from setuptools import Extension, setup


# 保留明文，便于本地开发时单独查看（打包时同样会混淆编译）
SKIP_MODULES: set[str] = set()


def collect_extensions(staging_dir: Path) -> list[Extension]:
    extensions: list[Extension] = []
    for py_file in sorted(staging_dir.glob("*.py")):
        if py_file.stem in SKIP_MODULES:
            continue
        if py_file.name.startswith("entry_"):
            continue
        extensions.append(
            Extension(
                py_file.stem,
                [str(py_file)],
            )
        )
    return extensions


def resolve_source_dir(path: Path) -> Path:
    """PyArmor 可能把脚本写到子目录 staging/，此处统一解析。"""
    if (path / "staging").is_dir() and not any(path.glob("*.py")):
        return path / "staging"
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="Cython 编译 jetson_nano 模块")
    parser.add_argument("staging_dir", type=Path, help="PyArmor 输出目录")
    parser.add_argument("output_dir", type=Path, help="编译产物输出目录")
    args = parser.parse_args()

    staging_dir = resolve_source_dir(args.staging_dir.resolve())
    output_dir = args.output_dir.resolve()
    if not staging_dir.is_dir():
        print(f"[错误] staging 目录不存在: {staging_dir}", file=sys.stderr)
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)
    extensions = collect_extensions(staging_dir)
    if not extensions:
        print("[错误] 未找到可编译的 Python 模块", file=sys.stderr)
        return 1

    # 在 output_dir 内编译，避免污染源码树
    for py_file in staging_dir.glob("*.py"):
        if py_file.stem in SKIP_MODULES:
            shutil.copy2(py_file, output_dir / py_file.name)
            continue
        if py_file.name.startswith("entry_"):
            continue
        shutil.copy2(py_file, output_dir / py_file.name)

    shutil.copy2(staging_dir / "device_verification_codes.json", output_dir / "device_verification_codes.json")

    original_cwd = Path.cwd()
    try:
        os.chdir(output_dir)
        setup(
            name="yh_jetson_nano",
            ext_modules=cythonize(
                [str(output_dir / f"{ext.name}.py") for ext in extensions],
                compiler_directives={"language_level": "3"},
            ),
            script_args=["build_ext", "--inplace"],
        )
    finally:
        os.chdir(original_cwd)

    # 编译成功后删除中间 .py / .c，仅保留 .so 与明文配置
    for py_file in output_dir.glob("*.py"):
        if py_file.stem in SKIP_MODULES:
            continue
        py_file.unlink(missing_ok=True)
    for c_file in output_dir.glob("*.c"):
        c_file.unlink(missing_ok=True)
    build_tmp = output_dir / "build"
    if build_tmp.is_dir():
        shutil.rmtree(build_tmp, ignore_errors=True)

    print(f"[成功] Cython 编译完成: {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
