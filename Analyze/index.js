const axios = require("axios");
const chalk = require("chalk");
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
      results.push(data);
      // Show output immediately after processing
      const currentPrice = parseFloat(data.quote?.last) || null;
      const strikePrice = parseFloat(data.options?.strike_price) || null;
      const bidPrice = parseFloat(data.options?.bid) || null;
      const askPrice = parseFloat(data.options?.ask) || null;
      const midPrice = bidPrice && askPrice ? (bidPrice + askPrice) / 2 : null;
      const midPercent =
        strikePrice && midPrice
          ? ((midPrice / strikePrice) * 100).toFixed(2)
          : null;
      const optionExpirationDate = new Date(data.options["expiration-date"]);

      // Only show symbols with:
      // - price above MIN_STOCK_PRICE
      // - expiration within DAYS_TO_EXPIRATION
      if (
        currentPrice &&
        currentPrice > MIN_STOCK_PRICE &&
        optionExpirationDate <= expirationDate
      ) {
        const output = `${symbol}: Price: $${currentPrice?.toFixed(
          2
        )} | Strike: $${strikePrice?.toFixed(2)} | Mid: $${midPrice?.toFixed(
          2
        )} (${midPercent}% of strike) | Exp: ${
          optionExpirationDate.toISOString().split("T")[0]
        }`;

        // Highlight lines where mid price is more than MIN_MID_PERCENT of strike
        if (midPercent && parseFloat(midPercent) > MIN_MID_PERCENT) {
          // Get days to earnings date
          const daysToEarnings = await getDaysToEarnings(symbol);
          const earningsOutput = daysToEarnings
            ? ` | Days to Earnings: ${daysToEarnings}`
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
