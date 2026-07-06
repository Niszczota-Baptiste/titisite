// PM2 — fichier de processus pour titisite
// Utilisation :
//   pm2 start deploy/ecosystem.config.cjs --env production
//   pm2 save && pm2 startup   (pour démarrer au boot)

module.exports = {
  apps: [
    {
      name: 'titisite',
      script: 'server/index.js',

      // ES Modules : pas besoin de flag supplémentaire sous Node 20+
      node_args: '',

      // Production uniquement — les variables sensibles sont dans .env
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },

      // Process unique (SQLite n'est pas multi-process safe)
      instances: 1,
      exec_mode: 'fork',

      watch: false,
      // World imports accept files up to 512 MB and WorldEdit manipulates
      // regions in memory, so a 512 MB ceiling could kill the process mid-import
      // (the upload is lost, the user sees a network error). 1 GB leaves head-
      // room for those legitimate peaks while still guarding against a leak.
      max_memory_restart: '1G',

      // Logs
      error_file: '/var/log/titisite/error.log',
      out_file:   '/var/log/titisite/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Redémarre automatiquement si le process plante
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
