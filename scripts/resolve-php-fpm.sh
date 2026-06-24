#!/usr/bin/env bash
# 查找宝塔 PHP-FPM 的 unix socket（与 resolve-php.sh 的 PHP 大版本对应，如 8.5 → php-cgi-85.sock）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PHP_BIN="${LARAVEL_PHP:-$("$SCRIPT_DIR/resolve-php.sh")}"

ver="$("$PHP_BIN" -r 'echo (int) PHP_MAJOR_VERSION . (int) PHP_MINOR_VERSION;')"

for sock in \
  "/tmp/php-cgi-${ver}.sock" \
  "/dev/shm/php-cgi-${ver}.sock" \
  "/tmp/php-cgi.sock"; do
  if [ -S "$sock" ]; then
    echo "$sock"
    exit 0
  fi
done

echo "未找到 PHP-FPM socket（版本 ${ver}）。请在宝塔 → PHP 8.x → 服务 → 启动 FPM" >&2
exit 1
