# YHthestudio 架构说明

> 版本：V2.2（Laravel 主 API + Node 过渡层 + Python RPC）

## 目录结构

```
├── src/                    # Vue 3 前端（用户商城 + 管理后台）
│   ├── views/user/         # 前台页面
│   ├── views/admin/        # 后台页面
│   ├── services/
│   │   ├── api.js          # 主 HTTP 客户端（路径映射 + Node 过渡接口）
│   │   └── v2/             # Laravel V2 类型化 API（见 v2/index.js）
│   ├── stores/             # Pinia：auth / admin / adminV2
│   └── utils/              # apiPath、会话跳转、权限等
├── laravel-api/            # Laravel 11 — 主业务 API（:8000）
├── api-server.js           # Node 入口（11 行）→ server/bootstrap.js
├── server/                 # Node 服务模块化实现
│   ├── bootstrap.js        # 组装中间件、路由、WebSocket、启动监听
│   ├── config.js           # 环境变量、日志、路径
│   ├── middleware/         # 限流、410、Session/CSRF
│   ├── lib/                # 认证、上传、bridge token
│   └── routes/             # chat、device、internal、legacy、static
├── py_backend/             # FastAPI — MySQL RPC（:5100）
├── database.js             # Node → Python RPC 客户端
├── legacy-node-allowlist.js # Node 路由白名单（BLOCK_LEGACY_MIGRATED_API 时使用）
├── uploads/                # 运行时上传目录（gitignore）
├── public/                 # 静态资源（构建时复制）
├── scripts/                # 开发与部署脚本
└── ecosystem.config.js     # PM2 进程配置
```

## 请求流向

```
浏览器
  ├─ /api/v2/*、/sanctum/*  → Laravel (:8000)
  │     ├─ Eloquent：商城、订单、论坛、RBAC
  │     ├─ PyDbClient → Python RPC：题库、固件、设备验证
  │     └─ LegacyNodeBridge → Node：大文件分片上传
  ├─ /api/chat/*、/ws        → Node (:3000)  [过渡期]
  ├─ /api/device/*           → Node (:3000)  [过渡期]
  └─ 静态 /dist              → Node (:3000)

Laravel（内网）
  └─ /api/internal/telegram/* → Node（需 NODE_INTERNAL_SECRET）
```

## 认证与会话

| 场景 | 机制 |
|------|------|
| 前台用户 | Laravel `web` guard + Sanctum CSRF |
| 后台管理 | Laravel `admin` guard + `admin_boot_id`（重启后失效） |
| 在线客服 | Node 独立会话（过渡期） |
| 分片上传 | Laravel 代发 → Node（`X-Legacy-Node-Token`） |

前端 `adminV2` store 为后台权威会话；`admin` store 在 V2 模式下仅作镜像（用户名显示等）。

401 时全局拦截器调用 `redirectToAdminLogin()` 自动跳转登录页。

## 环境变量

| 文件 | 用途 |
|------|------|
| `.env` | Node、Vite、Python（读 MYSQL_*） |
| `laravel-api/.env` | Laravel（DB_*、Sanctum、PY_DB_URL） |

**必须保持一致：** `NODE_INTERNAL_SECRET`、`PY_DB_URL`、MySQL 连接（`MYSQL_*` ↔ `DB_*`）

## 本地开发

```bash
npm run py          # Python :5100
npm run laravel     # Laravel :8000
npm run dev         # 构建 + Node :3000（或 vite 开发见 vite.config.js）
```

Vite 开发模式：`/api/v2` → Laravel，`/api/chat|device` → Node。

## 生产部署

详见 [DEPLOY.md](./DEPLOY.md)。PM2 进程：`yh-laravel`、`yh-api`、`yh-py`。

## 迁移状态

- **已迁入 Laravel V2：** 认证、RBAC、商城、订单、论坛、弹窗、支付设置、题库/固件/设备（读写在 Laravel，上传经 Node 代发）
- **仍在 Node：** 在线客服 WebSocket、Telegram Bot、大文件上传处理
- **Node 旧路由：** 默认 `BLOCK_LEGACY_MIGRATED_API=true` 返回 410

## 验证

```bash
npm run validate    # 前端构建 + 静态检查
npm run build       # 仅构建
```

Python 单元测试：`cd py_backend && python -m pytest tests/`

## 前端 V2 服务层

`src/services/v2/index.js` 统一导出 Laravel API 客户端：

| 模块 | 路径 | 用途 |
|------|------|------|
| `userAuth` | `v2/auth.js` | 前台登录/注册 |
| `cart` / `orders` / `forum` | 对应文件 | 商城与论坛 |
| `catalog` | `v2/catalog.js` | 商品与分类 |
| `adminAuth` | `admin/auth.js` | 后台登录与会话 |
| `adminQuestions` / `adminFirmware` / `adminDevices` | 对应文件 | 题库/固件/设备 |
| 其他 `admin/*` | 各模块文件 | 仪表盘、用户、订单等 |

页面应优先 `import` 自 `@/services/v2/admin/*`，仅聊天 (`/api/chat`) 与设备公开验签 (`/api/device`) 继续使用 `@/services/api`。
