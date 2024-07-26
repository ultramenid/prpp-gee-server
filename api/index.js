/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Default entry point for App Engine Node.js runtime. Defines a
 * web service which returns the mapid to be used by clients to display map
 * tiles showing slope computed in real time from SRTM DEM data. See
 * accompanying README file for instructions on how to set up authentication.
 */
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

app.get('/radd', async (_, response) => {
  var startDate = 24000;
  var endDate   = 24365;

  var geometry  = ee.FeatureCollection("users/adhityadhyaksa/PPRP_Boundary");
  var radd_alert = ee.ImageCollection('projects/radar-wur/raddalert/v1')
                    .filterMetadata('geography','equals','asia')
                    .filterMetadata('layer','contains','alert')
                    .map(function (i){
                      var date = i.select('Date').gte(startDate).and(i.select('Date').lte(endDate));
                      return i.updateMask(date).clip(geometry).selfMask();
                    }).filterBounds(geometry);
  var alert_image = radd_alert.mosaic()


  var AlertParam = {'opacity':1,
                    'bands':['Alert'],
                    'min':2,
                    'max':3,
                    'palette':['00c5ff','ff1313'],
                    'format':'PNG'
  };
  const res = alert_image.getMap(AlertParam);
  // console.log(res.urlFormat)
  response.send(res.urlFormat);

})



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