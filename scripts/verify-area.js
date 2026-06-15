// Reference baseline: shows that MapBiomas Collection 4 + the kabupatenCollection
// boundary reproduce the platform's CSV export for Sigi. NOTE: the live endpoints
// now use Collection 4.1 (to stay consistent with the /lulc map tiles), so this
// script intentionally uses ASSETS.mapbiomasIndonesia (Collection 4) and will
// NOT match current endpoint output — 4.1 moves ~11k ha from class 13 -> 3.
// Kept to document the Collection-4 platform match.
// Run: node scripts/verify-area.js
require("dotenv").config();
const { ee, initializeEarthEngine } = require("../api/services/earthEngine");
const { ASSETS, STACK_CLASSES } = require("../api/config/assets");

const KAB = "Sigi";

// MapBiomas platform export (ha) for Sigi, by class id.
const CSV = {
  1990: { 3: 418994, 13: 69057, 21: 13607, 40: 12672, 35: 3, 25: 647, 24: 2950, 33: 4609 },
  2024: { 3: 408777, 13: 81718, 21: 5719, 40: 13954, 35: 3, 25: 1726, 24: 6421, 33: 4222 },
};

const evaluate = (obj) =>
  new Promise((resolve, reject) =>
    obj.evaluate((v, err) => (err ? reject(err) : resolve(v)))
  );

async function areaByClass(geometry, year) {
  const classImage = ee
    .Image(ASSETS.mapbiomasIndonesia)
    .select("classification_" + year)
    .rename("class");
  const reduced = ee.Image.pixelArea()
    .divide(1e4)
    .addBands(classImage)
    .reduceRegion({
      reducer: ee.Reducer.sum().group({ groupField: 1 }),
      geometry,
      scale: 30,
      maxPixels: 1e13,
      tileScale: 8,
    });
  const groups = await evaluate(
    ee.List(ee.Algorithms.If(reduced.contains("groups"), reduced.get("groups"), []))
  );
  const byKey = {};
  for (const g of groups || []) byKey[String(g.group)] = Number(g.sum);
  return byKey;
}

(async () => {
  await initializeEarthEngine();
  const geometry = ee
    .FeatureCollection(ASSETS.kabupatenCollection)
    .filter(ee.Filter.eq("kab", KAB))
    .geometry();

  for (const year of [1990, 2024]) {
    const ours = await areaByClass(geometry, year);
    console.log(`\n=== ${KAB} ${year} (Collection 4 + kabupaten boundary) ===`);
    console.log("class".padEnd(22), "CSV".padStart(10), "ours".padStart(10), "Δ".padStart(8));
    let csvTotal = 0;
    let ourTotal = 0;
    for (const c of STACK_CLASSES) {
      const csv = CSV[year][c.key] || 0;
      const our = ours[c.key] || 0;
      if (csv === 0 && our === 0) continue;
      csvTotal += csv;
      ourTotal += our;
      console.log(
        `${c.key} ${c.label}`.padEnd(22),
        csv.toString().padStart(10),
        our.toFixed(0).padStart(10),
        (our - csv).toFixed(0).padStart(8)
      );
    }
    console.log(
      "TOTAL".padEnd(22),
      csvTotal.toString().padStart(10),
      ourTotal.toFixed(0).padStart(10),
      (ourTotal - csvTotal).toFixed(0).padStart(8)
    );
  }
  process.exit(0);
})().catch((err) => {
  console.error("FAILED:", err && err.message ? err.message : err);
  process.exit(1);
});
