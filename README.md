# YHthestudio | Official

[![Version](https://img.shields.io/badge/version-V2.1.1-blue?style=for-the-badge)](https://github.com/YHthestudio-JiuLi/official-website-modification/releases/tag/V2.1.1)
[![Branch](https://img.shields.io/badge/branch-vue__0.2.0-blue?style=for-the-badge)](https://github.com/YHthestudio-JiuLi/official-website-modification/tree/vue_0.2.0)

**创新科技，引领未来 · Innovative Technology, Leading the Future**

YHthestudio 官方站点：双语（中/英）官网 + 电商订单 + 技术论坛 + 在线客服 + 设备验签与固件/题库管理。

前端 **Vue 3**；后端 **三栈并行**：Laravel V2（认证/RBAC/商城主 API）+ Node.js Express（聊天/上传/Telegram）+ Python FastAPI（数据库 RPC）。架构详情见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

**仓库：** https://github.com/YHthestudio-JiuLi/official-website-modification.git  
**当前版本：** `V2.1.1`（分支 `vue_0.2.0`）

---

## 联系我们 / Contact

🌐 [官方网站 yhthestudio.com](https://yhthestudio.com)  
✈️ [Telegram 技术交流群](https://t.me/YH_TechnicalExchange)  
🐧 [QQ 群](https://qm.qq.com/q/PADe3iD2os)  
💬 [在线客服中心](https://yhthestudio.com/#/chat)

---

## V2.1.1 版本亮点

- **题库/固件分片上传修复**：`chunk` 直连 Node，避免误走 Laravel 导致 401 与「登录失效」
- **一键部署**：`scripts/deploy.sh`、Laravel PHP-FPM 可选脚本、DB 凭据一致性检查
- **后台会话加固**：admin boot session、CSRF 重试、上传 401 不再整页踢出登录
- **性能优化**：Element Plus 按需加载、管理端减少重复鉴权请求
- **Node 路由拆分**：`server/` 模块化，Laravel Bridge 转发大文件上传

## V2.1.0 版本亮点

- **Laravel V2 API**：用户/订单/论坛/商品/RBAC 等迁入 `/api/v2`，Sanctum 会话 + Spatie 权限
- **角色与代理**：超级管理员 / 运营 / 代理 / 普通用户；代理开户从用户表选取；数据隔离
- **题库与固件拆分**：独立导航与权限（`question.*` / `firmware.*`）；固件支持备注内联编辑
- **MySQL 主库**：生产默认 `DB_BACKEND=mysql`，Laravel 与 Python 共用 `yhthestudio_web`
- **顺丰物流**：后台录入运单号，用户端查询物流轨迹
- **USDT 链上校验**：订单支付哈希验证（可配置规则）
- **设备验证 UI**：操作按钮收纳为下拉菜单，避免表格裁切
- **论坛管理修复**：后台回复列表与 Laravel API 响应格式对齐
- **SEO / OG**：首页文案、站点地图、多语言标题同步

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3、Vite、Pinia、Vue Router、Vue I18n、Element Plus、Axios |
| API V2 | **Laravel 11**、Sanctum、Spatie Permission（端口 **8000**） |
| API 网关 | Node.js、Express（端口 **3000**） |
| 数据 RPC | Python、FastAPI、Uvicorn（端口 **5100**） |
| 数据库 | **MySQL 8+**（推荐；SQLite 仅兼容/迁移用） |
| 其他 | Telegram Bot、顺丰 API、Winston 日志、PM2 部署 |

---

## 架构

```
浏览器
  ↓
Nginx（:443）
  ├─ /api/v2/*、/sanctum/*  →  Laravel :8000（认证、RBAC、商城、订单、论坛管理）
  └─ 其余 /api/*、静态 dist   →  Node :3000
                                  ├─ 聊天 WebSocket / Telegram
                                  ├─ 设备验签、题库、固件上传
                                  └─ HTTP RPC → Python :5100 → MySQL
```

| 模块 | 后端 | 说明 |
|------|------|------|
| 登录/注册/用户/订单/论坛/商品/RBAC | Laravel V2 | `VITE_USE_V2_API=true` |
| 客服聊天、设备验证、题库、固件 | Node + Python | 见 `legacy-node-allowlist.js` |
| 商品图（新上传） | Laravel | `GET /api/v2/product-images/:id` |

> Python **不对外暴露**，仅本机 5100 供 Node RPC 调用。

---

## 目录结构

```
├── src/                      # Vue 前端
│   ├── views/user/           # 用户端（商城、论坛、客服、订单等）
│   ├── views/admin/          # 管理后台（含 RolesView、AgentsView、FirmwareView）
│   ├── services/v2/          # Laravel API 客户端
│   ├── composables/          # 权限 composable（useAdminPermission）
│   └── utils/apiPath.js      # /api → /api/v2 路径映射
├── laravel-api/              # Laravel V2 后端（勿提交 vendor/、.env）
├── py_backend/               # FastAPI + 业务 modules + MySQL 适配层
├── scripts/                  # laravel-serve、laravel-setup、迁移校验等
├── api-server.js             # Express 主入口
├── database.js               # Python RPC 客户端
├── legacy-node-allowlist.js  # 仍走 Node 的 API 白名单
├── uploads/                  # 运行时上传（不入 Git）
├── public/                   # favicon、sitemap、robots 等
└── ecosystem.config.js       # PM2（yh-api + yh-py + 可选 yh-laravel）
```

---

## 本地开发

### 前置条件

- Node.js 18+
- Python 3.10+
- **PHP >= 8.2**、Composer
- MySQL 8+

### 首次初始化

```bash
# 1. 依赖
npm install
python3 -m venv .venv && source .venv/bin/activate
pip install -r py_backend/requirements.txt && deactivate

# 2. 环境变量（勿提交 .env）
cp .env.example .env
# 编辑 DB_BACKEND=mysql、MYSQL_*、VITE_USE_V2_API=true

# 3. Laravel 初始化（仅首次）
npm run laravel:setup
# 编辑 laravel-api/.env 中 DB_* 与 NODE_INTERNAL_SECRET
```

### 日常启动（4 个终端）

```bash
# 终端 A：Python RPC（必须先起）
npm run py

# 终端 B：Laravel V2
npm run laravel          # http://127.0.0.1:8000

# 终端 C：Node API
npm start                # http://127.0.0.1:3000

# 终端 D：Vite 开发（热更新，代理 /api/v2）
npx vite --host 127.0.0.1 --port 5173
```

或使用 `npm run dev`（build + Node，不含 Laravel 热更新）。

### 访问地址

| 服务 | 地址 |
|------|------|
| Vite 开发前端 | http://127.0.0.1:5173 |
| Node API + 静态 | http://127.0.0.1:3000 |
| Laravel V2 | http://127.0.0.1:8000 |
| Python RPC | http://127.0.0.1:5100/health |

### 默认管理员

Laravel 初始化后，使用数据库中 `isAdmin=1` 或已分配 `super_admin` 角色的账号登录后台。  
首次 Python 种子可能创建：`admin` / `Yzx147258369`（以实际库为准）。

RBAC 变更后执行：

```bash
cd laravel-api && php artisan db:seed --class=RolePermissionSeeder
```

---

## 环境变量（根目录 `.env`）

| 变量 | 说明 | 示例 |
|------|------|------|
| `VITE_USE_V2_API` | 主 API 走 Laravel | `true` |
| `VITE_USE_V2_CATALOG` | 商品 API 走 V2 | `true` |
| `DB_BACKEND` | Python 数据库 | `mysql` |
| `MYSQL_*` | MySQL 连接 | `yhthestudio_web` |
| `PY_DB_URL` | Python 地址 | `http://127.0.0.1:5100` |
| `SESSION_SECRET` | Node Session | 随机长字符串 |
| `NODE_INTERNAL_SECRET` | Laravel→Node 内部回调 | 与 `laravel-api/.env` 一致 |
| `VITE_SITE_URL` | 构建时 OG 域名 | `https://yhthestudio.com` |
| `SF_EXPRESS_*` | 顺丰物流（可选） | 见 `.env.example` |

完整 Telegram、支付等配置见 `.env` 与 `laravel-api/.env.example`。

### SQLite → MySQL 迁移（历史库）

```bash
# 仅当仍有 data/yhthestudio.db 时
python -m py_backend.migrate_sqlite_to_mysql
```

当前版本**生产环境不再使用 SQLite 文件**，仅保留迁移脚本与 `DB_BACKEND=sqlite` 回退能力。

---

## 生产部署

**新手请直接阅读 [DEPLOY.md](./DEPLOY.md)**：12 步宝塔部署教程，含 PHP 扩展、PM2、`ecosystem.config.js`、**完整 Nginx 配置文件**与故障排查。

快速要点：

- PM2 三进程：`yh-laravel`(8000)、`yh-api`(3000)、`yh-py`(5100)
- Laravel 在宝塔上用 `php -S ... server.php` 启动（见 `ecosystem.config.js`）
- Nginx：`/api/v2/`、`/sanctum/` → 8000；反代 `Host` 必须为 `$host`
- 部署后必须 `npm run build`（`VITE_USE_V2_API=true`）

---

## 主要功能

### 用户端

- 注册 / 登录（登录后回跳）
- 商品浏览（分类筛选）、下单、USDT 支付与链上校验
- 订单物流查询（顺丰）
- 技术论坛（嵌套回复）
- 客服中心（在线聊天、Telegram/QQ）

### 管理后台

- **用户 / 角色 / 代理**（RBAC 六项细粒度权限）
- 商品、分类、订单（含物流单号）
- **论坛**、支付设置、弹窗公告
- **题库与固件**（权限独立）
- 设备验证（配额、白名单、密钥）
- 聊天工作台与聊天设置（权限拆分）

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run py` | Python FastAPI :5100 |
| `npm run laravel` | Laravel :8000 |
| `npm run laravel:setup` | 首次 Laravel 安装/迁移/Seeder |
| `npm run build` | Vite 构建 → `dist/` |
| `npm start` | Node API :3000 |
| `npm run dev` | build + start |
| `npm run validate` | 迁移期 API 路径校验脚本 |

---

## 分支与版本

| 标签/分支 | 说明 |
|-----------|------|
| **V2.1.1** | 当前：上传桥接修复、部署脚本、会话加固、PHP-FPM 支持 |
| **V2.1.0** | Laravel V2、RBAC、代理、固件/题库拆分、MySQL 主库 |
| `vue_0.2.0` | 开发主分支 |
| `vue_0.1.3` | 上一稳定（无 Laravel V2） |
| `vue_0.1.2` | 更早版本（SQLite 为主） |

发布页：https://github.com/YHthestudio-JiuLi/official-website-modification/releases/tag/V2.1.1

---

## 许可证

ISC

---

**更新日期：** 2026 年 6 月
