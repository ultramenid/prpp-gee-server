# prpp-gee-server

Node.js + Express API server integrating Google Earth Engine (GEE) for geospatial data processing, LULC analysis, and map tile generation.

---

## Project Structure

```
api/
  index.js              ← PM2/local entry point: GEE auth + server start
  app.js                ← Express setup, middleware, routes, health, errors
  config/
    assets.js           ← GEE asset paths & domain constants
  services/
    earthEngine.js      ← GEE auth/init service
  utils/
    httpErrors.js       ← HTTP error helpers
    yearValidation.js   ← Year query parsing and validation
  routes/
    mapid.js            ← GET /mapid
    lulc.js             ← GET /gee/lulc, GET /gee/lulc-stats, /stack-chart, /sankey-transition
    classes.js          ← GET /gee/classes (LULC class hierarchy)
ecosystem.config.js     ← PM2 production config
```

---

## Requirements

- Node.js >= 18
- A Google Earth Engine [service account](https://developers.google.com/earth-engine/service_account)

---

## Environment Variables

Create a `.env` file in the project root:

```env
PROJECT_ID=your-gee-project-id
PRIVATE_KEY_ID=your-private-key-id
PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
CLIENT_ID=your-client-id
CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com
PORT=8000
# Optional: restrict browser access to one origin. Leave unset to allow all origins.
CORS_ORIGIN=https://your-frontend.example.com
```

---

## Development

Auto-restarts on file save using nodemon:

```bash
npm install
npm run dev
```

---

## Production (PM2)

### First-time setup

```bash
npm install
npm run prod
```

### Survive server reboots

Run these once on your server after starting PM2:

```bash
pm2 startup    # generates a command — copy and run the output
pm2 save       # saves the current process list
```

### Common commands

| Command                | Description                      |
| ---------------------- | -------------------------------- |
| `npm run prod`         | Start the server with PM2        |
| `npm run prod:restart` | Restart after deploying new code |
| `npm run prod:logs`    | Stream live logs                 |
| `npm run prod:stop`    | Stop the server                  |

You can also use PM2 directly:

```bash
pm2 list                        # show all running processes
pm2 monit                       # live CPU/memory dashboard
pm2 logs prpp-gee-server        # stream logs
pm2 restart prpp-gee-server     # restart
pm2 stop prpp-gee-server        # stop
pm2 delete prpp-gee-server      # remove from PM2
```

### Deploy new code

```bash
git pull
npm install           # only if dependencies changed
npm run prod:restart
```

---

## API Endpoints

### GET /health

Returns basic service status.

**Response:**
{ "status": "ok" }

---

### `GET /mapid`

Returns a Sentinel-2 true-color mosaic tile URL (cloud-filtered, 2019–2020).

**Response:** tile URL string

---

### `GET /gee/lulc`

Returns a LULC map tile URL (plain text) for a given year and optional region.

Tiles are rendered live from the MapBiomas Indonesia Collection 4.1 classification
bands — the same asset the statistics endpoints reduce — so the map and the charts
always show identical data. Class ids are remapped onto the 13 `STACK_CLASSES`
colors; anything else (class `0` no-data, `27` unobserved) renders transparent.

| Query Param | Type             | Default    | Description                          |
| ----------- | ---------------- | ---------- | ------------------------------------ |
| `year`      | number           | `1992`     | LULC year                            |
| `kab`       | string           | —          | Filter by kabupaten (regency)        |
| `kec`       | string           | —          | Filter by kecamatan (district)       |
| `des`       | string           | —          | Filter by desa (village)             |
| `classes`   | comma-separated  | all 13     | Render only these class ids          |

Drill params follow the usual hierarchy: `des` requires `kec`, `kec` requires `kab`,
and `kab` must be an LTKL kabupaten. With no params the tiles cover all 9 kabupaten.

**Legend on/off — `classes`**

A tile is baked pixels, so a class cannot be hidden client-side. Pass the classes
that are still switched on and re-apply the returned tile URL; everything else
renders transparent. Order and duplicates don't matter — colors stay bound to the
class, never to its position in the query.

```
GET /gee/lulc?year=2024&kab=Siak&classes=3,5,76     # forest classes only
GET /gee/lulc?year=2024&kab=Siak                    # all classes
```

Valid ids are the 13 in `STACK_CLASSES` (`api/config/assets.js`), which also carries
their labels and colors: `3, 76, 5, 13, 21, 9, 35, 40, 25, 24, 30, 31, 33`. The same
ids come back as `keys`/`labels`/`colors` on `GET /gee/stack-chart`, so a legend can
be built without hardcoding them. An unknown id returns 400.
An empty `classes=` also returns 400 — with nothing selected the client should remove
the layer rather than request a blank tile.

**Example:**

```
GET /gee/lulc?year=2020&kab=Siak
```

`year` must be an integer. The API does not enforce a fixed year range because new
MapBiomas bands may be added over time (4.1 currently carries 1988–2024).

Verify the rendering end to end with `node scripts/verify-lulc-tile.js` — it fetches
a real tile and asserts every painted pixel is a palette-exact class color.

---

### `GET /gee/lulc-stats`

Returns forest area statistics (hectares) per kabupaten, sorted by area descending.

| Query Param | Type                      | Default | Description       |
| ----------- | ------------------------- | ------- | ----------------- |
| `year`      | number or comma-separated | `2024`  | One or more years |

**Examples:**

```
GET /gee/lulc-stats?year=2024
GET /gee/lulc-stats?year=2020,2021,2024
```

`year` must be one integer or comma-separated integers. The API does not enforce a fixed year range because new MapBiomas bands may be added over time.

---

### `GET /gee/classes`

Returns the LULC class hierarchy as pure metadata (no Earth Engine call). Use it to build legends and roll Level-2 classes up into Level-1 groups.

- `level1` — the 5 aggregate groups: `{ key, label, color, children: [classId, ...] }`
- `level2` — the 13 classes: `{ id, label, color, grp }` (`grp` is the parent Level-1 key)
- `mapping` — `{ L1_1: [3, 5, 76], ... }`, Level-1 key → child Level-2 ids

**Example:**

```
GET /gee/classes
```
