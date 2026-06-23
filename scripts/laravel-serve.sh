#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHP="$("$ROOT/scripts/resolve-php.sh")"
cd "$ROOT/laravel-api"
exec "$PHP" artisan serve --host=127.0.0.1 --port=8000
