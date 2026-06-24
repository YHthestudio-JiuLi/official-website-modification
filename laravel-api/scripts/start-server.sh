#!/usr/bin/env bash
# Laravel 内置服务器启动脚本：每次 PM2 拉起时轮换 admin boot id，使旧后台 session 失效
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_PHP="$ROOT/vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php"
PUBLIC="$ROOT/public"

PHP_BIN="${PHP_BIN:-php}"
HOST="${LARAVEL_HOST:-127.0.0.1}"
PORT="${LARAVEL_PORT:-8000}"

if [ ! -x "$PHP_BIN" ] && ! command -v "$PHP_BIN" >/dev/null 2>&1; then
  echo "[yh-laravel] PHP 不可执行: $PHP_BIN" >&2
  exit 1
fi

if [ ! -f "$PUBLIC/index.php" ] || [ ! -f "$SERVER_PHP" ]; then
  echo "[yh-laravel] 缺少 public/index.php 或 server.php，请执行 composer install" >&2
  exit 1
fi

BOOT_ID="$(date +%s%N 2>/dev/null || date +%s)"
mkdir -p "$ROOT/storage/framework" "$ROOT/storage/logs" "$ROOT/bootstrap/cache"
echo "$BOOT_ID" > "$ROOT/storage/framework/admin_boot_id"
export ADMIN_BOOT_ID="$BOOT_ID"

# server.php 以 getcwd() 为 public 根目录，必须在 public/ 下启动
# 分片上传每片 5MB，须提高 CLI 的 upload/post 限制（默认仅 2M/8M 会导致 chunk 失败）
cd "$PUBLIC"
echo "[yh-laravel] 启动 ${HOST}:${PORT} (PHP=$($PHP_BIN -r 'echo PHP_VERSION;'), docroot=$PUBLIC)" >&2
exec "$PHP_BIN" \
  -d upload_max_filesize=64M \
  -d post_max_size=70M \
  -d max_execution_time=7200 \
  -d max_input_time=7200 \
  -S "${HOST}:${PORT}" "$SERVER_PHP"
