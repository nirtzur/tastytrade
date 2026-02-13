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
  getNextOption,
  getAccountHistory,
} = require("./tastytrade");
const { getSP500Symbols } = require("./sp500");
const { getSectorETFs } = require("./etfs");
const sleep = require("./utils/sleep");
const AnalysisResult = require("../models/AnalysisResult");

// Trading parameters from environment variables
const MIN_STOCK_PRICE = parseFloat(process.env.MIN_STOCK_PRICE) || 30;
const MAX_STOCK_SPREAD = parseFloat(process.env.MAX_STOCK_SPREAD) || 15;
const MIN_MID_PERCENT = parseFloat(process.env.MIN_MID_PERCENT) || 3;
const DAYS_TO_EXPIRATION = parseInt(process.env.DAYS_TO_EXPIRATION) || 10;

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
          }
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
        (a, b) => new Date(a.date) - new Date(b.date)
      );

      // 1. Look for future earnings
      const nextEarnings = sortedEarnings.find(
        (e) => new Date(e.date) >= today
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
            }/${maxRetries})`
          );
        }
        await sleep(delay);
        continue;
      }

      if (isDebug) {
        console.error(
          `Failed to get earnings date for ${symbol}:`,
          error.message
        );
      }
      return null;
    }
  }
  return null;
}

// Parse command line arguments
const args = process.argv.slice(2);
const isDebug = args.includes("-debug");
const symbols = args
  .filter((arg) => arg !== "-debug")
  .map((symbol) => symbol.toUpperCase());

async function fetchSymbolData(symbol) {
  try {
    // First get the quote data
    const quote = await getQuote(symbol);

    // Calculate stock spread
    const stockBid = parseFloat(quote?.bid) || null;
    const stockAsk = parseFloat(quote?.ask) || null;
    const stockSpread = stockAsk - stockBid;

    // Validate stock spread before proceeding
    if (stockSpread > MAX_STOCK_SPREAD) {
      if (isDebug) {
        console.log(
          chalk.gray(
            `Skipping ${symbol}: Stock spread $${stockSpread.toFixed(
              2
            )} exceeds maximum of $${MAX_STOCK_SPREAD}`
          )
        );
      }
      return null;
    }

    // Then use the quote data to get the option chain
    const options = await getNextOption(symbol, quote);

    return {
      symbol,
      quote,
      options,
    };
  } catch (error) {
    if (isDebug) {
      console.error(
        chalk.yellow(`Failed to fetch data for ${symbol}:`, error.message)
      );
    }
    return null;
  }
}

async function storeAnalysisResult(result) {
  try {
    await AnalysisResult.upsert({
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
      status: result.status,
      notes: result.notes.join("; "),
    });
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

  for (const symbol of symbols) {
    const data = await fetchSymbolData(symbol);
    if (data) {
      const currentPrice = parseFloat(data.quote?.last) || null;
      const stockBid = parseFloat(data.quote?.bid) || null;
      const stockAsk = parseFloat(data.quote?.ask) || null;
      const stockSpread = stockAsk && stockBid ? stockAsk - stockBid : null;
      const strikePrice = parseFloat(data.options?.strike_price) || null;
      const optionBid = parseFloat(data.options?.bid) || null;
      const optionAsk = parseFloat(data.options?.ask) || null;
      const optionMidPrice =
        optionBid && optionAsk ? (optionBid + optionAsk) / 2 : null;
      const optionMidPercent =
        strikePrice && optionMidPrice
          ? (optionMidPrice / strikePrice) * 100
          : null;
      const optionExpirationDate = data.options["expiration-date"]
        ? new Date(data.options["expiration-date"])
        : null;

      // Prepare analysis result object
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
        status: null,
        notes: [],
        days_to_earnings: null,
      };

      // Add analysis notes and status
      if (currentPrice && currentPrice > MIN_STOCK_PRICE) {
        if (optionExpirationDate && optionExpirationDate <= expirationDate) {
          if (
            optionMidPercent &&
            parseFloat(optionMidPercent) > MIN_MID_PERCENT
          ) {
            analysisResult.status = "HIGH_MID_PERCENT";
            analysisResult.notes.push(
              `Mid price ${optionMidPercent.toFixed(
                2
              )}% of strike exceeds minimum ${MIN_MID_PERCENT}%`
            );
          } else {
            analysisResult.status = "LOW_MID_PERCENT";
            if (optionMidPercent) {
              analysisResult.notes.push(
                `Mid price ${optionMidPercent.toFixed(
                  2
                )}% of strike below minimum ${MIN_MID_PERCENT}%`
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
          `Stock price $${currentPrice} below minimum $${MIN_STOCK_PRICE}`
        );
      }

      // Always attempt to fetch days to earnings for every symbol
      try {
        const daysToEarnings = await getDaysToEarnings(symbol);
        if (daysToEarnings !== null && daysToEarnings !== undefined) {
          analysisResult.days_to_earnings = daysToEarnings;
          // Only add note if not already added for this info
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
            e.message
          );
        }
      }

      // Join notes into a single string
      const notes = analysisResult.notes.join("; ");

      // Store in database immediately
      await storeAnalysisResult(analysisResult);

      results.push(analysisResult);

      // Console output for immediate feedback
      if (
        currentPrice &&
        currentPrice > MIN_STOCK_PRICE &&
        optionExpirationDate <= expirationDate
      ) {
        const output = `${symbol}: Price: $${currentPrice?.toFixed(
          2
        )} | Strike: $${strikePrice?.toFixed(
          2
        )} | Mid: $${optionMidPrice?.toFixed(2)} (${optionMidPercent?.toFixed(
          2
        )}% of strike) | Exp: ${
          optionExpirationDate?.toISOString().split("T")[0]
        }`;

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
    // Add a small delay to avoid rate limiting
    await sleep();
  }

  return results;
}

async function main() {
  try {
    // Get symbols from command line arguments or use S&P 500 + ETFs
    let symbolsToProcess;
    if (symbols.length > 0) {
      symbolsToProcess = symbols;
      console.log(
        chalk.green(`Using provided symbols: ${symbolsToProcess.join(", ")}`)
      );
    } else {
      const sp500Symbols = await getSP500Symbols();
      const etfSymbols = getSectorETFs();
      symbolsToProcess = [...sp500Symbols, ...etfSymbols];
      console.log(
        chalk.green(
          `Using S&P 500 symbols (${sp500Symbols.length} total) and ${etfSymbols.length} sector ETFs...`
        )
      );
    }

    // Initialize Tastytrade client
    await initializeTastytrade();
    console.log(chalk.green("Tastytrade client initialized successfully"));

    // Process symbols
    const results = await processSymbols(symbolsToProcess);

    // Log completion
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

  const processSymbol = async (symbol) => {
    let analysisResult;
    try {
      const data = await fetchSymbolData(symbol);
      if (data) {
        const currentPrice = parseFloat(data.quote?.last) || null;
        const stockBid = parseFloat(data.quote?.bid) || null;
        const stockAsk = parseFloat(data.quote?.ask) || null;
        const stockSpread = stockAsk && stockBid ? stockAsk - stockBid : null;
        const strikePrice = parseFloat(data.options?.strike_price) || null;
        const optionBid = parseFloat(data.options?.bid || 0);
        const optionAsk = parseFloat(data.options?.ask) || null;
        const optionMidPrice = (optionBid + optionAsk) / 2;
        const optionMidPercent =
          strikePrice && optionMidPrice
            ? (optionMidPrice / strikePrice) * 100
            : null;
        const optionExpirationDate = data.options["expiration-date"]
          ? new Date(data.options["expiration-date"])
          : null;

        // Get days to earnings for all symbols regardless of readiness
        let daysToEarnings = await getDaysToEarnings(symbol);

        analysisResult = {
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
          days_to_earnings: daysToEarnings,
          analyzed_at: today,
          status: "ANALYZING", // Default status
        };

        // Determine final status
        if (currentPrice && currentPrice < MIN_STOCK_PRICE) {
          analysisResult.status = "LOW_STOCK_PRICE";
        } else if (stockSpread && stockSpread > MAX_STOCK_SPREAD) {
          analysisResult.status = "HIGH_SPREAD";
        } else if (optionMidPercent && optionMidPercent < MIN_MID_PERCENT) {
          analysisResult.status = "LOW_MID_PERCENT";
        } else if (
          currentPrice &&
          stockSpread &&
          optionMidPercent &&
          currentPrice >= MIN_STOCK_PRICE &&
          stockSpread <= MAX_STOCK_SPREAD &&
          optionMidPercent >= MIN_MID_PERCENT
        ) {
          analysisResult.status = "READY";
        } else {
          analysisResult.status = "NOT_READY";
        }
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
        await AnalysisResult.upsert(analysisResult, {
          where: { symbol, analyzed_at: analysisResult.analyzed_at },
        });
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

  // Process symbols sequentially (no concurrency)
  for (const symbol of symbols) {
    const result = await processSymbol(symbol);
    if (result) {
      results.push(result);
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
};
