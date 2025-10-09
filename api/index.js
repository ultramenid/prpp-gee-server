
require("dotenv").config({ path: ".env" })
const ee = require('@google/earthengine');
const express = require('express');
const privateKey = {
  "type": "service_account",
  "project_id": process.env.PROJECT_ID,
  "private_key_id": process.env.PRIVATE_KEY_ID,
  "private_key": process.env.PRIVATE_KEY,
  "client_email": process.env.CLIENT_EMAIL,
  "client_id": process.env.CLIENT_ID,
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/my-app-react%40ee-malichamdan.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
}  
const port = process.env.PORT || 8000;
const cors = require('cors');
const app = express();



app.use(cors());

// Define endpoint at /mapid.
app.get('/mapid',async (_, response) => {
  const vis = { bands: ["B4", "B3", "B2"], min: 0, max: 2000 };
  const mosaic = ee
      .ImageCollection("COPERNICUS/S2_SR")
      .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
      .filterDate("2019-01-01", "2020-12-31")
      .mosaic();
  
  const res = await mosaic.getMap(vis);
  console.log(res.urlFormat)
  response.send(res.urlFormat);
});




app.get("/gee/lulc", async (req, res) => {
  try {
    const { kab, kec, des } = req.query;

    let geometry = ee.FeatureCollection("projects/ee-dataaurigagee/assets/LTKL/desa");

    if (kab) geometry = geometry.filter(ee.Filter.eq("kab", kab));
    if (kec) geometry = geometry.filter(ee.Filter.eq("kec", kec));
    if (des) geometry = geometry.filter(ee.Filter.eq("des", des));

    const MBI4_1 = ee.Image("projects/ee-dataaurigagee/assets/LTKL/LTKL_mbi41_colored");
    const LULCyear = MBI4_1.clip(geometry);

    const mapInfo = await LULCyear.getMap();
    res.send(mapInfo.urlFormat);
  } catch (err) {
    console.error("❌ Error creating map:", err);
    res.status(500).send("Error generating map");
  }
});



console.log('Authenticating Earth Engine API using private key...');
ee.data.authenticateViaPrivateKey(
    privateKey,
    () => {
      console.log('Authentication successful.');
      ee.initialize(
          null, null,
          () => {
            console.log('Earth Engine client library initialized.');
            app.listen(port);
            console.log(`Listening on port ${port}`);
          },
          (err) => {
            console.log(err);
            console.log(
                `Please make sure you have created a service account and have been approved.
Visit https://developers.google.com/earth-engine/service_account#how-do-i-create-a-service-account to learn more.`);
          });
    },
    (err) => {
      console.log(err);
    });