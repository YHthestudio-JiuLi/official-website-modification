#!/usr/bin/env bash
# 将 Laravel 从 php -S :8000 切换为 Nginx + PHP-FPM（根治 API 卡顿）
#
# 用法:
#   sudo bash scripts/setup-laravel-fpm.sh
#   sudo bash scripts/setup-laravel-fpm.sh --domain yhthestudio.com
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${YH_DOMAIN:-yhthestudio.com}"
SKIP_NGINX_RELOAD=false

while [ $# -gt 0 ]; do
  case "$1" in
    --domain=*) DOMAIN="${1#*=}"; shift ;;
    --domain) DOMAIN="${2:?缺少域名}"; shift 2 ;;
    --skip-nginx-reload) SKIP_NGINX_RELOAD=true; shift ;;
    *) shift ;;
  esac
done

info()  { echo -e "\033[1;34m[INFO]\033[0m $*"; }
ok()    { echo -e "\033[1;32m[ OK ]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m $*"; }
fail()  { echo -e "\033[1;31m[FAIL]\033[0m $*" >&2; exit 1; }

PHP_BIN="$("$ROOT/scripts/resolve-php.sh")"
FPM_SOCK="$("$ROOT/scripts/resolve-php-fpm.sh")"
TEMPLATE="$ROOT/scripts/nginx/yh-laravel-fpm.conf.template"
EXT_DIR="/www/server/panel/vhost/nginx/extension/${DOMAIN}"
OUT_FILE="${EXT_DIR}/yh-laravel-fpm.conf"

if [ ! -f "$TEMPLATE" ]; then
  fail "缺少模板: $TEMPLATE"
fi

if [ ! -d "$EXT_DIR" ]; then
  warn "扩展目录不存在: $EXT_DIR，尝试创建..."
  mkdir -p "$EXT_DIR" || fail "无法创建 $EXT_DIR（请用 root 或检查宝塔域名）"
fi

info "APP_ROOT=$ROOT"
info "PHP-FPM socket=$FPM_SOCK"
info "写入 $OUT_FILE"

sed \
  -e "s|__APP_ROOT__|${ROOT}|g" \
  -e "s|__PHP_FPM_SOCK__|${FPM_SOCK}|g" \
  "$TEMPLATE" > "$OUT_FILE"

# FPM 以 www 运行，须可写 storage / bootstrap/cache
info "设置 laravel-api/storage 权限（www）..."
mkdir -p "$ROOT/laravel-api/storage/framework/sessions" \
  "$ROOT/laravel-api/storage/logs" \
  "$ROOT/laravel-api/bootstrap/cache"
if id www >/dev/null 2>&1; then
  chown -R www:www "$ROOT/laravel-api/storage" "$ROOT/laravel-api/bootstrap/cache"
  chmod -R ug+rwX "$ROOT/laravel-api/storage" "$ROOT/laravel-api/bootstrap/cache"
fi

info "Laravel optimize（config/route 缓存）..."
cd "$ROOT/laravel-api"
"$PHP_BIN" artisan optimize --force 2>/dev/null || {
  "$PHP_BIN" artisan config:cache
  "$PHP_BIN" artisan route:cache
}

touch "$ROOT/.laravel-fpm-enabled"
echo "$DOMAIN" > "$ROOT/.laravel-fpm-domain"

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe yh-laravel >/dev/null 2>&1; then
    info "停止 PM2 yh-laravel（已由 PHP-FPM 接管）..."
    pm2 delete yh-laravel || true
    pm2 save || true
  fi
fi

if [ "$SKIP_NGINX_RELOAD" = false ]; then
  if nginx -t 2>/dev/null; then
    nginx -s reload
    ok "Nginx 已重载"
  else
    warn "nginx -t 失败。请手动检查主配置是否仍含 proxy_pass :8000 的 /api/v2/ 与 /sanctum/（与 FPM 冲突）"
    nginx -t || true
  fi
fi

echo ""
ok "PHP-FPM 模式已启用"
echo ""
echo "  请务必在宝塔站点配置中删除或注释："
echo "    location /api/v2/ { proxy_pass http://127.0.0.1:8000; ... }"
echo "    location /sanctum/ { proxy_pass http://127.0.0.1:8000; ... }"
echo ""
echo "  验证（本机，替换域名）："
echo "    curl -s -o /dev/null -w 'time=%{time_total}s code=%{http_code}\n' \\"
echo "      -H 'Host: ${DOMAIN}' https://127.0.0.1/api/v2/health -k"
echo "    # 期望 time < 0.15s，code 200"
echo ""
