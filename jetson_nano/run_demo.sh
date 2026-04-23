#!/usr/bin/env bash
# 按时间窗口执行：满足条件才重新拉取签名，否则直接执行下一步
set -euo pipefail
cd "$(dirname "$0")"

# 冷却阈值（小时），可通过环境变量覆盖，例如：VERIFY_INTERVAL_HOURS=12 ./run_demo.sh
VERIFY_INTERVAL_HOURS="${VERIFY_INTERVAL_HOURS:-0.01}"
LAST_FILE="last_verify.json"

cleanup_yh_on_fail() {
  if [[ -d "YH" ]]; then
    echo "[警告] 检测到失败，删除本地 YH 目录及全部内容"
    rm -rf "YH"
  fi
}

# 是否启用「未授权/下载失败时后台轮询」；设为 0 可关闭（例如调试）
YH_DAEMON="${YH_DAEMON:-1}"

# 启动低频率后台同步（管理员网页授权后设备自动拉取绑定资源）
start_yh_background_sync() {
  if [[ "${YH_DAEMON}" != "1" ]]; then
    echo "[信息] 已设置 YH_DAEMON=0，不启动后台同步进程"
    return 1
  fi
  if [[ -f yh_background_sync.pid ]]; then
    local old
    old=$(cat yh_background_sync.pid 2>/dev/null || true)
    if [[ -n "${old}" ]] && kill -0 "${old}" 2>/dev/null; then
      echo "[信息] 后台同步已在运行 (pid ${old})，日志: $(pwd)/yh_background_sync.log"
      return 0
    fi
  fi
  nohup python3 yh_background_sync.py >> yh_background_sync.log 2>&1 &
  echo "[信息] 已启动后台同步（pid 见 yh_background_sync.pid），日志: $(pwd)/yh_background_sync.log"
  echo "[信息] 请在网页后台为该设备「授权」并绑定题库/固件；授权后本机将自动创建 YH 并解压同步"
  return 0
}

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

# 冷却跳过拉签时若尚无签名文件，必须重新拉取，否则 verify 会失败
if [[ "$should_verify" == "0" ]] && [[ ! -f "$LAST_FILE" ]]; then
  echo "[信息] 无 last_verify.json，改为执行拉取签名。"
  should_verify="1"
fi

if [[ "$should_verify" == "1" ]]; then
  fetch_rc=0
  python3 fetch_signature.py || fetch_rc=$?
  if [[ "$fetch_rc" == "2" ]]; then
    echo "[信息] 设备尚未白名单授权或暂未返回签名，前台结束；已挂低频率后台轮询等待网页授权…"
    start_yh_background_sync || true
    exit 0
  fi
  if [[ "$fetch_rc" != "0" ]]; then
    cleanup_yh_on_fail
    exit "$fetch_rc"
  fi
fi

if ! python3 verify_signature.py; then
  cleanup_yh_on_fail
  exit $?
fi

# 验签通过后必须跑同步脚本：会向网站查询当前绑定（题库/固件），与本地 .binding_state.json 比对；
# 一致则只补缺文件，不一致则清理后重新下载解压，避免本地与后台绑定不一致仍直接启动。
echo "[信息] 验签通过，正在核对网站绑定并同步题库与固件..."
if ! python3 download_bound_artifacts.py; then
  cleanup_yh_on_fail
  echo "[信息] 同步未完成，启动后台持续重试（不阻塞前台）…"
  start_yh_background_sync || true
  exit 0
fi

# 仅同步资源、不启动 GUI/主程序时设置 YH_SKIP_LAUNCH=1
if [[ "${YH_SKIP_LAUNCH:-0}" == "1" ]]; then
  echo "[信息] YH_SKIP_LAUNCH=1，不启动 YHTheStudio"
  exit 0
fi

exec bash launch_yh_studio.sh "$@"
