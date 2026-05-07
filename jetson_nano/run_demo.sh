#!/usr/bin/env bash
# 按时间窗口执行：满足条件才重新拉取签名，否则直接执行下一步
set -euo pipefail
# 不用 $(dirname …) 子进程，在系统 fork 用尽时首行即可能失败；用参数展开即可
case "${0}" in
  */*) cd "${0%/*}" ;;
  *) cd "." ;;
esac
# 默认抑制拉签/验签/同步完成等冗长输出；设为 0 可恢复详细日志。子进程（含 nohup 后台）会继承。
: "${YH_RUN_DEMO:=1}"
export YH_RUN_DEMO

# 冷却阈值（小时），可通过环境变量覆盖，例如：VERIFY_INTERVAL_HOURS=12 ./run_demo.sh
VERIFY_INTERVAL_HOURS="${VERIFY_INTERVAL_HOURS:-0.01}"
LAST_FILE="last_verify.json"

cleanup_yh_on_fail() {
  if [[ -d "YH" ]]; then
    echo "[警告] 检测到失败，删除本地 YH 目录及全部内容"
    rm -rf "YH"
  fi
}

# 是否启用「未授权/下载失败时后台轮询请求官网 API」；默认关闭（不自动联网轮询）。
YH_DAEMON="${YH_DAEMON:-0}"

# 可选：启动低频率后台同步（仅当 YH_DAEMON=1）
start_yh_background_sync() {
  if [[ "${YH_DAEMON}" != "1" ]]; then
    echo "[信息] 未启用后台轮询（YH_DAEMON 非 1），本机不会自动反复请求官网 API"
    return 1
  fi
  if [[ -f yh_background_sync.pid ]]; then
    local old=""
    read -r old < yh_background_sync.pid 2>/dev/null || true
    if [[ -n "${old}" ]] && kill -0 "${old}" 2>/dev/null; then
      # 已有实例在跑则静默返回，避免重复刷屏
      return 0
    fi
  fi
  nohup python3 yh_background_sync.py >> yh_background_sync.log 2>&1 &
  if [[ "${YH_RUN_DEMO:-}" != "1" ]]; then
    echo "[信息] 已启动后台同步（pid 见 yh_background_sync.pid），日志: ${PWD}/yh_background_sync.log"
    echo "[信息] 请在网页后台为该设备「授权」并绑定题库/固件；授权后本机将自动创建 YH 并解压同步"
  fi
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
    echo "[播报] 设备未授权，请联系平台管理员"
    start_yh_background_sync || true
    if [[ "${YH_DAEMON}" != "1" ]]; then
      echo "[信息] 管理员授权后请在本机再次执行 ./run_demo.sh（无人值守可: YH_DAEMON=1 ./run_demo.sh）"
    fi
    exit 0
  fi
  # 验证次数用尽：fetch_signature 已删除本地 YH 并打印提示
  if [[ "$fetch_rc" == "3" ]]; then
    exit 1
  fi
  if [[ "$fetch_rc" != "0" ]]; then
    exit "$fetch_rc"
  fi
fi

if ! python3 verify_signature.py; then
  exit $?
fi

echo "[播报] 设备验证通过，正在自动构建系统。请稍候！！！"

# 验签通过后跑同步脚本（输出受 YH_RUN_DEMO 控制）
python3 download_bound_artifacts.py
sync_rc=$?
# 退出码 4：网站未同时绑定固件与完整题库，已打印播报；不删 YH、不启动主程序
if [[ "$sync_rc" -eq 4 ]]; then
  exit 0
fi
if [[ "$sync_rc" -ne 0 ]]; then
  cleanup_yh_on_fail
  echo "[信息] 同步未完成。"
  start_yh_background_sync || true
  if [[ "${YH_DAEMON}" != "1" ]]; then
    echo "[信息] 网络或资源就绪后请再次执行 ./run_demo.sh（无人值守可: YH_DAEMON=1 ./run_demo.sh）"
  fi
  exit 0
fi

# 仅同步资源、不启动 GUI/主程序时设置 YH_SKIP_LAUNCH=1
if [[ "${YH_SKIP_LAUNCH:-0}" == "1" ]]; then
  echo "[信息] YH_SKIP_LAUNCH=1，不启动 YHTheStudio"
  exit 0
fi

echo "[播报] 系统构建完成，正在启动程序。请稍后！！！"
exec bash launch_yh_studio.sh "$@"
