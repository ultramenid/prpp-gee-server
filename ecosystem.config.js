module.exports = {
  apps: [
    {
      name: "prpp-gee-server",
      script: "api/index.js",

      // Number of instances — "max" uses all available CPU cores (cluster mode)
      // Use 1 if GEE auth state must not be shared across processes
      instances: "max",

      // Automatically restart if the process crashes
      autorestart: true,

      // Restart guards — keep a crash-on-startup (e.g. port already in use)
      // from becoming a tight infinite restart loop. A process must stay up
      // min_uptime to count as a successful start; after max_restarts rapid
      // failures PM2 gives up and marks it "errored" instead of hammering.
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 4000,

      // Restart if memory exceeds 512 MB (GEE responses can be large)
      max_memory_restart: "512M",

      // Watch is disabled in production — use CI/CD to deploy instead
      watch: false,

      // Environment variables for production
      env_production: {
        NODE_ENV: "production",
        PORT: 8000,
      },
    },
  ],
};
