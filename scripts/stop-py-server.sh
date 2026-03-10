#!/bin/bash

# 关闭 Python 服务脚本
# Python 服务运行在端口 5100，使用 uvicorn

echo "正在查找运行中的 Python 服务..."

# 查找占用端口 5100 的进程
PID=$(lsof -ti:5100)

if [ -z "$PID" ]; then
    echo "未找到运行中的 Python 服务（端口 5100）"
    exit 0
fi

echo "找到 Python 服务进程 ID: $PID"

# 显示进程信息
ps -p $PID -o pid,command 2>/dev/null

# 优雅地终止进程
echo "正在停止 Python 服务..."
kill $PID

# 等待进程结束
sleep 2

# 检查进程是否仍然存在
if ps -p $PID > /dev/null 2>&1; then
    echo "进程未响应，强制终止..."
    kill -9 $PID
fi

# 再次检查
if ! ps -p $PID > /dev/null 2>&1; then
    echo "Python 服务已成功停止"
else
    echo "无法停止 Python 服务，请手动检查"
    exit 1
fi
