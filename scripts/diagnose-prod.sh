#!/usr/bin/env bash
# 生产环境 API 慢/502 快速诊断
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

info()  { echo -e "\033[1;34m[INFO]\033[0m $*"; }
ok()    { echo -e "\033[1;32m[ OK ]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m $*"; }
fail()  { echo -e "\033[1;31m[FAIL]\033[0m $*"; }

DOMAIN="$(cat "$ROOT/.laravel-fpm-domain" 2>/dev/null || echo yhthestudio.com)"
LARAVEL_ENV="$ROOT/laravel-api/.env"
GIT_SAFE=(git -c "safe.directory=$ROOT")

echo ""
info "=== YHthestudio 生产诊断 ==="
info "项目: $ROOT"
info "域名: $DOMAIN"

if [ -d "$ROOT/.git" ]; then
  info "Git: $("${GIT_SAFE[@]}" log -1 --oneline 2>/dev/null || echo '无法读取')"
fi
echo ""

# PM2
if command -v pm2 >/dev/null 2>&1; then
  info "PM2 进程:"
  pm2 list || true
  echo ""
fi

# Redis
uses_redis=false
if [ -f "$LARAVEL_ENV" ] && grep -qE '^(SESSION_DRIVER|CACHE_STORE)=redis' "$LARAVEL_ENV"; then
  uses_redis=true
  info "laravel-api/.env 使用 Redis 会话/缓存"
  if command -v redis-cli >/dev/null 2>&1; then
    if redis-cli ping >/dev/null 2>&1; then
      ok "redis-cli ping → PONG"
    else
      fail "Redis 无响应！会导致 /api/v2 每次请求卡顿 10~20 秒"
    fi
  else
    warn "未找到 redis-cli"
  fi
else
  info "laravel-api/.env 未使用 Redis"
fi
echo ""

if [ -f "$LARAVEL_ENV" ]; then
  DB_HOST="$(grep -E '^DB_HOST=' "$LARAVEL_ENV" | head -1 | cut -d= -f2- | tr -d "\"'")"
  info "MySQL host: ${DB_HOST:-127.0.0.1}"
fi

# 接口耗时（不用 curl -f，避免 401/403 导致 set -e 中断）
time_url() {
  local label="$1"
  local url="$2"
  local extra_args=("${@:3}")
  local raw code time_total

  raw="$(curl -sS -o /dev/null -w '%{http_code} %{time_total}' "${extra_args[@]}" "$url" 2>/dev/null || echo '000 99')"
  code="${raw%% *}"
  time_total="${raw#* }"

  if [ "$code" = "200" ] || [ "$code" = "204" ] || [ "$code" = "401" ]; then
    if awk -v t="$time_total" 'BEGIN { exit (t + 0 > 2.0) ? 0 : 1 }'; then
      warn "$label → HTTP $code, ${time_total}s（偏慢）"
    else
      ok "$label → HTTP $code, ${time_total}s"
    fi
  else
    fail "$label → HTTP $code, ${time_total}s  url=$url"
  fi
}

info "本机接口耗时:"
time_url "Node csrf" "http://127.0.0.1:3000/api/csrf-token"
time_url "Python health" "http://127.0.0.1:5100/health"

if [ -f "$ROOT/.laravel-fpm-enabled" ]; then
  # 本机 HTTPS 需 -k + Host，与 setup-laravel-fpm.sh 一致
  time_url "Laravel health" "https://127.0.0.1/api/v2/health" -k -H "Host: ${DOMAIN}"
  time_url "Laravel products" "https://127.0.0.1/api/v2/products" -k -H "Host: ${DOMAIN}"
  time_url "Laravel storefront" "https://127.0.0.1/api/v2/catalog/storefront" -k -H "Host: ${DOMAIN}"
  time_url "Laravel categories" "https://127.0.0.1/api/v2/product-categories" -k -H "Host: ${DOMAIN}"
  # 商品图：第二次应明显快于第一次（磁盘/Nginx 缓存）
  IMG_ID="$(ls "$ROOT/laravel-api/storage/app/product-image-cache"/*.jpg 2>/dev/null | head -1 | xargs -n1 basename 2>/dev/null | cut -d. -f1 || echo 1)"
  time_url "商品图(首次路径)" "https://127.0.0.1/api/v2/product-images/${IMG_ID}" -k -H "Host: ${DOMAIN}"
  time_url "商品图(重复)" "https://127.0.0.1/api/v2/product-images/${IMG_ID}" -k -H "Host: ${DOMAIN}"
  time_url "商品图(legacy→v2)" "https://127.0.0.1/api/product-images/${IMG_ID}" -k -H "Host: ${DOMAIN}"
else
  time_url "Laravel health" "http://127.0.0.1:8000/api/v2/health"
  time_url "Laravel products" "http://127.0.0.1:8000/api/v2/products"
fi

echo ""
IMG_CACHE_DIR="$ROOT/laravel-api/storage/app/product-image-cache"
if [ -d "$IMG_CACHE_DIR" ]; then
  img_n="$(find "$IMG_CACHE_DIR" -maxdepth 1 -type f \( -name '*.jpg' -o -name '*.png' -o -name '*.webp' \) 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${img_n:-0}" -gt 0 ]; then
    ok "磁盘商品图缓存 ${img_n} 张（$IMG_CACHE_DIR）"
  else
    warn "磁盘商品图缓存为空，请执行: cd laravel-api && php artisan catalog:warm --images"
  fi
else
  warn "缺少 product-image-cache 目录，请重新运行 setup-laravel-fpm.sh"
fi

if [ -f /www/server/nginx/conf/yh-v2-fcgi-cache.conf ]; then
  ok "Nginx fastcgi_cache zone 已安装"
  if command -v curl >/dev/null 2>&1; then
    fcgi1="$(curl -sSI -H "Host: ${DOMAIN}" "https://127.0.0.1/api/v2/catalog/storefront" -k 2>/dev/null | tr -d '\r' | awk -F': ' 'tolower($1)=="x-cache-status"{print $2; exit}')"
    fcgi2="$(curl -sSI -H "Host: ${DOMAIN}" "https://127.0.0.1/api/v2/catalog/storefront" -k 2>/dev/null | tr -d '\r' | awk -F': ' 'tolower($1)=="x-cache-status"{print $2; exit}')"
    if [ "$fcgi2" = "HIT" ]; then
      ok "storefront fastcgi 缓存 HIT（第 2 次请求）"
    elif [ "$fcgi1" = "MISS" ] && [ -n "$fcgi2" ]; then
      warn "storefront 第 2 次仍为 ${fcgi2:-未知}，检查 extension 是否含 fastcgi_cache_key"
    fi
  fi
else
  warn "未检测到 yh-v2-fcgi-cache.conf，请 sudo bash scripts/setup-laravel-fpm.sh"
fi

if [ -d "$ROOT/.git" ]; then
  if ! "${GIT_SAFE[@]}" merge-base --is-ancestor 6706812 HEAD 2>/dev/null; then
    warn "尚未包含性能优化 6706812，请 git pull github refs/heads/V2.1.1"
  fi
fi

echo ""
if [ -d "$ROOT/.git" ]; then
  if ! "${GIT_SAFE[@]}" merge-base --is-ancestor e6a167f HEAD 2>/dev/null; then
    warn "尚未包含性能优化提交 e6a167f，请执行:"
    echo "  git -c safe.directory=$ROOT pull github vue_0.2.0"
    echo "  cd laravel-api && php artisan config:cache && php artisan route:cache"
  fi
fi

if [ "$uses_redis" = true ] && command -v redis-cli >/dev/null 2>&1 && ! redis-cli ping >/dev/null 2>&1; then
  fail "优先启动 Redis"
else
  info "若 products 仍 >2s，检查 Nginx 是否仍 proxy :8000（应走 PHP-FPM extension）"
fi
echo ""
