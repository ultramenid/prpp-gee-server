const express = require("express");
const { ee } = require("../services/earthEngine");
const {
  ASSETS,
  LTKL_KABUPATEN_LIST,
  LULC_ORIGINAL_CLASSES,
  LULC_REMAPPED_CLASSES,
  STACK_KEYS,
  STACK_LABELS,
  STACK_COLORS,
} = require("../config/assets");
const { parseSingleYear, parseYearList, parseYearRange } = require("../utils/yearValidation");

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
    const mapbiomasImage = ee.Image(ASSETS.mapbiomasIndonesiaC41);
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

// 100% Stacked Bar — percentage composition of land cover per LTKL kabupaten
// for a single year (default 2024). Returns one row per sub-region with each
// stack label as a percentage (0-100).
// Supports drill-down filters:
//   (none)                 -> group by kabupaten
//   ?kab=<name>            -> group by kecamatan within that kabupaten
//   ?kab=<name>&kec=<name> -> group by desa within that kecamatan
//   ?kab=<name>&kec=<name>&des=<name> -> single desa row (frontend renders as pie)
router.get("/stack-chart", async (req, res, next) => {
  try {
    const selectedYear = parseSingleYear(req.query.year, 2024);
    const { kab, kec, des } = req.query;
    const yearBand = "classification_" + selectedYear;

    // Validate hierarchy
    if (des && !kec) {
      return res.status(400).json({ error: "Parameter kec diperlukan ketika des diberikan." });
    }
    if (kec && !kab) {
      return res.status(400).json({ error: "Parameter kab diperlukan ketika kec diberikan." });
    }
    if (kab && !LTKL_KABUPATEN_LIST.includes(kab)) {
      return res.status(400).json({ error: `Kabupaten "${kab}" tidak ditemukan dalam daftar LTKL.` });
    }

    const mapbiomasImage = ee.Image(ASSETS.mapbiomasIndonesiaC41).select(yearBand).rename("class");
    const kecCollection = ee.FeatureCollection(ASSETS.kecamatanCollection);
    const desCollection = ee.FeatureCollection(ASSETS.desaCollection);

    // Determine drill-down level and sub-regions to process
    let level = "kabupaten";
    let nameKey = "kabupaten";
    let regions = [];

    if (des) {
      level = "desa";
      nameKey = "des";
      regions = [{
        name: des,
        collection: desCollection
          .filter(ee.Filter.eq("kab", kab))
          .filter(ee.Filter.eq("kec", kec))
          .filter(ee.Filter.eq("des", des)),
      }];
    } else if (kec) {
      level = "kecamatan";
      nameKey = "des";
      const desaList = await new Promise((resolve, reject) =>
        desCollection
          .filter(ee.Filter.eq("kab", kab))
          .filter(ee.Filter.eq("kec", kec))
          .aggregate_array("des")
          .evaluate((value, err) => (err ? reject(err) : resolve(value)))
      );
      regions = (desaList || []).map((desaName) => ({
        name: desaName,
        collection: desCollection
          .filter(ee.Filter.eq("kab", kab))
          .filter(ee.Filter.eq("kec", kec))
          .filter(ee.Filter.eq("des", desaName)),
      }));
    } else if (kab) {
      level = "kabupaten";
      nameKey = "kec";
      const kecList = await new Promise((resolve, reject) =>
        kecCollection
          .filter(ee.Filter.eq("kab", kab))
          .aggregate_array("kec")
          .evaluate((value, err) => (err ? reject(err) : resolve(value)))
      );
      regions = (kecList || []).map((kecName) => ({
        name: kecName,
        collection: kecCollection
          .filter(ee.Filter.eq("kab", kab))
          .filter(ee.Filter.eq("kec", kecName)),
      }));
    } else {
      level = "kabupaten";
      nameKey = "kabupaten";
      regions = LTKL_KABUPATEN_LIST.map((kabupatenName) => ({
        name: kabupatenName,
        collection: kecCollection.filter(ee.Filter.eq("kab", kabupatenName)),
      }));
    }

    // Process each sub-region individually (client-side loop — consistent with sankey)
    const allRows = [];
    for (const { name, collection } of regions) {
      const pixelAreaHa = ee.Image.pixelArea().divide(1e4);

      const areaByClass = pixelAreaHa.addBands(mapbiomasImage).reduceRegion({
        reducer: ee.Reducer.sum().group({ groupField: 1 }),
        geometry: collection.geometry(),
        scale: 30,
        maxPixels: 1e13,
      });

      const groups = ee.List(
        ee.Algorithms.If(areaByClass.contains("groups"), areaByClass.get("groups"), [])
      );

      const rawGroups = await new Promise((resolve, reject) =>
        groups.evaluate((value, err) => (err ? reject(err) : resolve(value)))
      );

      const areaDict = {};
      for (const item of rawGroups || []) {
        areaDict[String(item.group)] = Number(item.sum);
      }

      let total = 0;
      for (const key of STACK_KEYS) {
        total += areaDict[key] || 0;
      }

      const row = { name, total_ha: total };
      for (let i = 0; i < STACK_LABELS.length; i++) {
        const key = STACK_KEYS[i];
        const area = areaDict[key] || 0;
        row[STACK_LABELS[i]] = total > 0 ? (area / total) * 100 : 0;
      }

      allRows.push(row);
    }

    res.json({
      year: selectedYear,
      level,
      nameKey,
      rows: allRows,
      labels: STACK_LABELS,
      colors: STACK_COLORS,
      keys: STACK_KEYS,
    });
  } catch (err) {
    next(err);
  }
});

// Sankey transition — land-cover change matrix between two years.
// Returns ECharts-compatible nodes + links using the same colors/labels as the stack chart.
// Strategy: process each sub-region individually (fast geometry) then aggregate results in
// Node.js — avoids GEE timeout on a single massive region.
// Supports drill-down filters:
//   ?kab=<name>            -> aggregate totals for the kabupaten; details per kecamatan
//   ?kab=<name>&kec=<name> -> aggregate totals for the kecamatan; details per desa
//   ?kab=<name>&kec=<name>&des=<name> -> totals for the desa only (no details)
router.get("/sankey-transition", async (req, res, next) => {
  try {
    const { startYear, endYear } = parseYearRange(req.query.startYear, req.query.endYear, { start: 2013, end: 2024 });
    const { kab, kec, des } = req.query;

    const mapbiomasImage = ee.Image(ASSETS.mapbiomasIndonesiaC41);
    const kecCollection = ee.FeatureCollection(ASSETS.kecamatanCollection);
    const desCollection = ee.FeatureCollection(ASSETS.desaCollection);

    if (des && !kec) {
      return res.status(400).json({ error: "Parameter kec diperlukan ketika des diberikan." });
    }
    if (kec && !kab) {
      return res.status(400).json({ error: "Parameter kab diperlukan ketika kec diberikan." });
    }
    if (kab && !LTKL_KABUPATEN_LIST.includes(kab)) {
      return res.status(400).json({ error: `Kabupaten "${kab}" tidak ditemukan dalam daftar LTKL.` });
    }

    const stackKeysNumbers = STACK_KEYS.map(Number);

    const startImage = mapbiomasImage
      .select("classification_" + startYear)
      .rename("start");
    const endImage = mapbiomasImage
      .select("classification_" + endYear)
      .rename("end");

    const startStack = startImage.remap(stackKeysNumbers, stackKeysNumbers);
    const endStack = endImage.remap(stackKeysNumbers, stackKeysNumbers);

    // Encode start->end transition as a single integer so one grouped reducer
    // can count every combination (e.g. class 3 -> class 76 becomes 3076).
    const transitionImage = startStack.multiply(1000).add(endStack).rename("transition");
    const pixelAreaHa = ee.Image.pixelArea().divide(1e4);

    // Determine drill-down level and the list of sub-regions to process.
    let level = "kabupaten";
    let detailsLabel = "Kabupaten";
    let regions = []; // { key: detail name, collection: ee.FeatureCollection }

    if (des) {
      level = "desa";
      detailsLabel = null;
      regions = [{
        key: des,
        collection: desCollection
          .filter(ee.Filter.eq("kab", kab))
          .filter(ee.Filter.eq("kec", kec))
          .filter(ee.Filter.eq("des", des)),
      }];
    } else if (kec) {
      level = "kecamatan";
      detailsLabel = "Desa";
      const desaList = await new Promise((resolve, reject) =>
        desCollection
          .filter(ee.Filter.eq("kab", kab))
          .filter(ee.Filter.eq("kec", kec))
          .aggregate_array("des")
          .evaluate((value, err) => (err ? reject(err) : resolve(value)))
      );
      regions = (desaList || []).map((desaName) => ({
        key: desaName,
        collection: desCollection
          .filter(ee.Filter.eq("kab", kab))
          .filter(ee.Filter.eq("kec", kec))
          .filter(ee.Filter.eq("des", desaName)),
      }));
    } else if (kab) {
      level = "kabupaten";
      detailsLabel = "Kecamatan";
      const kecList = await new Promise((resolve, reject) =>
        kecCollection
          .filter(ee.Filter.eq("kab", kab))
          .aggregate_array("kec")
          .evaluate((value, err) => (err ? reject(err) : resolve(value)))
      );
      regions = (kecList || []).map((kecName) => ({
        key: kecName,
        collection: kecCollection
          .filter(ee.Filter.eq("kab", kab))
          .filter(ee.Filter.eq("kec", kecName)),
      }));
    } else {
      level = "kabupaten";
      detailsLabel = "Kabupaten";
      regions = LTKL_KABUPATEN_LIST.map((kabupatenName) => ({
        key: kabupatenName,
        collection: kecCollection.filter(ee.Filter.eq("kab", kabupatenName)),
      }));
    }

    // Accumulate transition counts (total + per sub-region details).
    const aggregated = {}; // code -> totalValue
    const perDetail = {};  // code -> { detailName: value }

    for (const { key, collection } of regions) {
      const areaByTransition = pixelAreaHa.addBands(transitionImage).reduceRegion({
        reducer: ee.Reducer.sum().group({ groupField: 1 }),
        geometry: collection.geometry(),
        scale: 30,
        maxPixels: 1e13,
      });

      const groups = ee.List(
        ee.Algorithms.If(areaByTransition.contains("groups"), areaByTransition.get("groups"), [])
      );

      const rawGroups = await new Promise((resolve, reject) =>
        groups.evaluate((value, err) => (err ? reject(err) : resolve(value)))
      );

      for (const item of rawGroups || []) {
        const code = Number(item.group);
        const value = Number(item.sum);
        if (value <= 0) continue;
        aggregated[code] = (aggregated[code] || 0) + value;
        if (detailsLabel) {
          if (!perDetail[code]) perDetail[code] = {};
          perDetail[code][key] = value;
        }
      }
    }

    const startLabels = STACK_LABELS.map((label) => `${label} (${startYear})`);
    const endLabels = STACK_LABELS.map((label) => `${label} (${endYear})`);

    const nodes = [...startLabels, ...endLabels].map((name, index) => ({
      name,
      itemStyle: { color: STACK_COLORS[index % STACK_COLORS.length] },
    }));

    const links = [];
    for (const [code, value] of Object.entries(aggregated)) {
      const startClass = Math.floor(Number(code) / 1000);
      const endClass = Number(code) % 1000;

      if (value <= 0) continue;

      const sourceIndex = stackKeysNumbers.indexOf(startClass);
      const targetIndex = stackKeysNumbers.indexOf(endClass);
      if (sourceIndex === -1 || targetIndex === -1) continue;

      links.push({
        source: startLabels[sourceIndex],
        target: endLabels[targetIndex],
        value,
        details: perDetail[code] || {},
      });
    }

    links.sort((a, b) => b.value - a.value);

    res.json({
      startYear,
      endYear,
      level,
      detailsLabel,
      nodes,
      links,
      labels: STACK_LABELS,
      colors: STACK_COLORS,
      keys: STACK_KEYS,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
