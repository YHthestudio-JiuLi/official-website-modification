#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
验签通过后，下载设备绑定的题库与固件到本地 YH 目录。
默认读取同目录 last_verify.json，并请求网站 /api/device/download/artifact 接口。

环境变量：
  API_BASE                 见 yh_config.resolve_api_base；默认 https://yhthestudio.com
  YH_PARALLEL_DOWNLOAD     默认 1，启用 HTTP Range 并行分片；设为 0/false/off 退回单连接。
  YH_DOWNLOAD_CONCURRENCY  并行时每文件并发路数，默认 4，范围 1～8（=1 等价单连接）。
  YH_APP_DIR                 可选，覆盖应用内 data 父目录，默认 dist/YHTheStudio/_internal
                             （题库落盘至 {YH_APP_DIR}/data，即 dist/YHTheStudio/_internal/data）

binding-status 会返回 firmware_size_bytes / question_db_size_bytes / question_vector_size_bytes
（用于进度条总大小与 ETA；固件在 stat 失败时还可来自库表 file_size）。代理 chunked 无 Content-Length 时依赖上述字段。
部署：更新 api-server 与 py_backend 后须分别重启 Node 与 Python 进程；npm run build 只构建前端。

下载策略：默认 HTTP Range 多连接分片（需 Node 端 206 支持，见 api-server.js），可用 YH_PARALLEL_DOWNLOAD=0 退回单连接。
artifact 请求遇 HTTP 429/502/503/504 时会在客户端退避重试；生产环境建议在 Node 端将 /api/device 排除通用限流。
固件 SHA 与绑定不一致时会自动再完整下载一次；若本次为并行模式则重试时强制单连接。
非 tty（被重定向到日志文件等）场景下，进度行会自动降频（按百分比与时间），避免日志被刷爆。

绑定门槛：仅当网站同时绑定固件、题库数据库与向量索引（binding-status 三项均为真）时才下载；
否则不拉取任何资源，打印「[播报] 设备未绑定系统程序，请联系平台管理员」并以退出码 4 结束（run_demo.sh 不删 YH、不启动主程序）。
"""
from __future__ import annotations

import gzip
import json
import os
import sys
import tarfile
import zipfile
from pathlib import Path

from artifact_firmware import (
    extract_firmware,
    find_existing_firmware_archive,
    question_files_exist,
    sha256_file,
)
from artifact_http import (
    EXIT_BINDING_INCOMPLETE,
    artifact_size_hint,
    binding_complete_for_download,
    download_one,
    fetch_binding_status,
    will_try_parallel_range,
)
from verify_signature import OUTPUT_NAME, purge_binding_artifacts_dir, verify_payload
from device_errors import DeviceApiHttpError, exit_code_from_api_error, is_auth_retryable_api_error, is_not_found_api_error
from yh_config import resolve_api_base
from yh_demo_log import demo_info, demo_warn
from yh_paths import (
    BINDING_STATE_FILE,
    firmware_ready,
    purge_local_artifacts,
    resolve_data_dir,
)
from yh_runtime import app_root, ensure_app_root_on_path


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
    keys = (
        "question_id",
        "firmware_id",
        "question_db_name",
        "question_vector_name",
        "firmware_name",
        "firmware_checksum_sha256",
    )
    for key in keys:
        if local_state.get(key) != remote_state.get(key):
            return False
    return True


def _place_at_canonical_name(saved: Path, target_dir: Path, canonical_name: str) -> Path:
    """将下载文件重命名为约定文件名（如 questions.db / faiss.index）。"""
    dest = target_dir / canonical_name
    if saved.name != canonical_name:
        dest.write_bytes(saved.read_bytes())
        saved.unlink(missing_ok=True)
    return dest


def sync_artifact(
    api_base: str,
    payload: dict,
    remote_binding: dict,
    *,
    artifact: str,
    target_dir: Path,
    canonical_name: str | None,
    success_message: str,
) -> int | None:
    """
    下载单个 artifact 到 target_dir。
    返回 None 表示成功；返回 3 表示失败（与 run_sync 退出码一致）。
    """
    try:
        saved = download_one(
            api_base,
            payload,
            artifact,
            target_dir,
            size_hint=artifact_size_hint(remote_binding, artifact),
        )
        if canonical_name:
            saved = _place_at_canonical_name(saved, target_dir, canonical_name)
        demo_info(success_message.format(path=saved))
    except DeviceApiHttpError as e:
        if is_not_found_api_error(e):
            demo_info(f"[跳过] {artifact}: HTTP {e.http_code}")
            return None
        print(f"[错误] 下载 {artifact} 失败: HTTP {e.http_code}: {e.body[:200]}", file=sys.stderr)
        return 3
    except RuntimeError as e:
        print(f"[错误] 下载 {artifact} 失败: {e}", file=sys.stderr)
        return 3
    return None


def _sync_firmware(
    api_base: str,
    payload: dict,
    remote_binding: dict,
    yh_dir: Path,
) -> int | None:
    """同步固件：解压已有包或下载后校验 SHA 并解压。返回 3 表示失败。"""
    existing_archive = find_existing_firmware_archive(yh_dir)
    need_firmware = bool(remote_binding.get("has_firmware"))
    need_download_firmware = False

    if not need_firmware:
        demo_info("[跳过] 网站未绑定固件")
        return None
    if firmware_ready(yh_dir):
        demo_info("[跳过] 固件已存在并已解压，跳过下载")
        if existing_archive is not None:
            demo_info(
                f"[信息] 已有解压内容，遗留压缩包不再自动解压（可手动删除）: {existing_archive}"
            )
        return None
    if existing_archive is not None:
        demo_info(f"[信息] 检测到已有固件包，尝试解压: {existing_archive}")
        try:
            extract_firmware(existing_archive, yh_dir)
            demo_info(f"[成功] 固件已解压到: {yh_dir}")
            return None
        except (zipfile.BadZipFile, tarfile.ReadError, gzip.BadGzipFile, RuntimeError, OSError) as e:
            demo_warn(f"[警告] 固件包损坏或无法解压，已删除该文件并将重新下载: {e}")
            try:
                existing_archive.unlink(missing_ok=True)
            except OSError:
                pass
            need_download_firmware = True
    else:
        need_download_firmware = True

    if not need_download_firmware:
        return None

    fw_sz = artifact_size_hint(remote_binding, "firmware")
    if fw_sz <= 0:
        demo_info(
            "[提示] binding-status 未返回固件大小，进度条可能无法显示总大小与预计时间；"
            "请确认已部署并重启 Node（api-server）与 Python（py_backend）。"
        )
    try:
        parallel_fw = will_try_parallel_range()
        downloaded_fw = download_one(api_base, payload, "firmware", yh_dir, size_hint=fw_sz)
        expected_fw_sha256 = str(remote_binding.get("firmware_checksum_sha256") or "").strip().lower()
        if expected_fw_sha256:
            actual_fw_sha256 = sha256_file(downloaded_fw)
            if actual_fw_sha256 != expected_fw_sha256:
                demo_warn("[警告] 固件 SHA-256 与绑定不一致，尝试重新完整下载一次…")
                downloaded_fw.unlink(missing_ok=True)
                downloaded_fw = download_one(
                    api_base,
                    payload,
                    "firmware",
                    yh_dir,
                    size_hint=fw_sz,
                    force_single=parallel_fw,
                )
                actual_fw_sha256 = sha256_file(downloaded_fw)
                if actual_fw_sha256 != expected_fw_sha256:
                    downloaded_fw.unlink(missing_ok=True)
                    print(
                        f"[错误] 固件 SHA-256 不匹配，已删除下载文件。期望={expected_fw_sha256} 实际={actual_fw_sha256}",
                        file=sys.stderr,
                    )
                    print(
                        "[提示] 若两次下载校验仍失败：请到管理后台核对固件文件是否已更换但未更新校验和，"
                        "或重新上传固件并保存；也可在服务器上对当前固件文件执行 sha256sum 与库表 firmware_checksum_sha256 比对。",
                        file=sys.stderr,
                    )
                    return 3
        extract_firmware(downloaded_fw, yh_dir)
        demo_info(f"[成功] 固件已解压到: {yh_dir}")
    except DeviceApiHttpError as e:
        if is_not_found_api_error(e):
            demo_info(f"[跳过] firmware: HTTP {e.http_code}")
            return None
        print(f"[错误] 下载 firmware 失败: HTTP {e.http_code}: {e.body[:200]}", file=sys.stderr)
        return 3
    except RuntimeError as e:
        print(f"[错误] 下载 firmware 失败: {e}", file=sys.stderr)
        return 3
    return None


def run_sync(verify_file: Path) -> int:
    """
    对已存在的 last_verify.json 执行一次绑定拉取与解压。
    返回：0 成功；1 缺少/损坏的校验文件；2 本地验签未通过；3 网络或下载失败；
    4 网站未同时绑定固件与完整题库（未下载任何资源）。
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
        purge_binding_artifacts_dir()
        print(f"[错误] 验签未通过，拒绝下载: {msg}", file=sys.stderr)
        return 2

    api_base = resolve_api_base(verify_data=data)
    root = app_root()
    yh_dir = root / "YH"
    if not yh_dir.exists():
        yh_dir.mkdir(parents=True, exist_ok=True)
        demo_info(f"[信息] 已创建目录: {yh_dir}")

    demo_info(f"[信息] 下载基址: {api_base}")
    try:
        remote_binding = fetch_binding_status(api_base, data)
    except DeviceApiHttpError as e:
        if is_auth_retryable_api_error(e.http_code, e.payload):
            if verify_file.is_file():
                verify_file.unlink(missing_ok=True)
            return exit_code_from_api_error(e.http_code, e.payload)
        print(f"[错误] {e}", file=sys.stderr)
        return 3
    except RuntimeError as e:
        print(f"[错误] {e}", file=sys.stderr)
        return 3

    binding_same = _same_binding(_load_local_binding_state(yh_dir), remote_binding)
    if not binding_same:
        demo_info("[信息] 检测到绑定关系变化，清理本地旧资源并重新同步")
        purge_local_artifacts(yh_dir)
    else:
        demo_info("[信息] 本地绑定与网站一致，按缺失文件补齐")

    _save_local_binding_state(yh_dir, remote_binding)

    if not binding_complete_for_download(remote_binding):
        return EXIT_BINDING_INCOMPLETE

    fw_rc = _sync_firmware(api_base, data, remote_binding, yh_dir)
    if fw_rc is not None:
        return fw_rc

    data_dir = resolve_data_dir(yh_dir)
    has_db, has_index = question_files_exist(data_dir)

    if bool(remote_binding.get("has_question_db")) and not has_db:
        rc = sync_artifact(
            api_base,
            data,
            remote_binding,
            artifact="question_db",
            target_dir=data_dir,
            canonical_name="questions.db",
            success_message="[成功] question_db -> {path}",
        )
        if rc is not None:
            return rc
    elif bool(remote_binding.get("has_question_db")):
        demo_info(f"[跳过] 题库数据库已存在: {data_dir / 'questions.db'}")

    if bool(remote_binding.get("has_question_vector")) and not has_index:
        rc = sync_artifact(
            api_base,
            data,
            remote_binding,
            artifact="question_vector",
            target_dir=data_dir,
            canonical_name="faiss.index",
            success_message="[成功] question_vector -> {path}",
        )
        if rc is not None:
            return rc
    elif bool(remote_binding.get("has_question_vector")):
        demo_info(f"[跳过] 向量索引已存在: {data_dir / 'faiss.index'}")

    demo_info(f"[完成] 下载流程结束，YH 目录: {yh_dir}，题库目录: {data_dir}")
    return 0


def main() -> int:
    ensure_app_root_on_path()
    if len(sys.argv) > 1:
        verify_file = Path(sys.argv[1])
    else:
        verify_file = app_root() / OUTPUT_NAME

    return run_sync(verify_file)


if __name__ == "__main__":
    sys.exit(main())
