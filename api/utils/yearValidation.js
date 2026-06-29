const { badRequest } = require("./httpErrors");

const INTEGER_PATTERN = /^-?\d+$/;
const MAPBIOMAS_MIN_YEAR = 1985;
const MAPBIOMAS_MAX_YEAR = 2024;

function parseSingleYear(value, defaultYear) {
  if (value === undefined) return defaultYear;

  const normalized = String(value).trim();
  if (!INTEGER_PATTERN.test(normalized)) {
    throw badRequest("year must be an integer");
  }

  return Number.parseInt(normalized, 10);
}

function parseYearRange(startValue, endValue, defaults = { start: 2013, end: 2024 }) {
  const startYear = parseSingleYear(startValue, defaults.start);
  const endYear = parseSingleYear(endValue, defaults.end);

  if (startYear < MAPBIOMAS_MIN_YEAR || startYear > MAPBIOMAS_MAX_YEAR) {
    throw badRequest(`startYear must be between ${MAPBIOMAS_MIN_YEAR} and ${MAPBIOMAS_MAX_YEAR}`);
  }
  if (endYear < MAPBIOMAS_MIN_YEAR || endYear > MAPBIOMAS_MAX_YEAR) {
    throw badRequest(`endYear must be between ${MAPBIOMAS_MIN_YEAR} and ${MAPBIOMAS_MAX_YEAR}`);
  }
  if (startYear >= endYear) {
    throw badRequest("startYear must be less than endYear");
  }

  return { startYear, endYear };
}

module.exports = { parseSingleYear, parseYearRange, MAPBIOMAS_MIN_YEAR, MAPBIOMAS_MAX_YEAR };
