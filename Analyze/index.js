const axios = require("axios");
const chalk = require("chalk");
const mysql = require("mysql2/promise");
const {
  initializeTastytrade,
  getQuote,
  getNextOption,
  getAccountHistory,
} = require("./tastytrade");
const { getSP500Symbols } = require("./sp500");
const { getSectorETFs } = require("./etfs");
const sleep = require("./utils/sleep");

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
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      throw new Error("Finnhub API key not found in environment variables");
    }

    const response = await axios.get(
      `https://finnhub.io/api/v1/calendar/earnings?symbol=${symbol}&token=${apiKey}`
    );

    if (!response?.data?.earningsCalendar?.[0]?.date) {
      return null;
    }

    const earningsDate = new Date(response.data.earningsCalendar[0].date);
    const today = new Date();
    const daysToEarnings = Math.ceil(
      (earningsDate - today) / (1000 * 60 * 60 * 24)
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
      const connection = await pool.getConnection();
      try {
        await connection.query(
          `REPLACE INTO analysis_results (
            symbol,
            current_price,
            stock_bid,
            stock_ask,
            stock_spread,
            option_strike_price,
            option_bid,
            option_ask,
            option_mid_price,
            option_mid_percent,
            option_expiration_date,
            days_to_earnings,
            status,
            notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            symbol,
            currentPrice,
            stockBid,
            stockAsk,
            stockSpread,
            strikePrice,
            optionBid,
            optionAsk,
            optionMidPrice,
            optionMidPercent,
            optionExpirationDate,
            analysisResult.days_to_earnings,
            analysisResult.status,
            notes,
          ]
        );
      } catch (error) {
        console.error(`Error storing analysis for ${symbol}:`, error);
        throw error;
      } finally {
        connection.release();
      }

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

if (require.main === module) {
  main();
}

module.exports = {
  initializeTastytrade,
  processSymbols,
  getAccountHistory,
};
