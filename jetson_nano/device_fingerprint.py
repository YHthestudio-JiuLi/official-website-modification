#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Jetson 设备指纹采集。"""
from __future__ import annotations

import re
import subprocess
import sys
from hashlib import sha512
from pathlib import Path

from yh_manifest import FINGERPRINT_ALGO_VERSION, FINGERPRINT_HEX_LENGTH

_FINGERPRINT_HEX_RE = re.compile(rf"^[0-9a-f]{{{FINGERPRINT_HEX_LENGTH}}}$")
_PLATFORM_UUID_RE = re.compile(r'"IOPlatformUUID"\s*=\s*"([^"]+)"')


def _read_text_file(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore").strip()


def _read_first_existing(paths: list[Path]) -> str:
    for path in paths:
        if path.exists() and path.is_file():
            value = _read_text_file(path)
            if value:
                return value
    return ""


def _read_storage_identifiers() -> str:
    ids: list[str] = []
    candidates = [
        Path("/sys/block/mmcblk0/device/cid"),
        Path("/sys/block/mmcblk0/device/serial"),
        Path("/sys/block/mmcblk1/device/cid"),
        Path("/sys/block/mmcblk1/device/serial"),
        Path("/sys/block/nvme0n1/device/serial"),
    ]
    for path in candidates:
        if path.exists() and path.is_file():
            value = _read_text_file(path).lower()
            if value:
                ids.append(value)
    return ",".join(ids)


def _run_text_command(args: list[str], timeout: int = 8) -> str:
    try:
        return subprocess.check_output(
            args,
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
        )
    except (OSError, subprocess.SubprocessError):
        return ""


def _read_macos_platform_uuid() -> str:
    """macOS 硬件 UUID，作为 machine-id 的本地开发回退。"""
    out = _run_text_command(["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"])
    for line in out.splitlines():
        match = _PLATFORM_UUID_RE.search(line)
        if match:
            return match.group(1).strip().lower()
    return ""


def _read_macos_serial() -> str:
    """macOS 机身序列号。"""
    out = _run_text_command(["system_profiler", "SPHardwareDataType"], timeout=15)
    for line in out.splitlines():
        if "Serial Number" in line:
            return line.split(":", 1)[-1].strip().lower()
    return ""


def _read_macos_storage_ids() -> str:
    """macOS 系统盘 UUID。"""
    out = _run_text_command(["diskutil", "info", "/"])
    for line in out.splitlines():
        if "Disk / Partition UUID" in line or "Volume UUID" in line:
            return line.split(":", 1)[-1].strip().lower()
    return ""


def _collect_fingerprint_parts() -> list[str]:
    machine_id = _read_first_existing([Path("/etc/machine-id"), Path("/var/lib/dbus/machine-id")])
    serial = _read_first_existing([Path("/proc/device-tree/serial-number")])
    storage_ids = _read_storage_identifiers()
    parts = [machine_id, serial, storage_ids]

    # 仅 macOS 本机联调：Jetson/Linux 正式环境不会进入此分支
    if not any(parts) and sys.platform == "darwin":
        parts = [_read_macos_platform_uuid(), _read_macos_serial(), _read_macos_storage_ids()]

    return [part for part in parts if part]


def build_device_fingerprint() -> str:
    raw = "|".join(_collect_fingerprint_parts())
    if not raw:
        return ""
    return sha512(raw.encode("utf-8")).hexdigest()


def normalize_fingerprint(value: str | None) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return ""
    if _FINGERPRINT_HEX_RE.fullmatch(raw) is None:
        return ""
    return raw
