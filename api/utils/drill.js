const { ee } = require("../services/earthEngine");
const { LTKL_KABUPATEN_LIST } = require("../config/assets");
const { badRequest } = require("./httpErrors");

// Validate the drill-down hierarchy: desa needs kecamatan, kecamatan needs
// kabupaten, and a supplied kabupaten must be one of the LTKL program regions.
// Throws HttpError so the app's error handler turns it into a 400 JSON response,
// matching the inline `res.status(400).json({ error })` it replaces.
function assertDrillParams(kabupaten, kecamatan, desa) {
  if (desa && !kecamatan) {
    throw badRequest("Parameter kec diperlukan ketika des diberikan.");
  }
  if (kecamatan && !kabupaten) {
    throw badRequest("Parameter kab diperlukan ketika kec diberikan.");
  }
  if (kabupaten && !LTKL_KABUPATEN_LIST.includes(kabupaten)) {
    throw badRequest(`Kabupaten "${kabupaten}" tidak ditemukan dalam daftar LTKL.`);
  }
}

// Resolve the drill level into a list of LEAF regions to sum over. Area by
// class is additive across disjoint regions, so each kabupaten is reduced
// separately (small, parallelizable geometry) rather than unioning all 9 into
// one giant multipolygon. Kabupaten-level scopes use the clean
// kabupatenCollection boundary (avoids the sliver loss from dissolving
// kecamatan); finer scopes use kecamatan/desa.
function resolveDrillRegions(kabupaten, kecamatan, desa, collections) {
  const { kabupatenCollection, kecamatanCollection, desaCollection } = collections;

  if (desa) {
    return {
      level: "desa",
      scope: desa,
      leafRegions: [{
        key: desa,
        collection: desaCollection
          .filter(ee.Filter.eq("kab", kabupaten))
          .filter(ee.Filter.eq("kec", kecamatan))
          .filter(ee.Filter.eq("des", desa)),
      }],
    };
  }

  if (kecamatan) {
    return {
      level: "kecamatan",
      scope: kecamatan,
      leafRegions: [{
        key: kecamatan,
        collection: kecamatanCollection
          .filter(ee.Filter.eq("kab", kabupaten))
          .filter(ee.Filter.eq("kec", kecamatan)),
      }],
    };
  }

  if (kabupaten) {
    return {
      level: "kabupaten",
      scope: kabupaten,
      leafRegions: [{ key: kabupaten, collection: kabupatenCollection.filter(ee.Filter.eq("kab", kabupaten)) }],
    };
  }

  return {
    level: "ltkl",
    scope: "Semua Kabupaten LTKL",
    leafRegions: LTKL_KABUPATEN_LIST.map((kabupatenName) => ({
      key: kabupatenName,
      collection: kabupatenCollection.filter(ee.Filter.eq("kab", kabupatenName)),
    })),
  };
}

// Evaluate a grouped reduceRegion result, returning the "groups" list (or []).
// Earth Engine returns null/undefined groups when the geometry has no pixels,
// so guard with Algorithms.If before evaluating.
function evalGroupedReduce(reduceRegionResult) {
  const groups = ee.List(
    ee.Algorithms.If(reduceRegionResult.contains("groups"), reduceRegionResult.get("groups"), [])
  );
  return new Promise((resolve, reject) =>
    groups.evaluate((value, err) => (err ? reject(err) : resolve(value || [])))
  );
}

module.exports = { assertDrillParams, resolveDrillRegions, evalGroupedReduce };