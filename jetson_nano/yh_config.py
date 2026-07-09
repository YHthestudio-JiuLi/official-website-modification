"""设备端 API 与环境配置（单一默认值来源）。"""
from __future__ import annotations

import os

# 生产环境默认 API 根地址；本地联调请通过环境变量 API_BASE 覆盖
DEFAULT_API_BASE = "https://yhthestudio.com"


def resolve_api_base(*, verify_data: dict | None = None) -> str:
    """
    解析 API 根地址，优先级：
    1. last_verify.json 中的 api_base（验签/下载场景）
    2. 环境变量 API_BASE
    3. DEFAULT_API_BASE
    """
    if verify_data:
        stored = str(verify_data.get("api_base") or "").strip().rstrip("/")
        if stored:
            return stored

    env_base = os.environ.get("API_BASE", "").strip().rstrip("/")
    if env_base:
        return env_base

    return DEFAULT_API_BASE
