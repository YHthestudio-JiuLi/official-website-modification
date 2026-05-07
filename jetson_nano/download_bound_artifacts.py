#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
验签通过后，下载设备绑定的题库与固件到本地 YH 目录。
默认读取同目录 last_verify.json，并请求网站 /api/device/download/artifact 接口。

环境变量：
  API_BASE                 见 fetch_signature.py；未设置且 last_verify.json 无 api_base 时见 DEFAULT_API_BASE 说明。
  YH_PARALLEL_DOWNLOAD     默认 1，启用 HTTP Range 并行分片；设为 0/false/off 退回单连接。
  YH_DOWNLOAD_CONCURRENCY  并行时每文件并发路数，默认 4，范围 1～8（=1 等价单连接）。

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
import hashlib
import json
import math
import os
import re
import shutil
import stat
import sys
import tarfile
import threading
import time
import urllib.error
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import unquote

from verify_signature import OUTPUT_NAME, purge_binding_artifacts_dir, verify_payload

DEFAULT_API_BASE = "https://yhthestudio.com"

# 单连接读缓冲
READ_CHUNK_BYTES = 4 * 1024 * 1024
# 并行分片：首包探测长度、剩余区间按 MIN_PART_BYTES 与并发数切块
FIRST_RANGE_BYTES = 4 * 1024 * 1024
MIN_PART_BYTES = 2 * 1024 * 1024
FIRMWARE_MARKER = ".firmware_ready"
BINDING_STATE_FILE = ".binding_state.json"
# 网站未同时绑定固件+完整题库时，不下载任何文件，run_demo.sh 据此不启动主程序
EXIT_BINDING_INCOMPLETE = 4


def _binding_complete_for_download(binding: dict) -> bool:
    """网站是否已同时绑定固件与完整题库（库表+向量）；缺一即视为未就绪，避免只解压固件导致运行时缺 faiss。"""
    return (
        bool(binding.get("has_firmware"))
        and bool(binding.get("has_question_db"))
        and bool(binding.get("has_question_vector"))
    )

# 下载进度展示用（与 artifact 参数对应）
_ARTIFACT_DOWNLOAD_LABELS = {
    "question_db": "题库数据库",
    "question_vector": "向量索引",
    "firmware": "固件",
}


def _format_download_mib(n: int) -> str:
    """将字节数格式化为 MiB 字符串（与脚本内其它二进制单位一致）。"""
    if n < 0:
        n = 0
    return f"{n / (1024 * 1024):.2f} MiB"


def _format_speed_mib_s(written_bytes: int, elapsed_s: float) -> str:
    """根据已写字节与耗时计算平均下载速度（MiB/s）。"""
    if written_bytes <= 0 or elapsed_s <= 1e-9:
        return "0.00 MiB/s"
    mib_s = (written_bytes / (1024 * 1024)) / elapsed_s
    return f"{mib_s:.2f} MiB/s"


def _format_eta(seconds: float) -> str:
    """预计剩余时间（粗略）。"""
    if seconds <= 0 or math.isinf(seconds) or math.isnan(seconds):
        return "--"
    s = max(1, int(math.ceil(seconds)))
    h, rem = divmod(s, 3600)
    m, s2 = divmod(rem, 60)
    if h > 0:
        return f"{h}时{m}分"
    if m > 0:
        return f"{m}分{s2}秒"
    return f"{s2}秒"


def _parse_content_range_total(content_range: str | None) -> int | None:
    """从 Content-Range 头解析资源总字节数，例如 bytes 0-0/12345 -> 12345。"""
    if not content_range:
        return None
    m = re.search(r"/(\d+)\s*$", content_range.strip())
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def _parse_content_length(raw: str | None) -> int:
    """解析 Content-Length 为字节数（兼容空白、代理改写等）。"""
    if raw is None:
        return 0
    s = str(raw).strip()
    if not s:
        return 0
    s = s.split(",")[0].strip().split()[0]
    try:
        n = int(s, 10)
        return n if n > 0 else 0
    except ValueError:
        return 0


def _coerce_positive_size(v) -> int:
    """将 binding JSON 中的大小字段转为正整数字节数（兼容 int/float/字符串/null）。"""
    if v is None:
        return 0
    if isinstance(v, bool):
        return 0
    if isinstance(v, (int, float)):
        n = int(v)
        return n if n > 0 else 0
    s = str(v).strip()
    if not s or s.lower() in ("null", "none", "undefined"):
        return 0
    try:
        n = int(float(s))
        return n if n > 0 else 0
    except ValueError:
        return 0


def _artifact_size_hint(binding: dict, artifact: str) -> int:
    """从 binding-status 返回的 *_size_bytes 取服务端统计的体积，作进度/ETA（chunked 无 Content-Length 时必需）。"""
    key = {
        "firmware": "firmware_size_bytes",
        "question_db": "question_db_size_bytes",
        "question_vector": "question_vector_size_bytes",
    }.get(artifact)
    if not key:
        return 0
    return _coerce_positive_size(binding.get(key))


def _stdout_is_tty() -> bool:
    """stdout 是否为终端；非终端时进度需要降频并改用换行。"""
    try:
        return bool(sys.stdout.isatty())
    except Exception:
        return False


def _build_progress_line(display_name: str, written: int, total_bytes: int, elapsed: float) -> str:
    """单行进度：已下 / 文件大小、网速、预计剩余。"""
    speed_str = _format_speed_mib_s(written, elapsed)
    total_str = _format_download_mib(total_bytes) if total_bytes > 0 else "未知"
    now_str = _format_download_mib(written)
    eol = "\r" if _stdout_is_tty() else "\n"
    if total_bytes > 0:
        pct = min(100.0, written * 100.0 / total_bytes)
        remain = max(0, total_bytes - written)
        if written > 0 and elapsed > 1e-6:
            rate = written / elapsed
            eta_sec = remain / rate if rate > 0 else float("inf")
        else:
            eta_sec = float("inf")
        eta_str = _format_eta(eta_sec)
        return (
            f"{eol}[下载] {display_name}: 已下 {now_str} / 文件大小 {total_str} ({pct:.1f}%) "
            f"网速 {speed_str} 预计 {eta_str}"
        )
    return f"{eol}[下载] {display_name}: 已下 {now_str} / 文件大小 {total_str} 网速 {speed_str} 预计 --"


class _ProgressThrottle:
    """非 tty 场景下的进度降频器：按百分比涨幅与最小时间间隔触发输出。"""

    def __init__(self, *, min_pct_step: float = 1.0, min_interval_s: float = 3.0) -> None:
        self._tty = _stdout_is_tty()
        self._min_pct_step = max(0.1, min_pct_step)
        self._min_interval_s = max(0.5, min_interval_s)
        self._last_pct = -1.0
        self._last_ts = 0.0

    def should_emit(self, written: int, total_bytes: int, now: float) -> bool:
        if self._tty:
            return True
        if total_bytes > 0:
            pct = min(100.0, written * 100.0 / total_bytes)
            if pct - self._last_pct >= self._min_pct_step or now - self._last_ts >= self._min_interval_s:
                self._last_pct = pct
                self._last_ts = now
                return True
            return False
        if now - self._last_ts >= self._min_interval_s:
            self._last_ts = now
            return True
        return False


_RETRYABLE_HTTP_STATUSES = {429, 502, 503, 504}


def _open_artifact_post(url: str, body_bytes: bytes, range_header: str | None = None):
    """发起设备端 artifact POST；可选 Range 头。对 429/5xx 限流类错误做退避重试。"""
    max_attempts = 6
    for attempt in range(max_attempts):
        req = urllib.request.Request(
            url,
            data=body_bytes,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        if range_header:
            req.add_header("Range", range_header)
        try:
            return urllib.request.urlopen(req, timeout=600)
        except urllib.error.HTTPError as e:
            if e.code in _RETRYABLE_HTTP_STATUSES and attempt + 1 < max_attempts:
                try:
                    e.read()
                except Exception:
                    pass
                wait_s = min(45.0, 2.0 * (2**attempt))
                print(
                    f"[信息] 服务端返回 HTTP {e.code}（限流/暂时不可用），{wait_s:.0f}s 后重试 "
                    f"({attempt + 1}/{max_attempts})…",
                    flush=True,
                )
                time.sleep(wait_s)
                continue
            raise


def _download_stream_to_path(resp, out_path: Path, display_name: str, total_hint: int, t_start: float) -> int:
    """将整段 HTTP 响应体写入文件并刷新进度（用于 HTTP 200 整文件）。"""
    written = 0
    # 优先用 binding 给出的总长，避免 chunked 下整段循环里 total_use 一直为 0
    total_use = max(0, int(total_hint))
    throttle = _ProgressThrottle()
    with out_path.open("wb") as wf:
        while True:
            chunk = resp.read(READ_CHUNK_BYTES)
            if not chunk:
                break
            wf.write(chunk)
            written += len(chunk)
            now = time.monotonic()
            elapsed = now - t_start
            if total_use <= 0:
                cln = _parse_content_length(resp.headers.get("Content-Length"))
                if cln > 0:
                    total_use = cln
                if total_use <= 0:
                    cr = _parse_content_range_total(resp.headers.get("Content-Range"))
                    if cr and cr > 0:
                        total_use = cr
            if throttle.should_emit(written, total_use, now):
                sys.stdout.write(_build_progress_line(display_name, written, total_use, elapsed))
                sys.stdout.flush()
    return written


def _parallel_download_enabled() -> bool:
    """是否开启并行分片（环境变量 YH_PARALLEL_DOWNLOAD）。"""
    v = os.environ.get("YH_PARALLEL_DOWNLOAD", "1").strip().lower()
    return v in ("1", "true", "yes", "on")


def _download_concurrency_cap() -> int:
    """并行时的并发路数（1～8），对应环境变量 YH_DOWNLOAD_CONCURRENCY。"""
    try:
        c = int(os.environ.get("YH_DOWNLOAD_CONCURRENCY", "4"))
    except ValueError:
        c = 4
    return max(1, min(8, c))


def _will_try_parallel_range() -> bool:
    """本次是否走 Range 探测 + 可能多连接（开关开且并发>1）。"""
    return _parallel_download_enabled() and _download_concurrency_cap() > 1


def _split_ranges_even(rem_start: int, rem_end: int, parts: int) -> list[tuple[int, int]]:
    """将闭区间 [rem_start, rem_end] 尽量均匀切成 parts 段（端点包含）。"""
    if rem_start > rem_end or parts < 1:
        return []
    total = rem_end - rem_start + 1
    parts = min(parts, total)
    ranges: list[tuple[int, int]] = []
    base = total // parts
    extra = total % parts
    pos = rem_start
    for i in range(parts):
        seg_len = base + (1 if i < extra else 0)
        a = pos
        b = pos + seg_len - 1
        ranges.append((a, b))
        pos = b + 1
    return ranges


def _download_range_to_path(url: str, body: bytes, start: int, end: int, out_path: Path) -> None:
    """Range POST 下载闭区间 [start, end] 到独立文件（期望 HTTP 206）。"""
    rng = f"bytes={start}-{end}"
    expected = end - start + 1
    resp = _open_artifact_post(url, body, rng)
    try:
        code = getattr(resp, "status", None) or resp.getcode()
        if code != 206:
            err_body = resp.read(4096).decode("utf-8", errors="replace")
            raise RuntimeError(f"Range 分片期望 206，实际 HTTP {code}: {err_body[:400]}")
        written = 0
        with out_path.open("wb") as wf:
            while True:
                chunk = resp.read(READ_CHUNK_BYTES)
                if not chunk:
                    break
                wf.write(chunk)
                written += len(chunk)
        if written != expected:
            raise RuntimeError(f"分片字节数不符: 期望 {expected} 实际 {written}")
    finally:
        try:
            resp.close()
        except Exception:
            pass


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


def _download_one(
    base: str,
    payload: dict,
    artifact: str,
    target_dir: Path,
    size_hint: int = 0,
    *,
    force_single: bool = False,
) -> Path:
    """下载单个资源：默认单连接 HTTP 200；开关开启时先发 Range 探测，支持 206 并行分片。"""
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
    fallback_name = {
        "question_db": "questions.db",
        "question_vector": "faiss.index",
        "firmware": "firmware.bin",
    }[artifact]
    display_name = _ARTIFACT_DOWNLOAD_LABELS.get(artifact, artifact)

    use_parallel = _will_try_parallel_range() and not force_single

    def _download_single_connection() -> Path:
        """不带 Range，整文件 HTTP 200 流式写入。"""
        resp_local = None
        try:
            resp_local = _open_artifact_post(url, body, None)
            code = getattr(resp_local, "status", None) or resp_local.getcode()
            cd = resp_local.headers.get("Content-Disposition")
            name = Path(_parse_filename(cd, fallback_name)).name
            out = target_dir / name
            if code != 200:
                err_body = resp_local.read(4096).decode("utf-8", errors="replace")
                raise RuntimeError(f"HTTP {code}: {err_body[:400]}")
            cl_n = _parse_content_length(resp_local.headers.get("Content-Length"))
            cr_n = _parse_content_range_total(resp_local.headers.get("Content-Range")) or 0
            total_use = cl_n or cr_n or _coerce_positive_size(size_hint)
            t_start = time.monotonic()
            _download_stream_to_path(resp_local, out, display_name, total_use, t_start)
            sys.stdout.write("\n")
            sys.stdout.flush()
            print(f"[下载] {display_name} 完成 -> {out}")
            return out
        finally:
            if resp_local is not None:
                try:
                    resp_local.close()
                except Exception:
                    pass

    if not use_parallel:
        try:
            return _download_single_connection()
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {e.code}: {err}") from e
        except urllib.error.URLError as e:
            reason = getattr(e, "reason", e)
            raise RuntimeError(f"网络请求失败: {reason}") from e

    print(
        f"[信息] YH_PARALLEL_DOWNLOAD=1，Range 并行分片（并发上限 {_download_concurrency_cap()}）…",
        flush=True,
    )

    resp = None
    try:
        rng_first = f"bytes=0-{FIRST_RANGE_BYTES - 1}"
        resp = _open_artifact_post(url, body, rng_first)
        try:
            code = getattr(resp, "status", None) or resp.getcode()
            cd = resp.headers.get("Content-Disposition")
            name = Path(_parse_filename(cd, fallback_name)).name
            out = target_dir / name

            # 服务端忽略 Range：同一响应即为整文件 HTTP 200，直接流式写入（勿再发起第二次请求）
            if code == 200:
                cl_n = _parse_content_length(resp.headers.get("Content-Length"))
                cr_n = _parse_content_range_total(resp.headers.get("Content-Range")) or 0
                total_use = cl_n or cr_n or _coerce_positive_size(size_hint)
                t_start = time.monotonic()
                _download_stream_to_path(resp, out, display_name, total_use, t_start)
                sys.stdout.write("\n")
                sys.stdout.flush()
                print(f"[下载] {display_name} 完成 -> {out}")
                return out

            if code != 206:
                err_body = resp.read(4096).decode("utf-8", errors="replace")
                raise RuntimeError(f"HTTP {code}: {err_body[:400]}")

            total = _parse_content_range_total(resp.headers.get("Content-Range"))
            if not total or total <= 0:
                raise RuntimeError("响应缺少 Content-Range 总长度，无法分片下载（请升级 Node 端）")

            first_data = resp.read()
            try:
                resp.close()
            except Exception:
                pass
            resp = None

            first_len = len(first_data)
            if first_len > FIRST_RANGE_BYTES:
                raise RuntimeError("首包体积异常，中止下载")

            if first_len >= total:
                out.write_bytes(first_data)
                print(f"[下载] {display_name} 完成 -> {out}")
                return out

            conc = _download_concurrency_cap()
            rem_start = first_len
            rem_end = total - 1
            rem_n = rem_end - rem_start + 1
            if rem_n < MIN_PART_BYTES * 2:
                eff_parts = 1
            else:
                eff_parts = min(conc, max(1, rem_n // MIN_PART_BYTES))

            ranges = _split_ranges_even(rem_start, rem_end, eff_parts)
            part_paths = [out.with_suffix(out.suffix + f".part{i}") for i in range(len(ranges))]

            for orphan in out.parent.glob(f"{out.name}.part*"):
                orphan.unlink(missing_ok=True)

            t_start = time.monotonic()
            stop_evt = threading.Event()
            # tty 下保持 0.25s 顺滑刷新；非 tty 下 1s 轮询且按百分比/时间降频
            reporter_interval = 0.25 if _stdout_is_tty() else 1.0
            reporter_throttle = _ProgressThrottle()

            def _reporter() -> None:
                while not stop_evt.wait(reporter_interval):
                    extra = sum(p.stat().st_size for p in part_paths if p.exists())
                    written = first_len + extra
                    now_ts = time.monotonic()
                    elapsed = now_ts - t_start
                    if reporter_throttle.should_emit(written, total, now_ts):
                        sys.stdout.write(_build_progress_line(display_name, written, total, elapsed))
                        sys.stdout.flush()

            rep = threading.Thread(target=_reporter, daemon=True)
            rep.start()

            def _worker(seg: tuple[int, int], pth: Path) -> None:
                a, b = seg
                _download_range_to_path(url, body, a, b, pth)

            try:
                workers = min(conc, len(ranges))
                with ThreadPoolExecutor(max_workers=workers) as ex:
                    futs = [ex.submit(_worker, ranges[i], part_paths[i]) for i in range(len(ranges))]
                    for fu in as_completed(futs):
                        fu.result()
            except Exception:
                for p in part_paths:
                    p.unlink(missing_ok=True)
                raise
            finally:
                stop_evt.set()
                rep.join(timeout=2.0)

            with out.open("wb") as wf:
                wf.write(first_data)
                for p in part_paths:
                    if not p.is_file():
                        raise RuntimeError(f"分片文件缺失: {p}")
                    with p.open("rb") as rf:
                        shutil.copyfileobj(rf, wf, length=READ_CHUNK_BYTES)
                    p.unlink(missing_ok=True)

            elapsed = time.monotonic() - t_start
            sys.stdout.write(_build_progress_line(display_name, total, total, elapsed))
            sys.stdout.write("\n")
            sys.stdout.flush()
            print(f"[下载] {display_name} 完成（并行分片 {len(ranges)} 路）-> {out}")
            return out
        finally:
            if resp is not None:
                try:
                    resp.close()
                except Exception:
                    pass
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


def _probe_firmware_format(archive_path: Path) -> str:
    """
    按文件头识别压缩格式，避免服务端 Content-Disposition 文件名（如 .zip）
    与实际内容（如 gzip）不一致——部署到公网后更易出现 DB 与上传文件名混用。
    返回: zip | tar.gz | gzip | tar | unknown
    """
    try:
        raw = archive_path.read_bytes()[:264]
    except OSError:
        return "unknown"
    if not raw:
        return "unknown"
    # JSON / HTML 错误页（反代或鉴权把错误当正文返回时）
    if raw[:1] in (b"{", b"["):
        raise RuntimeError(
            "下载内容疑似 JSON（常为 API 错误），请检查服务端固件是否已上传、路径是否在 uploads 下"
        )
    if raw[:2].lower() == b"<!":
        raise RuntimeError("下载内容疑似 HTML，请检查 Nginx 反代、HTTPS 与 /api/device/download/artifact 是否直达 Node")
    # ZIP 本地文件头
    if len(raw) >= 4 and raw[:2] == b"PK" and raw[2:4] in (b"\x03\x04", b"\x05\x06", b"\x07\x08"):
        return "zip"
    # gzip：可能是 tar.gz 或单文件 .gz
    if len(raw) >= 2 and raw[:2] == b"\x1f\x8b":
        if tarfile.is_tarfile(archive_path):
            return "tar.gz"
        return "gzip"
    if tarfile.is_tarfile(archive_path):
        return "tar"
    return "unknown"


def _extract_firmware(archive_path: Path, yh_dir: Path) -> None:
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


def _sha256_file(path: Path) -> str:
    """计算文件 SHA-256（十六进制小写）。"""
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


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

    # 尽早写入绑定快照，避免下载中断后无 .binding_state.json、下次误判「绑定变化」而 Purge
    _save_local_binding_state(yh_dir, remote_binding)

    if not _binding_complete_for_download(remote_binding):
        print("[播报] 设备未绑定系统程序，请联系平台管理员", flush=True)
        return EXIT_BINDING_INCOMPLETE

    existing_archive = _find_existing_firmware_archive(yh_dir)
    need_firmware = bool(remote_binding.get("has_firmware"))
    # 先判断是否已解压就绪：避免遗留损坏的 .zip 先于「就绪」被解压导致崩溃并触发 run_demo 删库
    need_download_firmware = False

    if not need_firmware:
        print("[跳过] 网站未绑定固件")
    elif need_firmware and _firmware_ready(yh_dir):
        print("[跳过] 固件已存在并已解压，跳过下载")
        if existing_archive is not None:
            print(
                f"[信息] 已有解压内容，遗留压缩包不再自动解压（避免损坏包误覆盖；可手动删除）: {existing_archive}",
                flush=True,
            )
    elif existing_archive is not None:
        print(f"[信息] 检测到已有固件包，尝试解压: {existing_archive}")
        try:
            _extract_firmware(existing_archive, yh_dir)
            print(f"[成功] 固件已解压到: {yh_dir}")
        except (zipfile.BadZipFile, tarfile.ReadError, gzip.BadGzipFile, RuntimeError, OSError) as e:
            print(
                f"[警告] 固件包损坏或无法解压，已删除该文件并将重新下载: {e}",
                file=sys.stderr,
                flush=True,
            )
            try:
                existing_archive.unlink(missing_ok=True)
            except OSError:
                pass
            need_download_firmware = True
    else:
        need_download_firmware = True

    if need_firmware and need_download_firmware:
        fw_sz = _artifact_size_hint(remote_binding, "firmware")
        if fw_sz <= 0:
            print(
                "[提示] binding-status 未返回固件大小，进度条可能无法显示总大小与预计时间；"
                "请确认已部署并重启 Node（api-server）与 Python（py_backend）。",
                flush=True,
            )
        try:
            parallel_fw = _will_try_parallel_range()
            downloaded_fw = _download_one(api_base, data, "firmware", yh_dir, size_hint=fw_sz)
            expected_fw_sha256 = str(remote_binding.get("firmware_checksum_sha256") or "").strip().lower()
            if expected_fw_sha256:
                actual_fw_sha256 = _sha256_file(downloaded_fw)
                if actual_fw_sha256 != expected_fw_sha256:
                    # 传输或磁盘偶发损坏时完整重试一次；并行首轮则强制单连接重试
                    print(
                        "[警告] 固件 SHA-256 与绑定不一致，尝试重新完整下载一次…",
                        flush=True,
                    )
                    downloaded_fw.unlink(missing_ok=True)
                    downloaded_fw = _download_one(
                        api_base,
                        data,
                        "firmware",
                        yh_dir,
                        size_hint=fw_sz,
                        force_single=parallel_fw,
                    )
                    actual_fw_sha256 = _sha256_file(downloaded_fw)
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
            saved_db = _download_one(
                api_base, data, "question_db", data_dir, size_hint=_artifact_size_hint(remote_binding, "question_db")
            )
            if saved_db.name != "questions.db":
                (data_dir / "questions.db").write_bytes(saved_db.read_bytes())
                saved_db.unlink(missing_ok=True)
            print(f"[成功] question_db -> {data_dir / 'questions.db'}")
        except RuntimeError as e:
            print(f"[错误] 下载 question_db 失败: {e}", file=sys.stderr)
            return 3
    elif need_db:
        print(f"[跳过] 题库数据库已存在: {data_dir / 'questions.db'}")

    if need_index and (not has_index):
        try:
            saved_index = _download_one(
                api_base,
                data,
                "question_vector",
                data_dir,
                size_hint=_artifact_size_hint(remote_binding, "question_vector"),
            )
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
    if os.environ.get("YH_RUN_DEMO") != "1":
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
