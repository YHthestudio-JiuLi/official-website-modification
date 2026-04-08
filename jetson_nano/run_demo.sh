#!/usr/bin/env bash
# 按时间窗口执行：满足条件才重新拉取签名，否则直接执行下一步
set -euo pipefail
cd "$(dirname "$0")"

# 冷却阈值（小时），可通过环境变量覆盖，例如：VERIFY_INTERVAL_HOURS=12 ./run_demo.sh
VERIFY_INTERVAL_HOURS="${VERIFY_INTERVAL_HOURS:-0.01}"
LAST_FILE="last_verify.json"

should_verify="1"
if [[ -f "$LAST_FILE" ]]; then
  # 用 Python 解析 JSON 和时间戳，兼容不同系统的 date 行为
  if python3 - "$LAST_FILE" "$VERIFY_INTERVAL_HOURS" <<'PY'
import json
import sys
import time
from pathlib import Path

path = Path(sys.argv[1])
threshold_hours = float(sys.argv[2])
threshold_seconds = int(threshold_hours * 3600)

data = json.loads(path.read_text(encoding="utf-8"))
issued_at = int(data.get("issued_at", 0))
now_ts = int(time.time())
delta = now_ts - issued_at

if issued_at <= 0:
    print("[信息] last_verify.json 中没有有效 issued_at，将执行验证。")
    raise SystemExit(1)

print(f"[信息] 上次 issued_at: {issued_at}，距今约 {delta // 3600} 小时 {(delta % 3600) // 60} 分钟")
if delta >= threshold_seconds:
    print(f"[信息] 间隔 >= {threshold_hours:g} 小时，执行重新验证。")
    raise SystemExit(0)

print(f"[信息] 间隔 < {threshold_hours:g} 小时，跳过重新验证，直接执行下一步。")
raise SystemExit(2)
PY
  then
    should_verify="1"
  else
    rc="$?"
    if [[ "$rc" == "2" ]]; then
      should_verify="0"
    else
      should_verify="1"
    fi
  fi
else
  echo "[信息] 未找到 $LAST_FILE，首次运行将执行验证。"
fi

if [[ "$should_verify" == "1" ]]; then
  python3 fetch_signature.py
fi

python3 verify_signature.py
