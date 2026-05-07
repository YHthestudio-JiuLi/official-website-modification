module.exports = {
  apps: [
    {
      name: 'yh-api',
      script: 'api-server.js',
      cwd: '/www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2',
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
        TRUST_PROXY: '1'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOST: '0.0.0.0',
        PY_DB_URL: 'http://127.0.0.1:5100',
        TRUST_PROXY: '1'
      }
    },
    {
      name: 'yh-py',
      script: '/www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2/.venv/bin/uvicorn',
      args: 'py_backend.main:app --host 127.0.0.1 --port 5100',
      interpreter: 'none',
      cwd: '/www/wwwroot/yhthestudio.com/official-website-modification_v0.1.2',
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
  ]
}
