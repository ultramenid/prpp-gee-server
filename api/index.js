
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
    const { kab, kec, des, year = 1992 } = req.query;
    const yearInt = parseInt(year, 10);

    let geometry = ee.FeatureCollection("projects/ee-dataaurigagee/assets/LTKL/desa");

    if (kab) geometry = geometry.filter(ee.Filter.eq("kab", kab));
    if (kec) geometry = geometry.filter(ee.Filter.eq("kec", kec));
    if (des) geometry = geometry.filter(ee.Filter.eq("des", des));

    const MBI4_1 = `projects/ee-dataaurigagee/assets/LTKL/LTKLcollection2/LTKL_mbi41_${yearInt}`;
    const LULCyear = ee.Image(MBI4_1).clip(geometry);

    const mapInfo = await LULCyear.getMap();
    res.send(mapInfo.urlFormat);
  } catch (err) {
    console.error("❌ Error creating map:", err);
    res.status(500).send("Error generating map");
  }
});


app.get('/gee/lulc-stats', async (req, res) => {
  try {
    // 1 YEAR ONLY — default = 2024
    const year = req.query.year ? parseInt(req.query.year, 10) : 2024;

    var originalClass   = [3,5,76];
    var remapClass      = [3,3,3];

    var LTKLkabList     = [
      'Gorontalo','Siak','Musi Banyuasin','Kapuas Hulu','Bone Bolango',
      'Sintang','Sanggau','Aceh Tamiang','Sigi'
    ];

    var MBI41 = ee.Image('projects/mapbiomas-public/assets/indonesia/lulc/collection4/mapbiomas_indonesia_collection4_coverage_v2');
    var LTKLkab = ee.FeatureCollection('projects/ee-dataaurigagee/assets/LTKL/kecamatan');

    var allAreas = ee.Dictionary({});

    // LOOP KABUPATEN
    for (var kabId in LTKLkabList) {
      var kabupaten = LTKLkabList[kabId];
      var kab_aoi   = LTKLkab.filterMetadata('kab', 'equals', kabupaten);

      var MBIyear = MBI41
        .select('classification_' + year)
        .clip(kab_aoi)
        .remap(originalClass, remapClass)
        .rename(kabupaten);

      var areaScope = ee.Image.pixelArea().divide(1E4);

      var areaHectare = areaScope.addBands(MBIyear).reduceRegion({
        reducer: ee.Reducer.sum().group({ groupField: 1 }),
        geometry: kab_aoi.bounds(),
        scale: 30,
        maxPixels: 1E13
      });

      var statsFormatted = ee.List(areaHectare.get('groups'))
        .map(function(i) {
          var d = ee.Dictionary(i);
          return [
            ee.Number(d.get('group')).format("%02d"),
            ee.Number(d.get('sum')).format('%.0f')
          ];
        });

      var statsDictionary = ee.Dictionary(statsFormatted.flatten());

      var areaValue = ee.Number(statsDictionary.get('03'));
      allAreas = allAreas.set(kabupaten, areaValue);
    }

    var fc = ee.FeatureCollection(
      allAreas.keys().map(function(k) {
        return ee.Feature(null, {
          kab: k,
          area: ee.Number(allAreas.get(k))
        });
      })
    );

    var sorted = fc.sort('area', false);

    var sortedList = sorted.aggregate_array('kab')
      .zip(sorted.aggregate_array('area'));

    // ---- Evaluate result ----
    const finalData = await new Promise((resolve, reject) => {
      sortedList.getInfo((info, err) => {
        if (err) return reject(err);
        resolve(info);
      });
    });

    return res.json({
      year,
      data: finalData
    });

  } catch (err) {
    console.error("Error /gee/lulc-stats:", err);
    return res.status(500).json({ error: "Failed computing stats", details: err?.message || err });
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