/**
 * PM2 生产配置（宝塔）
 * APP_ROOT / PHP_BIN 可由 scripts/deploy.sh 自动注入。
 *
 * Laravel 生产推荐 PHP-FPM（bash scripts/setup-laravel-fpm.sh），
 * 生产默认 LARAVEL_PM2=0（PHP-FPM）；仅本地无 FPM 时设 LARAVEL_PM2=1 启动 yh-laravel。
 */
const path = require('path')
const fs = require('fs')

const APP_ROOT = process.env.APP_ROOT || path.resolve(__dirname)
const PHP_BIN = process.env.PHP_BIN || '/www/server/php/85/bin/php'
const fpmMarker = path.join(APP_ROOT, '.laravel-fpm-enabled')
// 默认不启内置 PHP 服务；显式 LARAVEL_PM2=1 且未启用 FPM 标记时才启动 yh-laravel
const useLaravelPm2 = (process.env.LARAVEL_PM2 ?? '0') === '1' && !fs.existsSync(fpmMarker)

/** @type {import('pm2').StartOptions[]} */
const apps = []

if (useLaravelPm2) {
  apps.push({
    name: 'yh-laravel',
    script: `${APP_ROOT}/laravel-api/scripts/start-server.sh`,
    interpreter: 'bash',
    cwd: `${APP_ROOT}/laravel-api`,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    env: {
      APP_ENV: 'production',
      PHP_BIN
    },
    env_production: {
      APP_ENV: 'production',
      PHP_BIN
    }
  })
}

apps.push(
  {
    name: 'yh-api',
    script: 'api-server.js',
    cwd: APP_ROOT,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    env: {
      NODE_ENV: 'production',
      PORT: '3000',
      HOST: '0.0.0.0',
      PY_DB_URL: 'http://127.0.0.1:5100',
      TRUST_PROXY: '1',
      BLOCK_LEGACY_MIGRATED_API: 'true'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: '3000',
      HOST: '0.0.0.0',
      PY_DB_URL: 'http://127.0.0.1:5100',
      TRUST_PROXY: '1',
      BLOCK_LEGACY_MIGRATED_API: 'true'
    }
  },
  {
    name: 'yh-py',
    script: `${APP_ROOT}/.venv/bin/uvicorn`,
    args: 'py_backend.main:app --host 127.0.0.1 --port 5100',
    interpreter: 'none',
    cwd: APP_ROOT,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    env: {
      PYTHONUNBUFFERED: '1'
    },
    env_production: {
      PYTHONUNBUFFERED: '1'
    }
  }
)

module.exports = { apps }
