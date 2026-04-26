// GEE asset paths — defined once here, imported by all route files
const ASSETS = {
  desaCollection: "projects/ee-dataaurigagee/assets/LTKL/desa",
  kecamatanCollection: "projects/ee-dataaurigagee/assets/LTKL/kecamatan",
  // Returns the LULC asset path for a given year
  lulcCollection: (year) =>
    `projects/ee-dataaurigagee/assets/LTKL/LTKLcollection2/LTKL_mbi41_${year}`,
  mapbiomasIndonesia:
    "projects/mapbiomas-public/assets/indonesia/lulc/collection4/mapbiomas_indonesia_collection4_coverage_v2",
};

// Kabupaten (regency) names covered by the LTKL program
const LTKL_KABUPATEN_LIST = [
  "Gorontalo", "Siak", "Musi Banyuasin", "Kapuas Hulu", "Bone Bolango",
  "Sintang", "Sanggau", "Aceh Tamiang", "Sigi",
];

// Remap forest-related LULC classes (3, 5, 76) to a single class (3) for area calculation
const LULC_ORIGINAL_CLASSES = [3, 5, 76];
const LULC_REMAPPED_CLASSES = [3, 3, 3];

module.exports = { ASSETS, LTKL_KABUPATEN_LIST, LULC_ORIGINAL_CLASSES, LULC_REMAPPED_CLASSES };
