const express = require("express");
const cors = require("cors");

const mapidRouter = require("./routes/mapid");
const lulcRouter = require("./routes/lulc");

const app = express();

app.use(cors());

// Mount route groups — add new route files here as the API grows
app.use("/mapid", mapidRouter);
app.use("/gee", lulcRouter);

module.exports = app;
