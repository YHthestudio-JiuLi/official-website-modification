#!/usr/bin/env bash
# 在宝塔 nginx.conf 的 http{} 顶部写入 yh-v2-fcgi-cache.conf include（须早于 vhost）
# 用法: sudo bash scripts/ensure-nginx-fcgi-cache.sh [nginx.conf路径]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_MAIN="${1:-/www/server/nginx/conf/nginx.conf}"
FCGI_SNIP_SRC="$ROOT/scripts/nginx/yh-v2-fcgi-cache-http.snippet"
FCGI_SNIP_DST="/www/server/nginx/conf/yh-v2-fcgi-cache.conf"
INCLUDE_LINE='    include /www/server/nginx/conf/yh-v2-fcgi-cache.conf;'

if [ ! -f "$FCGI_SNIP_SRC" ]; then
  echo "[FAIL] 缺少 $FCGI_SNIP_SRC" >&2
  exit 1
fi
if [ ! -f "$NGINX_MAIN" ]; then
  echo "[FAIL] 缺少 $NGINX_MAIN" >&2
  exit 1
fi

sed "s|__APP_ROOT__|${ROOT}|g" "$FCGI_SNIP_SRC" > "$FCGI_SNIP_DST"

python3 - "$NGINX_MAIN" "$INCLUDE_LINE" << 'PY'
import shutil
import sys
import re

path, include_line = sys.argv[1], sys.argv[2]
if not include_line.endswith("\n"):
    include_line += "\n"

with open(path, "r", encoding="utf-8", errors="replace") as f:
    text = f.read()

lines = [l for l in text.splitlines(True) if "yh-v2-fcgi-cache.conf" not in l]
out = []
inserted = False
i = 0
while i < len(lines):
    line = lines[i]
    if (
        not inserted
        and re.match(r"^\s*http\s*$", line)
        and i + 1 < len(lines)
        and re.match(r"^\s*\{\s*$", lines[i + 1])
    ):
        out.append(line)
        out.append(lines[i + 1])
        out.append(include_line)
        inserted = True
        i += 2
        continue
    out.append(line)
    if not inserted and re.search(r"^\s*http\s*\{", line):
        out.append(include_line)
        inserted = True
    i += 1

if not inserted:
    print("[FAIL] 未在 nginx.conf 中找到 http { 块", file=sys.stderr)
    sys.exit(1)

new_text = "".join(out)
if new_text != text:
    shutil.copy2(path, path + ".bak")
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_text)
    print("[ OK ] 已在 http{} 顶部写入 fastcgi_cache include")
else:
    print("[ OK ] fastcgi_cache include 已在正确位置")
PY

if nginx -t 2>/dev/null; then
  nginx -s reload
  echo "[ OK ] Nginx 已重载"
else
  echo "[FAIL] nginx -t 仍失败，请检查:" >&2
  nginx -t || true
  exit 1
fi
