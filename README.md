# YHthestudio - Vue 3 电商与论坛平台

[![Branch](https://img.shields.io/badge/branch-vue__0.2.0-blue)](https://github.com/YHthestudio-JiuLi/official-website-modification/tree/vue_0.2.0)

YHthestudio 官方站点：双语（中/英）电商 + 技术论坛 + 在线客服 + 设备验签与固件管理。前端 Vue 3，后端 Node.js（API/会话）+ Python FastAPI（数据库 RPC）。

**仓库：** https://github.com/YHthestudio-JiuLi/official-website-modification.git  
**当前版本分支：** `vue_0.2.0`

---

## 版本亮点（vue_0.2.0）

- **MySQL 支持**：生产环境推荐 `DB_BACKEND=mysql`；保留 SQLite 兼容；提供 `migrate_sqlite_to_mysql.py` 迁移脚本
- **产品二级分类**：一级/二级分类管理、商品绑定、前台双层筛选
- **产品图片入库**：新上传图片存 MySQL `images` 表（BLOB），经 `GET /api/product-images/:id` 访问
- **客服中心改版**：联系我们 / 在线客服 / Telegram·QQ；登录后回跳；管理端聊天设置整合
- **Telegram 订单通知**：支付成功推送含商品**类型（分类）**、链上交易信息
- **链接预览（Open Graph）**：Telegram 等分享站点链接时显示标题、说明与图标
- **分类排序修复**：一级/二级 `sortOrder` 在后台与前台均生效

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3、Vite、Pinia、Vue Router、Vue I18n、Axios |
| API 层 | Node.js、Express（端口 3000） |
| 数据层 | Python、FastAPI、Uvicorn（端口 5100，RPC） |
| 数据库 | **MySQL**（推荐）或 SQLite |
| 其他 | Telegram Bot、Winston 日志、PM2 部署 |

---

## 架构

```
浏览器 → Nginx（反代 :443 → :3000）
              ↓
         api-server.js（Express）
              ↓ HTTP RPC
         py_backend/main.py（FastAPI :5100）
              ↓
         MySQL / SQLite
```

- 所有数据库操作经 `database.js` → `POST /rpc` → Python 各 `modules/*`
- 静态页面由 Node 提供 `dist/`（`npm run build` 产物）
- Python **不对外暴露**给浏览器，仅本机 5100 供 Node 调用

---

## 目录结构

```
├── src/                      # Vue 前端
│   ├── views/user/           # 用户页（商城、论坛、客服、订单等）
│   ├── views/admin/          # 管理后台
│   ├── components/           # 公共/管理组件
│   ├── stores/               # Pinia
│   ├── router/               # 路由
│   ├── i18n/                 # 中英文文案
│   └── utils/                # 工具（如 categorySort.js）
├── py_backend/
│   ├── main.py               # FastAPI + RPC 分发
│   ├── db.py                 # MySQL 连接与 SQLite 兼容层
│   ├── migrate_sqlite_to_mysql.py
│   └── modules/              # 用户、商品、订单、论坛、聊天等
├── public/                   # favicon 等静态资源
├── uploads/                  # 固件、题库等磁盘文件（元数据在库）
├── data/                     # SQLite 文件（仅 DB_BACKEND=sqlite）
├── api-server.js             # Express API 主入口
├── database.js               # Python RPC 客户端
├── telegram.js               # Telegram 推送（订单/论坛/客服）
├── translate.js              # 商品内容中→英
├── ecosystem.config.js       # PM2（yh-api + yh-py）
├── deploy.sh                 # 服务器一键部署脚本
├── yhweb部署命令.md           # 部署备忘
└── index.html                # 含 Open Graph 元数据模板
```

---

## 本地开发

### 前置条件

- Node.js 18+
- Python 3.10+
- MySQL 8+（或改用 SQLite，见环境变量）

### 启动步骤

```bash
# 1. 安装 Node 依赖
npm install

# 2. 复制并编辑环境变量（勿提交 .env）
cp .env.example .env   # 若无 example，参考下方「环境变量」自行创建 .env

# 3. Python 虚拟环境与依赖
python3 -m venv .venv
source .venv/bin/activate
pip install -r py_backend/requirements.txt
deactivate

# 4. 终端 A：Python 数据库后端（必须先启动）
npm run py

# 5. 终端 B：构建并启动 Node（含 API + 静态页）
npm run dev
# 或开发时分开：npm run build && npm start
```

### 访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| 站点（生产式） | http://localhost:3000 | Node 提供 API + dist |
| Python RPC | http://127.0.0.1:5100 | 仅本机，/health 健康检查 |

> 若单独跑 Vite dev server（5173），需配置 proxy；推荐直接用 `npm run dev` 走 3000。

### 默认管理员

首次初始化自动创建：

- 用户名：`admin`
- 密码：`admin123`

---

## 环境变量

在项目根目录创建 `.env`（**不要提交到 Git**）：

| 变量 | 说明 | 示例 |
|------|------|------|
| `PORT` | Node 端口 | `3000` |
| `HOST` | Node 监听 | `0.0.0.0` |
| `PY_DB_URL` | Python 后端 | `http://127.0.0.1:5100` |
| `SESSION_SECRET` | Session 密钥 | 随机长字符串 |
| `DB_BACKEND` | 数据库类型 | `mysql` 或 `sqlite` |
| `MYSQL_HOST` | MySQL 主机 | `127.0.0.1` |
| `MYSQL_PORT` | MySQL 端口 | `3306` |
| `MYSQL_USER` | MySQL 用户 | `root` |
| `MYSQL_PASSWORD` | MySQL 密码 | — |
| `MYSQL_DATABASE` | 库名 | `yhthestudio_web` |
| `YH_DB_PATH` | SQLite 路径 | `data/yhthestudio.db` |
| `VITE_SITE_URL` | 站点公网 URL（构建时写入 OG） | `https://yhthestudio.com` |
| `TELEGRAM_BOT_TOKEN` | 客服/订单 Bot | — |
| `TELEGRAM_CHAT_ID` | 推送 Chat ID | — |
| `ORDER_TELEGRAM_*` | 订单专用 Bot（可选） | 默认同上 |

完整 Telegram、论坛、支付等配置见 `.env` 内注释。

### SQLite → MySQL 迁移

```bash
source .venv/bin/activate
# .env 中 DB_BACKEND=mysql 且 MYSQL_* 已配置
python -m py_backend.migrate_sqlite_to_mysql
```

> 脚本会清空目标 MySQL 表后从 SQLite 重新导入；执行前请备份。

---

## 生产部署

详细步骤见 [`yhweb部署命令.md`](./yhweb部署命令.md) 或执行：

```bash
bash deploy.sh
```

### 简要流程

```bash
cd /www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2

# 安装依赖、构建前端（VITE_SITE_URL 从 .env 注入 Open Graph）
npm install --registry=https://registry.npmjs.org/
npm run build

# Python
source .venv/bin/activate && pip install -r py_backend/requirements.txt && deactivate

# PM2：yh-api (3000) + yh-py (5100)
pm2 start ecosystem.config.js --env production
pm2 save
```

**Nginx / 宝塔：** 整站反代到 `http://127.0.0.1:3000`，不要指到 5100。大文件上传需调大 `client_max_body_size` 与代理超时。

### 验证

```bash
curl -I http://127.0.0.1:3000
curl http://127.0.0.1:5100/health
pm2 list
```

---

## 主要功能

### 用户端

- 注册 / 登录（支持登录后回跳）
- 商品列表（一级/二级分类筛选）、详情、购物车
- USDT 订单与支付确认
- 技术论坛（嵌套回复）
- 客服中心（联系我们、在线客服、Telegram/QQ）
- 设备验签、Nano 固件、题库等扩展模块

### 管理后台

- 用户 / 商品 / 订单 / 论坛
- **产品分类**（一级 + 二级，`sortOrder` 排序）
- 支付设置、弹窗公告、聊天与 Telegram 配置
- 固件与题库管理

### Telegram

- 论坛新帖/回复推送
- 客服消息转发
- **订单支付通知**（含商品分类、链上哈希与金额）

---

## 常用 npm 脚本

| 命令 | 说明 |
|------|------|
| `npm run py` | 启动 Python FastAPI（:5100） |
| `npm run build` | Vite 构建 → `dist/` |
| `npm start` | 启动 Node API（:3000） |
| `npm run dev` | build + start（本地联调） |

---

## 分支说明

| 分支 | 说明 |
|------|------|
| `vue_0.2.0` | 当前：MySQL、二级分类、OG、订单分类推送等 |
| `vue_0.1.3` | 上一稳定：客服改版、一级分类、登录回跳 |
| `vue_0.1.2` | 更早版本（SQLite 为主） |

---

## 许可证

ISC

---

**更新日期：** 2026 年 5 月
