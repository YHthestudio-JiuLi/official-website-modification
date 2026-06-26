#!/usr/bin/env bash
# 生产机 git 拉取（绕过 safe.directory / node_modules 脏文件）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GIT=(git -c "safe.directory=$ROOT")
BRANCH="${1:-vue_0.2.0}"
REMOTE="${2:-github}"

if ! command -v git >/dev/null 2>&1; then
  echo "[FAIL] 未安装 git" >&2
  exit 1
fi

if "${GIT[@]}" status --porcelain -- node_modules/.package-lock.json 2>/dev/null | grep -q .; then
  echo "[WARN] 还原 node_modules/.package-lock.json"
  "${GIT[@]}" checkout -- node_modules/.package-lock.json 2>/dev/null || rm -f node_modules/.package-lock.json
fi

echo "[INFO] 当前: $("${GIT[@]}" log -1 --oneline)"
echo "[INFO] fetch ${REMOTE}/${BRANCH} ..."
"${GIT[@]}" fetch "$REMOTE" "$BRANCH"
"${GIT[@]}" merge --ff-only "${REMOTE}/${BRANCH}"
echo "[ OK ] 已更新: $("${GIT[@]}" log -1 --oneline)"
