#!/usr/bin/env bash
# 在 jetson_nano 目录下启动 YHTheStudio（默认 YH/dist/YHTheStudio/YHTheStudio）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "${ROOT}"

# 应用根目录（内含 _internal、models、data 等），可为相对于 jetson_nano 的路径
STUDIO_REL="${YH_STUDIO_DIR:-YH/dist/YHTheStudio}"
# 可显式指定可执行文件名（相对于应用目录）或绝对路径
STUDIO_EXE="${YH_STUDIO_EXE:-}"

if [[ ! -d "${ROOT}/${STUDIO_REL}" ]]; then
  echo "[错误] 应用目录不存在: ${ROOT}/${STUDIO_REL}（请先完成下载与解压）" >&2
  exit 1
fi

# 规范为绝对路径，避免先 cd 进子目录后相对路径被错误拼接
STUDIO_ABS="$(cd "${ROOT}/${STUDIO_REL}" && pwd)"

if [[ -n "${STUDIO_EXE}" ]]; then
  if [[ "${STUDIO_EXE}" = /* ]]; then
    EXE_ABS="${STUDIO_EXE}"
  else
    EXE_ABS="${ROOT}/${STUDIO_EXE}"
  fi
  if [[ ! -f "${EXE_ABS}" ]]; then
    echo "[错误] 指定的可执行文件不存在: ${EXE_ABS}" >&2
    exit 1
  fi
  EXE_DIR="$(cd "$(dirname "${EXE_ABS}")" && pwd)"
  EXE_NAME="$(basename "${EXE_ABS}")"
  echo "[信息] 工作目录: ${EXE_DIR}"
  echo "[信息] 启动: ${EXE_DIR}/${EXE_NAME}"
  cd "${EXE_DIR}"
  exec "./${EXE_NAME}" "$@"
fi

# 默认：在应用目录内启动 ./YHTheStudio（必须先 cd，再 exec 相对路径，禁止携带 STUDIO_REL 前缀）
if [[ ! -f "${STUDIO_ABS}/YHTheStudio" ]]; then
  echo "[错误] 未找到 ${STUDIO_ABS}/YHTheStudio，请设置 YH_STUDIO_EXE" >&2
  exit 1
fi

echo "[信息] 工作目录: ${STUDIO_ABS}"
echo "[信息] 启动: ${STUDIO_ABS}/YHTheStudio"
cd "${STUDIO_ABS}"
exec ./YHTheStudio "$@"
