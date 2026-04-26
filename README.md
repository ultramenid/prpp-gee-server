# prpp-gee-server

Node.js + Express API server integrating Google Earth Engine (GEE) for geospatial data processing, LULC analysis, and map tile generation.

---

## Project Structure

```
api/
  index.js              ← Entry point: GEE auth + server start
  app.js                ← Express setup + route mounting
  config/
    assets.js           ← GEE asset paths & domain constants
  routes/
    mapid.js            ← GET /mapid
    lulc.js             ← GET /gee/lulc, GET /gee/lulc-stats
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

### `GET /mapid`

Returns a Sentinel-2 true-color mosaic tile URL (cloud-filtered, 2019–2020).

**Response:** tile URL string

---

### `GET /gee/lulc`

Returns a LULC map tile URL for a given year and optional region.

| Query Param | Type   | Default | Description                    |
| ----------- | ------ | ------- | ------------------------------ |
| `year`      | number | `1992`  | LULC year                      |
| `kab`       | string | —       | Filter by kabupaten (regency)  |
| `kec`       | string | —       | Filter by kecamatan (district) |
| `des`       | string | —       | Filter by desa (village)       |

**Example:**

```
GET /gee/lulc?year=2020&kab=Siak
```

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
