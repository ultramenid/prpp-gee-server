const test = require("node:test");
const assert = require("node:assert/strict");

const { parseSingleYear } = require("../api/utils/yearValidation");
const { HttpError } = require("../api/utils/httpErrors");

test("parseSingleYear returns default year when value is missing", () => {
  assert.equal(parseSingleYear(undefined, 1992), 1992);
});

test("parseSingleYear parses integer strings", () => {
  assert.equal(parseSingleYear("2024", 1992), 2024);
});

test("parseSingleYear rejects decimals", () => {
  assert.throws(
    () => parseSingleYear("2024.5", 1992),
    (err) => err instanceof HttpError && err.statusCode === 400 && err.message === "year must be an integer"
  );
});

test("parseSingleYear rejects comma-separated values", () => {
  assert.throws(
    () => parseSingleYear("2020,2021", 1992),
    (err) => err instanceof HttpError && err.statusCode === 400 && err.message === "year must be an integer"
  );
});
