const axios = require("axios");
const chalk = require("chalk");
const mysql = require("mysql2/promise");
const yahooFinance = require("yahoo-finance2").default;
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

require("dotenv").config();

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
  try {
    const result = await yahooFinance.quote(symbol, {
      fields: ["earningsTimestamp"],
    });

    if (!result.earningsTimestamp) {
      return null;
    }
    const today = new Date();
    const daysToEarnings = Math.ceil(
      (result.earningsTimestamp - today) / (1000 * 60 * 60 * 24)
    );

    return daysToEarnings;
  } catch (error) {
    if (isDebug) {
      console.error(
        `Failed to get earnings date for ${symbol}:`,
        error.message
      );
    }
    return null;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const isDebug = args.includes("-debug");
const symbols = args
  .filter((arg) => arg !== "-debug")
  .map((symbol) => symbol.toUpperCase());

async function fetchSymbolData(symbol, token) {
  try {
    // First get the quote data
    const quote = await getQuote(symbol, token);

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
    const options = await getNextOption(symbol, token, quote);

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
      analyzed_at: new Date(),
    });
  } catch (error) {
    console.error(`Error storing analysis for ${result.symbol}:`, error);
    throw error;
  }
}

async function processSymbols(symbols, token) {
  const results = [];
  const today = new Date();
  const expirationDate = new Date();
  expirationDate.setDate(today.getDate() + DAYS_TO_EXPIRATION);

  for (const symbol of symbols) {
    const data = await fetchSymbolData(symbol, token);
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

            // Get days to earnings
            const daysToEarnings = await getDaysToEarnings(symbol);
            if (daysToEarnings) {
              analysisResult.days_to_earnings = daysToEarnings;
              analysisResult.notes.push(
                `${daysToEarnings} days until earnings`
              );
            }
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
    const token = await initializeTastytrade();
    console.log(chalk.green("Tastytrade client initialized successfully"));

    // Process symbols
    const results = await processSymbols(symbolsToProcess, token);

    // Log completion
    console.log(chalk.green("\nProcessing complete!"));
    console.log(`Total symbols processed: ${results.length}`);
  } catch (error) {
    console.error(chalk.red("Application error:", error));
    process.exit(1);
  }
}

// Process symbols with progress callback
async function processSymbolsWithProgress(symbols, token, progressCallback) {
  const results = [];
  const today = new Date();
  const expirationDate = new Date();
  expirationDate.setDate(today.getDate() + DAYS_TO_EXPIRATION);

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];

    // Send progress update
    progressCallback({
      type: "progress",
      current: i + 1,
      total: symbols.length,
      symbol: symbol,
      message: `Processing ${symbol}... (${i + 1}/${symbols.length})`,
    });

    const data = await fetchSymbolData(symbol, token);
    if (data) {
      const currentPrice = parseFloat(data.quote?.last) || null;
      const stockBid = parseFloat(data.quote?.bid) || null;
      const stockAsk = parseFloat(data.quote?.ask) || null;
      const stockSpread = stockAsk && stockBid ? stockAsk - stockBid : null;
      const strikePrice = parseFloat(data.options?.strike_price) || null;
      const optionBid = parseFloat(data.options?.bid || 0);
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

      // Get days to earnings (same as original processSymbols)
      let daysToEarnings = null;
      if (
        optionMidPercent &&
        parseFloat(optionMidPercent) > MIN_MID_PERCENT &&
        currentPrice &&
        currentPrice > MIN_STOCK_PRICE &&
        optionExpirationDate &&
        optionExpirationDate <= expirationDate
      ) {
        daysToEarnings = await getDaysToEarnings(symbol);
      }

      // Prepare analysis result object (same as original processSymbols)
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
        days_to_earnings: daysToEarnings,
        analyzed_at: today,
        status: "ANALYZING",
      };

      // Apply the same logic as original processSymbols for status determination
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
      }

      results.push(analysisResult);

      // Save to database
      try {
        await AnalysisResult.upsert(analysisResult, {
          where: { symbol },
        });
      } catch (dbError) {
        console.error(`Error saving ${symbol} to database:`, dbError);
      }
    }

    // Add small delay to prevent overwhelming the API
    await sleep(100);
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
