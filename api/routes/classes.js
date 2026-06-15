const express = require("express");
const { LEVEL1_GROUPS, LEVEL2_CLASSES } = require("../config/assets");

const router = express.Router();

// GET /gee/classes — LULC class hierarchy as pure metadata (no Earth Engine
// call). Returns the 5 Level-1 groups, the 13 Level-2 classes, and the
// Level-1 -> Level-2 id mapping so clients can build legends and roll-ups.
router.get("/classes", (req, res) => {
  const mapping = {};
  for (const group of LEVEL1_GROUPS) mapping[group.key] = group.children;

  res.json({
    level1: LEVEL1_GROUPS,
    level2: LEVEL2_CLASSES,
    mapping,
  });
});

module.exports = router;
