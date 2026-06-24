#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHP="$("$ROOT/scripts/resolve-php.sh")"
cd "$ROOT/laravel-api"

# 与 laravel-api/scripts/start-server.sh 一致：每次拉起 Laravel 时轮换 boot id，旧后台 session 失效
BOOT_ID="$(date +%s%N)"
mkdir -p storage/framework
echo "$BOOT_ID" > storage/framework/admin_boot_id
export ADMIN_BOOT_ID="$BOOT_ID"

exec "$PHP" artisan serve --host=127.0.0.1 --port=8000
