const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseSingleYear,
  parseYearList,
} = require("../api/utils/yearValidation");
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

test("parseYearList returns default list when value is missing", () => {
  assert.deepEqual(parseYearList(undefined, [2024]), [2024]);
});

test("parseYearList parses comma-separated integer strings", () => {
  assert.deepEqual(parseYearList("2020, 2021,2024", [2024]), [2020, 2021, 2024]);
});

test("parseYearList rejects empty entries", () => {
  assert.throws(
    () => parseYearList("2020,,2024", [2024]),
    (err) => err instanceof HttpError && err.statusCode === 400 && err.message === "year must contain comma-separated integers"
  );
});

test("parseYearList rejects non-integers", () => {
  assert.throws(
    () => parseYearList("2020,abc", [2024]),
    (err) => err instanceof HttpError && err.statusCode === 400 && err.message === "year must contain comma-separated integers"
  );
});
