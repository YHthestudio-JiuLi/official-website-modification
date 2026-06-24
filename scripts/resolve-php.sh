#!/usr/bin/env bash
# 查找可用于 Laravel 的 PHP（>= 8.2），不覆盖系统默认 php 7.4
set -euo pipefail

if [ -n "${LARAVEL_PHP:-}" ] && [ -x "$LARAVEL_PHP" ]; then
  echo "$LARAVEL_PHP"
  exit 0
fi

for candidate in \
  /www/server/php/85/bin/php \
  /www/server/php/84/bin/php \
  /www/server/php/83/bin/php \
  /www/server/php/82/bin/php \
  /opt/homebrew/opt/php@8.5/bin/php \
  /opt/homebrew/opt/php@8.4/bin/php \
  /opt/homebrew/opt/php@8.3/bin/php \
  /opt/homebrew/opt/php@8.2/bin/php \
  /usr/local/opt/php@8.5/bin/php \
  /usr/local/opt/php@8.4/bin/php \
  /usr/local/opt/php@8.3/bin/php \
  /usr/local/opt/php@8.2/bin/php; do
  if [ -x "$candidate" ]; then
    echo "$candidate"
    exit 0
  fi
done

if command -v php >/dev/null 2>&1 && php -r 'exit(version_compare(PHP_VERSION, "8.2.0", ">=") ? 0 : 1);'; then
  command -v php
  exit 0
fi

echo "未找到 PHP >= 8.2。请执行: brew install php@8.3" >&2
exit 1
