const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveMaxStockSpread,
  buildAnalysisResult,
  serializeAnalysisResultForStorage,
  shouldSkipSymbolForAnalysis,
  calculateDaysToExpiration,
  isWeeklyOptionCandidate,
  calculateDaysBetweenDates,
} = require("../Analyze/index");
const {
  getEffectiveSelectedDate,
} = require("../frontend/src/components/analysisTableUtils");

test("uses percentage-based max spread when MAX_STOCK_SPREAD_PCT is provided", () => {
  assert.equal(resolveMaxStockSpread(100, { MAX_STOCK_SPREAD_PCT: "0.02" }), 2);
});

test("falls back to legacy dollar-based max spread when only MAX_STOCK_SPREAD is set", () => {
  assert.equal(resolveMaxStockSpread(100, { MAX_STOCK_SPREAD: "15" }), 15);
});

test("defaults to 1% of stock price when neither setting is present", () => {
  assert.equal(resolveMaxStockSpread(100, {}), 1);
});

test("builds an analysis result even when option-chain data is missing", () => {
  const result = buildAnalysisResult({
    symbol: "AAPL",
    data: { quote: { last: "40" } },
    analyzedAt: new Date("2026-01-01T00:00:00.000Z"),
    expirationWindowDate: new Date("2026-01-10T00:00:00.000Z"),
  });

  assert.equal(result.symbol, "AAPL");
  assert.equal(result.status, "EXPIRATION_TOO_FAR");
  assert.ok(
    result.notes.some((note) =>
      note.includes("No valid option chain data available"),
    ),
  );
});

test("serializes analysis notes into a database-ready string", () => {
  const serialized = serializeAnalysisResultForStorage({
    symbol: "AAPL",
    notes: ["first note", "second note"],
  });

  assert.equal(serialized.notes, "first note; second note");
});

test("keeps symbols in the analysis set even when option-chain data is unavailable", () => {
  assert.equal(
    shouldSkipSymbolForAnalysis("No valid expiration found in option chain"),
    false,
  );
  assert.equal(
    shouldSkipSymbolForAnalysis(
      "Failed to fetch option chain for AAPL: No valid strike found above current price",
    ),
    false,
  );
  assert.equal(
    shouldSkipSymbolForAnalysis(
      "Temporary network error while fetching quotes",
    ),
    false,
  );
});

test("calculates time-to-expiration from the actual expiration date", () => {
  const analyzedAt = new Date("2026-01-01T12:00:00Z");
  const expiration = new Date("2026-01-08T12:00:00Z");
  assert.equal(calculateDaysToExpiration(expiration, analyzedAt), 7);
});

test("calculates earnings-day deltas without timezone drift", () => {
  const today = new Date("2026-08-14T18:00:00-04:00");
  const earningsDate = new Date("2026-08-20T00:00:00Z");
  assert.equal(calculateDaysBetweenDates(today, earningsDate), 5);
  assert.equal(calculateDaysBetweenDates(earningsDate, today), -5);
});

test("only treats option expirations within the weekly window as valid candidates", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  assert.equal(
    isWeeklyOptionCandidate(new Date("2026-01-08T12:00:00Z"), now),
    true,
  );
  assert.equal(
    isWeeklyOptionCandidate(new Date("2026-01-20T12:00:00Z"), now),
    false,
  );
  assert.equal(isWeeklyOptionCandidate(null, now), false);
});

test("falls back to the latest valid analysis date if the current selected date is stale", () => {
  const data = [
    { analyzed_at: "2026-01-02T12:00:00Z" },
    { analyzed_at: "2026-01-04T12:00:00Z" },
  ];

  const selectedDate = {
    format: (pattern) => {
      if (pattern === "YYYY-MM-DD") return "2026-01-03";
      return "2026-01-03T00:00:00Z";
    },
  };

  const effectiveDate = getEffectiveSelectedDate(data, selectedDate);
  assert.equal(effectiveDate.format("YYYY-MM-DD"), "2026-01-04");
});
