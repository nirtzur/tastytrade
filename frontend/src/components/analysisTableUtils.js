function parseDate(value) {
  if (!value) return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateKey(value) {
  const parsed = parseDate(value);
  if (!parsed) return null;

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDayjsLike(value) {
  const parsed = parseDate(value);
  if (!parsed) return null;

  return {
    value: parsed,
    format(pattern) {
      if (pattern === "YYYY-MM-DD") {
        const year = this.value.getUTCFullYear();
        const month = String(this.value.getUTCMonth() + 1).padStart(2, "0");
        const day = String(this.value.getUTCDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
      return this.value.toISOString();
    },
    isSame(other) {
      if (!other) return false;
      const otherKey = other.format
        ? other.format("YYYY-MM-DD")
        : formatDateKey(other);
      return this.format("YYYY-MM-DD") === otherKey;
    },
  };
}

function getLatestAnalyzedDate(data) {
  if (!Array.isArray(data) || data.length === 0) return null;

  return data.reduce((latest, current) => {
    const currentDate = parseDate(current?.analyzed_at);
    if (!currentDate) return latest;

    if (!latest) return toDayjsLike(current.analyzed_at);
    return currentDate.getTime() > latest.value.getTime()
      ? toDayjsLike(current.analyzed_at)
      : latest;
  }, null);
}

function getEffectiveSelectedDate(data, selectedDate) {
  if (!Array.isArray(data) || data.length === 0) return selectedDate || null;

  const latestDate = getLatestAnalyzedDate(data);
  if (!latestDate) return selectedDate || null;
  if (!selectedDate) return latestDate;

  const selectedDateString = selectedDate.format
    ? selectedDate.format("YYYY-MM-DD")
    : formatDateKey(selectedDate);
  const validDateStrings = new Set(
    data
      .map((row) => row?.analyzed_at)
      .filter(Boolean)
      .map((value) => formatDateKey(value)),
  );

  return validDateStrings.has(selectedDateString) ? selectedDate : latestDate;
}

module.exports = {
  getLatestAnalyzedDate,
  getEffectiveSelectedDate,
};
