require("dotenv").config({ path: ".env" });

const app = require("./app");
const { initializeEarthEngine } = require("./services/earthEngine");

const port = process.env.PORT || 8000;

initializeEarthEngine()
  .then(() => {
    app.listen(port, () => {
      console.log(`Listening on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("Earth Engine startup failed:", err);
    process.exitCode = 1;
  });
