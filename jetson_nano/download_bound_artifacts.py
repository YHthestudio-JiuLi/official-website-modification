#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
验签通过后，下载设备绑定的题库与固件到本地 YH 目录。
默认读取同目录 last_verify.json，并请求网站 /api/device/download/artifact 接口。
"""
from __future__ import annotations

import gzip
import json
import os
import re
import shutil
import stat
import sys
import tarfile
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import unquote

from verify_signature import OUTPUT_NAME, verify_payload

DEFAULT_API_BASE = "http://127.0.0.1:3000"
FIRMWARE_MARKER = ".firmware_ready"
BINDING_STATE_FILE = ".binding_state.json"


def _parse_filename(cd: str | None, fallback: str) -> str:
    """从响应头提取文件名，兼容 filename 与 filename*。"""
    if not cd:
        return fallback
    m = re.search(r"filename\*=UTF-8''([^;]+)", cd, re.I)
    if m:
        return unquote(m.group(1).strip().strip('"'))
    m = re.search(r'filename="([^"]+)"', cd)
    if m:
        return m.group(1)
    m = re.search(r"filename=([^;]+)", cd)
    if m:
        return m.group(1).strip().strip('"')
    return fallback


def _download_one(base: str, payload: dict, artifact: str, target_dir: Path) -> Path:
    """下载单个资源并保存到目标目录。"""
    url = f"{base.rstrip('/')}/api/device/download/artifact"
    body = json.dumps(
        {
            "device_id": payload["device_id"],
            "issued_at": payload["issued_at"],
            "signature": payload["signature"],
            "artifact": artifact,
        },
        ensure_ascii=False,
    ).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    fallback_name = {
        "question_db": "questions.db",
        "question_vector": "faiss.index",
        "firmware": "firmware.bin",
    }[artifact]

    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            cd = resp.headers.get("Content-Disposition")
            name = Path(_parse_filename(cd, fallback_name)).name
            out = target_dir / name
            with out.open("wb") as f:
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
            return out
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {err}") from e
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", e)
        raise RuntimeError(f"网络请求失败: {reason}") from e


def _fetch_binding_status(base: str, payload: dict) -> dict:
    """读取设备在网站上的当前绑定关系。"""
    url = f"{base.rstrip('/')}/api/device/binding-status"
    body = json.dumps(
        {
            "device_id": payload["device_id"],
            "issued_at": payload["issued_at"],
            "signature": payload["signature"],
        },
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8")
            return json.loads(text)
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"读取绑定关系失败 HTTP {e.code}: {err}") from e
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", e)
        raise RuntimeError(f"读取绑定关系网络失败: {reason}") from e


def _load_local_binding_state(yh_dir: Path) -> dict | None:
    """读取本地绑定状态缓存。"""
    state_file = yh_dir / BINDING_STATE_FILE
    if not state_file.is_file():
        return None
    try:
        return json.loads(state_file.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_local_binding_state(yh_dir: Path, state: dict) -> None:
    """保存本地绑定状态缓存。"""
    state_file = yh_dir / BINDING_STATE_FILE
    state_file.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def _same_binding(local_state: dict | None, remote_state: dict) -> bool:
    """判断本地缓存绑定是否与网站一致。"""
    if not local_state:
        return False
    keys = ("question_id", "firmware_id", "question_db_name", "question_vector_name", "firmware_name")
    for key in keys:
        if local_state.get(key) != remote_state.get(key):
            return False
    return True


def _purge_local_artifacts(yh_dir: Path) -> None:
    """绑定变化时清理旧题库和旧固件。"""
    # 清理常见题库落盘位置
    for rel in (
        "questions.db",
        "faiss.index",
        "YHTheStudio/data/questions.db",
        "YHTheStudio/data/faiss.index",
        "dist/YHTheStudio/data/questions.db",
        "dist/YHTheStudio/data/faiss.index",
    ):
        p = yh_dir / rel
        if p.is_file():
            p.unlink(missing_ok=True)

    # 清理旧固件目录结构
    for rel in ("dist", "__MACOSX", "_internal", "models", "tts", "YHTheStudio"):
        p = yh_dir / rel
        if p.is_dir():
            shutil.rmtree(p, ignore_errors=True)

    # 清理旧固件包和标记
    marker = yh_dir / FIRMWARE_MARKER
    marker.unlink(missing_ok=True)
    state_file = yh_dir / BINDING_STATE_FILE
    state_file.unlink(missing_ok=True)
    for pattern in ("*.zip", "*.tar.gz", "*.tgz", "*.tar", "*.gz"):
        for p in yh_dir.glob(pattern):
            if p.is_file():
                p.unlink(missing_ok=True)


def _resolve_data_dir(yh_dir: Path) -> Path:
    """定位题库目标目录，优先保留固件原始结构中的 data 目录。"""
    app_dir = os.environ.get("YH_APP_DIR", "").strip()
    if app_dir:
        data_dir = yh_dir / app_dir / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        return data_dir

    # 优先匹配固件原始目录结构：YH/dist/YHTheStudio/data
    dist_app_root = yh_dir / "dist" / "YHTheStudio"
    dist_layout = dist_app_root / "data"
    if dist_layout.exists():
        return dist_layout
    if dist_app_root.exists():
        dist_layout.mkdir(parents=True, exist_ok=True)
        return dist_layout

    default_dir = yh_dir / "YHTheStudio" / "data"
    if default_dir.exists():
        return default_dir

    for child in yh_dir.iterdir():
        if child.is_dir() and (child / "data").is_dir():
            return child / "data"

    default_dir.mkdir(parents=True, exist_ok=True)
    return default_dir


def _question_files_exist(data_dir: Path) -> tuple[bool, bool]:
    """检查题库数据库和向量索引是否存在。"""
    return (data_dir / "questions.db").is_file(), (data_dir / "faiss.index").is_file()


def _firmware_ready(yh_dir: Path) -> bool:
    """检查固件是否已经就绪。"""
    marker = yh_dir / FIRMWARE_MARKER
    if marker.is_file():
        return True
    dist_app_root = yh_dir / "dist" / "YHTheStudio"
    if dist_app_root.is_dir() and (dist_app_root / "_internal").is_dir() and (dist_app_root / "models").is_dir():
        return True
    # 仅当固件关键结构存在时才视为就绪，避免仅创建 data 目录导致误判
    app_root = yh_dir / "YHTheStudio"
    if app_root.is_dir() and (app_root / "_internal").is_dir() and (app_root / "models").is_dir():
        return True
    if (yh_dir / "_internal").is_dir() and (yh_dir / "models").is_dir():
        return True
    return False


def dist_studio_resources_ready(yh_dir: Path | None = None) -> bool:
    """
    判断 YH/dist/YHTheStudio 布局下是否已有运行所需资源：
    data/questions.db、data/faiss.index，以及固件解压后的关键目录（逻辑同 _firmware_ready）。
    """
    root = Path(__file__).resolve().parent
    yh = (root / "YH") if yh_dir is None else yh_dir
    if not yh.is_dir():
        return False
    studio = yh / "dist" / "YHTheStudio"
    if not studio.is_dir():
        return False
    data_dir = studio / "data"
    has_db, has_idx = _question_files_exist(data_dir)
    if not (has_db and has_idx):
        return False
    return _firmware_ready(yh)


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
    """
    解压后恢复可执行权限：
    - ELF 二进制（0x7F 'ELF'）
    - Shebang 脚本（#!）
    - 常见可执行目标名（如 YHTheStudio）
    """
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

        if path.name in ("YHTheStudio",):
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
                # zip 的符号链接内容是目标路径字符串
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


def _extract_firmware(archive_path: Path, yh_dir: Path) -> None:
    """把固件包解压到 YH 目录。"""
    suffixes = [s.lower() for s in archive_path.suffixes]

    if suffixes and suffixes[-1] == ".zip":
        _extract_zip_preserve_symlink(archive_path, yh_dir)
    elif suffixes[-2:] == [".tar", ".gz"] or (suffixes and suffixes[-1] == ".tgz"):
        with tarfile.open(archive_path, "r:gz") as tf:
            tf.extractall(yh_dir)
    elif suffixes and suffixes[-1] == ".tar":
        with tarfile.open(archive_path, "r:") as tf:
            tf.extractall(yh_dir)
    elif suffixes and suffixes[-1] == ".gz":
        out_name = archive_path.stem or "firmware.bin"
        out_file = yh_dir / out_name
        with gzip.open(archive_path, "rb") as src, out_file.open("wb") as dst:
            while True:
                chunk = src.read(1024 * 1024)
                if not chunk:
                    break
                dst.write(chunk)
    else:
        # 未识别压缩格式时保留原文件到 YH 根目录，避免固件丢失
        target = yh_dir / archive_path.name
        archive_path.replace(target)
        return

    # 保持压缩包原始目录结构，不做目录重排
    _restore_executable_bits(yh_dir)
    marker = yh_dir / FIRMWARE_MARKER
    marker.write_text(f"{archive_path.name}\n", encoding="utf-8")
    archive_path.unlink(missing_ok=True)


def _find_existing_firmware_archive(yh_dir: Path) -> Path | None:
    """查找已下载但尚未处理的固件压缩包。"""
    patterns = ("*.zip", "*.tar.gz", "*.tgz", "*.tar", "*.gz")
    for pattern in patterns:
        files = sorted(yh_dir.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)
        if files:
            return files[0]
    return None


def run_sync(verify_file: Path) -> int:
    """
    对已存在的 last_verify.json 执行一次绑定拉取与解压。
    返回：0 成功；1 缺少/损坏的校验文件；2 本地验签未通过；3 网络或下载失败。
    """
    if not verify_file.is_file():
        print(f"[错误] 找不到文件: {verify_file}", file=sys.stderr)
        return 1

    try:
        data = json.loads(verify_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"[错误] JSON 解析失败: {e}", file=sys.stderr)
        return 1

    ok, msg = verify_payload(data)
    if not ok:
        yh_dir = Path(__file__).resolve().parent / "YH"
        if yh_dir.is_dir():
            # 验签失败时清空本地资源，防止设备继续使用失效绑定内容
            shutil.rmtree(yh_dir, ignore_errors=True)
            print(f"[警告] 验签未通过，已删除本地目录: {yh_dir}", file=sys.stderr)
        print(f"[错误] 验签未通过，拒绝下载: {msg}", file=sys.stderr)
        return 2

    api_base = str(data.get("api_base") or os.environ.get("API_BASE") or DEFAULT_API_BASE).strip().rstrip("/")
    if not api_base:
        api_base = DEFAULT_API_BASE

    root = Path(__file__).resolve().parent
    yh_dir = root / "YH"
    if not yh_dir.exists():
        yh_dir.mkdir(parents=True, exist_ok=True)
        print(f"[信息] 已创建目录: {yh_dir}")

    print(f"[信息] 下载基址: {api_base}")
    try:
        remote_binding = _fetch_binding_status(api_base, data)
    except RuntimeError as e:
        print(f"[错误] {e}", file=sys.stderr)
        return 3

    local_binding = _load_local_binding_state(yh_dir)
    binding_same = _same_binding(local_binding, remote_binding)
    if not binding_same:
        print("[信息] 检测到绑定关系变化，清理本地旧资源并重新同步")
        _purge_local_artifacts(yh_dir)
    else:
        print("[信息] 本地绑定与网站一致，按缺失文件补齐")

    existing_archive = _find_existing_firmware_archive(yh_dir)
    need_firmware = bool(remote_binding.get("has_firmware"))
    if existing_archive is not None and need_firmware:
        # 只要 YH 下存在压缩包，就优先执行解压，避免被“已就绪”判断短路
        print(f"[信息] 检测到已有固件包，直接解压: {existing_archive}")
        _extract_firmware(existing_archive, yh_dir)
        print(f"[成功] 固件已解压到: {yh_dir}")
    elif need_firmware and _firmware_ready(yh_dir):
        print("[跳过] 固件已存在并已解压，跳过下载")
    elif not need_firmware:
        print("[跳过] 网站未绑定固件")
    else:
        try:
            downloaded_fw = _download_one(api_base, data, "firmware", yh_dir)
            _extract_firmware(downloaded_fw, yh_dir)
            print(f"[成功] 固件已解压到: {yh_dir}")
        except RuntimeError as e:
            err = str(e)
            if "HTTP 404" in err:
                print(f"[跳过] firmware: {err[:200]}")
            else:
                print(f"[错误] 下载 firmware 失败: {err}", file=sys.stderr)
                return 3

    data_dir = _resolve_data_dir(yh_dir)
    has_db, has_index = _question_files_exist(data_dir)
    need_db = bool(remote_binding.get("has_question_db"))
    need_index = bool(remote_binding.get("has_question_vector"))

    if need_db and (not has_db):
        try:
            saved_db = _download_one(api_base, data, "question_db", data_dir)
            if saved_db.name != "questions.db":
                (data_dir / "questions.db").write_bytes(saved_db.read_bytes())
                saved_db.unlink(missing_ok=True)
            print(f"[成功] question_db -> {data_dir / 'questions.db'}")
        except RuntimeError as e:
            print(f"[错误] 下载 question_db 失败: {e}", file=sys.stderr)
            return 3
    elif need_db:
        print(f"[跳过] 题库数据库已存在: {data_dir / 'questions.db'}")
    else:
        print("[跳过] 网站未绑定 question_db")

    if need_index and (not has_index):
        try:
            saved_index = _download_one(api_base, data, "question_vector", data_dir)
            if saved_index.name != "faiss.index":
                (data_dir / "faiss.index").write_bytes(saved_index.read_bytes())
                saved_index.unlink(missing_ok=True)
            print(f"[成功] question_vector -> {data_dir / 'faiss.index'}")
        except RuntimeError as e:
            err = str(e)
            if "HTTP 404" in err:
                print(f"[跳过] question_vector: {err[:200]}")
            else:
                print(f"[错误] 下载 question_vector 失败: {err}", file=sys.stderr)
                return 3
    elif need_index:
        print(f"[跳过] 向量索引已存在: {data_dir / 'faiss.index'}")
    else:
        print("[跳过] 网站未绑定 question_vector")

    _save_local_binding_state(yh_dir, remote_binding)
    print(f"[完成] 下载流程结束，YH 目录: {yh_dir}，题库目录: {data_dir}")
    return 0


def main() -> int:
    if len(sys.argv) > 1:
        verify_file = Path(sys.argv[1])
    else:
        verify_file = Path(__file__).resolve().parent / OUTPUT_NAME

    return run_sync(verify_file)


if __name__ == "__main__":
    sys.exit(main())
