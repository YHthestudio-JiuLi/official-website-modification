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
├── client/                 # Vue 3 前端源码
│   ├── src/
│   │   ├── components/    # 可复用组件
│   │   │   ├── common/    # 通用组件
│   │   │   ├── user/      # 用户端组件
│   │   │   └── admin/     # 管理端组件
│   │   ├── views/         # 页面组件
│   │   │   ├── user/      # 用户前端页面
│   │   │   └── admin/     # 管理后台页面
│   │   ├── stores/        # Pinia 状态管理
│   │   ├── router/        # Vue Router 配置
│   │   ├── i18n/          # 国际化文件
│   │   ├── services/      # API 服务
│   │   └── styles/        # 全局样式
│   ├── index.html
│   └── package.json
├── py_backend/            # Python FastAPI 后端
│   ├── main.py           # FastAPI 应用入口
│   └── db.sqlite         # SQLite 数据库
├── data/                  # 数据文件目录
├── api-server.js          # Node.js API 服务器
├── database.js            # RPC 客户端 (连接 Python 后端)
├── translate.js           # 中文转英文翻译工具
└── package.json           # 项目依赖配置
```

## 开发命令

```bash
# 安装依赖
npm install
cd client && npm install

# 启动 Python 数据库后端 (必须先启动)
npm run py

# 启动 API 服务器 (新终端)
npm start

# 启动 Vue 前端开发服务器 (新终端)
npm run client:dev

# 构建 Vue 前端
npm run client:build
```

## 生产部署

1. 构建前端:
```bash
npm run client:build
```

2. 构建产物位于 `client/dist/`

3. 使用 PM2 运行 API 服务:
```bash
pm2 start api-server.js --name yhthestudio-api
```

4. 配置 Nginx:
- 静态文件指向 `client/dist/`
- `/api` 代理到 Node.js 服务器 (端口 3000)

## 默认账户

管理员账户（首次初始化自动创建）:
- 用户名: `admin`
- 密码: `admin123`

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| PORT | Node.js 服务器端口 | 3000 |
| HOST | Node.js 服务器主机 | 0.0.0.0 |
| PY_DB_URL | Python 后端地址 | http://127.0.0.1:5100 |
| YH_DB_PATH | SQLite 数据库路径 | data/yhthestudio.db |

## API 端点

### 用户 API
- `GET /api/auth/me` - 获取当前用户
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/logout` - 用户登出
- `GET /api/products` - 获取产品列表
- `GET /api/products/:id` - 获取产品详情
- `POST /api/orders` - 创建订单
- `GET /api/orders` - 获取用户订单
- `GET /api/forum/posts` - 获取论坛帖子
- `POST /api/forum/posts` - 发布帖子
- 更多见 CLAUDE.md

### 管理 API
- `POST /api/admin/auth/login` - 管理员登录
- `GET /api/admin/stats` - 获取统计数据
- `GET/POST/PUT/DELETE /api/admin/users` - 用户管理
- `GET/POST/PUT/DELETE /api/admin/products` - 产品管理
- `GET/POST/PUT/DELETE /api/admin/orders` - 订单管理
- `GET/POST/PUT/DELETE /api/admin/posts` - 论坛管理
- `GET/PUT /api/admin/payment-settings` - 支付设置

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
2026 年 3 月
