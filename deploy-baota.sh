#!/bin/bash

# YHthestudio Web 项目 - 宝塔面板快速部署脚本
# 适用于 CentOS 7 + 宝塔面板 v11

echo "=========================================="
echo "YHthestudio Web - 宝塔面板部署脚本"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否在项目目录
if [ ! -f "package.json" ]; then
    echo -e "${RED}错误: 未找到 package.json，请确保在项目根目录执行此脚本${NC}"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}警告: 未找到 Node.js${NC}"
    echo "请在宝塔面板中安装 Node.js 版本管理器"
    echo "路径: 软件商店 -> 运行环境 -> Node.js 版本管理器"
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js 版本: $(node -v)"
echo -e "${GREEN}✓${NC} npm 版本: $(npm -v)"

# 检查 PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}警告: 未找到 PM2${NC}"
    echo "请在宝塔面板中安装 PM2 管理器"
    echo "路径: 软件商店 -> 运行环境 -> PM2管理器"
    exit 1
fi

echo -e "${GREEN}✓${NC} PM2 已安装"

# 创建日志目录
if [ ! -d "logs" ]; then
    echo "正在创建日志目录..."
    mkdir -p logs
    echo -e "${GREEN}✓${NC} 日志目录创建完成"
fi

# 安装依赖
echo ""
echo "正在安装项目依赖..."
npm install --production

if [ $? -ne 0 ]; then
    echo -e "${RED}错误: 依赖安装失败${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} 依赖安装完成"

# 检查数据库目录
if [ ! -d "data" ]; then
    echo "正在创建数据库目录..."
    mkdir -p data
    echo -e "${GREEN}✓${NC} 数据库目录创建完成"
fi

# 初始化数据库
if [ -f "init-db.js" ]; then
    echo ""
    echo "正在初始化数据库..."
    node init-db.js
    
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}警告: 数据库初始化可能失败，请检查 init-db.js${NC}"
    else
        echo -e "${GREEN}✓${NC} 数据库初始化完成"
    fi
fi

# 设置文件权限
echo ""
echo "正在设置文件权限..."
chmod 755 data 2>/dev/null || true
chmod 644 data/*.db 2>/dev/null || true
chmod 755 logs 2>/dev/null || true

echo -e "${GREEN}✓${NC} 文件权限设置完成"

# 检查 PM2 中是否已有该应用
PM2_APP_EXISTS=$(pm2 list | grep -c "yhthestudio" || echo "0")

if [ "$PM2_APP_EXISTS" -gt "0" ]; then
    echo ""
    echo "检测到 PM2 中已有 yhthestudio 应用"
    read -p "是否重启现有应用? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "正在重启应用..."
        pm2 restart yhthestudio
        echo -e "${GREEN}✓${NC} 应用已重启"
    else
        echo "跳过重启，您可以稍后手动执行: pm2 restart yhthestudio"
    fi
else
    echo ""
    echo "正在启动应用..."
    # 优先使用 ecosystem.config.js
    if [ -f "ecosystem.config.js" ]; then
        pm2 start ecosystem.config.js
    else
        pm2 start server.js --name yhthestudio
    fi
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} 应用启动成功"
        # 保存 PM2 配置，以便开机自启
        pm2 save
        echo -e "${GREEN}✓${NC} PM2 配置已保存"
    else
        echo -e "${RED}错误: 应用启动失败${NC}"
        exit 1
    fi
fi

# 显示 PM2 状态
echo ""
echo "=========================================="
echo "部署完成！"
echo "=========================================="
echo ""
echo "PM2 应用状态:"
pm2 list | grep yhthestudio || echo "未找到应用"

echo ""
echo "下一步操作："
echo "1. 在宝塔面板中配置 Nginx 反向代理"
echo "   路径: 网站 -> 添加站点 -> 设置 -> 反向代理"
echo "   目标URL: http://127.0.0.1:3000"
echo ""
echo "2. 配置 SSL 证书（推荐）"
echo "   路径: 网站 -> 您的站点 -> 设置 -> SSL"
echo ""
echo "3. 访问后台并修改默认密码"
echo "   地址: http://your-domain.com/admin/login"
echo "   默认账号: admin / admin123"
echo ""
echo "常用命令："
echo "  pm2 logs yhthestudio    # 查看日志"
echo "  pm2 restart yhthestudio # 重启应用"
echo "  pm2 stop yhthestudio    # 停止应用"
echo "  pm2 list                # 查看所有应用"
echo ""
echo "详细部署指南请查看: README-DEPLOY.md"
echo ""

