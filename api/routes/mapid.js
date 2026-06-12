const express = require("express");
const { ee } = require("../services/earthEngine");

const router = express.Router();

router.get("/", async (req, res, next) => {
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
    next(err);
  }
});

module.exports = router;
