module.exports = {
  apps: [
    {
      name: 'workforce-api',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      listen_timeout: 10_000,
      kill_timeout: 5_000,
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
}
