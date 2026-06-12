const express = require("express");
const { ee } = require("../services/earthEngine");
const {
  ASSETS,
  LTKL_KABUPATEN_LIST,
  LULC_ORIGINAL_CLASSES,
  LULC_REMAPPED_CLASSES,
} = require("../config/assets");
const { parseSingleYear, parseYearList } = require("../utils/yearValidation");

const router = express.Router();

router.get("/lulc", async (req, res, next) => {
  try {
    const { kab, kec, des } = req.query;
    const selectedYear = parseSingleYear(req.query.year, 1992);

    let regionCollection = ee.FeatureCollection(ASSETS.desaCollection);
    if (kab) regionCollection = regionCollection.filter(ee.Filter.eq("kab", kab));
    if (kec) regionCollection = regionCollection.filter(ee.Filter.eq("kec", kec));
    if (des) regionCollection = regionCollection.filter(ee.Filter.eq("des", des));

    const lulcImage = ee.Image(ASSETS.lulcCollection(selectedYear)).clip(regionCollection);

    const mapInfo = await lulcImage.getMap();
    res.send(mapInfo.urlFormat);
  } catch (err) {
    next(err);
  }
});

router.get("/lulc-stats", async (req, res, next) => {
  try {
    const yearList = parseYearList(req.query.year, [2024]);
    const mapbiomasImage = ee.Image(ASSETS.mapbiomasIndonesia);
    const kabCollection = ee.FeatureCollection(ASSETS.kecamatanCollection);

    let resultByYear = ee.Dictionary({});

    for (const year of yearList) {
      let allAreas = ee.Dictionary({});

      for (const kabupaten of LTKL_KABUPATEN_LIST) {
        const kabRegion = kabCollection.filter(ee.Filter.eq("kab", kabupaten));

        const classifiedImage = mapbiomasImage
          .select("classification_" + year)
          .clip(kabRegion)
          .remap(LULC_ORIGINAL_CLASSES, LULC_REMAPPED_CLASSES)
          .rename(kabupaten);

        const pixelAreaHectares = ee.Image.pixelArea().divide(1e4);

        const areaByClass = pixelAreaHectares.addBands(classifiedImage).reduceRegion({
          reducer: ee.Reducer.sum().group({ groupField: 1 }),
          geometry: kabRegion.geometry(),
          scale: 30,
          maxPixels: 1e13,
        });

        const statsFormatted = ee.List(areaByClass.get("groups")).map(function (item) {
          const entry = ee.Dictionary(item);
          return [
            ee.Number(entry.get("group")).format("%02d"),
            ee.Number(entry.get("sum")).format("%.0f"),
          ];
        });

        const statsDictionary = ee.Dictionary(statsFormatted.flatten());
        const forestAreaHectares = ee.Number(statsDictionary.get("03", 0));
        allAreas = allAreas.set(kabupaten, forestAreaHectares);
      }

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

    const result = await new Promise((resolve, reject) =>
      resultByYear.evaluate((value, err) => (err ? reject(err) : resolve(value)))
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
