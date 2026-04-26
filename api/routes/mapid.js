const express = require("express");
const ee = require("@google/earthengine");

const router = express.Router();

// GET /mapid — Sentinel-2 true-color mosaic tile URL (cloud-filtered, 2019–2020)
router.get("/", async (req, res) => {
  try {
    const vis = { bands: ["B4", "B3", "B2"], min: 0, max: 2000 };
    const mosaic = ee
      .ImageCollection("COPERNICUS/S2_SR")
      .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
      .filterDate("2019-01-01", "2020-12-31")
      .mosaic();

    const mapInfo = await mosaic.getMap(vis);
    res.send(mapInfo.urlFormat);
  } catch (err) {
    console.error("Error in /mapid:", err);
    res.status(500).send("Internal server error");
  }
});

module.exports = router;
