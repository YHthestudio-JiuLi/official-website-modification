"""设备端 artifact HTTP 下载引擎（Range 分片、进度、binding-status）。"""
from __future__ import annotations

import json
import math
import os
import re
import shutil
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import unquote

from device_errors import DeviceApiHttpError
from yh_demo_log import demo_endline, demo_info, demo_stdout

# 单连接读缓冲
READ_CHUNK_BYTES = 4 * 1024 * 1024
# 并行分片：首包探测长度、剩余区间按 MIN_PART_BYTES 与并发数切块
FIRST_RANGE_BYTES = 4 * 1024 * 1024
MIN_PART_BYTES = 2 * 1024 * 1024

# 固件解压后的标准布局：YH/dist/YHTheStudio/_internal/data
# 网站未同时绑定固件+完整题库时，不下载任何文件，run_demo.sh 据此不启动主程序
EXIT_BINDING_INCOMPLETE = 4


def binding_complete_for_download(binding: dict) -> bool:
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


def artifact_size_hint(binding: dict, artifact: str) -> int:
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
                demo_info(f"[信息] 服务端返回 HTTP {e.code}（限流/暂时不可用），{wait_s:.0f}s 后重试 "
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
                demo_stdout(_build_progress_line(display_name, written, total_use, elapsed))
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


def will_try_parallel_range() -> bool:
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


def auth_body_from_payload(payload: dict) -> dict:
    """从 last_verify.json 提取下载/绑定查询鉴权字段（指纹 + 签名）。"""
    fingerprint = payload.get("fingerprint")
    if not isinstance(fingerprint, str) or not fingerprint.strip():
        raise ValueError("last_verify.json 缺少 fingerprint")
    return {
        "fingerprint": fingerprint.strip(),
        "issued_at": payload["issued_at"],
        "signature": payload["signature"],
    }


def download_one(
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
            **auth_body_from_payload(payload),
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

    use_parallel = will_try_parallel_range() and not force_single

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
                raise DeviceApiHttpError(code, err_body)
            cl_n = _parse_content_length(resp_local.headers.get("Content-Length"))
            cr_n = _parse_content_range_total(resp_local.headers.get("Content-Range")) or 0
            total_use = cl_n or cr_n or _coerce_positive_size(size_hint)
            t_start = time.monotonic()
            _download_stream_to_path(resp_local, out, display_name, total_use, t_start)
            demo_endline()
            demo_info(f"[下载] {display_name} 完成 -> {out}")
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
            raise DeviceApiHttpError(e.code, err) from e
        except urllib.error.URLError as e:
            reason = getattr(e, "reason", e)
            raise RuntimeError(f"网络请求失败: {reason}") from e

    demo_info(f"[信息] YH_PARALLEL_DOWNLOAD=1，Range 并行分片（并发上限 {_download_concurrency_cap()}）…",
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
                demo_info(f"[下载] {display_name} 完成 -> {out}")
                return out

            if code != 206:
                err_body = resp.read(4096).decode("utf-8", errors="replace")
                raise DeviceApiHttpError(code, err_body)

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
                demo_info(f"[下载] {display_name} 完成 -> {out}")
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
                        demo_stdout(_build_progress_line(display_name, written, total, elapsed))
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
            demo_stdout(_build_progress_line(display_name, total, total, elapsed))
            demo_endline()
            demo_info(f"[下载] {display_name} 完成（并行分片 {len(ranges)} 路）-> {out}")
            return out
        finally:
            if resp is not None:
                try:
                    resp.close()
                except Exception:
                    pass
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise DeviceApiHttpError(e.code, err) from e
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", e)
        raise RuntimeError(f"网络请求失败: {reason}") from e


def fetch_binding_status(base: str, payload: dict) -> dict:
    """读取设备在网站上的当前绑定关系。"""
    url = f"{base.rstrip('/')}/api/device/binding-status"
    body = json.dumps(auth_body_from_payload(payload), ensure_ascii=False).encode("utf-8")
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
        raise DeviceApiHttpError(e.code, err) from e
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", e)
        raise RuntimeError(f"读取绑定关系网络失败: {reason}") from e


