const ee = require("@google/earthengine");

let initializationPromise;

function buildPrivateKey() {
  return {
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
}

function initializeEarthEngine() {
  if (!initializationPromise) {
    initializationPromise = new Promise((resolve, reject) => {
      console.log("Authenticating Earth Engine API using private key...");
      ee.data.authenticateViaPrivateKey(
        buildPrivateKey(),
        () => {
          console.log("Authentication successful.");
          ee.initialize(
            null,
            null,
            () => {
              console.log("Earth Engine client library initialized.");
              resolve();
            },
            reject
          );
        },
        reject
      );
    });
  }

  return initializationPromise;
}

module.exports = { ee, initializeEarthEngine };
