"""固件包探测、解压与校验（供 download_bound_artifacts 使用）。"""
from __future__ import annotations

import gzip
import hashlib
import os
import stat
import tarfile
import zipfile
from pathlib import Path

from yh_paths import FIRMWARE_MARKER, dist_studio_root, firmware_ready, resolve_data_dir


def question_files_exist(data_dir: Path) -> tuple[bool, bool]:
    """检查题库数据库和向量索引是否存在。"""
    return (data_dir / "questions.db").is_file(), (data_dir / "faiss.index").is_file()


def dist_studio_resources_ready(yh_dir: Path | None = None) -> bool:
    """
    判断 YH/dist/YHTheStudio 布局下是否已有运行所需资源：
    _internal/data/questions.db、_internal/data/faiss.index，以及固件解压后的关键目录。
    """
    root = Path(__file__).resolve().parent
    yh = (root / "YH") if yh_dir is None else yh_dir
    if not yh.is_dir():
        return False
    if not dist_studio_root(yh).is_dir():
        return False
    data_dir = resolve_data_dir(yh)
    has_db, has_idx = question_files_exist(data_dir)
    if not (has_db and has_idx):
        return False
    return firmware_ready(yh)


def _merge_dir(src: Path, dst: Path) -> None:
    """把 src 目录内容并入 dst（已存在则递归合并）。"""
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        target = dst / item.name
        if item.is_dir():
            _merge_dir(item, target)
            item.rmdir()
        else:
            if target.exists():
                target.unlink()
            item.replace(target)


def _restore_executable_bits(yh_dir: Path) -> None:
    """解压后恢复 ELF、shebang 与常见可执行目标的执行权限。"""
    restored = 0
    for path in yh_dir.rglob("*"):
        if not path.is_file():
            continue

        should_exec = False
        try:
            with path.open("rb") as f:
                head = f.read(4)
            if head.startswith(b"\x7fELF") or head.startswith(b"#!"):
                should_exec = True
        except Exception:
            continue

        if path.name in ("YHTheStudio", "YHTheStudio.bin"):
            should_exec = True

        if not should_exec:
            continue

        try:
            mode = path.stat().st_mode
            new_mode = mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
            if new_mode != mode:
                os.chmod(path, new_mode)
                restored += 1
        except Exception:
            continue

    print(f"[信息] 已恢复可执行权限文件数: {restored}")


def _extract_zip_preserve_symlink(zip_path: Path, target_dir: Path) -> None:
    """解压 zip 并保留符号链接，避免链接库被写成文本文件。"""
    with zipfile.ZipFile(zip_path, "r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                (target_dir / info.filename).mkdir(parents=True, exist_ok=True)
                continue

            out_path = target_dir / info.filename
            out_path.parent.mkdir(parents=True, exist_ok=True)

            mode = (info.external_attr >> 16) & 0xFFFF
            is_symlink = (mode & 0o170000) == 0o120000
            if is_symlink:
                target = zf.read(info).decode("utf-8", errors="ignore")
                out_path.unlink(missing_ok=True)
                os.symlink(target, out_path)
                continue

            with zf.open(info, "r") as src, out_path.open("wb") as dst:
                while True:
                    chunk = src.read(1024 * 1024)
                    if not chunk:
                        break
                    dst.write(chunk)


def _probe_firmware_format(archive_path: Path) -> str:
    """
    按文件头识别压缩格式，避免 Content-Disposition 文件名与实际内容不一致。
    返回: zip | tar.gz | gzip | tar | unknown
    """
    try:
        raw = archive_path.read_bytes()[:264]
    except OSError:
        return "unknown"
    if not raw:
        return "unknown"
    if raw[:1] in (b"{", b"["):
        raise RuntimeError(
            "下载内容疑似 JSON（常为 API 错误），请检查服务端固件是否已上传、路径是否在 uploads 下"
        )
    if raw[:2].lower() == b"<!":
        raise RuntimeError("下载内容疑似 HTML，请检查 Nginx 反代、HTTPS 与 /api/device/download/artifact 是否直达 Node")
    if len(raw) >= 4 and raw[:2] == b"PK" and raw[2:4] in (b"\x03\x04", b"\x05\x06", b"\x07\x08"):
        return "zip"
    if len(raw) >= 2 and raw[:2] == b"\x1f\x8b":
        if tarfile.is_tarfile(archive_path):
            return "tar.gz"
        return "gzip"
    if tarfile.is_tarfile(archive_path):
        return "tar"
    return "unknown"


def extract_firmware(archive_path: Path, yh_dir: Path) -> None:
    """把固件包解压到 YH 目录。"""
    kind = _probe_firmware_format(archive_path)
    if kind == "unknown":
        suffixes = [s.lower() for s in archive_path.suffixes]
        if suffixes and suffixes[-1] == ".zip":
            kind = "zip"
        elif suffixes[-2:] == [".tar", ".gz"] or (suffixes and suffixes[-1] == ".tgz"):
            kind = "tar.gz"
        elif suffixes and suffixes[-1] == ".tar":
            kind = "tar"
        elif suffixes and suffixes[-1] == ".gz":
            kind = "gzip"

    if kind == "zip":
        _extract_zip_preserve_symlink(archive_path, yh_dir)
    elif kind == "tar.gz":
        with tarfile.open(archive_path, "r:gz") as tf:
            tf.extractall(yh_dir)
    elif kind == "tar":
        with tarfile.open(archive_path, "r:") as tf:
            tf.extractall(yh_dir)
    elif kind == "gzip":
        out_name = archive_path.stem or "firmware.bin"
        out_file = yh_dir / out_name
        with gzip.open(archive_path, "rb") as src, out_file.open("wb") as dst:
            while True:
                chunk = src.read(1024 * 1024)
                if not chunk:
                    break
                dst.write(chunk)
    else:
        target = yh_dir / archive_path.name
        archive_path.replace(target)
        return

    _restore_executable_bits(yh_dir)
    marker = yh_dir / FIRMWARE_MARKER
    marker.write_text(f"{archive_path.name}\n", encoding="utf-8")
    archive_path.unlink(missing_ok=True)


def find_existing_firmware_archive(yh_dir: Path) -> Path | None:
    """查找已下载但尚未处理的固件压缩包。"""
    patterns = ("*.zip", "*.tar.gz", "*.tgz", "*.tar", "*.gz")
    for pattern in patterns:
        files = sorted(yh_dir.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)
        if files:
            return files[0]
    return None


def sha256_file(path: Path) -> str:
    """计算文件 SHA-256（十六进制小写）。"""
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()
