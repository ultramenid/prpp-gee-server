require("dotenv").config({ path: ".env" });
const ee = require("@google/earthengine");
const app = require("./app");

const privateKey = {
  type: "service_account",
  project_id: process.env.PROJECT_ID,
  private_key_id: process.env.PRIVATE_KEY_ID,
  private_key: process.env.PRIVATE_KEY,
  client_email: process.env.CLIENT_EMAIL,
  client_id: process.env.CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.CLIENT_X509_CERT_URL,
  universe_domain: "googleapis.com",
};

const port = process.env.PORT || 8000;

// --- GEE Authentication & Server Start ---
console.log("Authenticating Earth Engine API using private key...");
ee.data.authenticateViaPrivateKey(
  privateKey,
  () => {
    console.log("Authentication successful.");
    ee.initialize(
      null,
      null,
      () => {
        console.log("Earth Engine client library initialized.");
        app.listen(port);
        console.log(`Listening on port ${port}`);
      },
      (err) => {
        console.error("Earth Engine initialization failed:", err);
        console.error(
          "Please make sure you have created a service account and have been approved.\n" +
            "Visit https://developers.google.com/earth-engine/service_account#how-do-i-create-a-service-account to learn more."
        );
      }
    );
  },
  (err) => {
    console.error("Earth Engine authentication failed:", err);
  }
);

// Export app for Vercel serverless deployment
module.exports = app;
