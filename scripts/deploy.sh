#!/usr/bin/env bash
# YHthestudio 一键部署 / 更新脚本（宝塔 / Linux 生产环境）
#
# 用法:
#   bash scripts/deploy.sh              # 常规更新（安装依赖、构建、迁移、PM2 重启）
#   bash scripts/deploy.sh --first-time # 首次部署（含 .env 模板、key:generate、db:seed）
#   bash scripts/deploy.sh --pull       # 先 git pull 再部署
#
# 可选:
#   --skip-build      跳过 npm run build
#   --skip-migrate    跳过 artisan migrate
#   --skip-npm        跳过 npm install
#   --skip-python     跳过 Python 虚拟环境
#   --no-pm2          不启动/重启 PM2（仅构建与 Laravel 步骤）
#   --laravel-fpm     安装 Nginx+PHP-FPM 接管 Laravel（根治 API 卡顿，停用 yh-laravel）
#
# 详见 DEPLOY.md（Nginx / SSL 需单独配置）

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── 颜色输出 ──
info()  { echo -e "\033[1;34m[INFO]\033[0m $*"; }
ok()    { echo -e "\033[1;32m[ OK ]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m $*"; }
fail()  { echo -e "\033[1;31m[FAIL]\033[0m $*" >&2; exit 1; }

# ── 参数解析 ──
FIRST_TIME=false
DO_PULL=false
SKIP_BUILD=false
SKIP_MIGRATE=false
SKIP_NPM=false
SKIP_PYTHON=false
NO_PM2=false
LARAVEL_FPM=false

for arg in "$@"; do
  case "$arg" in
    --first-time)   FIRST_TIME=true ;;
    --pull)         DO_PULL=true ;;
    --skip-build)   SKIP_BUILD=true ;;
    --skip-migrate) SKIP_MIGRATE=true ;;
    --skip-npm)     SKIP_NPM=true ;;
    --skip-python)  SKIP_PYTHON=true ;;
    --no-pm2)       NO_PM2=true ;;
    --laravel-fpm)  LARAVEL_FPM=true ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *) fail "未知参数: $arg（使用 --help 查看）" ;;
  esac
done

export APP_ROOT="$ROOT"
export PHP_BIN="${PHP_BIN:-$("$ROOT/scripts/resolve-php.sh")}"

info "项目目录: $APP_ROOT"
info "PHP:      $PHP_BIN ($("$PHP_BIN" -r 'echo PHP_VERSION;'))"

# ── 依赖命令检查 ──
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "未找到命令: $1"
}

require_cmd node
require_cmd npm
require_cmd python3

if [ "$NO_PM2" = false ]; then
  require_cmd pm2 || fail "未安装 PM2，请: npm install -g pm2"
fi

# ── 环境变量文件 ──
ensure_env_file() {
  local file="$1"
  local example="$2"
  local label="$3"

  if [ -f "$file" ]; then
    return 0
  fi

  if [ "$FIRST_TIME" = true ] && [ -f "$example" ]; then
    cp "$example" "$file"
    warn "已创建 $label（从模板复制），请编辑后重新运行部署"
    NEED_ENV_EDIT=true
    return 0
  fi

  fail "缺少 $label，请先: cp $example $file 并编辑数据库等配置"
}

NEED_ENV_EDIT=false
ensure_env_file "$ROOT/.env" "$ROOT/.env.example" "根目录 .env"
ensure_env_file "$ROOT/laravel-api/.env" "$ROOT/laravel-api/.env.example" "laravel-api/.env"

if [ "${NEED_ENV_EDIT:-false}" = true ]; then
  fail "请先编辑 .env / laravel-api/.env 后重新运行（可加 --first-time）"
fi

# 校验 NODE_INTERNAL_SECRET 两边一致
check_secret_match() {
  local root_secret laravel_secret
  root_secret="$(grep -E '^NODE_INTERNAL_SECRET=' "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  laravel_secret="$(grep -E '^NODE_INTERNAL_SECRET=' "$ROOT/laravel-api/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"

  if [ -z "$root_secret" ] || [ -z "$laravel_secret" ]; then
    warn "NODE_INTERNAL_SECRET 未配置，Laravel ↔ Node 内部回调可能失败"
    return
  fi
  if [ "$root_secret" != "$laravel_secret" ]; then
    fail "NODE_INTERNAL_SECRET 不一致：根目录 .env 与 laravel-api/.env 必须相同"
  fi
  if [ "$root_secret" = "change-me-to-a-long-random-string" ]; then
    warn "NODE_INTERNAL_SECRET 仍为默认值，生产环境请更换为随机字符串"
  fi
}

check_session_domain() {
  local domain
  domain="$(grep -E '^SESSION_DOMAIN=' "$ROOT/laravel-api/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  if [ -z "$domain" ] || [ "$domain" = "null" ]; then
    return 0
  fi
  if echo "$domain" | grep -qE '^https?://'; then
    fail "laravel-api/.env 中 SESSION_DOMAIN 不能含 https://，应改为 .yhthestudio.com"
  fi
}

# 校验 Laravel 与 Python/Node 使用同一 MySQL 库
check_db_credential_match() {
  local mysql_user mysql_pass mysql_db
  local db_user db_pass db_name

  mysql_user="$(grep -E '^MYSQL_USER=' "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  mysql_pass="$(grep -E '^MYSQL_PASSWORD=' "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  mysql_db="$(grep -E '^MYSQL_DATABASE=' "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  db_user="$(grep -E '^DB_USERNAME=' "$ROOT/laravel-api/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  db_pass="$(grep -E '^DB_PASSWORD=' "$ROOT/laravel-api/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  db_name="$(grep -E '^DB_DATABASE=' "$ROOT/laravel-api/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"

  if [ -z "$mysql_user" ] || [ -z "$db_user" ]; then
    warn "MySQL 用户名未配置，请检查 .env 与 laravel-api/.env"
    return
  fi
  if [ "$mysql_user" != "$db_user" ] || [ "$mysql_pass" != "$db_pass" ] || [ "$mysql_db" != "$db_name" ]; then
    fail "MySQL 配置不一致：根目录 MYSQL_* 与 laravel-api/.env 的 DB_* 必须相同（用户/密码/库名）"
  fi
}

check_secret_match
check_session_domain
check_db_credential_match

# 生产构建前检查 VITE 开关
if [ "$SKIP_BUILD" = false ]; then
  if ! grep -qE '^VITE_USE_V2_API=true' "$ROOT/.env" 2>/dev/null; then
    warn "根目录 .env 中 VITE_USE_V2_API 未设为 true，前端可能仍请求旧 API"
  fi
fi

# ── Git 拉取 ──
if [ "$DO_PULL" = true ]; then
  require_cmd git
  info "git pull..."
  # root 部署时避免修改 global git config，用单次 safe.directory
  git -c "safe.directory=$ROOT" pull --ff-only
  ok "代码已更新"
fi

# ── Node 依赖与前端构建 ──
if [ "$SKIP_NPM" = false ]; then
  info "npm install..."
  npm install --registry=https://registry.npmjs.org/
  ok "Node 依赖安装完成"
fi

if [ "$SKIP_BUILD" = false ]; then
  info "npm run build（VITE_* 从此刻 .env 写入 dist）..."
  npm run build
  test -f dist/index.html || fail "dist/index.html 不存在，构建失败"
  ok "前端构建完成"
fi

# ── Python 虚拟环境 ──
setup_python() {
  local venv="$ROOT/.venv"
  local py="$venv/bin/python"

  # 检测是否为跨平台/损坏的 venv（常见于本机 venv 上传到 Linux）
  if [ -d "$venv" ] && [ ! -x "$py" ]; then
    warn "检测到无效 .venv，正在重建..."
    rm -rf "$venv"
  fi

  if [ ! -x "$py" ]; then
    info "创建 Python 虚拟环境..."
    python3 -m venv "$venv"
  fi

  info "安装 Python 依赖..."
  "$py" -m pip install -U pip -q
  "$py" -m pip install -r py_backend/requirements.txt -q
  ok "Python 环境就绪"
}

if [ "$SKIP_PYTHON" = false ]; then
  setup_python
fi

# ── Laravel ──
setup_laravel() {
  local laravel="$ROOT/laravel-api"
  cd "$laravel"

  # Composer
  local composer_cmd=""
  if [ -f "$laravel/composer.phar" ]; then
    composer_cmd="$PHP_BIN $laravel/composer.phar"
  elif command -v composer >/dev/null 2>&1; then
    composer_cmd="$PHP_BIN $(command -v composer)"
  else
    info "下载 composer.phar..."
    "$PHP_BIN" -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"
    "$PHP_BIN" composer-setup.php --quiet
    rm -f composer-setup.php
    composer_cmd="$PHP_BIN $laravel/composer.phar"
  fi

  info "composer install --no-dev..."
  $composer_cmd install --no-interaction --no-dev --optimize-autoloader

  if [ ! -f vendor/autoload.php ]; then
    fail "laravel-api/vendor 未生成，composer install 失败"
  fi

  if [ "$FIRST_TIME" = true ]; then
    info "php artisan key:generate..."
    "$PHP_BIN" artisan key:generate --force
  fi

  if [ "$SKIP_MIGRATE" = false ]; then
    info "php artisan migrate..."
    "$PHP_BIN" artisan migrate --force
    info "php artisan db:seed (RolePermissionSeeder)..."
    "$PHP_BIN" artisan db:seed --class=RolePermissionSeeder --force
    info "php artisan permission:cache..."
    "$PHP_BIN" artisan permission:cache
  fi

  if grep -qE '^(SESSION_DRIVER|CACHE_STORE)=redis' "$ROOT/laravel-api/.env" 2>/dev/null; then
    if command -v redis-cli >/dev/null 2>&1 && ! redis-cli ping >/dev/null 2>&1; then
      warn "laravel-api/.env 使用 Redis，但本机 redis-cli ping 失败，会话/缓存可能间歇超时变慢"
    fi
  fi

  info "php artisan optimize（config/route 缓存）..."
  if "$PHP_BIN" artisan optimize 2>/dev/null; then
    :
  else
    "$PHP_BIN" artisan config:cache
    "$PHP_BIN" artisan route:cache
  fi

  if id www >/dev/null 2>&1; then
    chown -R www:www storage bootstrap/cache 2>/dev/null || true
    chmod -R ug+rwX storage bootstrap/cache 2>/dev/null || true
  fi

  cd "$ROOT"
  ok "Laravel 就绪"
}

setup_laravel

if [ "$LARAVEL_FPM" = true ]; then
  info "启用 Laravel PHP-FPM 模式..."
  bash "$ROOT/scripts/setup-laravel-fpm.sh"
fi

# ── 运行时目录权限 ──
mkdir -p "$ROOT/logs" "$ROOT/uploads" "$ROOT/laravel-api/storage/framework/sessions"
mkdir -p "$ROOT/laravel-api/storage/logs" "$ROOT/laravel-api/bootstrap/cache"

# ── PM2 ──
pm2_deploy() {
  info "PM2 启动/重启 (APP_ROOT=$APP_ROOT, PHP_BIN=$PHP_BIN)..."
  export APP_ROOT PHP_BIN
  export LARAVEL_PM2="${LARAVEL_PM2:-0}"

  if [ "$LARAVEL_PM2" = "0" ] || [ -f "$ROOT/.laravel-fpm-enabled" ]; then
    export LARAVEL_PM2=0
    pm2 delete yh-laravel 2>/dev/null || true
    info "Laravel 由 PHP-FPM 运行，跳过 yh-laravel"
  fi

  if pm2 describe yh-api >/dev/null 2>&1; then
    pm2 restart ecosystem.config.js --env production
  else
    pm2 start ecosystem.config.js --env production
  fi

  pm2 save
  ok "PM2 进程已更新"
  pm2 list
}

if [ "$NO_PM2" = false ]; then
  pm2_deploy
fi

# ── 健康检查 ──
health_check() {
  local url="$1"
  local label="$2"
  local retries=15
  local i=1

  while [ "$i" -le "$retries" ]; do
    if curl -sf "$url" >/dev/null 2>&1; then
      ok "$label → $url"
      return 0
    fi
    sleep 2
    i=$((i + 1))
  done
  warn "$label 健康检查超时: $url（请 pm2 logs 排查）"
  return 1
}

if [ "$NO_PM2" = false ]; then
  info "等待服务就绪..."
  health_check "http://127.0.0.1:5100/health" "Python yh-py" || true

  LARAVEL_HEALTH_URL="http://127.0.0.1:8000/api/v2/health"
  if [ -f "$ROOT/.laravel-fpm-enabled" ]; then
    DOMAIN="$(cat "$ROOT/.laravel-fpm-domain" 2>/dev/null || echo yhthestudio.com)"
    LARAVEL_HEALTH_URL="https://${DOMAIN}/api/v2/health"
    info "Laravel 走 PHP-FPM，健康检查: $LARAVEL_HEALTH_URL"
  fi

  if health_check "$LARAVEL_HEALTH_URL" "Laravel API"; then
    if ! curl -sf "$LARAVEL_HEALTH_URL" | grep -q '"product_count"'; then
      warn "products 表可能缺失，请: pm2 restart yh-py && cd laravel-api && php artisan migrate --force"
    fi
    PRODUCTS_URL="${LARAVEL_HEALTH_URL%/health}/products"
    health_check "$PRODUCTS_URL" "Laravel products API" || true
  elif [ ! -f "$ROOT/.laravel-fpm-enabled" ]; then
    pm2 logs yh-laravel --lines 25 --nostream 2>/dev/null || true
  fi
  health_check "http://127.0.0.1:3000/api/csrf-token" "Node yh-api" || true
fi

echo ""
ok "部署流程完成"
echo ""
echo "  本机验证:"
if [ -f "$ROOT/.laravel-fpm-enabled" ]; then
  echo "    curl -s https://$(cat "$ROOT/.laravel-fpm-domain" 2>/dev/null || echo yhthestudio.com)/api/v2/health"
else
  echo "    curl -s http://127.0.0.1:8000/api/v2/health"
fi
echo "    curl -s http://127.0.0.1:3000/api/csrf-token"
echo "    curl -s http://127.0.0.1:5100/health"
echo ""
echo "  若 API 响应慢，请执行: bash scripts/setup-laravel-fpm.sh  （PHP-FPM 替代 php -S）"
echo "  若外网无法访问，请按 DEPLOY.md 配置 Nginx："
if [ -f "$ROOT/.laravel-fpm-enabled" ]; then
  echo "    /api/v2/ 、/sanctum/ → PHP-FPM 8.5（extension/yh-laravel-fpm.conf）"
else
  echo "    /api/v2/ 、/sanctum/ → :8000"
fi
echo "    /ws 、其余 /api/* 、静态页 → :3000"
echo ""

if [ "$FIRST_TIME" = true ] && [ "$NO_PM2" = false ]; then
  warn "首次部署请执行: pm2 startup  （按提示设置开机自启）"
fi
