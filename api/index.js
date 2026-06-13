require("dotenv").config({ path: ".env" });

const app = require("./app");
const { initializeEarthEngine } = require("./services/earthEngine");

const port = process.env.PORT || 8000;

initializeEarthEngine()
  .then(() => {
    const server = app.listen(port, () => {
      console.log(`Listening on port ${port}`);
    });

    // Without this handler a bind failure (e.g. EADDRINUSE when the port is
    // already taken) emits an unhandled 'error' event that crashes the process
    // with a raw stack trace. Under PM2 autorestart that becomes a tight
    // restart loop. Log a clear message and exit so PM2's restart guards can
    // back off instead of hammering.
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `Port ${port} is already in use — another process (dev server or a previous instance) is bound to it. Stop it or set a different PORT.`
        );
      } else {
        console.error("HTTP server error:", err);
      }
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error("Earth Engine startup failed:", err);
    process.exit(1);
  });
