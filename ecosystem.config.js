// PM2 进程管理配置文件
// 使用方法: pm2 start ecosystem.config.js
// 或者: pm2 start server.js --name yhthestudio

module.exports = {
  apps: [{
    name: 'yhthestudio',
    script: 'server.js',
    instances: 1, // 单实例模式，如需多进程可使用 'max' 或具体数字
    exec_mode: 'fork', // fork 模式（单核推荐），多核可使用 'cluster'
    watch: false, // 生产环境建议关闭文件监听
    max_memory_restart: '500M', // 内存超过500M自动重启
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOST: '0.0.0.0'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true, // 自动重启
    max_restarts: 10, // 最大重启次数
    min_uptime: '10s' // 最小运行时间，少于此时长内的重启不计入重启次数
  }]
};

