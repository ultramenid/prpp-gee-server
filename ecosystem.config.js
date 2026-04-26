module.exports = {
  apps: [
    {
      name: "prpp-gee-server",
      script: "api/index.js",

      // Number of instances — "max" uses all available CPU cores (cluster mode)
      // Use 1 if GEE auth state must not be shared across processes
      instances: 1,

      // Automatically restart if the process crashes
      autorestart: true,

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
