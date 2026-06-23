#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHP="$("$ROOT/scripts/resolve-php.sh")"
cd "$ROOT/laravel-api"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "已创建 laravel-api/.env，请编辑数据库后重新运行 npm run laravel:setup"
  exit 0
fi

"$PHP" "$(command -v composer)" install --no-interaction
"$PHP" artisan key:generate --force
"$PHP" artisan migrate --force
"$PHP" artisan db:seed --class=RolePermissionSeeder --force

echo "Laravel 就绪。启动: npm run laravel"
