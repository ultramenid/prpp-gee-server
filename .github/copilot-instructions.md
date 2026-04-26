# Project Guidelines — prpp-gee-server

Node.js + Express API server integrating Google Earth Engine (GEE). Handles geospatial data processing, LULC analysis, and map tile generation.

## Architecture

- `api/index.js` — single entrypoint: GEE auth, all Express routes
- GEE assets live under `projects/ee-dataaurigagee/assets/LTKL/`
- GEE is initialized asynchronously; the server only starts listening after `ee.initialize()` succeeds

---

## 1. Newbie Friendly & Reusable Code

- Write code that a junior developer can understand without prior context.
- Extract repeated logic into clearly named helper functions rather than copy-pasting blocks.
- Each route handler should do **one thing only** — keep handlers short; move GEE logic into helper functions.
- Add a brief inline comment above any non-obvious logic (GEE filter chains, remapping, coordinate transforms).
- Prefer explicit over clever: avoid one-liners that sacrifice readability.
- Always use `const`/`let` — never `var`. `var` has function scope and causes subtle bugs.

```js
// Good — clear, const, single responsibility
const buildRegionGeometry = (kab, kec, des) => {
  let region = ee.FeatureCollection("projects/ee-dataaurigagee/assets/LTKL/desa");
  if (kab) region = region.filter(ee.Filter.eq("kab", kab));
  if (kec) region = region.filter(ee.Filter.eq("kec", kec));
  if (des) region = region.filter(ee.Filter.eq("des", des));
  return region;
};

// Avoid — var, inline logic, no separation
app.get("/gee/lulc", async (req, res) => {
  var geo = ee.FeatureCollection("...desa");
  if (req.query.kab) geo = geo.filter(...);
  // ... more logic crammed in here
});
```

## 2. Meaningful Variable Names — English Only

- All variable names, function names, and comments must be in **English**.
- No abbreviations unless universally understood (`req`, `res`, `err`, `url`, `id`).
- Domain terms like `kab` (kabupaten), `kec` (kecamatan), `des` (desa) are **kept as-is** because they are query param names defined by the API contract — but add a comment explaining them on first use.
- Boolean variables should read as a question: `isValidYear`, `hasGeometry`, `isCloudFree`.
- Collections/arrays must be plural: `yearList`, `regionFilters`, `sortedResults`.
- Use consistent response object name `res` in all route handlers — not `response` or `r`.
- Use **camelCase** for all JS variables — never snake_case (`kab_aoi` → `kabRegion`, `kab_aoi` is a JS variable, not a query param).

```js
// Good — descriptive, English, consistent res naming
app.get("/gee/lulc", async (req, res) => {
  // kab = kabupaten (regency), kec = kecamatan (district), des = desa (village)
  const { kab, kec, des, year = 1992 } = req.query;
  const selectedYear = parseInt(year, 10);
  const lulcAssetPath = `projects/ee-dataaurigagee/assets/LTKL/LTKLcollection2/LTKL_mbi41_${selectedYear}`;
});

// Avoid — Indonesian, cryptic, inconsistent
app.get("/mapid", async (_, response) => {
  // 'response' instead of 'res'
  const MBI4_1 = `projects/.../LTKL_mbi41_${thn}`;
  var LULCyear = ee.Image(MBI4_1); // var, Indonesian abbreviation
});
```

## 3. Data Integrity & Backward Compatibility

- Always validate and sanitize query parameters at the route level **before** passing them to GEE.
- After `parseInt(value, 10)`, always check `isNaN()` — never pass `NaN` to a GEE asset path.
- When adding new query parameters, make them **optional with safe defaults** so existing callers are not broken.
- Never remove or rename existing query parameters in a released endpoint — add new ones alongside.
- All sensitive config (API keys, private keys, project IDs, service account URLs) must come from `process.env` — never hardcoded strings in source code. This includes `client_x509_cert_url`.
- Wrap every async route in `try/catch` — including simple ones like `/mapid`.
- Always use `console.error` for errors — not `console.log`. This ensures errors appear in the correct output stream and can be filtered in production logs.

```js
// Good — validated, with NaN guard and try/catch
app.get("/gee/lulc", async (req, res) => {
  try {
    const { kab, kec, des, year = 1992 } = req.query;
    const selectedYear = parseInt(year, 10);
    if (isNaN(selectedYear))
      return res.status(400).send("year must be a valid number");

    const lulcAssetPath = `projects/ee-dataaurigagee/assets/LTKL/LTKLcollection2/LTKL_mbi41_${selectedYear}`;
    // ...
  } catch (err) {
    console.error("Error in /gee/lulc:", err);
    res.status(500).send("Internal server error");
  }
});

// Avoid — no try/catch, no NaN check, hardcoded URL
app.get("/mapid", async (_, response) => {
  const res = await mosaic.getMap(vis); // uncaught rejection crashes server
  response.send(res.urlFormat);
});
```

## 4. Correctness, Minimality & Edge Cases

- Handle all edge cases explicitly: missing params, NaN values, empty GEE results, and network errors.
- Use `for...of` to iterate arrays — never `for...in` on arrays (`for...in` enumerates object keys, not array values, and can include prototype properties).
- Return the smallest useful response — don't over-fetch from GEE or send unnecessary data to the client.
- Log errors with context (`console.error("context:", err)`) before sending the response so failures are traceable.
- Do not add features, middleware, or abstractions unless the current task requires them.

```js
// Good — for...of on arrays, const, explicit
const yearList = [2020, 2021, 2024];
for (const year of yearList) {
  const assetPath = `projects/.../LTKL_mbi41_${year}`;
  // process year
}

// Avoid — for...in on array (iterates indices as strings, not values)
for (var yearId in yearList) {
  var year = yearList[yearId]; // yearId is "0", "1", "2" — not the year value
}
```

## 5. Performance & Optimization

- Filter GEE collections as early as possible (date, cloud cover, geometry) to reduce server-side computation.
- **Never call `.getMap()`, `.getInfo()`, or `.evaluate()` inside a loop** — these are blocking HTTP calls to GEE. Build the full GEE computation graph first, then evaluate once.
- Do not block the event loop: all GEE calls and I/O must be `async/await` or Promise-based.
- Use `.clip(geometry)` only after all filters — clipping large unfiltered collections is expensive.
- GEE asset paths used across routes should be defined as named constants at the top of the file to avoid duplication and typos.
- Domain lists and lookup tables (e.g., a list of kabupaten names) must be defined as top-level `const` — never hardcoded inside a route handler.
- Use `ee.Filter.eq()` instead of the deprecated `.filterMetadata()` method.
- Prefer `.evaluate()` (Promise-based) over `.getInfo()` (synchronous/blocking) when fetching GEE results server-side.

```js
// Good — constants at top, filter first, single evaluation
const ASSETS = {
  desaCollection: "projects/ee-dataaurigagee/assets/LTKL/desa",
  kecamatanCollection: "projects/ee-dataaurigagee/assets/LTKL/kecamatan",
  lulcCollection: (year) =>
    `projects/ee-dataaurigagee/assets/LTKL/LTKLcollection2/LTKL_mbi41_${year}`,
  mapbiomasIndonesia:
    "projects/mapbiomas-public/assets/indonesia/lulc/collection4/mapbiomas_indonesia_collection4_coverage_v2",
};

// Domain list as a top-level constant, not inside a handler
const LTKL_KABUPATEN_LIST = [
  'Gorontalo', 'Siak', 'Musi Banyuasin', 'Kapuas Hulu', 'Bone Bolango',
  'Sintang', 'Sanggau', 'Aceh Tamiang', 'Sigi',
];

// ee.Filter.eq instead of filterMetadata; evaluate() instead of getInfo()
const kabRegion = kabCollection.filter(ee.Filter.eq('kab', kabupaten));
const result = await new Promise((resolve, reject) =>
  eeObject.evaluate((value, err) => err ? reject(err) : resolve(value))
);

// Avoid — filterMetadata (deprecated), getInfo (blocking), list inside handler
app.get('/gee/lulc-stats', async (req, res) => {
  var LTKLkabList = ['Gorontalo', ...]; // hardcoded inside route
  var kab_aoi = LTKLkab.filterMetadata('kab', 'equals', kabupaten); // deprecated
  return res.json(resultByYear.getInfo()); // synchronous, blocks the event loop
});
```
