#!/bin/bash

# YHthestudio Web 项目部署脚本
# 适用于宝塔面板

echo "=========================================="
echo "YHthestudio Web 项目部署脚本"
echo "=========================================="

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "错误: 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

echo "✓ Node.js 版本: $(node -v)"
echo "✓ npm 版本: $(npm -v)"

# 检查是否在项目目录
if [ ! -f "package.json" ]; then
    echo "错误: 未找到 package.json，请确保在项目根目录执行此脚本"
    exit 1
fi

# 安装依赖
echo ""
echo "正在安装项目依赖..."
npm install --production

if [ $? -ne 0 ]; then
    echo "错误: 依赖安装失败"
    exit 1
fi

echo "✓ 依赖安装完成"

# 检查数据库目录
if [ ! -d "data" ]; then
    echo "正在创建数据库目录..."
    mkdir -p data
    echo "✓ 数据库目录创建完成"
fi

# 初始化数据库
if [ -f "init-db.js" ]; then
    echo ""
    echo "正在初始化数据库..."
    node init-db.js
    
    if [ $? -ne 0 ]; then
        echo "警告: 数据库初始化可能失败，请检查 init-db.js"
    else
        echo "✓ 数据库初始化完成"
    fi
fi

# 设置文件权限
echo ""
echo "正在设置文件权限..."
chmod 755 data 2>/dev/null
chmod 644 data/*.db 2>/dev/null 2>/dev/null || true

echo "✓ 文件权限设置完成"

echo ""
echo "=========================================="
echo "部署完成！"
echo "=========================================="
echo ""
echo "下一步操作："
echo "1. 在宝塔 PM2管理器中添加项目"
echo "2. 配置 Nginx 反向代理到 http://127.0.0.1:3000"
echo "3. 配置 SSL 证书（推荐）"
echo ""
echo "详细部署指南请查看: README-DEPLOY.md"
echo ""
echo "提示: 如果使用宝塔面板，推荐使用 deploy-baota.sh 脚本"
echo ""



