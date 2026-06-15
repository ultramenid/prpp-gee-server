// Reference baseline: rolls the Level-2 transition matrix up into the 5 Level-1
// groups for Sigi (1990 -> 2024) and compares against the MapBiomas platform
// Sankey CSV export (which is Level-1). NOTE: the live /sankey-transition endpoint
// now uses Collection 4.1 (to stay consistent with the /lulc map tiles), so this
// script intentionally uses ASSETS.mapbiomasIndonesia (Collection 4) and will NOT
// match current endpoint output. Kept to document the Collection-4 platform match.
// Run: node scripts/verify-sankey.js
require("dotenv").config();
const { ee, initializeEarthEngine } = require("../api/services/earthEngine");
const {
  ASSETS,
  STACK_KEYS,
  STACK_CLASSES,
  LEVEL1_GROUPS,
} = require("../api/config/assets");

const KAB = "Sigi";
const START = 1990;
const END = 2024;

// class id -> Level-1 group label (from STACK_CLASSES.grp + LEVEL1_GROUPS.label)
const GROUP_LABEL = Object.fromEntries(LEVEL1_GROUPS.map((g) => [g.key, g.label]));
const CLASS_TO_GROUP_LABEL = Object.fromEntries(
  STACK_CLASSES.map((c) => [Number(c.key), GROUP_LABEL[c.grp]])
);

// Platform Sankey CSV export (ha), keyed "startGroup -> endGroup".
const CSV = {
  "Hutan->Hutan": 401494.07,
  "Hutan->Tumbuhan Non-Hutan": 16734.49,
  "Hutan->Pertanian": 514.44,
  "Hutan->Non Vegetasi": 191.98,
  "Hutan->Tubuh Air": 59.43,
  "Tumbuhan Non-Hutan->Hutan": 6683.33,
  "Tumbuhan Non-Hutan->Tumbuhan Non-Hutan": 57808.45,
  "Tumbuhan Non-Hutan->Pertanian": 2904.46,
  "Tumbuhan Non-Hutan->Non Vegetasi": 1478.34,
  "Tumbuhan Non-Hutan->Tubuh Air": 182.42,
  "Pertanian->Hutan": 288.59,
  "Pertanian->Tumbuhan Non-Hutan": 6735.24,
  "Pertanian->Pertanian": 15966.45,
  "Pertanian->Non Vegetasi": 3023.17,
  "Pertanian->Tubuh Air": 268.76,
  "Non Vegetasi->Hutan": 62.65,
  "Non Vegetasi->Tumbuhan Non-Hutan": 187.61,
  "Non Vegetasi->Pertanian": 147.75,
  "Non Vegetasi->Non Vegetasi": 3185.48,
  "Non Vegetasi->Tubuh Air": 13.94,
  "Tubuh Air->Hutan": 248.54,
  "Tubuh Air->Tumbuhan Non-Hutan": 252.57,
  "Tubuh Air->Pertanian": 142.12,
  "Tubuh Air->Non Vegetasi": 267.35,
  "Tubuh Air->Tubuh Air": 3697.93,
};

const evaluate = (obj) =>
  new Promise((resolve, reject) =>
    obj.evaluate((v, err) => (err ? reject(err) : resolve(v)))
  );

(async () => {
  await initializeEarthEngine();

  const geometry = ee
    .FeatureCollection(ASSETS.kabupatenCollection)
    .filter(ee.Filter.eq("kab", KAB))
    .geometry();

  const mapbiomasImage = ee.Image(ASSETS.mapbiomasIndonesia);
  const stackKeysNumbers = STACK_KEYS.map(Number);

  const startStack = mapbiomasImage
    .select("classification_" + START)
    .remap(stackKeysNumbers, stackKeysNumbers)
    .rename("start");
  const endStack = mapbiomasImage
    .select("classification_" + END)
    .remap(stackKeysNumbers, stackKeysNumbers)
    .rename("end");

  const transitionImage = startStack.multiply(1000).add(endStack).rename("transition");

  const areaByTransition = ee.Image.pixelArea()
    .divide(1e4)
    .addBands(transitionImage)
    .reduceRegion({
      reducer: ee.Reducer.sum().group({ groupField: 1 }),
      geometry,
      scale: 30,
      maxPixels: 1e13,
      tileScale: 8,
    });

  const rawGroups = await evaluate(
    ee.List(
      ee.Algorithms.If(areaByTransition.contains("groups"), areaByTransition.get("groups"), [])
    )
  );

  // Roll Level-2 transition codes up into Level-1 group->group transitions.
  const ours = {};
  for (const item of rawGroups || []) {
    const code = Number(item.group);
    const value = Number(item.sum);
    if (value <= 0) continue;
    const startClass = Math.floor(code / 1000);
    const endClass = code % 1000;
    const startGroup = CLASS_TO_GROUP_LABEL[startClass];
    const endGroup = CLASS_TO_GROUP_LABEL[endClass];
    if (!startGroup || !endGroup) continue;
    const key = `${startGroup}->${endGroup}`;
    ours[key] = (ours[key] || 0) + value;
  }

  console.log(`\n=== ${KAB} ${START} -> ${END} Level-1 Sankey (Collection 4 + kabupaten boundary) ===`);
  console.log("transition".padEnd(42), "CSV".padStart(12), "ours".padStart(12), "Δ".padStart(10));

  const allKeys = new Set([...Object.keys(CSV), ...Object.keys(ours)]);
  let csvTotal = 0;
  let ourTotal = 0;
  let maxAbsDelta = 0;
  for (const key of allKeys) {
    const csv = CSV[key] || 0;
    const our = ours[key] || 0;
    csvTotal += csv;
    ourTotal += our;
    maxAbsDelta = Math.max(maxAbsDelta, Math.abs(our - csv));
    console.log(
      key.padEnd(42),
      csv.toFixed(2).padStart(12),
      our.toFixed(2).padStart(12),
      (our - csv).toFixed(2).padStart(10)
    );
  }
  console.log(
    "TOTAL".padEnd(42),
    csvTotal.toFixed(2).padStart(12),
    ourTotal.toFixed(2).padStart(12),
    (ourTotal - csvTotal).toFixed(2).padStart(10)
  );
  console.log(`\nmax |Δ| per transition: ${maxAbsDelta.toFixed(2)} ha`);
  process.exit(0);
})().catch((err) => {
  console.error("FAILED:", err && err.message ? err.message : err);
  process.exit(1);
});
