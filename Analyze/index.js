const axios = require("axios");
const chalk = require("chalk");
const mysql = require("mysql2/promise");
require("dotenv").config();
const finnhub = require("finnhub");

const finnhubClient = new finnhub.DefaultApi();
finnhubClient.apiKey = process.env.FINNHUB_API_KEY;

const {
  initializeTastytrade,
  getQuote,
  getQuotes,
  getNextOption,
  getAccountHistory,
  getMarketMetrics,
} = require("./tastytrade");
const { getSP500Symbols } = require("./sp500");
const { getSectorETFs } = require("./etfs");
const sleep = require("./utils/sleep");
const AnalysisResult = require("../models/AnalysisResult");

// Trading parameters from environment variables
const MIN_STOCK_PRICE = parseFloat(process.env.MIN_STOCK_PRICE) || 30;
const MAX_STOCK_SPREAD_PCT = parseFloat(process.env.MAX_STOCK_SPREAD_PCT);
const MAX_STOCK_SPREAD = parseFloat(process.env.MAX_STOCK_SPREAD);
const MIN_MID_PERCENT = parseFloat(process.env.MIN_MID_PERCENT) || 3;
const DAYS_TO_EXPIRATION = parseInt(process.env.DAYS_TO_EXPIRATION) || 10;

function resolveMaxStockSpread(stockPrice, env = process.env) {
  const configuredPct = parseFloat(env?.MAX_STOCK_SPREAD_PCT);
  if (Number.isFinite(configuredPct) && configuredPct > 0) {
    return stockPrice * configuredPct;
  }

  const configuredSpread = parseFloat(env?.MAX_STOCK_SPREAD);
  if (Number.isFinite(configuredSpread) && configuredSpread >= 0) {
    return configuredSpread;
  }

  return stockPrice * 0.01;
}

// Create MySQL connection pool
const pool = mysql.createPool({
  host: "localhost",
  user: "nir",
  password: "tzur",
  database: "tastytrade",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Add function to get days to earnings date
async function getDaysToEarnings(symbol) {
  const maxRetries = 3;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      // Add a small delay before each request to avoid rate limits
      await sleep(1000);

      const today = new Date();
      const threeMonthsLater = new Date();
      threeMonthsLater.setMonth(today.getMonth() + 3);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(today.getMonth() - 6);

      const from = sixMonthsAgo.toISOString().split("T")[0];
      const to = threeMonthsLater.toISOString().split("T")[0];

      const earnings = await new Promise((resolve, reject) => {
        finnhubClient.earningsCalendar(
          { from, to, symbol },
          (error, data, response) => {
            if (error) {
              reject(error);
            } else {
              resolve(data);
            }
          },
        );
      });

      if (
        !earnings ||
        !earnings.earningsCalendar ||
        earnings.earningsCalendar.length === 0
      ) {
        return null;
      }

      // Sort by date
      const sortedEarnings = earnings.earningsCalendar.sort(
        (a, b) => new Date(a.date) - new Date(b.date),
      );

      // 1. Look for future earnings
      const nextEarnings = sortedEarnings.find(
        (e) => new Date(e.date) >= today,
      );

      if (nextEarnings) {
        const nextDate = new Date(nextEarnings.date);
        return Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
      }

      // 2. If no future earnings, find the most recent past earnings
      const lastEarnings = [...sortedEarnings]
        .reverse()
        .find((e) => new Date(e.date) < today);

      if (lastEarnings) {
        const lastDate = new Date(lastEarnings.date);
        // Returns negative number indicating days since last earnings
        return Math.ceil((lastDate - today) / (1000 * 60 * 60 * 24));
      }

      return null;
    } catch (error) {
      // Check if it's a rate limit error
      const isRateLimit = error.status === 429;

      if (isRateLimit && retries < maxRetries - 1) {
        retries++;
        const delay = 2000 * Math.pow(2, retries); // Exponential backoff
        if (isDebug) {
          console.log(
            `Rate limit hit for ${symbol}, retrying in ${delay}ms (Attempt ${
              retries + 1
            }/${maxRetries})`,
          );
        }
        await sleep(delay);
        continue;
      }

      if (isDebug) {
        console.error(
          `Failed to get earnings date for ${symbol}:`,
          error.message,
        );
      }
      return null;
    }
  }
  return null;
}

// Parse command line arguments
const args = process.argv.slice(2);
const isDebug =
  args.includes("-debug") || process.env.NODE_ENV === "development";
const symbols = args
  .filter((arg) => arg !== "-debug")
  .map((symbol) => symbol.toUpperCase());

async function fetchSymbolData(symbol, preFetchedQuote = null) {
  const warnings = [];

  try {
    // First get the quote data
    const quote = preFetchedQuote || (await getQuote(symbol));

    // Calculate stock spread and price
    const stockBid = parseFloat(quote?.bid) || null;
    const stockAsk = parseFloat(quote?.ask) || null;
    const stockSpread =
      stockAsk !== null && stockBid !== null ? stockAsk - stockBid : null;
    const stockPrice =
      parseFloat(quote?.last) ||
      (stockBid !== null && stockAsk !== null
        ? (stockBid + stockAsk) / 2
        : null);

    // Validate stock spread but do not drop the symbol entirely
    if (stockSpread !== null && stockPrice !== null) {
      const maxSpreadAllowed = resolveMaxStockSpread(stockPrice);
      if (stockSpread > maxSpreadAllowed) {
        warnings.push(
          `Stock spread $${stockSpread.toFixed(2)} exceeds maximum $${maxSpreadAllowed.toFixed(2)}`,
        );
        if (isDebug) {
          console.log(
            chalk.gray(
              `${symbol}: stock spread $${stockSpread.toFixed(
                2,
              )} exceeds max $${maxSpreadAllowed.toFixed(2)}`,
            ),
          );
        }
      }
    }

    let options = null;
    try {
      options = await getNextOption(symbol, quote);
    } catch (error) {
      warnings.push(`No valid option chain data available: ${error.message}`);
      if (isDebug) {
        console.warn(
          chalk.yellow(`${symbol}: unable to fetch a valid option chain`),
        );
      }
    }

    // Validate option bid-ask spread but keep the symbol in the analysis set
    if (options) {
      const optionBid = parseFloat(options.bid) || null;
      const optionAsk = parseFloat(options.ask) || null;
      const optionMid =
        optionBid !== null && optionAsk !== null
          ? (optionBid + optionAsk) / 2
          : null;

      if (optionMid > 0 && optionAsk !== null) {
        const optionSpread = optionAsk - optionBid;
        const optionSpreadPct = optionSpread / optionMid;
        if (optionSpreadPct > 0.15) {
          warnings.push(
            `Option bid-ask spread is ${(optionSpreadPct * 100).toFixed(1)}% of premium`,
          );
          if (isDebug) {
            console.log(
              chalk.gray(
                `${symbol}: option spread ${(optionSpreadPct * 100).toFixed(
                  1,
                )}% exceeds max 15%`,
              ),
            );
          }
        }
      }
    }

    return {
      symbol,
      quote,
      options,
      warnings,
    };
  } catch (error) {
    if (isDebug) {
      console.error(
        chalk.yellow(`Failed to fetch data for ${symbol}:`, error.message),
      );
    }
    return {
      symbol,
      quote: null,
      options: null,
      warnings: [error.message],
    };
  }
}

async function fetchIVRMap(symbols) {
  const ivrMap = new Map();
  try {
    const chunks = [];
    for (let i = 0; i < symbols.length; i += 50) {
      chunks.push(symbols.slice(i, i + 50));
    }

    for (const chunk of chunks) {
      try {
        const metrics = await getMarketMetrics(chunk);
        if (metrics && metrics.items) {
          metrics.items.forEach((item) => {
            if (
              item.symbol &&
              item["implied-volatility-index-rank"] !== undefined &&
              item["implied-volatility-index-rank"] !== null
            ) {
              ivrMap.set(
                item.symbol,
                parseFloat(item["implied-volatility-index-rank"]) * 100,
              );
            }
          });
        }
      } catch (chunkError) {
        console.error("Error fetching IVR chunk:", chunkError.message);
      }
    }
  } catch (e) {
    console.error("Error in fetchIVRMap:", e.message);
  }
  return ivrMap;
}

function normalizeAnalysisNotes(notes) {
  if (Array.isArray(notes)) {
    return notes.filter(Boolean).join("; ");
  }
  return notes || "";
}

function serializeAnalysisResultForStorage(result) {
  return {
    symbol: result.symbol,
    current_price: result.current_price,
    stock_bid: result.stock_bid,
    stock_ask: result.stock_ask,
    stock_spread: result.stock_spread,
    option_strike_price: result.option_strike_price,
    option_bid: result.option_bid,
    option_ask: result.option_ask,
    option_mid_price: result.option_mid_price,
    option_mid_percent: result.option_mid_percent,
    option_expiration_date: result.option_expiration_date,
    days_to_earnings: result.days_to_earnings,
    ivr: result.ivr,
    status: result.status,
    notes: normalizeAnalysisNotes(result.notes),
    analyzed_at: result.analyzed_at || new Date(),
  };
}

function shouldSkipSymbolForAnalysis(errorMessage) {
  if (!errorMessage) return false;

  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes("no valid expiration found") ||
    normalized.includes("no valid strike found") ||
    normalized.includes("no weekly") ||
    normalized.includes("no valid option chain data")
  );
}

function buildAnalysisResult({
  symbol,
  data,
  analyzedAt = new Date(),
  expirationWindowDate = new Date(),
  ivrMap = new Map(),
  daysToEarnings = null,
}) {
  const currentPrice = parseFloat(data?.quote?.last) || null;
  const stockBid = parseFloat(data?.quote?.bid) || null;
  const stockAsk = parseFloat(data?.quote?.ask) || null;
  const stockSpread = stockAsk && stockBid ? stockAsk - stockBid : null;
  const strikePrice = parseFloat(data?.options?.strike_price) || null;
  const optionBid = parseFloat(data?.options?.bid) || null;
  const optionAsk = parseFloat(data?.options?.ask) || null;
  const optionMidPrice =
    optionBid !== null && optionAsk !== null
      ? (optionBid + optionAsk) / 2
      : null;
  const optionMidPercent =
    strikePrice && optionMidPrice ? (optionMidPrice / strikePrice) * 100 : null;
  const optionExpirationDate = data?.options?.["expiration-date"]
    ? new Date(data.options["expiration-date"])
    : null;

  const analysisResult = {
    symbol,
    current_price: currentPrice,
    stock_bid: stockBid,
    stock_ask: stockAsk,
    stock_spread: stockSpread,
    option_strike_price: strikePrice,
    option_bid: optionBid,
    option_ask: optionAsk,
    option_mid_price: optionMidPrice,
    option_mid_percent: optionMidPercent,
    option_expiration_date: optionExpirationDate,
    ivr: ivrMap.get(symbol) || null,
    status: null,
    notes: [...(data?.warnings || [])],
    days_to_earnings: daysToEarnings,
    analyzed_at: analyzedAt,
  };

  if (!data?.options) {
    analysisResult.notes.push("No valid option chain data available");
  }

  if (currentPrice && currentPrice > MIN_STOCK_PRICE) {
    if (optionExpirationDate && optionExpirationDate <= expirationWindowDate) {
      if (optionMidPercent && parseFloat(optionMidPercent) > MIN_MID_PERCENT) {
        analysisResult.status = "HIGH_MID_PERCENT";
        analysisResult.notes.push(
          `Mid price ${optionMidPercent.toFixed(2)}% of strike exceeds minimum ${MIN_MID_PERCENT}%`,
        );
      } else {
        analysisResult.status = "LOW_MID_PERCENT";
        if (optionMidPercent) {
          analysisResult.notes.push(
            `Mid price ${optionMidPercent.toFixed(2)}% of strike below minimum ${MIN_MID_PERCENT}%`,
          );
        }
      }
    } else {
      analysisResult.status = "EXPIRATION_TOO_FAR";
      analysisResult.notes.push("Option expiration beyond target window");
    }
  } else {
    analysisResult.status = "LOW_STOCK_PRICE";
    analysisResult.notes.push(
      `Stock price $${currentPrice} below minimum $${MIN_STOCK_PRICE}`,
    );
  }

  return analysisResult;
}

async function storeAnalysisResult(result) {
  try {
    await AnalysisResult.upsert(serializeAnalysisResultForStorage(result));
  } catch (error) {
    console.error(`Error storing analysis for ${result.symbol}:`, error);
    throw error;
  }
}

async function processSymbols(symbols) {
  const results = [];
  const today = new Date();
  const expirationDate = new Date();
  expirationDate.setDate(today.getDate() + DAYS_TO_EXPIRATION);

  const ivrMap = await fetchIVRMap(symbols);

  for (let i = 0; i < symbols.length; i += 50) {
    const chunk = symbols.slice(i, i + 50);
    let chunkQuotes = [];
    try {
      chunkQuotes = await getQuotes(chunk);
    } catch (e) {
      console.error(
        `Error fetching quotes for chunk starting with ${chunk[0]}:`,
        e.message,
      );
    }

    const quotesMap = new Map();
    if (Array.isArray(chunkQuotes)) {
      chunkQuotes.forEach((q) => quotesMap.set(q.symbol, q));
    }

    for (const symbol of chunk) {
      const quote = quotesMap.get(symbol);
      const data = await fetchSymbolData(symbol, quote);
      const hasWeeklyOptionData = data?.options || false;
      if (
        !hasWeeklyOptionData &&
        shouldSkipSymbolForAnalysis(data?.warnings?.join(" ") || "")
      ) {
        continue;
      }

      let analysisResult = buildAnalysisResult({
        symbol,
        data,
        analyzedAt: today,
        expirationWindowDate: expirationDate,
        ivrMap,
      });

      try {
        const daysToEarnings = await getDaysToEarnings(symbol);
        if (daysToEarnings !== null && daysToEarnings !== undefined) {
          analysisResult.days_to_earnings = daysToEarnings;
          if (
            !analysisResult.notes.some((n) => n.includes("days until earnings"))
          ) {
            analysisResult.notes.push(`${daysToEarnings} days until earnings`);
          }
        }
      } catch (e) {
        if (isDebug) {
          console.error(
            `Error fetching days to earnings for ${symbol}:`,
            e.message,
          );
        }
      }

      await storeAnalysisResult(analysisResult);
      results.push(analysisResult);

      const currentPrice = analysisResult.current_price;
      const strikePrice = analysisResult.option_strike_price;
      const optionMidPrice = analysisResult.option_mid_price;
      const optionMidPercent = analysisResult.option_mid_percent;
      const optionExpirationDate = analysisResult.option_expiration_date;

      if (
        currentPrice &&
        currentPrice > MIN_STOCK_PRICE &&
        optionExpirationDate &&
        optionExpirationDate <= expirationDate
      ) {
        const output = `${symbol}: Price: $${currentPrice?.toFixed(2)} | Strike: $${strikePrice?.toFixed(2)} | Mid: $${optionMidPrice?.toFixed(2)} (${optionMidPercent?.toFixed(2)}% of strike) | Exp: ${optionExpirationDate?.toISOString().split("T")[0]}`;

        if (
          optionMidPercent &&
          parseFloat(optionMidPercent) > MIN_MID_PERCENT
        ) {
          const earningsOutput = analysisResult.days_to_earnings
            ? ` | Days to Earnings: ${analysisResult.days_to_earnings}`
            : "";
          console.log(chalk.yellow(output + earningsOutput));
        } else {
          console.log(chalk.cyan(output));
        }
      }
    }

    await sleep();
  }

  return results;
}

async function main() {
  try {
    let symbolsToProcess;
    if (symbols.length > 0) {
      symbolsToProcess = symbols;
      console.log(
        chalk.green(`Using provided symbols: ${symbolsToProcess.join(", ")}`),
      );
    } else {
      const sp500Symbols = await getSP500Symbols();
      const etfSymbols = getSectorETFs();
      symbolsToProcess = [...sp500Symbols, ...etfSymbols];
      console.log(
        chalk.green(
          `Using S&P 500 symbols (${sp500Symbols.length} total) and ${etfSymbols.length} sector ETFs...`,
        ),
      );
    }

    await initializeTastytrade();
    console.log(chalk.green("Tastytrade client initialized successfully"));

    const results = await processSymbols(symbolsToProcess);

    console.log(chalk.green("\nProcessing complete!"));
    console.log(`Total symbols processed: ${results.length}`);
  } catch (error) {
    console.error(chalk.red("Application error:", error));
    process.exit(1);
  }
}

// Process symbols with progress callback
async function processSymbolsWithProgress(symbols, progressCallback) {
  const results = [];
  const today = new Date();
  const expirationDate = new Date();
  expirationDate.setDate(today.getDate() + DAYS_TO_EXPIRATION);
  let processedCount = 0;

  const ivrMap = await fetchIVRMap(symbols);

  const processSymbol = async (symbol, preFetchedQuote = null) => {
    let analysisResult;
    try {
      const data = await fetchSymbolData(symbol, preFetchedQuote);
      if (data) {
        const hasWeeklyOptionData = data?.options || false;
        if (
          !hasWeeklyOptionData &&
          shouldSkipSymbolForAnalysis(data?.warnings?.join(" ") || "")
        ) {
          return null;
        }

        // Get days to earnings for all symbols regardless of readiness
        const daysToEarnings = await getDaysToEarnings(symbol);

        analysisResult = buildAnalysisResult({
          symbol,
          data,
          analyzedAt: today,
          expirationWindowDate: expirationDate,
          ivrMap,
          daysToEarnings,
        });
      }
    } catch (error) {
      console.error(chalk.red(`Error processing ${symbol}: ${error.message}`));
      analysisResult = {
        symbol,
        analyzed_at: today,
        status: "ERROR",
        notes: `Error: ${error.message}`,
      };
    }

    // Save to database
    if (analysisResult) {
      try {
        await storeAnalysisResult(analysisResult);
      } catch (dbError) {
        console.error(`Error saving ${symbol} to database:`, dbError);
      }
    }

    processedCount++;
    // Send progress update
    progressCallback({
      type: "progress",
      current: processedCount,
      total: symbols.length,
      symbol: symbol,
      message: `Processing ${symbol}... (${processedCount}/${symbols.length})`,
    });

    return analysisResult;
  };

  // Process symbols in chunks of 50
  for (let i = 0; i < symbols.length; i += 50) {
    const chunk = symbols.slice(i, i + 50);
    let chunkQuotes = [];
    try {
      chunkQuotes = await getQuotes(chunk);
    } catch (e) {
      console.error(
        `Error fetching quotes for chunk starting with ${chunk[0]}:`,
        e.message,
      );
    }

    // Create a map for quick lookup
    const quotesMap = new Map();
    if (Array.isArray(chunkQuotes)) {
      chunkQuotes.forEach((q) => quotesMap.set(q.symbol, q));
    }

    for (const symbol of chunk) {
      const quote = quotesMap.get(symbol);
      const result = await processSymbol(symbol, quote);
      if (result) {
        results.push(result);
      }
    }
  }

  return results;
}

if (require.main === module) {
  main();
}

module.exports = {
  initializeTastytrade,
  processSymbols,
  processSymbolsWithProgress,
  getAccountHistory,
  resolveMaxStockSpread,
  buildAnalysisResult,
  serializeAnalysisResultForStorage,
  shouldSkipSymbolForAnalysis,
};
