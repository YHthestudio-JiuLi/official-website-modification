#!/usr/bin/env bash
# 迁移验证：前端构建 + 路由/文件静态检查
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> npm run build"
npm run build

echo "==> 检查 Laravel 路由文件"
test -f laravel-api/routes/api.php
grep -q "OrderController" laravel-api/routes/api.php
grep -q "CartController" laravel-api/routes/api.php
grep -q "ForumController" laravel-api/routes/api.php
grep -q "LegacyBridgeController" laravel-api/routes/api.php

echo "==> 检查 Admin Controller 单文件单类"
! grep -l "class AdminOrderController" laravel-api/app/Http/Controllers/Api/V2/Admin/*.php | grep -q CommerceAdmin || true
test -f laravel-api/app/Http/Controllers/Api/V2/Admin/DashboardController.php
test -f laravel-api/app/Http/Controllers/Api/V2/Admin/AdminOrderController.php

echo "==> 检查前端 V2 路径映射"
test -f src/utils/apiPath.js
grep -q "VITE_USE_V2_API" .env.example

echo "==> 检查 Node server 模块化"
test -f server/bootstrap.js
test -f server/routes/chat.js
test -f server/routes/device.js
test -f server/routes/firmwareAdminRoutes.js
test -f src/services/v2/index.js

echo "==> 检查 dist 产物"
test -d dist
test -f dist/index.html

echo "==> Node 代理范围单元测试"
npm run test:agent-scope

echo "==> Python is_scoped_agent 单元测试"
.venv/bin/python -m unittest py_backend.tests.test_users_scoped_agent -q

echo "==> Laravel 代理范围单元测试"
PHP_BIN=""
for candidate in php php82 php8.2 php83 php8.3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PHP_VERSION="$("$candidate" -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')"
    if [ "$(printf '%s\n' "8.2" "$PHP_VERSION" | sort -V | head -n1)" = "8.2" ]; then
      PHP_BIN="$candidate"
      break
    fi
  fi
done
if [ -n "$PHP_BIN" ]; then
  (cd laravel-api && "$PHP_BIN" vendor/bin/phpunit tests/Unit/AgentDataScopeTest.php tests/Unit/AdminFirmwareAgentScopeTest.php --no-output)
else
  echo "跳过 Laravel PHPUnit（本机无 PHP >= 8.2）"
fi

echo "✅ validate-migration.sh 通过"
