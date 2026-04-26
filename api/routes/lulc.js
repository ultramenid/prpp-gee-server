const express = require("express");
const ee = require("@google/earthengine");
const { ASSETS, LTKL_KABUPATEN_LIST, LULC_ORIGINAL_CLASSES, LULC_REMAPPED_CLASSES } = require("../config/assets");

const router = express.Router();

// GET /gee/lulc — LULC map tile URL for a given year and optional region filters
// kab = kabupaten (regency), kec = kecamatan (district), des = desa (village)
router.get("/lulc", async (req, res) => {
  try {
    const { kab, kec, des, year = 1992 } = req.query;
    const selectedYear = parseInt(year, 10);
    if (isNaN(selectedYear)) return res.status(400).send("year must be a valid number");

    let regionCollection = ee.FeatureCollection(ASSETS.desaCollection);
    if (kab) regionCollection = regionCollection.filter(ee.Filter.eq("kab", kab));
    if (kec) regionCollection = regionCollection.filter(ee.Filter.eq("kec", kec));
    if (des) regionCollection = regionCollection.filter(ee.Filter.eq("des", des));

    const lulcImage = ee.Image(ASSETS.lulcCollection(selectedYear)).clip(regionCollection);

    const mapInfo = await lulcImage.getMap();
    res.send(mapInfo.urlFormat);
  } catch (err) {
    console.error("Error in /gee/lulc:", err);
    res.status(500).send("Internal server error");
  }
});

// GET /gee/lulc-stats — LULC area stats (hectares) per kabupaten, sorted by area descending
// Accepts ?year=2020 or comma-separated ?year=2020,2021
router.get("/lulc-stats", async (req, res) => {
  try {
    const yearParam = req.query.year;
    let yearList = [];

    if (yearParam) {
      // Allow comma-separated years: ?year=2020,2021
      yearList = String(yearParam)
        .split(",")
        .map((v) => parseInt(v.trim(), 10))
        .filter((n) => !isNaN(n));
    }

    if (yearList.length === 0) yearList = [2024]; // default year

    const mapbiomasImage = ee.Image(ASSETS.mapbiomasIndonesia);
    const kabCollection = ee.FeatureCollection(ASSETS.kecamatanCollection);

    let resultByYear = ee.Dictionary({});

    for (const year of yearList) {
      let allAreas = ee.Dictionary({});

      for (const kabupaten of LTKL_KABUPATEN_LIST) {
        // Filter to the target kabupaten boundary
        const kabRegion = kabCollection.filter(ee.Filter.eq("kab", kabupaten));

        // Select the classification band for this year, remap to target classes
        const classifiedImage = mapbiomasImage
          .select("classification_" + year)
          .clip(kabRegion)
          .remap(LULC_ORIGINAL_CLASSES, LULC_REMAPPED_CLASSES)
          .rename(kabupaten);

        // Pixel area image in hectares
        const pixelAreaHectares = ee.Image.pixelArea().divide(1e4);

        // Compute area per class within the kabupaten bounds
        const areaByClass = pixelAreaHectares.addBands(classifiedImage).reduceRegion({
          reducer: ee.Reducer.sum().group({ groupField: 1 }),
          geometry: kabRegion.bounds(),
          scale: 30,
          maxPixels: 1e13,
        });

        // Reshape groups array into a flat { classCode: area } dictionary
        const statsFormatted = ee.List(areaByClass.get("groups")).map(function (item) {
          const entry = ee.Dictionary(item);
          return [
            ee.Number(entry.get("group")).format("%02d"),
            ee.Number(entry.get("sum")).format("%.0f"),
          ];
        });

        const statsDictionary = ee.Dictionary(statsFormatted.flatten());

        // Class "03" corresponds to the remapped forest class
        const forestAreaHectares = ee.Number(statsDictionary.get("03"));
        allAreas = allAreas.set(kabupaten, forestAreaHectares);
      }

      // Build a FeatureCollection to sort kabupaten by area descending
      const kabFeatures = ee.FeatureCollection(
        allAreas.keys().map(function (key) {
          return ee.Feature(null, {
            kab: key,
            area: ee.Number(allAreas.get(key)),
          });
        })
      );

      const sortedFeatures = kabFeatures.sort("area", false);
      const sortedList = sortedFeatures
        .aggregate_array("kab")
        .zip(sortedFeatures.aggregate_array("area"));

      resultByYear = resultByYear.set(String(year), sortedList);
    }

    // Evaluate the full GEE computation graph once, asynchronously (non-blocking)
    const result = await new Promise((resolve, reject) =>
      resultByYear.evaluate((value, err) => (err ? reject(err) : resolve(value)))
    );

    return res.json(result);
  } catch (err) {
    console.error("Error in /gee/lulc-stats:", err);
    return res.status(500).json({ error: "Failed computing stats", details: err?.message ?? err });
  }
});

module.exports = router;
