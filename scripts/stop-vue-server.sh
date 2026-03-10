#!/bin/bash

# 关闭 Vue 服务脚本
# Vue 服务（api-server.js）通常运行在端口 3000 或 8080

echo "正在查找运行中的 Vue 服务..."

# 尝试查找占用常见端口的进程（3000, 8080, 5173）
PORTS="3000 8080 5173"
FOUND=false

for PORT in $PORTS; do
    PID=$(lsof -ti:$PORT)
    if [ -n "$PID" ]; then
        echo "找到运行中的服务（端口 $PORT）进程 ID: $PID"
        # 显示进程信息
        ps -p $PID -o pid,command 2>/dev/null
        
        # 检查是否是 node 进程运行的 api-server
        if ps -p $PID -o command | grep -q "node"; then
            echo "检测到 Node.js 服务，正在停止..."
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
                echo "Vue 服务（端口 $PORT）已成功停止"
                FOUND=true
            else
                echo "无法停止 Vue 服务（端口 $PORT），请手动检查"
            fi
        fi
    fi
done

# 如果没有找到任何服务
if [ "$FOUND" = false ]; then
    # 尝试查找 node api-server.js 进程
    NODE_PID=$(ps aux | grep "node.*api-server" | grep -v grep | awk '{print $2}')
    if [ -n "$NODE_PID" ]; then
        echo "找到 api-server.js 进程 ID: $NODE_PID"
        echo "正在停止 Vue 服务..."
        kill $NODE_PID
        
        sleep 2
        
        if ps -p $NODE_PID > /dev/null 2>&1; then
            echo "进程未响应，强制终止..."
            kill -9 $NODE_PID
        fi
        
        if ! ps -p $NODE_PID > /dev/null 2>&1; then
            echo "Vue 服务已成功停止"
            FOUND=true
        fi
    fi
fi

if [ "$FOUND" = false ]; then
    echo "未找到运行中的 Vue 服务"
fi
