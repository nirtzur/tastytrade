const dayjs = require("dayjs");

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value.format === "function") {
    return value.isValid && value.isValid() ? value : null;
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : null;
}

function getLatestAnalyzedDate(data) {
  if (!Array.isArray(data) || data.length === 0) return null;

  return data.reduce((latest, current) => {
    const currentDate = normalizeDate(current?.analyzed_at);
    if (!currentDate) return latest;
    if (!latest) return currentDate;
    return currentDate.isAfter(latest) ? currentDate : latest;
  }, null);
}

function getEffectiveSelectedDate(data, selectedDate) {
  const normalizedSelected = normalizeDate(selectedDate);
  if (normalizedSelected && Array.isArray(data) && data.length > 0) {
    const formattedSelected = normalizedSelected.format("YYYY-MM-DD");
    const hasData = data.some((row) => {
      const rowDate = normalizeDate(row?.analyzed_at);
      return rowDate && rowDate.format("YYYY-MM-DD") === formattedSelected;
    });
    if (hasData) {
      return normalizedSelected;
    }
    return getLatestAnalyzedDate(data) || normalizedSelected;
  }

  return getLatestAnalyzedDate(data) || normalizedSelected || dayjs();
}

module.exports = {
  getLatestAnalyzedDate,
  getEffectiveSelectedDate,
};
