#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2"
PY_BIN="$APP_DIR/.venv/bin/python3"

echo "[1/8] 进入目录"
cd "$APP_DIR"

echo "[2/8] 检查并安装 Python 运行环境"
if ! command -v python3 >/dev/null 2>&1 || ! command -v pip3 >/dev/null 2>&1; then
  if command -v dnf >/dev/null 2>&1; then
    dnf -y install python3 python3-pip python3-devel
  elif command -v yum >/dev/null 2>&1; then
    yum -y install python3 python3-pip python3-devel
  else
    echo "未找到 dnf/yum，无法自动安装 python3，请先手动安装后重试。"
    exit 1
  fi
fi

echo "[3/8] 安装 Node 依赖"
npm install --registry=https://registry.npmjs.org/

echo "[4/8] 构建前端"
npm run build

echo "[5/8] 准备 Python 虚拟环境"
if [ ! -x "$PY_BIN" ]; then
  python3 -m venv .venv
fi

echo "[6/8] 安装 Python 依赖"
# 使用 python -m pip，避免部分系统 venv 内无 pip 可执行文件
"$PY_BIN" -m ensurepip --upgrade 2>/dev/null || true
"$PY_BIN" -m pip install -U pip
"$PY_BIN" -m pip install -r py_backend/requirements.txt

echo "[7/8] 启动/重载 PM2"
# 固定按 ecosystem 统一拉起，确保 yh-py 始终使用 uvicorn 启动
# 清理异常残留的 yh-py 进程记录，避免 pm2 读取坏状态时报错
pm2 delete yh-py >/dev/null 2>&1 || true
pm2 start ecosystem.config.js --env production
pm2 save

echo "[8/8] 检查并重载 Nginx"
nginx -t
nginx -s reload

echo "✅ Deploy done"
echo "=== 验证输出 ==="
curl -s http://127.0.0.1:3000/ | grep -Eo 'assets/(index|i18n)-[^"]+\.js' || true
curl -s https://yhthestudio.com/ | grep -Eo 'assets/(index|i18n)-[^"]+\.js' || true
