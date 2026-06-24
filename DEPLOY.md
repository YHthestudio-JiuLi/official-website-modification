# YHthestudio 生产部署说明（V2.1.0）

> 面向 **宝塔面板 + OpenCloudOS/CentOS** 的新手逐步部署指南。  
> 按章节顺序执行，不要跳步。  
> **版本**：V2.1.0 · 分支 `vue_0.2.0`

**示例路径（全文统一替换为你的实际路径）：**

```text
/www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2
```

---

## 目录

1. [部署前需要了解什么](#1-部署前需要了解什么)
2. [服务器环境准备](#2-服务器环境准备)
3. [上传代码](#3-上传代码)
4. [配置环境变量](#4-配置环境变量)
5. [安装 Laravel 依赖](#5-安装-laravel-依赖)
6. [安装 Node 并构建前端](#6-安装-node-并构建前端)
7. [安装 Python 环境](#7-安装-python-环境)
8. [配置 PM2 并启动三个服务](#8-配置-pm2-并启动三个服务)
9. [配置 Nginx（含完整配置文件）](#9-配置-nginx含完整配置文件)
10. [部署验证](#10-部署验证)
11. [日常更新代码](#11-日常更新代码)
12. [常见问题](#12-常见问题)

---

## 1. 部署前需要了解什么

### 1.1 架构图

```
浏览器 (HTTPS)
    ↓
Nginx (:443)
    ├─ /api/v2/*、/sanctum/*  →  Laravel  :8000  （认证、后台、商城、论坛、RBAC、题库/固件/设备管理）
    ├─ /api/chat/*、/ws        →  Node     :3000  （在线客服，过渡期）
    ├─ /api/device/*           →  Node     :3000  （设备公开验签，过渡期）
    └─ 页面、其余 /api/*        →  Node     :3000  （静态 dist；已迁接口返回 410）

Laravel 内网代发（浏览器不感知）：
    Laravel  :8000  ──上传/Telegram──→  Node  :3000
                                              ↓ RPC
                                         Python  :5100
                                              ↓
                                         MySQL
```

**Node 核心职责（仅两块）：**

| 职责 | 说明 |
|------|------|
| **大文件上传** | 题库/固件分片合并；浏览器只打 Laravel，Laravel 带内部 token 代发 Node |
| **Telegram** | Bot 轮询、论坛/订单通知、客服配置变更后重启 Bot（`/api/internal/telegram/*`） |

**过渡期仍走 Node（后续可迁入 Laravel）：** 在线客服 REST + WebSocket（`/api/chat/*`、`/ws`）、设备公开 API（`/api/device/*`）。

**已停用：** 浏览器直接访问旧 `/api/admin/*`（除上传代发路径外）会收到 `410 legacy_api_retired`，请统一使用 `/api/v2`。默认 `BLOCK_LEGACY_MIGRATED_API=true`（根目录 `.env`）。

### 1.2 需要跑几个进程

| PM2 名称 | 端口 | 作用 |
|----------|------|------|
| `yh-laravel` | 8000 | Laravel V2 API（主栈） |
| `yh-api` | 3000 | Node：上传 + Telegram + 在线客服/设备验签(过渡) + 静态页 |
| `yh-py` | 5100 | Python：数据库 RPC |

### 1.3 打包上传时可删除的内容

减小压缩包体积（服务器上会重新安装）：

- `.git/`、`node_modules/`、`.venv/`、`laravel-api/vendor/`、`dist/`、`logs/`

**必须保留或单独拷贝：**

- `.env`、`laravel-api/.env`（敏感配置，勿提交 Git）
- `uploads/`（商品图、固件等运行时文件，若有历史数据）

---

## 2. 服务器环境准备

### 步骤 2.1 宝塔安装软件

登录宝塔 → **软件商店**，安装：

| 软件 | 版本要求 |
|------|----------|
| Nginx | 任意较新版本 |
| MySQL | 8.0+ |
| Redis | 推荐 |
| PM2 管理器 | 最新 |
| Node.js | 18+ |
| PHP | **8.2 或以上**（建议 8.5，不要用 7.4 跑 Laravel） |
| Composer | 在 PHP 设置里或命令行安装 |

### 步骤 2.2 配置 PHP 8.x 扩展

宝塔 → **软件商店** → **PHP 8.5**（或你安装的 8.2+）→ **设置** → **安装扩展**：

| 扩展 | 必须 |
|------|------|
| fileinfo | ✅ |
| pdo_mysql | ✅ |
| redis | ✅ |
| mbstring、openssl、tokenizer、xml、ctype、json、bcmath | ✅ |
| pcntl | 建议 |

### 步骤 2.3 放开 PHP 禁用函数

同一页面 → **禁用函数**，**删除**以下项（若存在）：

```
putenv
proc_open
pcntl_signal
pcntl_alarm
```

保存后 SSH 验证：

```bash
PHP=/www/server/php/85/bin/php   # 按你的 PHP 版本改 82/83/85

$PHP -m | grep -E 'fileinfo|pdo_mysql|redis|pcntl'
$PHP -r "var_dump(function_exists('putenv'), function_exists('proc_open'));"
```

应看到扩展名，且两个 `bool(true)`。

> **说明**：宝塔默认禁用 `putenv`、`proc_open`，会导致 Composer 和 Laravel 无法启动。

### 步骤 2.4 创建 MySQL 数据库

宝塔 → **数据库** → **添加数据库**：

- 数据库名：`yhthestudio_web`
- 用户名 / 密码：自行设置并记下

或 SSH 执行：

```sql
CREATE DATABASE yhthestudio_web CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 步骤 2.5 启动 Redis

宝塔 → **软件商店** → **Redis** → 启动。

---

## 3. 上传代码

### 方式 A：Git 拉取

```bash
cd /www/wwwroot/yhthestudio.com
git clone https://github.com/YHthestudio-JiuLi/official-website-modification.git official-website-modification_v0.1.2
cd official-website-modification_v0.1.2
git checkout vue_0.2.0
```

### 方式 B：本机压缩上传（宝塔文件管理）

1. 本机删除 `.git`、`node_modules`、`.venv`、`laravel-api/vendor`、`dist` 后打包
2. 宝塔 → **文件** → 上传到 `/www/wwwroot/yhthestudio.com/`
3. 解压

```bash
cd /www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2
ls -la    # 确认 api-server.js、laravel-api、src 等存在
```

---

## 4. 配置环境变量

### 步骤 4.1 根目录 `.env`

```bash
cd /www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2

# 若没有 .env（上传时可能没带）
cp .env.example .env
nano .env
```

**至少修改以下项：**

```ini
PORT=3000
HOST=0.0.0.0
VITE_SITE_URL=https://yhthestudio.com

# 前端必须走 Laravel V2（构建时生效，见第 6 步）
VITE_USE_V2_API=true
VITE_USE_V2_CATALOG=true
BLOCK_LEGACY_MIGRATED_API=true

SESSION_SECRET=替换为随机长字符串

# Python 连接 MySQL（与 Laravel 同一库）
DB_BACKEND=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=你的数据库用户名
MYSQL_PASSWORD=你的数据库密码
MYSQL_DATABASE=yhthestudio_web
PY_DB_URL=http://127.0.0.1:5100

NODE_INTERNAL_SECRET=替换为随机长字符串
```

### 步骤 4.2 Laravel `.env`

```bash
cp laravel-api/.env.example laravel-api/.env
nano laravel-api/.env
```

**至少修改：**

```ini
APP_ENV=production
APP_DEBUG=false
APP_URL=https://yhthestudio.com

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=yhthestudio_web
DB_USERNAME=你的数据库用户名
DB_PASSWORD=你的数据库密码

SESSION_DRIVER=redis
SESSION_DOMAIN=.yhthestudio.com
SESSION_SECURE_COOKIE=true
CACHE_STORE=redis
QUEUE_CONNECTION=redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

SANCTUM_STATEFUL_DOMAINS=localhost,127.0.0.1,yhthestudio.com,www.yhthestudio.com
CORS_ALLOWED_ORIGINS=https://yhthestudio.com,https://www.yhthestudio.com

NODE_INTERNAL_SECRET=与根目录 .env 中相同
LEGACY_NODE_URL=http://127.0.0.1:3000
PY_DB_URL=http://127.0.0.1:5100
```

> `NODE_INTERNAL_SECRET` **根目录 `.env` 与 `laravel-api/.env` 中必须完全一致**。  
> Node（`api-server.js`）只读**根目录** `.env`；Laravel 只读 `laravel-api/.env`。缺一边会导致 bridge token 校验失败。  
> **题库/固件/设备管理** 由 Laravel 经 `PY_DB_URL` 调用 Python RPC，务必在 `laravel-api/.env` 中配置，且 `yh-py` 进程在线。

---

## 5. 安装 Laravel 依赖

```bash
cd /www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2/laravel-api

PHP=/www/server/php/85/bin/php   # 全文用此变量，按实际 PHP 版本修改

# 安装 Composer 依赖（必须在 laravel-api 目录内执行）
$PHP composer.phar install --no-dev --optimize-autoloader
# 若没有 composer.phar，先下载：
# $PHP -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"
# $PHP composer-setup.php

# 确认 vendor 已生成
ls vendor/autoload.php

# 初始化 Laravel
$PHP artisan key:generate --force
$PHP artisan migrate --force
$PHP artisan db:seed --class=RolePermissionSeeder --force
$PHP artisan config:cache
$PHP artisan route:cache
```

若 `composer install` 报错 `ext-fileinfo` → 回到 [步骤 2.2](#步骤-22-配置-php-8x-扩展) 安装 fileinfo。  
若报错 `putenv` / `proc_open` → 回到 [步骤 2.3](#步骤-23-放开-php-禁用函数)。

---

## 6. 安装 Node 并构建前端

```bash
cd /www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2

# 确认 V2 开关已开启（否则页面会请求旧 API，导致无数据）
grep VITE_USE .env

npm install --registry=https://registry.npmjs.org/
npm run build
```

构建成功后应有 `dist/` 目录。

> **重要**：每次修改 `VITE_SITE_URL`、`VITE_USE_V2_API` 后都必须重新 `npm run build`，再 `pm2 restart yh-api`。

---

## 7. 安装 Python 环境

> **切勿**把本机（macOS/Windows）的 `.venv/` 打包上传到 Linux 服务器。  
> 若出现 `pip: cannot execute: required file not found` 或 `curl 127.0.0.1:5100/health` 无输出，  
> 必须在服务器上**删除并重建**虚拟环境：

```bash
cd /www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2
rm -rf .venv
python3 -m venv .venv
.venv/bin/python -m pip install -U pip
.venv/bin/python -m pip install -r py_backend/requirements.txt
pm2 restart yh-py yh-api
curl -s http://127.0.0.1:5100/health   # 应输出 {"ok":true,"backend":"mysql"}
```

正常首次安装步骤：

```bash
cd /www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2

python3 -m venv .venv
.venv/bin/python -m pip install -U pip
.venv/bin/python -m pip install -r py_backend/requirements.txt

# 验证
.venv/bin/python -m uvicorn py_backend.main:app --host 127.0.0.1 --port 5100 &
sleep 2
curl -sf http://127.0.0.1:5100/health && echo "Python OK"
kill %1
```

---

## 8. 配置 PM2 并启动三个服务

### 步骤 8.1 修改 `ecosystem.config.js`

```bash
nano /www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2/ecosystem.config.js
```

**必须修改：**

1. 所有路径改为你服务器上的实际目录
2. `yh-laravel` 使用 **PHP 8.x 完整路径** + **内置 Web 服务器**（宝塔上 `artisan serve` 常因 pcntl 报错）

`yh-laravel` 使用 `laravel-api/scripts/start-server.sh`（在 `public/` 目录启动，勿直接 `php -S ... server.php` 于项目根，否则会缺 `index.php`）。

### 步骤 8.2 启动 PM2

```bash
cd /www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2

pm2 delete yh-api yh-py yh-laravel 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup    # 按提示执行一次，实现开机自启
pm2 list
```

三个进程应均为 **online**，`↺` 重启次数不应持续增加。

### 步骤 8.3 验证三个端口

```bash
curl -s http://127.0.0.1:8000/api/v2/health
# 期望：{"ok":true,"service":"laravel-api",...}

curl -s http://127.0.0.1:3000/api/csrf-token
# 期望：{"csrfToken":"..."}

curl -s http://127.0.0.1:5100/health
# 期望：健康检查 JSON
```

若 Laravel 不通，查看日志：

```bash
pm2 logs yh-laravel --lines 30 --nostream
```

### 步骤 8.4（强烈推荐）Laravel 改用 PHP-FPM，解决后台 API 卡顿

开发用的 `php -S :8000` **单进程、每次请求冷启动**，生产环境下一个 API 常需 0.5～1 秒。  
**根治方式**：Nginx 用 PHP-FPM 8.5 执行 `laravel-api/public/index.php`，并停用 PM2 的 `yh-laravel`。

```bash
cd /www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2

# 一键：写 extension 配置、optimize、停 yh-laravel
bash scripts/setup-laravel-fpm.sh --domain yhthestudio.com

# 或部署时附带
bash scripts/deploy.sh --laravel-fpm
```

**然后**在宝塔站点 Nginx 主配置中 **删除** 原先反代到 `:8000` 的两段（与 FPM 重复会冲突）：

```nginx
# 删除或注释这两段
location /api/v2/ { proxy_pass http://127.0.0.1:8000; ... }
location /sanctum/ { proxy_pass http://127.0.0.1:8000; ... }
```

FPM 规则由 `extension/yhthestudio.com/yh-laravel-fpm.conf` 提供。验证：

```bash
curl -s -o /dev/null -w 'time=%{time_total}s\n' https://yhthestudio.com/api/v2/health
# 期望 time < 0.15s（原先 php -S 常 > 0.5s）
```

---

## 9. 配置 Nginx（含完整配置文件）

### 步骤 9.1 宝塔添加网站

1. 宝塔 → **网站** → **添加站点**
2. 域名：`yhthestudio.com`（可加 `www`）
3. 根目录指向项目目录（或任意，实际流量走反代）
4. 申请 **SSL 证书** 并开启强制 HTTPS

### 步骤 9.2 设置反向代理（Node 3000）

宝塔 → 网站 → `yhthestudio.com` → **反向代理** → **添加反代**：

- 代理名称：随意
- 目标 URL：`http://127.0.0.1:3000`
- 发送域名：`$host`（**不要填 127.0.0.1**）

这会在服务器生成文件：

```text
/www/server/panel/vhost/nginx/proxy/yhthestudio.com/*.conf
```

**检查并修正**该文件中的 Host 头：

```bash
cat /www/server/panel/vhost/nginx/proxy/yhthestudio.com/*.conf
```

若看到 `proxy_set_header Host 127.0.0.1;`，必须改为：

```nginx
proxy_set_header Host $host;
```

### 步骤 9.3 修改站点主配置文件

宝塔 → 网站 → `yhthestudio.com` → **配置文件**。

在 `location = /favicon.png { ... }` 之后、`include .../proxy/yhthestudio.com/*.conf;` **之前**，插入 Laravel 与 WebSocket 规则（**顺序不能错**）。

### 步骤 9.4 宝塔完整 Nginx 配置（可直接替换）

> 使用前：将 `yhthestudio.com`、路径、SSL 证书路径改为你自己的。  
> 宝塔自动生成的 SSL、`well-known` 等段落已保留。

配置文件路径：`/www/server/panel/vhost/nginx/yhthestudio.com.conf`

```nginx
server
{
    listen 80;
    listen 443 ssl;
    listen 443 quic;
    listen [::]:443 ssl;
    listen [::]:443 quic;
    http2 on;
    listen [::]:80;
    server_name yhthestudio.com www.yhthestudio.com;
    index index.php index.html index.htm default.php default.htm default.html;
    root /www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2;

    #CERT-APPLY-CHECK--START
    include /www/server/panel/vhost/nginx/well-known/yhthestudio.com.conf;
    #CERT-APPLY-CHECK--END
    include /www/server/panel/vhost/nginx/extension/yhthestudio.com/*.conf;

    #SSL-START
    set $isRedcert 1;
    if ($server_port != 443) {
        set $isRedcert 2;
    }
    if ( $uri ~ /\.well-known/ ) {
        set $isRedcert 1;
    }
    if ($isRedcert != 1) {
        rewrite ^(/.*)$ https://$host$1 permanent;
    }
    ssl_certificate    /www/server/panel/vhost/cert/yhthestudio.com/fullchain.pem;
    ssl_certificate_key    /www/server/panel/vhost/cert/yhthestudio.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers EECDH+CHACHA20:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    add_header Strict-Transport-Security "max-age=31536000";
    error_page 497 https://$host$request_uri;
    #SSL-END

    error_page 404 /404.html;

    # 大文件上传（固件等）
    client_max_body_size 512m;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;

    location = /favicon.png {
        root /www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2/dist;
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location ~ /purge(/.*) {
        proxy_cache_purge cache_one $host$1$is_args$args;
    }

    # ── V2.1.0：Laravel API（必须在 proxy include 之前）──
    location /api/v2/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /sanctum/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 客服 WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 整站及其余 /api/* → Node :3000（宝塔反向代理生成）
    include /www/server/panel/vhost/nginx/proxy/yhthestudio.com/*.conf;

    include enable-php-00.conf;

    include /www/server/panel/vhost/rewrite/yhthestudio.com.conf;

    location ~ ^/(\.user.ini|\.htaccess|\.git|\.env|\.svn|\.project|LICENSE|README.md)
    {
        return 404;
    }

    location ~ \.well-known {
        allow all;
    }

    if ( $uri ~ "^/\.well-known/.*\.(php|jsp|py|js|css|lua|ts|go|zip|tar\.gz|rar|7z|sql|bak)$" ) {
        return 403;
    }

    access_log  /www/wwwlogs/yhthestudio.com.log;
    error_log   /www/wwwlogs/yhthestudio.com.error.log;
}
```

### 步骤 9.5 保存并重载 Nginx

```bash
nginx -t
```

显示 `syntax is ok` 后：

```bash
nginx -s reload
```

或在宝塔面板点击 **保存 → 重载配置**。

> **常见错误**：把 `location /api/v2/` 写在文件末尾、或写进 `location ~ /purge` 内部，会导致 `unexpected "}"`。Laravel 的 location 必须放在 **`include proxy` 之前**。

### 步骤 9.6 路由分工速查

| 请求路径 | 转发到 |
|----------|--------|
| `/api/v2/*` | Laravel `:8000` |
| `/sanctum/*` | Laravel `:8000` |
| `/ws` | Node `:3000` |
| 其余 `/api/*`、页面 | Node `:3000` |

---

## 10. 部署验证

### 步骤 10.1 命令行检查

```bash
curl -s http://127.0.0.1:8000/api/v2/health
curl -s http://127.0.0.1:8000/api/v2/products | head -c 200
curl -s http://127.0.0.1:3000/api/csrf-token
curl -I https://yhthestudio.com/api/v2/health
pm2 list
```

### 步骤 10.2 数据库是否有数据

```bash
mysql -u你的用户 -p yhthestudio_web -e "SELECT COUNT(*) AS products FROM products;"
```

若为 `0`，页面会没有商品——需在后台录入，或从旧库/SQLite 迁移（见 [12. 常见问题](#12-常见问题)）。

### 步骤 10.3 浏览器检查

1. 打开 `https://yhthestudio.com`
2. **Ctrl+F5** 强制刷新
3. F12 → **Network**，确认请求的是 `/api/v2/products` 而非 `/api/products`
4. 检查：首页商品、登录、后台 `/admin`、客服聊天

---

## 11. 日常更新代码

### 11.1 覆盖上传 / git pull 之后

```bash
cd /www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2

# 确认 .env 仍在（覆盖上传可能删掉）
ls -la .env laravel-api/.env

npm install --registry=https://registry.npmjs.org/
npm run build

cd laravel-api
PHP=/www/server/php/85/bin/php
$PHP composer.phar install --no-dev --optimize-autoloader
$PHP artisan migrate --force
$PHP artisan config:cache
$PHP artisan route:cache
cd ..

.venv/bin/python -m pip install -r py_backend/requirements.txt

pm2 restart all
nginx -s reload
```

### 11.2 仅改了前端

```bash
npm run build
pm2 restart yh-api
```

### 11.3 RBAC 权限有变更

```bash
cd laravel-api
/www/server/php/85/bin/php artisan db:seed --class=RolePermissionSeeder --force
```

管理员须 **重新登录** 后台。

---

## 12. 常见问题

### 12.1 `/api/v2/health` 返回 502

| 原因 | 处理 |
|------|------|
| `yh-laravel` 未运行 | `pm2 list`，`pm2 logs yh-laravel` |
| 缺少 `vendor/` | 执行 [第 5 步](#5-安装-laravel-依赖) |
| PM2 用了 PHP 7.4 | `ecosystem.config.js` 改用 `/www/server/php/85/bin/php` |
| `proc_open` 被禁用 | [步骤 2.3](#步骤-23-放开-php-禁用函数) |

### 12.2 `yh-laravel` 不断重启（↺ 持续增加）

```bash
pm2 logs yh-laravel --lines 30 --nostream
```

| 日志内容 | 处理 |
|----------|------|
| `vendor/autoload.php not found` | `composer install` |
| `proc_open is not available` | 放开禁用函数；或改用 `php -S` 方式（见第 8 步） |
| `Signals are not supported` / `pcntl` | 不要用 `artisan serve`，改用 `php -S ... server.php` |
| `putenv()` undefined | 从禁用函数中删除 `putenv` |

### 12.3 网页能打开但没有商品/数据

1. 检查 API：`curl -s http://127.0.0.1:8000/api/v2/products`
2. 若返回 `[]` → 数据库无数据，后台录入或迁移旧库
3. 若有数据但页面空 → 未重新构建前端：

```bash
grep VITE_USE_V2 .env    # 必须为 true
npm run build
pm2 restart yh-api
```

浏览器 **Ctrl+F5** 强刷。

### 12.4 登录失败 / 401

- 检查 `laravel-api/.env` 中 `SANCTUM_STATEFUL_DOMAINS` 是否包含你的域名
- 检查反代 `proxy_set_header Host` 是否为 `$host`（不是 `127.0.0.1`）
- 检查 `SESSION_DOMAIN=.yhthestudio.com` 是否与域名匹配

### 12.5 Nginx 保存报 `unexpected "}"`

- Laravel 的 `location` 块不要放在文件最末尾
- 不要粘贴在 `location ~ /purge` **内部**
- 确保每个 `location { }` 成对闭合
- 保存前执行 `nginx -t` 查看具体行号

### 12.6 固件上传 413

增大 Nginx `client_max_body_size 512m` 并重载。

### 12.7 从旧 SQLite 迁移数据

```bash
# 上传 data/yhthestudio.db 到项目目录后
cd /www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2
.venv/bin/python -m py_backend.migrate_sqlite_to_mysql
```

### 12.9 后台登录或题库/固件上传异常

**当前架构（V2.2+）**：后台统一走 **Laravel Sanctum**（`/api/v2`），Node 只负责**上传代发**和 **Telegram**，浏览器不再需要 Node 的 `connect.sid`。

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 列表/设置页 401 | Laravel 会话失效或 PM2 重启后 boot id 变化 | 重新登录后台 |
| 上传失败 | Node 未运行或 `NODE_INTERNAL_SECRET` 不一致 | 检查 `pm2 logs yh-api`，确认根目录与 `laravel-api/.env` 密钥一致 |
| 旧接口 410 | 浏览器仍访问已停用 `/api/admin/*` | 重新 `npm run build`，确保走 `/api/v2` |

**验证 Laravel 后台会话**（F12 Console）：

```javascript
fetch('/api/v2/auth/admin/me', { credentials: 'include' }).then(r => r.json()).then(console.log)
```

应返回 `{ admin: { ... }, permissions: [...] }`。

### 12.9.1 题库 / 固件列表加载失败（503 / 403）

| 状态码 | 常见原因 | 处理 |
|--------|----------|------|
| **503** | `yh-py` 未运行，或 `laravel-api/.env` 缺少 `PY_DB_URL` | `pm2 status` 确认 yh-py online；`curl http://127.0.0.1:5100/health` |
| **403** | 账号无 `question.view` / `firmware.view` 权限 | 后台「角色管理」分配权限，或使用 super_admin |
| **401** | Laravel 会话失效 | 重新登录后台 |

**验证 Python RPC**（SSH）：

```bash
curl -s -X POST http://127.0.0.1:5100/rpc \
  -H 'Content-Type: application/json' \
  -d '{"op":"questions.findAll","args":{}}' | head -c 200
```

**验证 Laravel 接口**（浏览器 F12，已登录后台）：

```javascript
fetch('/api/v2/admin/questions', { credentials: 'include' }).then(r => r.json()).then(console.log)
fetch('/api/v2/admin/device-firmwares', { credentials: 'include' }).then(r => r.json()).then(console.log)
```

### 12.10 查看日志

```bash
pm2 logs yh-api --lines 50
pm2 logs yh-laravel --lines 50
pm2 logs yh-py --lines 50
tail -f logs/combined.log
```

---

## 附录：部署检查清单（打印对照）

```
□ PHP 8.2+ 已安装，扩展 fileinfo / pdo_mysql / redis 已启用
□ putenv、proc_open 已从禁用函数中移除
□ MySQL 库 yhthestudio_web 已创建
□ Redis 已启动
□ 根目录 .env 已配置（VITE_USE_V2_API=true）
□ laravel-api/.env 已配置（DB、Sanctum、Redis）
□ laravel-api/vendor 已安装（composer install）
□ artisan migrate + seed 已执行
□ npm run build 已执行，dist/ 存在
□ Python .venv 已安装依赖
□ PM2 三个进程 online（yh-laravel / yh-api / yh-py）
□ Nginx 已配置 /api/v2/、/sanctum/ → 8000
□ 反代 Host 为 $host
□ curl https://域名/api/v2/health 返回 200
□ 浏览器 Ctrl+F5 后商品/登录正常
```

---

**文档版本**：V2.1.0 · 2026-06 · 已根据宝塔生产环境实测更新
