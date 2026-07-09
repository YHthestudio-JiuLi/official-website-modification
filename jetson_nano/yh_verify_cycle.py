"""拉签 → 验签 → 下载 共享编排（yh_main 与 yh_background_sync 共用）。"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class CycleOutcome(str, Enum):
    """单轮验证周期结果。"""

    SYNC_DONE = "sync_done"
    FETCH_RETRY = "fetch_retry"
    FETCH_FATAL = "fetch_fatal"
    FETCH_FAILED = "fetch_failed"
    VERIFY_FAILED = "verify_failed"
    SYNC_FAILED = "sync_failed"


@dataclass(frozen=True)
class CycleResult:
    outcome: CycleOutcome
    fetch_rc: int = 0
    verify_rc: int = 0
    sync_rc: int = 0
    api_code: str = ""


def run_verify_cycle(
    last_path: Path,
    *,
    on_verify_passed: Callable[[], None] | None = None,
) -> CycleResult:
    """
    执行一轮：拉签 → 验签 → 同步下载。
    on_verify_passed：验签成功后、开始下载前的回调（主流程用于播报「验证通过」）。
    """
    from fetch_signature import run_fetch
    from verify_signature import run_verify

    fetch_rc, api_code = run_fetch()
    if fetch_rc == 2:
        return CycleResult(CycleOutcome.FETCH_RETRY, fetch_rc=2, api_code=api_code)
    if fetch_rc == 3:
        return CycleResult(CycleOutcome.FETCH_FATAL, fetch_rc=3, api_code=api_code)
    if fetch_rc != 0:
        return CycleResult(CycleOutcome.FETCH_FAILED, fetch_rc=fetch_rc, api_code=api_code)

    verify_rc = run_verify(last_path)
    if verify_rc != 0:
        return CycleResult(CycleOutcome.VERIFY_FAILED, verify_rc=verify_rc)

    if on_verify_passed is not None:
        on_verify_passed()

    from download_bound_artifacts import run_sync

    sync_rc = run_sync(last_path)
    if sync_rc == 0:
        return CycleResult(CycleOutcome.SYNC_DONE, sync_rc=0)
    return CycleResult(CycleOutcome.SYNC_FAILED, sync_rc=sync_rc)


def broadcast_message_for_cycle(result: CycleResult) -> str | None:
    """根据周期结果返回应播报文案（验签成功中间态由 on_verify_passed 回调处理）。"""
    from device_errors import (
        BROADCAST_SYNC_COMPLETE,
        broadcast_message_for_fetch,
        broadcast_message_for_sync,
        broadcast_message_for_verify,
    )

    outcome = result.outcome
    if outcome in (CycleOutcome.FETCH_RETRY, CycleOutcome.FETCH_FATAL, CycleOutcome.FETCH_FAILED):
        return broadcast_message_for_fetch(result.api_code, result.fetch_rc)
    if outcome == CycleOutcome.VERIFY_FAILED:
        return broadcast_message_for_verify(result.verify_rc)
    if outcome == CycleOutcome.SYNC_FAILED:
        return broadcast_message_for_sync(result.sync_rc)
    if outcome == CycleOutcome.SYNC_DONE:
        return BROADCAST_SYNC_COMPLETE
    return None
