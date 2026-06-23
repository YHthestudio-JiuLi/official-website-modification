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

echo "==> 检查 dist 产物"
test -d dist
test -f dist/index.html

echo "✅ validate-migration.sh 通过"
