#!/usr/bin/env python3
from __future__ import annotations

import sys

try:
    import pyarmor_runtime_000000  # noqa: F401  # PyArmor 运行时须最先加载
except ImportError:
    pass

from yh_main import main


if __name__ == "__main__":
    raise SystemExit(main())
