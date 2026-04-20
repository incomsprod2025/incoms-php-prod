// ecosystem.config.js — PM2 Process Manager
module.exports = {
  apps: [{
    name:        'incoms',
    script:      'server.js',
    cwd:         '/var/www/incoms/backend',
    instances:   1,           // 1 suffit pour SQLite (pas multi-process)
    autorestart: true,
    watch:       false,
    max_memory_restart: '256M',
    env_production: {
      NODE_ENV:   'production',
      PORT:       3000,
      JWT_SECRET: 'REMPLACEZ_PAR_VOTRE_SECRET_FORT',
      DB_PATH:    '/var/www/incoms/backend/data/incoms.db',
    },
    error_file:  '/var/log/pm2/incoms-error.log',
    out_file:    '/var/log/pm2/incoms-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
