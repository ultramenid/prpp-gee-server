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
  STACK_CLASSES,
  LEVEL1_GROUPS,
} = require("../config/assets");

// Level-2 class id -> Level-1 group key (from STACK_CLASSES.grp). Used to roll the
// 13-class transition matrix up into the 5 Level-1 groups for the Sankey, so the
// chart and tooltip show the Level-1 grouping while each group->group value stays
// the exact sum of its Level-2 children.
const CLASS_TO_GROUP_KEY = STACK_CLASSES.reduce((map, c) => {
  map[Number(c.key)] = c.grp;
  return map;
}, {});
// Class key (string) -> full class descriptor, for building the 2-level coverage
// hierarchy (Tingkat 1 group -> Tingkat 2 class) consumed by the sunburst chart.
const STACK_CLASS_BY_KEY = STACK_CLASSES.reduce((map, c) => {
  map[c.key] = c;
  return map;
}, {});
const LEVEL1_KEYS = LEVEL1_GROUPS.map((g) => g.key);
const LEVEL1_LABELS = LEVEL1_GROUPS.map((g) => g.label);
const LEVEL1_COLORS = LEVEL1_GROUPS.map((g) => g.color);
const { parseSingleYear, parseYearList, parseYearRange } = require("../utils/yearValidation");

const router = express.Router();

// Run an array of thunks (() => Promise) with a bounded number in flight at
// once, preserving result order. Keeps fan-out work (per-region × per-year EE
// reductions) parallel without opening an unbounded number of requests.
async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, tasks.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await tasks[currentIndex]();
    }
  });
  await Promise.all(workers);
  return results;
}

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
    const kabCollection = ee.FeatureCollection(ASSETS.kabupatenCollection);

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

// Stacked Bar — land-cover composition as a YEAR SERIES (default 1990-2024).
// Returns one row per year, each stack label carrying the ABSOLUTE area in
// hectares for that year; `total_ha` is the sum across all classes (used for
// the percentage shown in the tooltip).
// The drill level only changes the geometry scope — the chart is always a
// per-year trend for the focused region:
//   (none)                            -> all 9 LTKL kabupaten summed
//   ?kab=<name>                       -> that kabupaten
//   ?kab=<name>&kec=<name>            -> that kecamatan
//   ?kab=<name>&kec=<name>&des=<name> -> that desa
router.get("/stack-chart", async (req, res, next) => {
  try {
    const { startYear, endYear } = parseYearRange(req.query.startYear, req.query.endYear, {
      start: 1990,
      end: 2024,
    });
    const { kab, kec, des } = req.query;

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

    const mapbiomasImage = ee.Image(ASSETS.mapbiomasIndonesiaC41);
    const kabCollection = ee.FeatureCollection(ASSETS.kabupatenCollection);
    const kecCollection = ee.FeatureCollection(ASSETS.kecamatanCollection);
    const desCollection = ee.FeatureCollection(ASSETS.desaCollection);

    // Resolve the drill level into a list of LEAF regions to sum over. Area by
    // class is additive across disjoint regions, so we never union all 9
    // kabupaten into one giant multipolygon (that reduceRegion times out).
    // Instead each kabupaten is reduced separately (small, parallelizable
    // geometry — like the Sankey loop) and the per-year areas are summed in
    // Node. Kabupaten-level scopes use the clean kabupatenCollection boundary
    // (avoids the sliver loss from dissolving kecamatan); finer scopes use
    // kecamatan/desa.
    let level;
    let scope;
    let leafRegions; // [{ key, collection }]

    if (des) {
      level = "desa";
      scope = des;
      leafRegions = [{
        key: des,
        collection: desCollection
          .filter(ee.Filter.eq("kab", kab))
          .filter(ee.Filter.eq("kec", kec))
          .filter(ee.Filter.eq("des", des)),
      }];
    } else if (kec) {
      level = "kecamatan";
      scope = kec;
      leafRegions = [{
        key: kec,
        collection: kecCollection
          .filter(ee.Filter.eq("kab", kab))
          .filter(ee.Filter.eq("kec", kec)),
      }];
    } else if (kab) {
      level = "kabupaten";
      scope = kab;
      leafRegions = [{ key: kab, collection: kabCollection.filter(ee.Filter.eq("kab", kab)) }];
    } else {
      level = "ltkl";
      scope = "Semua Kabupaten LTKL";
      leafRegions = LTKL_KABUPATEN_LIST.map((kabupatenName) => ({
        key: kabupatenName,
        collection: kabCollection.filter(ee.Filter.eq("kab", kabupatenName)),
      }));
    }

    const pixelAreaHa = ee.Image.pixelArea().divide(1e4);

    const years = [];
    for (let year = startYear; year <= endYear; year++) years.push(year);

    // Grouped area-by-class reduction for one region + one year, as an EE
    // Feature. Reduces at the native 30 m scale with maxPixels high enough that
    // Earth Engine never coarsens (no bestEffort): coarsening picks a different
    // pixel scale per region+year, so its rounding error drifts year to year and
    // the year-over-year trend becomes noisy. Exact reduction costs ~20× more
    // compute but keeps each year's areas stable and comparable.
    const yearFeature = (geometry, yearValue) => {
      const band = ee.String("classification_").cat(ee.Number(yearValue).format("%d"));
      const classImage = mapbiomasImage.select(band).rename("class");
      const areaByClass = pixelAreaHa.addBands(classImage).reduceRegion({
        reducer: ee.Reducer.sum().group({ groupField: 1 }),
        geometry,
        scale: 30,
        maxPixels: 1e13,
        tileScale: 8,
      });
      return ee.Feature(null, {
        year: yearValue,
        groups: ee.Algorithms.If(areaByClass.contains("groups"), areaByClass.get("groups"), []),
      });
    };

    // One round-trip = one region × a batch of years. Exact reduction makes each
    // round-trip much heavier than the old bestEffort path, so we keep batches
    // small — finer-grained tasks parallelize better across the concurrency pool
    // and keep every single Earth Engine request well under its compute limit.
    const BATCH_SIZE = 3;
    const MAX_CONCURRENCY = 8;
    const tasks = [];
    for (const { collection } of leafRegions) {
      const geometry = collection.geometry();
      for (let i = 0; i < years.length; i += BATCH_SIZE) {
        const batchYears = years.slice(i, i + BATCH_SIZE);
        tasks.push(
          () =>
            new Promise((resolve, reject) =>
              ee
                .FeatureCollection(ee.List(batchYears).map((year) => yearFeature(geometry, year)))
                .evaluate((value, err) => (err ? reject(err) : resolve((value && value.features) || [])))
            ),
        );
      }
    }

    const taskResults = await runWithConcurrency(tasks, MAX_CONCURRENCY);

    // Sum area per class per year across every leaf region.
    const areaByYearByKey = {}; // year -> { classKey: hectares }
    for (const features of taskResults) {
      for (const feature of features) {
        const props = feature.properties || {};
        const year = Number(props.year);
        if (!areaByYearByKey[year]) areaByYearByKey[year] = {};
        for (const item of props.groups || []) {
          const key = String(item.group);
          areaByYearByKey[year][key] = (areaByYearByKey[year][key] || 0) + Number(item.sum);
        }
      }
    }

    const rows = years.map((year) => {
      const areaDict = areaByYearByKey[year] || {};

      let total = 0;
      for (const key of STACK_KEYS) total += areaDict[key] || 0;

      const row = { name: String(year), year, total_ha: total };
      for (let i = 0; i < STACK_LABELS.length; i++) {
        row[STACK_LABELS[i]] = areaDict[STACK_KEYS[i]] || 0;
      }
      return row;
    });

    res.json({
      startYear,
      endYear,
      level,
      scope,
      rows,
      labels: STACK_LABELS,
      colors: STACK_COLORS,
      keys: STACK_KEYS,
    });
  } catch (err) {
    next(err);
  }
});

// Coverage hierarchy — land-cover composition for a SINGLE year as a 2-level
// tree (Tingkat 1 group -> Tingkat 2 class), feeding the nested-donut/sunburst
// chart. Each group's value is the exact sum of its Level-2 children, so the
// inner ring (groups) and outer ring (classes) always reconcile. The drill
// level only changes the geometry scope (same boundaries as the stack chart):
//   (none)                            -> all 9 LTKL kabupaten summed
//   ?kab=<name>                       -> that kabupaten (clean boundary)
//   ?kab=<name>&kec=<name>            -> that kecamatan
//   ?kab=<name>&kec=<name>&des=<name> -> that desa
router.get("/coverage-hierarchy", async (req, res, next) => {
  try {
    const year = parseSingleYear(req.query.year, 2024);
    const { kab, kec, des } = req.query;

    if (des && !kec) {
      return res.status(400).json({ error: "Parameter kec diperlukan ketika des diberikan." });
    }
    if (kec && !kab) {
      return res.status(400).json({ error: "Parameter kab diperlukan ketika kec diberikan." });
    }
    if (kab && !LTKL_KABUPATEN_LIST.includes(kab)) {
      return res.status(400).json({ error: `Kabupaten "${kab}" tidak ditemukan dalam daftar LTKL.` });
    }

    const mapbiomasImage = ee.Image(ASSETS.mapbiomasIndonesiaC41);
    const kabCollection = ee.FeatureCollection(ASSETS.kabupatenCollection);
    const kecCollection = ee.FeatureCollection(ASSETS.kecamatanCollection);
    const desCollection = ee.FeatureCollection(ASSETS.desaCollection);

    // Resolve the drill level into a list of LEAF regions to sum over — area by
    // class is additive across disjoint regions, so each kabupaten is reduced
    // separately (small, parallelizable geometry) rather than unioning all 9
    // into one giant multipolygon. Kabupaten-level scopes use the clean
    // kabupatenCollection boundary (avoids the sliver loss from dissolving
    // kecamatan); finer scopes use kecamatan/desa.
    let level;
    let scope;
    let leafRegions;

    if (des) {
      level = "desa";
      scope = des;
      leafRegions = [{
        collection: desCollection
          .filter(ee.Filter.eq("kab", kab))
          .filter(ee.Filter.eq("kec", kec))
          .filter(ee.Filter.eq("des", des)),
      }];
    } else if (kec) {
      level = "kecamatan";
      scope = kec;
      leafRegions = [{
        collection: kecCollection
          .filter(ee.Filter.eq("kab", kab))
          .filter(ee.Filter.eq("kec", kec)),
      }];
    } else if (kab) {
      level = "kabupaten";
      scope = kab;
      leafRegions = [{ collection: kabCollection.filter(ee.Filter.eq("kab", kab)) }];
    } else {
      level = "ltkl";
      scope = "Semua Kabupaten LTKL";
      leafRegions = LTKL_KABUPATEN_LIST.map((kabupatenName) => ({
        collection: kabCollection.filter(ee.Filter.eq("kab", kabupatenName)),
      }));
    }

    const pixelAreaHa = ee.Image.pixelArea().divide(1e4);
    const classImage = mapbiomasImage.select("classification_" + year).rename("class");

    // Grouped area-by-class reduction for one region at native 30 m scale with no
    // coarsening (no bestEffort) — identical precision to the stack chart so a
    // shared year's totals agree across charts.
    const reduceAreaByClass = (geometry) => {
      const areaByClass = pixelAreaHa.addBands(classImage).reduceRegion({
        reducer: ee.Reducer.sum().group({ groupField: 1 }),
        geometry,
        scale: 30,
        maxPixels: 1e13,
        tileScale: 8,
      });
      const groups = ee.List(
        ee.Algorithms.If(areaByClass.contains("groups"), areaByClass.get("groups"), [])
      );
      return new Promise((resolve, reject) =>
        groups.evaluate((value, err) => (err ? reject(err) : resolve(value || [])))
      );
    };

    const MAX_CONCURRENCY = 8;
    const tasks = leafRegions.map(({ collection }) => () => reduceAreaByClass(collection.geometry()));
    const taskResults = await runWithConcurrency(tasks, MAX_CONCURRENCY);

    // Sum area per class across every leaf region.
    const areaByKey = {}; // classKey -> hectares
    for (const groups of taskResults) {
      for (const item of groups) {
        const key = String(item.group);
        areaByKey[key] = (areaByKey[key] || 0) + Number(item.sum);
      }
    }

    // Build the 2-level hierarchy from the single source (LEVEL1_GROUPS + the
    // class descriptors). Drop zero-area classes and empty groups so the donut
    // only renders slices that exist for this region/year.
    let totalHa = 0;
    const groups = LEVEL1_GROUPS.map((group) => {
      const children = group.children
        .map((classId) => {
          const cls = STACK_CLASS_BY_KEY[String(classId)];
          if (!cls) return null;
          const value = areaByKey[String(classId)] || 0;
          return { key: cls.key, label: cls.label, color: cls.color, value };
        })
        .filter((child) => child && child.value > 0);
      const value = children.reduce((sum, child) => sum + child.value, 0);
      totalHa += value;
      return { key: group.key, label: group.label, color: group.color, value, children };
    }).filter((group) => group.value > 0);

    res.json({ year, level, scope, total_ha: totalHa, groups });
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
    const kabCollection = ee.FeatureCollection(ASSETS.kabupatenCollection);
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

    // Determine drill-down level, the clean enclosing boundary used for the
    // headline transition totals, and the list of sub-regions used only for the
    // per-detail breakdown. Totals reduce over `aggregateGeometry` — the SAME
    // clean boundary the stack chart uses at each level (kabupatenCollection for
    // a kabupaten, kecamatan polygon for a kecamatan, desa polygon for a desa) —
    // so the two charts never disagree on a shared figure. The detail regions are
    // finer polygons whose slivers don't perfectly tile the parent, so their
    // per-detail values can sum to slightly less than the headline total. When
    // there is no single enclosing polygon (all-LTKL view), aggregateGeometry is
    // null and the totals are summed from the per-kabupaten detail reductions.
    let level = "kabupaten";
    let detailsLabel = "Kabupaten";
    let aggregateGeometry = null;
    let regions = []; // { key: detail name, collection: ee.FeatureCollection }

    if (des) {
      level = "desa";
      detailsLabel = null;
      aggregateGeometry = desCollection
        .filter(ee.Filter.eq("kab", kab))
        .filter(ee.Filter.eq("kec", kec))
        .filter(ee.Filter.eq("des", des))
        .geometry();
    } else if (kec) {
      level = "kecamatan";
      detailsLabel = "Desa";
      aggregateGeometry = kecCollection
        .filter(ee.Filter.eq("kab", kab))
        .filter(ee.Filter.eq("kec", kec))
        .geometry();
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
      aggregateGeometry = kabCollection.filter(ee.Filter.eq("kab", kab)).geometry();
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
        collection: kabCollection.filter(ee.Filter.eq("kab", kabupatenName)),
      }));
    }

    // Reduce the start->end transition area (grouped by transition code) over one
    // geometry at native 30 m scale with no coarsening — identical precision to
    // the stack chart so the two never disagree on a shared figure.
    const reduceTransitions = async (geometry) => {
      const areaByTransition = pixelAreaHa.addBands(transitionImage).reduceRegion({
        reducer: ee.Reducer.sum().group({ groupField: 1 }),
        geometry,
        scale: 30,
        maxPixels: 1e13,
        tileScale: 8,
      });
      const groups = ee.List(
        ee.Algorithms.If(areaByTransition.contains("groups"), areaByTransition.get("groups"), [])
      );
      return new Promise((resolve, reject) =>
        groups.evaluate((value, err) => (err ? reject(err) : resolve(value || [])))
      );
    };

    const aggregated = {}; // code -> totalValue (headline link width)
    const perDetail = {};  // code -> { detailName: value }

    // Headline totals from the clean enclosing boundary (matches the stack chart).
    // For the all-LTKL view there's no single polygon, so aggregateGeometry is
    // null and totals are accumulated from the per-kabupaten reductions below.
    if (aggregateGeometry) {
      for (const item of await reduceTransitions(aggregateGeometry)) {
        const code = Number(item.group);
        const value = Number(item.sum);
        if (value <= 0) continue;
        aggregated[code] = (aggregated[code] || 0) + value;
      }
    }

    // Per sub-region breakdown (and, when aggregateGeometry is null, the totals).
    for (const { key, collection } of regions) {
      const rawGroups = await reduceTransitions(collection.geometry());
      for (const item of rawGroups) {
        const code = Number(item.group);
        const value = Number(item.sum);
        if (value <= 0) continue;
        if (!aggregateGeometry) {
          aggregated[code] = (aggregated[code] || 0) + value;
        }
        if (detailsLabel) {
          if (!perDetail[code]) perDetail[code] = {};
          perDetail[code][key] = value;
        }
      }
    }

    // Roll the Level-2 transition matrix up into the 5 Level-1 groups. Each
    // group->group flow is the exact sum of its Level-2 children, and the
    // per-region details are summed the same way so the tooltip breakdown stays
    // consistent with the headline flow.
    const groupAggregated = {}; // "startGroupKey>endGroupKey" -> value
    const groupDetail = {};     // "startGroupKey>endGroupKey" -> { detailName: value }
    for (const [code, value] of Object.entries(aggregated)) {
      if (value <= 0) continue;
      const startGroup = CLASS_TO_GROUP_KEY[Math.floor(Number(code) / 1000)];
      const endGroup = CLASS_TO_GROUP_KEY[Number(code) % 1000];
      if (!startGroup || !endGroup) continue;
      const groupKey = `${startGroup}>${endGroup}`;
      groupAggregated[groupKey] = (groupAggregated[groupKey] || 0) + value;
      if (detailsLabel && perDetail[code]) {
        if (!groupDetail[groupKey]) groupDetail[groupKey] = {};
        for (const [detailName, detailValue] of Object.entries(perDetail[code])) {
          groupDetail[groupKey][detailName] = (groupDetail[groupKey][detailName] || 0) + detailValue;
        }
      }
    }

    const startLabels = LEVEL1_LABELS.map((label) => `${label} (${startYear})`);
    const endLabels = LEVEL1_LABELS.map((label) => `${label} (${endYear})`);

    const nodes = [...startLabels, ...endLabels].map((name, index) => ({
      name,
      itemStyle: { color: LEVEL1_COLORS[index % LEVEL1_COLORS.length] },
    }));

    const links = [];
    for (const [groupKey, value] of Object.entries(groupAggregated)) {
      if (value <= 0) continue;
      const [startGroup, endGroup] = groupKey.split(">");
      const sourceIndex = LEVEL1_KEYS.indexOf(startGroup);
      const targetIndex = LEVEL1_KEYS.indexOf(endGroup);
      if (sourceIndex === -1 || targetIndex === -1) continue;

      links.push({
        source: startLabels[sourceIndex],
        target: endLabels[targetIndex],
        value,
        details: groupDetail[groupKey] || {},
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
      labels: LEVEL1_LABELS,
      colors: LEVEL1_COLORS,
      keys: LEVEL1_KEYS,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
