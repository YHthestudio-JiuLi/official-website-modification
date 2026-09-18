#!/usr/bin/env bash
# 生产一键入口（转发到 scripts/deploy.sh）
#
# 用法（在服务器项目根目录）:
#   bash deploy.sh
#   bash deploy.sh --first-time
#   bash deploy.sh --pull
#
# 默认启用 PHP-FPM + Node 反代（与 DEPLOY.md 0.1 一致）。
# 其它参数原样传给 scripts/deploy.sh。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# 若调用方未显式传 --laravel-fpm / --no-pm2 等，默认补上生产推荐开关
HAS_FPM=false
for arg in "$@"; do
  case "$arg" in
    --laravel-fpm|--help|-h) HAS_FPM=true ;;
  esac
done

if [ "$HAS_FPM" = true ]; then
  exec bash "$ROOT/scripts/deploy.sh" "$@"
fi

exec bash "$ROOT/scripts/deploy.sh" --laravel-fpm "$@"
