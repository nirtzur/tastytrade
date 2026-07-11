const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveMaxStockSpread,
  buildAnalysisResult,
  serializeAnalysisResultForStorage,
  shouldSkipSymbolForAnalysis,
} = require("../Analyze/index");

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

test("filters out symbols when no weekly option expiration is available", () => {
  assert.equal(
    shouldSkipSymbolForAnalysis("No valid expiration found in option chain"),
    true,
  );
  assert.equal(
    shouldSkipSymbolForAnalysis(
      "Failed to fetch option chain for AAPL: No valid strike found above current price",
    ),
    true,
  );
  assert.equal(
    shouldSkipSymbolForAnalysis(
      "Temporary network error while fetching quotes",
    ),
    false,
  );
});
