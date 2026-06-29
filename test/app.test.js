const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

test("GET /health returns service status", async () => {
  const app = require("../api/app");

  const response = await request(app).get("/health").expect(200);

  assert.deepEqual(response.body, { status: "ok" });
});

test("GET /unknown returns JSON 404", async () => {
  const app = require("../api/app");

  const response = await request(app).get("/unknown").expect(404);

  assert.deepEqual(response.body, { error: "Not found" });
});

test("uses CORS_ORIGIN when configured", async () => {
  const originalCorsOrigin = process.env.CORS_ORIGIN;
  process.env.CORS_ORIGIN = "https://example.com";
  delete require.cache[require.resolve("../api/app")];

  const app = require("../api/app");
  const response = await request(app).get("/health").expect(200);

  assert.equal(response.headers["access-control-allow-origin"], "https://example.com");

  if (originalCorsOrigin === undefined) {
    delete process.env.CORS_ORIGIN;
  } else {
    process.env.CORS_ORIGIN = originalCorsOrigin;
  }
  delete require.cache[require.resolve("../api/app")];
});

test("GET /gee/lulc rejects non-integer year", async () => {
  const app = require("../api/app");

  const response = await request(app).get("/gee/lulc?year=2024.5").expect(400);

  assert.deepEqual(response.body, { error: "year must be an integer" });
});

test("GET /gee/lulc rejects comma-separated year", async () => {
  const app = require("../api/app");

  const response = await request(app).get("/gee/lulc?year=2020,2021").expect(400);

  assert.deepEqual(response.body, { error: "year must be an integer" });
});
