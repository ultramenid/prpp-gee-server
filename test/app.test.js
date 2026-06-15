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

test("GET /gee/lulc-stats rejects invalid year list", async () => {
  const app = require("../api/app");

  const response = await request(app).get("/gee/lulc-stats?year=2020,abc").expect(400);

  assert.deepEqual(response.body, { error: "year must contain comma-separated integers" });
});

test("GET /gee/lulc-stats rejects empty year entries", async () => {
  const app = require("../api/app");

  const response = await request(app).get("/gee/lulc-stats?year=2020,,2024").expect(400);

  assert.deepEqual(response.body, { error: "year must contain comma-separated integers" });
});

test("GET /gee/classes returns the Level-1/Level-2 hierarchy", async () => {
  const app = require("../api/app");

  const response = await request(app).get("/gee/classes").expect(200);

  assert.equal(response.body.level1.length, 5);
  assert.equal(response.body.level2.length, 13);

  // Every Level-2 class maps to a known Level-1 group.
  const groupKeys = new Set(response.body.level1.map((group) => group.key));
  for (const klass of response.body.level2) {
    assert.ok(groupKeys.has(klass.grp), `unknown group ${klass.grp}`);
  }

  // mapping children must match the Level-2 ids assigned to each group.
  for (const group of response.body.level1) {
    const idsInGroup = response.body.level2
      .filter((klass) => klass.grp === group.key)
      .map((klass) => klass.id)
      .sort((a, b) => a - b);
    assert.deepEqual(
      [...response.body.mapping[group.key]].sort((a, b) => a - b),
      idsInGroup
    );
  }
});
