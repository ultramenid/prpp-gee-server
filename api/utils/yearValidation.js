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

function parseYearList(value, defaultYears) {
  if (value === undefined) return defaultYears;

  const parts = String(value).split(",").map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => !INTEGER_PATTERN.test(part))) {
    throw badRequest("year must contain comma-separated integers");
  }

  return parts.map((part) => Number.parseInt(part, 10));
}

module.exports = { parseSingleYear, parseYearList, parseYearRange, MAPBIOMAS_MIN_YEAR, MAPBIOMAS_MAX_YEAR };
