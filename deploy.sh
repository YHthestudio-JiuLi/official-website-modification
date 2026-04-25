#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2"
PY_BIN="$APP_DIR/.venv/bin/python3.10"

echo "[1/8] 进入目录"
cd "$APP_DIR"

# echo "[2/8] 拉取最新代码"
# git pull --rebase || git pull

echo "[3/8] 安装 Node 依赖"
npm install --registry=https://registry.npmjs.org/

echo "[4/8] 构建前端"
npm run build

echo "[5/8] 准备 Python 虚拟环境"
if [ ! -x "$PY_BIN" ]; then
  python3.10 -m venv .venv
fi

echo "[6/8] 安装 Python 依赖"
source .venv/bin/activate
pip install -U pip
pip install -r py_backend/requirements.txt
deactivate

echo "[7/8] 启动/重载 PM2"
if pm2 describe yh-api >/dev/null 2>&1; then
  pm2 reload ecosystem.config.js --env production
else
  pm2 start ecosystem.config.js --env production
fi
pm2 save

echo "[8/8] 检查并重载 Nginx"
nginx -t
nginx -s reload

echo "✅ Deploy done"
echo "=== 验证输出 ==="
curl -s http://127.0.0.1:3000/ | grep -Eo 'assets/(index|i18n)-[^"]+\.js' || true
curl -s https://yhthestudio.com/ | grep -Eo 'assets/(index|i18n)-[^"]+\.js' || true
