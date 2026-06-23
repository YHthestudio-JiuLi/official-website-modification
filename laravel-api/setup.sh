#!/usr/bin/env bash
# Laravel API 首次部署（服务器需 PHP >= 8.2）
set -euo pipefail
cd "$(dirname "$0")"

if ! php -r 'exit(version_compare(PHP_VERSION, "8.2.0", ">=") ? 0 : 1);'; then
  echo "需要 PHP >= 8.2，当前: $(php -v | head -1)"
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "已创建 .env，请编辑数据库与 Redis 后重新运行"
  exit 0
fi

composer install --no-dev --optimize-autoloader --no-interaction
php artisan key:generate --force
php artisan migrate --force
php artisan db:seed --class=RolePermissionSeeder --force
php artisan config:cache
php artisan route:cache

echo "Laravel API 就绪。启动: php artisan serve --host=127.0.0.1 --port=8000"
