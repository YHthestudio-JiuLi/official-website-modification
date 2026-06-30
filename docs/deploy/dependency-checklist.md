# 部署附录：依赖与检查清单（V2.1.1）

> 本文档由 `DEPLOY.md` 拆分而来，聚焦依赖安装与上线核对。

---

## 附录 A：项目依赖与插件清单（完整）

> 部署前对照本表逐项安装。**缺任一「必须」项可能导致验单失败、商品图过大、接口 500 等问题。**

### A.1 系统级软件（宝塔软件商店）

| 软件 | 版本 | 用途 |
|------|------|------|
| Nginx | 较新版本 | HTTPS、静态资源、PHP-FPM、fastcgi_cache |
| MySQL | 8.0+ | 主数据库 `yhthestudio_web` |
| Redis | 推荐 | Laravel Session / 缓存 / 队列 |
| PHP | **8.2+**（建议 8.5） | Laravel V2 API（PHP-FPM 模式） |
| Composer | 最新 | 安装 Laravel 依赖 |
| Node.js | **18+** | 前端构建、Node 网关（`:3000`） |
| PM2 管理器 | 最新 | 守护 `yh-api`、`yh-py` 进程 |
| Python | **3.9+** | FastAPI 数据库 RPC（`:5100`） |

生产推荐：**Laravel 走 PHP-FPM**，不再用 PM2 跑 `yh-laravel:8000`（见 `scripts/setup-laravel-fpm.sh`）。

---

### A.2 PHP 扩展（宝塔 → PHP → 安装扩展）

| 扩展 | 必须 | 项目中的用途 |
|------|------|--------------|
| fileinfo | ✅ | Laravel Filesystem、Composer |
| pdo_mysql | ✅ | MySQL 读写 |
| redis | ✅ | Session、Redis 缓存、队列 |
| mbstring | ✅ | Laravel 字符串处理 |
| openssl | ✅ | HTTPS、加密 |
| tokenizer | ✅ | Laravel 解析 |
| xml、ctype、json | ✅ | Laravel 核心 |
| bcmath | ✅ | USDT 链上金额十六进制转十进制 |
| gmp | ✅ | USDT TRC20 验单：TRON 地址 Base58 编码；缺则验单必失败 |
| gd（WebP） | ✅ | 商品图写入磁盘时自动压缩为 WebP（`ProductImageDiskCache`） |
| curl | ✅ | 请求 TronGrid（验单）、顺丰丰桥（物流） |
| pcntl | 建议 | Laravel 队列 worker、控制台信号 |
| intl | 可选 | Guzzle 国际化域名（一般不影响主流程） |

**PHP 禁用函数须移除**（宝塔 → PHP → 禁用函数）：

```
putenv
proc_open
pcntl_signal
pcntl_alarm
```

一键自检：

```bash
PHP=/www/server/php/85/bin/php
$PHP -m | grep -Ei 'fileinfo|pdo_mysql|redis|bcmath|gmp|gd|curl|mbstring|openssl'
$PHP -r "echo 'gmp='.(extension_loaded('gmp')?'yes':'no').PHP_EOL;"
$PHP -r "echo 'webp='.(function_exists('imagewebp')?'yes':'no').PHP_EOL;"
$PHP -r "var_dump(function_exists('putenv'), function_exists('proc_open'));"
```

---

### A.3 Laravel Composer 依赖（`laravel-api/composer.json`）

生产环境执行 `composer install --no-dev` 后包含：

| 包名 | 用途 |
|------|------|
| laravel/framework ^11 | V2 API 主框架 |
| laravel/sanctum | 用户 / 管理员 SPA 会话认证 |
| laravel/tinker | 运维调试（`artisan tinker`） |
| spatie/laravel-permission | RBAC 角色权限 |
| spatie/laravel-activitylog | 后台操作审计日志 |

PHP 版本要求：`^8.2`（见 `composer.json`）。

---

### A.4 Node.js npm 依赖（根目录 `package.json`）

**运行时（`dependencies`）— PM2 `yh-api` 使用：**

| 包名 | 用途 |
|------|------|
| express | HTTP 网关、静态 `dist/` |
| ws | 在线客服 WebSocket |
| express-session、csurf、cors | 会话与 CSRF（Legacy 路由） |
| bcryptjs | 密码哈希（Legacy） |
| multer、form-data | 文件上传 |
| axios、hpagent | HTTP 客户端（Telegram 代理等） |
| winston | 日志 |
| dotenv | 读取根目录 `.env` |
| compression、express-rate-limit | 压缩与限流 |
| vue、vue-router、pinia、vue-i18n | 前端框架（构建产物在 `dist/`） |
| element-plus、@element-plus/icons-vue | 管理后台 UI |
| uuid、body-parser | 通用工具 |

**构建时（`devDependencies`）— 仅 `npm run build` 需要：**

| 包名 | 用途 |
|------|------|
| vite | 前端打包 |
| @vitejs/plugin-vue | Vue SFC 支持 |
| esbuild | Vite 底层编译 |

Node 版本：**18+**。

---

### A.5 Python pip 依赖（`py_backend/requirements.txt`）

PM2 `yh-py` 使用虚拟环境 `.venv` 安装：

| 包名 | 用途 |
|------|------|
| fastapi | RPC HTTP 服务 |
| uvicorn[standard] | ASGI 服务器（`:5100`） |
| pydantic | 请求/响应校验 |
| python-multipart | 文件上传解析 |
| pymysql | MySQL 驱动（`DB_BACKEND=mysql`） |
| cryptography | 设备验签等加密运算 |

安装命令：

```bash
python3 -m venv .venv
.venv/bin/pip install -r py_backend/requirements.txt
```

> **切勿**把 macOS/Windows 的 `.venv` 上传到 Linux 服务器，须在本机重建。

---

### A.6 外部 API 与可选集成

| 服务 | 配置位置 | 说明 |
|------|----------|------|
| TronGrid | 无需密钥 | USDT TRC20 链上验单（`api.trongrid.io`） |
| 顺丰丰桥 | `laravel-api/.env`：`SF_PARTNER_ID`、`SF_CHECK_WORD`、`SF_SANDBOX` | 路由查询 `EXP_RECE_SEARCH_ROUTES`；生产网关 `https://bspgw.sf-express.com/std/service`；须在开放平台配置 **IP 白名单** |
| Telegram Bot | 根目录 `.env`：`TELEGRAM_*` | 订单/论坛/客服通知（中国大陆服务器需配置代理） |

---

### A.7 Nginx / PHP-FPM 相关

由 `scripts/setup-laravel-fpm.sh` 写入站点 extension 配置：

| 能力 | 说明 |
|------|------|
| PHP-FPM 8.5 | 承接 `/api/v2/*`、`/sanctum/*` |
| fastcgi_cache | 公开 API 响应缓存（`yh_v2_api` zone） |
| 商品图直出 | `/api/v2/product-images/*` 命中磁盘 WebP |
| `/assets/` 强缓存 | `immutable` 一年，提升移动端加载 |
| `client_max_body_size` | 固件/题库大文件上传（建议 ≥ 512m） |

---

### A.8 PM2 进程一览

| 进程名 | 端口 | 说明 |
|--------|------|------|
| `yh-api` | 3000 | Node：静态页、聊天、上传、Telegram |
| `yh-py` | 5100 | Python：MySQL RPC |
| `yh-laravel` | 8000 | **仅本地开发**；生产用 PHP-FPM，默认不启 |

---

## 附录 B：部署检查清单（打印对照）

```
□ PHP 8.2+ 已安装
□ PHP 扩展：fileinfo / pdo_mysql / redis / bcmath / gmp / gd(webp) / curl 已启用
□ putenv、proc_open 已从禁用函数中移除
□ MySQL 库 yhthestudio_web 已创建
□ Redis 已启动
□ 根目录 .env 已配置（VITE_USE_V2_API=true）
□ laravel-api/.env 已配置（DB、Sanctum、Redis、顺丰可选）
□ laravel-api/vendor 已安装（composer install）
□ artisan migrate + seed 已执行
□ npm run build 已执行，dist/ 存在
□ Python .venv 已安装依赖（fastapi / uvicorn / pymysql 等）
□ PM2：yh-api、yh-py online；生产已启用 PHP-FPM（非 yh-laravel:8000）
□ Nginx extension：/api/v2/、/sanctum/ → PHP-FPM
□ 反代 Host 为 $host
□ curl https://域名/api/v2/health 返回 200
□ gmp=yes（验单）、imagewebp=yes（商品图压缩）
□ 浏览器 Ctrl+F5 后商品/登录/验单正常
```

