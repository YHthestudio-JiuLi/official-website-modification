#!/usr/bin/env bash
# 安装/刷新 Node 反代（客服会话桥接、chat、device、上传、WebSocket）
#
# 用法:
#   sudo bash scripts/setup-node-proxy.sh
#   sudo bash scripts/setup-node-proxy.sh --domain yhthestudio.com
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${YH_DOMAIN:-yhthestudio.com}"
SKIP_NGINX_RELOAD=false
ENSURE_DIST_ROOT=true

while [ $# -gt 0 ]; do
  case "$1" in
    --domain=*) DOMAIN="${1#*=}"; shift ;;
    --domain) DOMAIN="${2:?缺少域名}"; shift 2 ;;
    --skip-nginx-reload) SKIP_NGINX_RELOAD=true; shift ;;
    --no-dist-root) ENSURE_DIST_ROOT=false; shift ;;
    *) shift ;;
  esac
done

info()  { echo -e "\033[1;34m[INFO]\033[0m $*"; }
ok()    { echo -e "\033[1;32m[ OK ]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m $*"; }
fail()  { echo -e "\033[1;31m[FAIL]\033[0m $*" >&2; exit 1; }

TEMPLATE="$ROOT/scripts/nginx/yh-node-proxy.conf.template"
EXT_DIR="/www/server/panel/vhost/nginx/extension/${DOMAIN}"
OUT_FILE="${EXT_DIR}/yh-node-proxy.conf"
SITE_CONF="/www/server/panel/vhost/nginx/${DOMAIN}.conf"
REWRITE="/www/server/panel/vhost/rewrite/${DOMAIN}.conf"
DIST_ROOT="${ROOT}/dist"

[ -f "$TEMPLATE" ] || fail "缺少模板: $TEMPLATE"

if [ ! -d "$EXT_DIR" ]; then
  warn "扩展目录不存在: $EXT_DIR，尝试创建..."
  mkdir -p "$EXT_DIR" || fail "无法创建 $EXT_DIR（请用 root 或检查宝塔域名）"
fi

info "写入 $OUT_FILE"
cp "$TEMPLATE" "$OUT_FILE"

# Vue SPA 伪静态
if [ -d "$(dirname "$REWRITE")" ]; then
  info "写入 SPA rewrite: $REWRITE"
  cat > "$REWRITE" <<'EOF'
# Vue Router history 模式
location / {
    try_files $uri $uri/ /index.html;
}
EOF
fi

# 站点 root 指向 dist（避免提供源码 index.html → /src/main.js 白屏）
if [ "$ENSURE_DIST_ROOT" = true ] && [ -f "$SITE_CONF" ]; then
  if grep -qE "root[[:space:]]+${ROOT};" "$SITE_CONF" 2>/dev/null; then
    info "将站点 root 从项目根改为 dist"
    sed -i "s|root ${ROOT};|root ${DIST_ROOT};|" "$SITE_CONF"
  elif ! grep -qE "root[[:space:]]+${DIST_ROOT};" "$SITE_CONF" 2>/dev/null; then
    warn "未自动改 root：请确认 $SITE_CONF 中 root 为 ${DIST_ROOT}"
  else
    ok "站点 root 已是 dist"
  fi
fi

if [ "$SKIP_NGINX_RELOAD" = false ]; then
  if nginx -t 2>/dev/null; then
    nginx -s reload
    ok "Nginx 已重载（Node 反代 + SPA）"
  else
    warn "nginx -t 失败，请手动检查配置"
    nginx -t || true
  fi
fi

ok "Node 反代已安装 → $OUT_FILE"
