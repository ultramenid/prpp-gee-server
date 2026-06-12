const { badRequest } = require("./httpErrors");

const INTEGER_PATTERN = /^-?\d+$/;

function parseSingleYear(value, defaultYear) {
  if (value === undefined) return defaultYear;

  const normalized = String(value).trim();
  if (!INTEGER_PATTERN.test(normalized)) {
    throw badRequest("year must be an integer");
  }

  return Number.parseInt(normalized, 10);
}

function parseYearList(value, defaultYears) {
  if (value === undefined) return defaultYears;

  const parts = String(value).split(",").map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => !INTEGER_PATTERN.test(part))) {
    throw badRequest("year must contain comma-separated integers");
  }

  return parts.map((part) => Number.parseInt(part, 10));
}

module.exports = { parseSingleYear, parseYearList };
