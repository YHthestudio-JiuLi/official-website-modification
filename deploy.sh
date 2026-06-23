#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2"
PY_BIN="$APP_DIR/.venv/bin/python3"
LARAVEL_DIR="$APP_DIR/laravel-api"

echo "[1/10] 进入目录"
cd "$APP_DIR"

echo "[2/10] 检查 PHP（Laravel 需 >= 8.2）"
if ! command -v php >/dev/null 2>&1; then
  echo "未找到 php，请先安装 PHP 8.2+ 后重试。"
  exit 1
fi
PHP_VER=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')
echo "PHP 版本: $PHP_VER"

echo "[3/10] 安装 Node 依赖"
npm install --registry=https://registry.npmjs.org/

echo "[4/10] 构建前端"
npm run build

echo "[5/10] Laravel 依赖与迁移"
cd "$LARAVEL_DIR"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "已创建 laravel-api/.env，请确认 DB_* 与 SANCTUM_STATEFUL_DOMAINS 后重新部署。"
fi
if command -v composer >/dev/null 2>&1; then
  composer install --no-dev --optimize-autoloader
  php artisan key:generate --force 2>/dev/null || true
  php artisan migrate --force
  php artisan db:seed --class=RolePermissionSeeder --force
  php artisan config:cache
  php artisan route:cache
else
  echo "未找到 composer，跳过 Laravel 安装（请手动在服务器执行 laravel-api/setup.sh）"
fi
cd "$APP_DIR"

echo "[6/10] 准备 Python 虚拟环境"
if [ ! -x "$PY_BIN" ]; then
  python3 -m venv .venv
fi

echo "[7/10] 安装 Python 依赖"
"$PY_BIN" -m ensurepip --upgrade 2>/dev/null || true
"$PY_BIN" -m pip install -U pip
"$PY_BIN" -m pip install -r py_backend/requirements.txt

echo "[8/10] 启动/重载 PM2"
pm2 delete yh-py >/dev/null 2>&1 || true
pm2 start ecosystem.config.js --env production
pm2 save

echo "[9/10] 检查并重载 Nginx"
nginx -t
nginx -s reload

echo "[10/10] 健康检查"
curl -sf http://127.0.0.1:8000/api/v2/health && echo "" || echo "⚠️  Laravel :8000 未响应，请检查 yh-laravel 进程"
curl -sf http://127.0.0.1:3000/api/csrf-token >/dev/null && echo "Node API :3000 OK" || echo "⚠️  Node :3000 未响应"

echo "✅ Deploy done"
curl -s https://yhthestudio.com/ | grep -Eo 'assets/(index|i18n)-[^"]+\.js' || true
