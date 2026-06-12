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

// Stack-chart class IDs (string of MapBiomas class numbers) and metadata
// used by the 100% stacked bar chart endpoint.
const STACK_KEYS = [
  "3", "76", "5",
  "13",
  "21", "9", "35", "40",
  "25", "24", "30",
  "31", "33",
];

const STACK_LABELS = [
  "Formasi Hutan",
  "Hutan Rawa Gambut",
  "Mangrove",
  "Non-Hutan Lainnya",
  "Pertanian Lainnya",
  "Kebun Kayu",
  "Sawit",
  "Sawah",
  "Non-Vegetasi Lainnya",
  "Permukiman",
  "Lubang Tambang",
  "Tambak",
  "Sungai, Danau, Laut",
];

const STACK_COLORS = [
  "#1f8d49",
  "#2f7360",
  "#04381d",
  "#d89f5c",
  "#ffefc3",
  "#7a5900",
  "#9065d0",
  "#f272c2",
  "#db4d4f",
  "#d4271e",
  "#9c0027",
  "#091077",
  "#2532e4",
];

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
  STACK_KEYS,
  STACK_LABELS,
  STACK_COLORS,
};
