// GEE asset paths — defined once here, imported by all route files
const ASSETS = {
  desaCollection: "projects/ee-dataaurigagee/assets/LTKL/desa",
  kecamatanCollection: "projects/ee-dataaurigagee/assets/LTKL/kecamatan",
  kabupatenCollection: "projects/ee-dataaurigagee/assets/LTKL/kabupaten",
  lulcCollection: (year) =>
    `projects/ee-dataaurigagee/assets/LTKL/LTKLcollection2/LTKL_mbi41_${year}`,
  // MapBiomas Indonesia Collection 4 — the version published on the public
  // MapBiomas platform. Kept for reference/verification only (its per-class
  // areas reproduce the platform's CSV exports — see scripts/verify-area.js),
  // NOT used by the live endpoints.
  mapbiomasIndonesia:
    "projects/mapbiomas-public/assets/indonesia/lulc/collection4/mapbiomas_indonesia_collection4_coverage_v2",
  // MapBiomas Indonesia Collection 4.1 — the asset the precomputed /lulc map
  // tiles (LTKL_mbi41_*) are derived from. ALL area statistics (stack-chart,
  // lulc-stats, sankey-transition) use this so the charts stay consistent with
  // the land-cover map shown on the site. Note: 4.1 reclassified a large amount
  // of Non-Hutan (class 13) into Formasi Hutan (class 3) vs 4.0, so forest area
  // reads higher here than in the platform's Collection-4 CSV exports. Bands are
  // classification_1988..2024 (superset of Collection 4's 1990..2024).
  mapbiomasIndonesiaC41:
    "projects/mapbiomas-indonesia/assets/LAND-COVER/COLLECTION-41/GENERAL/classification-ft/mapbiomas_indonesia_collection41_coverage_v1",
};

const STACK_CLASSES = [
  { key: "3", label: "Formasi Hutan", color: "#1f8d49", grp: "L1_1" },
  { key: "76", label: "Hutan Rawa Gambut", color: "#2f7360", grp: "L1_1" },
  { key: "5", label: "Mangrove", color: "#04381d", grp: "L1_1" },
  { key: "13", label: "Non-Hutan Lainnya", color: "#d89f5c", grp: "L1_2" },
  { key: "21", label: "Pertanian Lainnya", color: "#ffefc3", grp: "L1_3" },
  { key: "9", label: "Kebun Kayu", color: "#7a5900", grp: "L1_3" },
  { key: "35", label: "Sawit", color: "#9065d0", grp: "L1_3" },
  { key: "40", label: "Sawah", color: "#f272c2", grp: "L1_3" },
  { key: "25", label: "Non-Vegetasi Lainnya", color: "#db4d4f", grp: "L1_4" },
  { key: "24", label: "Permukiman", color: "#d4271e", grp: "L1_4" },
  { key: "30", label: "Lubang Tambang", color: "#9c0027", grp: "L1_4" },
  { key: "31", label: "Tambak", color: "#091077", grp: "L1_5" },
  { key: "33", label: "Sungai, Danau, Laut", color: "#2532e4", grp: "L1_5" },
];

const LEVEL1_GROUPS = [
  { key: "L1_1", label: "Hutan", color: "#1f8d49", children: [3, 5, 76] },
  {
    key: "L1_2",
    label: "Tumbuhan Non-Hutan",
    color: "#d6bc74",
    children: [13],
  },
  {
    key: "L1_3",
    label: "Pertanian",
    color: "#E974ED",
    children: [40, 35, 9, 21],
  },
  {
    key: "L1_4",
    label: "Non Vegetasi",
    color: "#d4271e",
    children: [30, 24, 25],
  },
  { key: "L1_5", label: "Tubuh Air", color: "#2532e4", children: [31, 33] },
];

// Parallel arrays derived from STACK_CLASSES — kept for the JSON response shape
// (ECharts) and index-based row building in the route layer.
const STACK_KEYS = STACK_CLASSES.map((c) => c.key);
const STACK_LABELS = STACK_CLASSES.map((c) => c.label);
const STACK_COLORS = STACK_CLASSES.map((c) => c.color);

// Kabupaten (regency) names covered by the LTKL program
const LTKL_KABUPATEN_LIST = [
  "Gorontalo",
  "Siak",
  "Musi Banyuasin",
  "Kapuas Hulu",
  "Bone Bolango",
  "Sintang",
  "Sanggau",
  "Aceh Tamiang",
  "Sigi",
];

module.exports = {
  ASSETS,
  LTKL_KABUPATEN_LIST,
  STACK_CLASSES,
  STACK_KEYS,
  STACK_LABELS,
  STACK_COLORS,
  LEVEL1_GROUPS,
};
