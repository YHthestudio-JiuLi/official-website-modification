#!/usr/bin/env bash
# 生产环境 API 慢/502 快速诊断
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

info()  { echo -e "\033[1;34m[INFO]\033[0m $*"; }
ok()    { echo -e "\033[1;32m[ OK ]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m $*"; }
fail()  { echo -e "\033[1;31m[FAIL]\033[0m $*"; }

DOMAIN="$(cat "$ROOT/.laravel-fpm-domain" 2>/dev/null || echo yhthestudio.com)"
LARAVEL_ENV="$ROOT/laravel-api/.env"

echo ""
info "=== YHthestudio 生产诊断 ==="
info "项目: $ROOT"
info "域名: $DOMAIN"
echo ""

# PM2
if command -v pm2 >/dev/null 2>&1; then
  info "PM2 进程:"
  pm2 list || true
  echo ""
fi

# Redis（最常见慢因：配置了 redis 但服务未启动）
uses_redis=false
if [ -f "$LARAVEL_ENV" ] && grep -qE '^(SESSION_DRIVER|CACHE_STORE)=redis' "$LARAVEL_ENV"; then
  uses_redis=true
  info "laravel-api/.env 使用 Redis 会话/缓存"
  if command -v redis-cli >/dev/null 2>&1; then
    if redis-cli ping >/dev/null 2>&1; then
      ok "redis-cli ping → PONG"
    else
      fail "Redis 无响应！这会导致 /api/v2 每次请求卡顿 10~20 秒"
      echo "  修复: 宝塔 → 软件商店 → Redis → 启动"
      echo "  或编辑 laravel-api/.env:"
      echo "    SESSION_DRIVER=file"
      echo "    CACHE_STORE=file"
      echo "  然后: cd laravel-api && php artisan config:cache"
    fi
  else
    warn "未安装 redis-cli，无法检测 Redis"
  fi
else
  info "laravel-api/.env 未使用 Redis（SESSION/CACHE）"
fi
echo ""

# MySQL
if [ -f "$LARAVEL_ENV" ]; then
  DB_HOST="$(grep -E '^DB_HOST=' "$LARAVEL_ENV" | head -1 | cut -d= -f2- | tr -d "\"'")"
  info "MySQL host: ${DB_HOST:-127.0.0.1}"
fi

# 接口耗时（本机）
time_url() {
  local label="$1"
  local url="$2"
  local code time_total
  read -r code time_total < <(curl -sf -o /dev/null -w '%{http_code} %{time_total}' "$url" 2>/dev/null || echo "000 99")
  if [ "$code" = "200" ] || [ "$code" = "204" ] || [ "$code" = "401" ]; then
    if awk -v t="$time_total" 'BEGIN { exit !(t > 2.0) }'; then
      warn "$label → HTTP $code, ${time_total}s（偏慢）"
    else
      ok "$label → HTTP $code, ${time_total}s"
    fi
  else
    fail "$label → HTTP $code, ${time_total}s"
  fi
}

info "本机接口耗时:"
time_url "Node csrf" "http://127.0.0.1:3000/api/csrf-token"
time_url "Python health" "http://127.0.0.1:5100/health"

if [ -f "$ROOT/.laravel-fpm-enabled" ]; then
  time_url "Laravel health" "https://${DOMAIN}/api/v2/health"
  time_url "Laravel products" "https://${DOMAIN}/api/v2/products"
  time_url "Laravel categories" "https://${DOMAIN}/api/v2/product-categories"
else
  time_url "Laravel health" "http://127.0.0.1:8000/api/v2/health"
  time_url "Laravel products" "http://127.0.0.1:8000/api/v2/products"
fi

echo ""
if [ "$uses_redis" = true ] && command -v redis-cli >/dev/null 2>&1 && ! redis-cli ping >/dev/null 2>&1; then
  fail "优先处理 Redis，再执行: bash scripts/deploy.sh --pull"
else
  info "若 products 仍 >2s，请确认已启用 PHP-FPM: bash scripts/setup-laravel-fpm.sh"
  info "部署更新: bash scripts/deploy.sh --pull"
fi
echo ""
