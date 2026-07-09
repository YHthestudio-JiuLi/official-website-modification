#!/usr/bin/env bash
# 设备验证启动入口：优先 yh-device，否则走 Python yh_main（含 TTS 播报）
#
# 退出码（供监控/CI 参考）：
#   0  正常结束（含设备未启用、未绑定固件/题库等可恢复场景）
#   1  拉签失败、验签失败、验证次数用尽
#   3+ 同步下载失败等
set -euo pipefail
case "${0}" in
  */*) cd "${0%/*}" ;;
  *) cd "." ;;
esac

: "${YH_RUN_DEMO:=1}"
export YH_RUN_DEMO
export YH_APP_ROOT="$(pwd)"

# 打包单文件优先
if [[ -x "./yh-device" ]]; then
  exec ./yh-device "$@"
fi
if [[ -x "./dist/yh-device" ]]; then
  exec ./dist/yh-device "$@"
fi

resolve_yh_python() {
  if [[ -n "${YH_PYTHON:-}" ]] && [[ -x "${YH_PYTHON}" ]]; then
    echo "${YH_PYTHON}"
    return 0
  fi
  local py=""
  for py in "../.venv/bin/python3" "python3"; do
    if [[ "$py" == "python3" ]] || [[ -x "$py" ]]; then
      if "$py" -c "import cryptography" 2>/dev/null; then
        echo "$py"
        return 0
      fi
    fi
  done
  echo "[错误] 未找到已安装 cryptography 的 Python。" >&2
  echo "[提示] pip3 install -r requirements.txt" >&2
  return 1
}

YH_PY="$(resolve_yh_python)" || exit 1
export YH_PYTHON="$YH_PY"
exec "$YH_PY" yh_main.py "$@"
