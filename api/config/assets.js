// GEE asset paths — defined once here, imported by all route files
const ASSETS = {
  desaCollection: "projects/ee-dataaurigagee/assets/LTKL/desa",
  kecamatanCollection: "projects/ee-dataaurigagee/assets/LTKL/kecamatan",
  // Returns the LULC asset path for a given year
  lulcCollection: (year) =>
    `projects/ee-dataaurigagee/assets/LTKL/LTKLcollection2/LTKL_mbi41_${year}`,
  mapbiomasIndonesia:
    "projects/mapbiomas-public/assets/indonesia/lulc/collection4/mapbiomas_indonesia_collection4_coverage_v2",
  mapbiomasIndonesiaC41:
    "projects/mapbiomas-indonesia/assets/LAND-COVER/COLLECTION-41/GENERAL/classification-ft/mapbiomas_indonesia_collection41_coverage_v1",
};

// Stack-chart classes (MapBiomas class number + metadata), in stacking order.
// Single source of truth for the 100% stacked bar chart endpoint — keeping key,
// label, and color on one row prevents the three from drifting out of alignment.
const STACK_CLASSES = [
  { key: "3",  label: "Formasi Hutan",        color: "#1f8d49" },
  { key: "76", label: "Hutan Rawa Gambut",    color: "#2f7360" },
  { key: "5",  label: "Mangrove",             color: "#04381d" },
  { key: "13", label: "Non-Hutan Lainnya",    color: "#d89f5c" },
  { key: "21", label: "Pertanian Lainnya",    color: "#ffefc3" },
  { key: "9",  label: "Kebun Kayu",           color: "#7a5900" },
  { key: "35", label: "Sawit",                color: "#9065d0" },
  { key: "40", label: "Sawah",                color: "#f272c2" },
  { key: "25", label: "Non-Vegetasi Lainnya", color: "#db4d4f" },
  { key: "24", label: "Permukiman",           color: "#d4271e" },
  { key: "30", label: "Lubang Tambang",       color: "#9c0027" },
  { key: "31", label: "Tambak",               color: "#091077" },
  { key: "33", label: "Sungai, Danau, Laut",  color: "#2532e4" },
];

// Parallel arrays derived from STACK_CLASSES — kept for the JSON response shape
// (ECharts) and index-based row building in the route layer.
const STACK_KEYS = STACK_CLASSES.map((c) => c.key);
const STACK_LABELS = STACK_CLASSES.map((c) => c.label);
const STACK_COLORS = STACK_CLASSES.map((c) => c.color);

// Kabupaten (regency) names covered by the LTKL program
const LTKL_KABUPATEN_LIST = [
  "Gorontalo", "Siak", "Musi Banyuasin", "Kapuas Hulu", "Bone Bolango",
  "Sintang", "Sanggau", "Aceh Tamiang", "Sigi",
];

// Remap forest-related LULC classes (3, 5, 76) to a single class (3) for area calculation
const LULC_ORIGINAL_CLASSES = [3, 5, 76];
const LULC_REMAPPED_CLASSES = [3, 3, 3];

module.exports = {
  ASSETS,
  LTKL_KABUPATEN_LIST,
  LULC_ORIGINAL_CLASSES,
  LULC_REMAPPED_CLASSES,
  STACK_CLASSES,
  STACK_KEYS,
  STACK_LABELS,
  STACK_COLORS,
};
