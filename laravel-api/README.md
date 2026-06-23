# YHthestudio Laravel API (v2)

与现有 Express/Python 并行的新后端，提供 **Sanctum 认证 + RBAC 权限 + 代理账户**。

## 要求

- **PHP >= 8.2**（本地若为 PHP 7.4，请在服务器或 `brew install php` 后执行）
- MySQL（与主项目共用 `yhthestudio_web`）
- Redis（Session / 限流，生产推荐）

## 快速开始

```bash
cd laravel-api
cp .env.example .env
# 编辑 DB_*、REDIS_*、SANCTUM_STATEFUL_DOMAINS

./setup.sh
# 或手动：
composer install
php artisan key:generate
php artisan migrate
php artisan db:seed --class=RolePermissionSeeder
php artisan serve --host=127.0.0.1 --port=8000
```

项目根目录：

```bash
npm run laravel          # 启动 :8000
npm run dev              # Vite 代理 /api/v2 与 /sanctum → Laravel
npm start                # 旧 Express :3000（商城/论坛等仍走此服务）
```

## API 前缀

| 路径 | 说明 |
|------|------|
| `GET /api/v2/health` | 健康检查 |
| `POST /api/v2/auth/admin/login` | 管理端登录（限流 5/min） |
| `GET /api/v2/auth/me` | 当前用户 + 权限列表 |
| `GET /api/v2/admin/roles` | 角色管理 |
| `GET /api/v2/products` | 商品列表（公开） |
| `GET /api/v2/product-categories` | 分类列表 |
| `GET /api/v2/product-images/{id}` | 商品图片（新上传） |
| `GET/POST/PUT/DELETE /api/v2/admin/products` | 商品管理 |
| `GET/POST/PUT/DELETE /api/v2/admin/product-categories` | 分类管理 |

旧路径 `/api/product-images/{id}` 在迁移期仍由 Express 提供；新上传返回 `/api/v2/product-images/{id}`。


## 安全特性

- Laravel Sanctum SPA Cookie + CSRF
- 登录/IP 双重限流
- `spatie/laravel-permission` 角色权限
- Policy 级数据隔离（代理 Scope）
- 可选 `ADMIN_IP_WHITELIST`
- 安全响应头中间件

## Nginx（生产）

```nginx
location /api/v2/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /sanctum/ {
    proxy_pass http://127.0.0.1:8000;
}

# 可选：商品图全部切到 Laravel 后启用
# location /api/product-images/ {
#     proxy_pass http://127.0.0.1:8000/api/v2/product-images/;
# }

# 旧 API 迁移完成前保留
location /api/ {
    proxy_pass http://127.0.0.1:3000;
}
```

## 迁移阶段（v2.2）

| 模块 | 状态 | 路径 |
|------|------|------|
| 认证 / 注册 | ✅ Laravel | `/api/v2/auth/*` |
| 商品 / 分类 / 图片 | ✅ Laravel | `/api/v2/products*` |
| 购物车 / 订单 | ✅ Laravel | `/api/v2/cart`, `/api/v2/orders` |
| 论坛 | ✅ Laravel | `/api/v2/forum/*` |
| 支付设置 / 弹窗 | ✅ Laravel | `/api/v2/payment-settings`, `/api/v2/admin/popup-notices` |
| RBAC / 代理 | ✅ Laravel | `/api/v2/admin/roles`, `/api/v2/admin/agents` |
| 聊天 / WebSocket | ⏳ 旧 Node | `/api/chat/*`, `/ws` |
| 设备验签 / 题库 | ⏳ 旧 Node | `/api/device/*`, `/api/admin/questions*` |

前端设置 `VITE_USE_V2_API=true`（见根目录 `.env.example`）后，`api.js` 自动将商城/论坛等请求映射到 `/api/v2`；聊天与设备相关仍直连 Node。

验证：`npm run validate`（构建 + 静态检查）

## 迁移阶段（历史）

## 权限种子

`php artisan db:seed --class=RolePermissionSeeder` 会创建：

- 角色：`super_admin`、`staff`、`agent`、`customer`
- 权限：`user.*`、`role.*`、`agent.*`、`product.*`、`order.*` 等
- 将现有 `isAdmin=1` 用户挂上 `super_admin`
