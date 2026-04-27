// PM2 process manager — déploiement sans Docker (option VPS direct)
// Usage : pm2 start ecosystem.config.cjs --env production

module.exports = {
  apps: [
    {
      name: 'titisite',
      script: 'server/index.js',
      instances: 1,         // SQLite single-writer — ne pas mettre cluster
      exec_mode: 'fork',
      node_args: '--experimental-vm-modules',

      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },

      // Redémarre automatiquement si la mémoire dépasse 512 Mo
      max_memory_restart: '512M',

      // Logs horodatés
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,

      // Redémarrage gracieux (attend que les connexions en cours finissent)
      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 10000,
    },
  ],
};
