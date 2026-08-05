// Verifies /gee/lulc renders real MapBiomas classes in the exact palette:
// fetches one tile over Siak, decodes it, and asserts every non-transparent
// pixel color is a STACK_COLORS entry. Catches a broken remap/visualize pairing
// (blank tiles, interpolated colors, palette drifting out of order).
// Run: node scripts/verify-lulc-tile.js
require("dotenv").config();
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const request = require("supertest");
const app = require("../api/app");
const { initializeEarthEngine } = require("../api/services/earthEngine");
const { STACK_KEYS, STACK_COLORS, STACK_LABELS } = require("../api/config/assets");

// Minimal PNG reader — enough to undo the per-scanline filters and count colors.
function pngColors(buffer) {
  let position = 8;
  const idatChunks = [];
  let width, height, bytesPerPixel;
  while (position < buffer.length) {
    const length = buffer.readUInt32BE(position);
    const type = buffer.toString("ascii", position + 4, position + 8);
    const data = buffer.slice(position + 8, position + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bytesPerPixel = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 1;
    }
    if (type === "IDAT") idatChunks.push(data);
    position += length + 12;
  }
  const filtered = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(height * stride);
  const paeth = (left, up, upLeft) => {
    const estimate = left + up - upLeft;
    const dLeft = Math.abs(estimate - left);
    const dUp = Math.abs(estimate - up);
    const dUpLeft = Math.abs(estimate - upLeft);
    return dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft;
  };
  for (let y = 0; y < height; y++) {
    const filterType = filtered[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const current = filtered[y * (stride + 1) + 1 + x];
      const left = x >= bytesPerPixel ? pixels[y * stride + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= bytesPerPixel && y > 0 ? pixels[(y - 1) * stride + x - bytesPerPixel] : 0;
      pixels[y * stride + x] =
        (filterType === 0 ? current
          : filterType === 1 ? current + left
          : filterType === 2 ? current + up
          : filterType === 3 ? current + ((left + up) >> 1)
          : current + paeth(left, up, upLeft)) & 0xff;
    }
  }
  const counts = new Map();
  for (let i = 0; i < pixels.length; i += bytesPerPixel) {
    const alpha = bytesPerPixel === 4 ? pixels[i + 3] : 255;
    const hex = alpha === 0
      ? "transparent"
      : "#" + [pixels[i], pixels[i + 1], pixels[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("");
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  return counts;
}

// Fetch one /gee/lulc tile and return the class ids actually painted into it.
async function renderedClasses(query) {
  const response = await request(app).get(`/gee/lulc?${query}`).expect(200);
  // z/x/y covering Siak, Riau (~102.0E, 0.8N) — dense mixed land cover.
  const tileUrl = response.text.replace("{z}", "10").replace("{x}", "802").replace("{y}", "509");
  const png = Buffer.from(await (await fetch(tileUrl)).arrayBuffer());

  const painted = [...pngColors(png)]
    .filter(([hex]) => hex !== "transparent")
    .sort((a, b) => b[1] - a[1]);

  return painted.map(([hex, pixelCount]) => {
    const index = STACK_COLORS.indexOf(hex);
    assert.notEqual(index, -1, `${hex} is not in STACK_COLORS — remap and palette are out of sync`);
    console.log(`  ${hex}  ${String(pixelCount).padStart(6)} px  ${STACK_KEYS[index].padStart(2)} ${STACK_LABELS[index]}`);
    return STACK_KEYS[index];
  });
}

(async () => {
  await initializeEarthEngine();

  console.log("all classes:");
  const everything = await renderedClasses("year=2024&kab=Siak");
  assert.ok(everything.length >= 5, `expected several land-cover classes, got ${everything.length}`);

  // A legend toggle must remove classes from the tile itself — raster pixels
  // cannot be filtered client-side. Duplicates and out-of-order ids in the query
  // must not break the remap or shift the palette.
  console.log("classes=76,3,3,5 (forest only, duplicated and out of order):");
  const forestOnly = await renderedClasses("year=2024&kab=Siak&classes=76,3,3,5");
  assert.deepEqual([...forestOnly].sort(), ["3", "5", "76"].filter((id) => everything.includes(id)).sort());

  console.log("classes=35 (single class):");
  const singleClass = await renderedClasses("year=2024&kab=Siak&classes=35");
  assert.deepEqual(singleClass, ["35"]);

  for (const [query, expected] of [
    ["classes=999", 400],
    ["classes=", 400],
    ["classes=3,abc", 400],
  ]) {
    const response = await request(app).get(`/gee/lulc?year=2024&kab=Siak&${query}`);
    assert.equal(response.status, expected, `?${query} should be ${expected}, got ${response.status}`);
  }

  console.log("OK — palette-exact, class filter honoured, bad input rejected.");
})();
