# YHthestudio - Vue 3 E-commerce & Forum Platform

## 项目简介
YHthestudio 是一个现代化的双语（中文/英文）电子商务网站，包含论坛功能。采用 Vue 3 + Vite 前端架构和 Node.js/Express + Python/FastAPI 双后端架构。

## 技术栈

### 前端
- **框架**: Vue 3 + Vite
- **状态管理**: Pinia
- **路由**: Vue Router
- **国际化**: Vue I18n
- **HTTP 客户端**: Axios
- **UI**: 自定义组件 + CSS Variables
- **图标**: Font Awesome 6

### 后端
- **API Server**: Node.js/Express (端口 3000)
- **数据库服务**: Python/FastAPI (端口 5100)
- **数据库**: SQLite

## 目录结构

```
official-website-modification/
├── src/                   # Vue 3 前端源码
│   ├── components/        # 可复用组件（用户端/管理端）
│   ├── views/             # 页面组件（user/admin）
│   ├── stores/            # Pinia 状态管理
│   ├── router/            # Vue Router 配置
│   ├── i18n/              # 国际化文件
│   ├── services/          # API 请求封装
│   ├── utils/             # 前端工具函数
│   └── style.css          # 全局样式
├── py_backend/            # Python FastAPI 后端
│   ├── main.py            # FastAPI 应用入口
│   └── modules/           # 数据管理模块（订单/论坛/聊天等）
├── data/                  # SQLite 数据文件目录
├── uploads/               # 上传资源（如商品图片）
├── scripts/               # 辅助脚本
├── plans/                 # 规划文档
├── logs/                  # 运行日志
├── jetson_nano/           # 设备验签相关脚本与依赖
├── dist/                  # 前端构建产物（生产环境）
├── api-server.js          # Node.js API 服务器
├── database.js            # RPC 客户端（连接 Python 后端）
├── telegram.js            # Telegram 推送与回调处理
├── telegram-fetcher.js    # Telegram 抓取脚本
├── translate.js           # 中文转英文翻译工具
├── index.html             # HTML 入口
├── vite.config.js         # Vite 配置
├── package.json           # 项目依赖与脚本
└── README.md              # 项目说明文档
```

## 开发命令

```bash
# 安装依赖
npm install

# 方式一：开发模式 (推荐)
# 终端 1: 启动 Python 数据库后端
npm run py

# 终端 2: 启动 Vue 前端服务(Vite)
npm run dev

```

## 访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| Vite 开发服务器 | http://localhost:5173 | 前端开发环境 (热重载) |
| API 服务器 | http://localhost:3000 | 后端 API + 静态文件 |
| Python 后端 | http://localhost:5100 | 数据库服务 |

## 生产部署

1. 构建前端:
```bash
npm run build
```

2. 构建产物位于 `dist/`

3. 使用 PM2 运行 API 服务:
```bash
pm2 start api-server.js --name yhthestudio-api
```

4. 配置 Nginx:
- 静态文件指向 `dist/`
- `/api` 代理到 Node.js 服务器 (端口 3000)

## 默认账户

管理员账户（首次初始化自动创建）:
- 用户名：`admin`
- 密码：`admin123`

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| PORT | Node.js 服务器端口 | 3000 |
| HOST | Node.js 服务器主机 | 0.0.0.0 |
| PY_DB_URL | Python 后端地址 | http://127.0.0.1:5100 |
| YH_DB_PATH | SQLite 数据库路径 | data/yhthestudio.db |

## 功能特性

- ✅ 用户注册/登录/个人中心
- ✅ 产品展示与详情
- ✅ 购物车与订单管理
- ✅ 在线支付 (USDT)
- ✅ 技术论坛 (支持嵌套回复)
- ✅ 双语支持 (中文/英文)
- ✅ 完整的管理后台
- ✅ 响应式设计
- ✅ 侧边栏可收缩导航
- ✅ 表格横向滚动支持
- ✅ 论坛帖子折叠/展开

## 更新日期
2026 年 4 月
