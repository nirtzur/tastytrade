const axios = require("axios");
const sleep = require("./utils/sleep");
const WebSocket = require("ws");
const TastytradeClient = require("@tastytrade/api").default;

// Setup global WebSocket and window as required by the library for Node.js usage
global.WebSocket = WebSocket;
global.window = {
  WebSocket,
  setTimeout,
  clearTimeout,
};
require("dotenv").config();

// Validate required environment variables
const REQUIRED_ENV_VARS = [
  "TASTYTRADE_BASE_URL",
  "TASTYTRADE_ACCOUNT_NUMBER",
  "TASTYTRADE_CLIENT_SECRET",
];

function validateEnvironment() {
  const missing = REQUIRED_ENV_VARS.filter((varName) => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

const baseUrl = process.env.TASTYTRADE_BASE_URL;

let tastytradeClient = null;

async function initializeTastytrade({ username = null, password = null } = {}) {
  try {
    validateEnvironment();

    // If client exists and we are not forcing a new login, just return success
    if (tastytradeClient && !username && !password) {
      return { success: true };
    }

    console.log(
      "Initializing Tastytrade with URL:",
      process.env.TASTYTRADE_BASE_URL
    );

    // Initialize client without fixed refresh token
    const config = {
      baseUrl: process.env.TASTYTRADE_BASE_URL,
      accountStreamerUrl: "wss://streamer.tastyworks.com",
      clientSecret: process.env.TASTYTRADE_CLIENT_SECRET,
      oauthScopes: ["read", "trade"],
    };

    // Create new client (or overwrite existing if login requested)
    tastytradeClient = new TastytradeClient(config);

    if (username && password) {
      console.log("Logging in with username/password...");
      await tastytradeClient.sessionService.login(username, password);
      console.log("Login successful via SDK");
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error("Authentication error details:", {
      message: error.message,
      stack: error.stack,
    });
    throw new Error(`Failed to authenticate with Tastytrade: ${error.message}`);
  }
}

// Helper to access the initialized client
function getClient() {
  if (!tastytradeClient) {
    throw new Error("Tastytrade client not initialized");
  }
  return tastytradeClient;
}

// ... existing logic but refactored to use client ...

// Note: Removed sessionToken param as it is handled by the client internall via OAuth
async function getQuote(symbol) {
  try {
    // Determine last price using market-data API
    // Note: The SDK's marketDataService is for streaming. For snapshots, we use raw HTTP client.
    const client = getClient();
    const marketData = await client.httpClient.getData(
      `/market-data/Equity/${symbol}`
    );

    // SDK returns the data payload directly if unwrapped, or axios response.
    // Let's assume unwrapped based on typical SDK behavior, but handle both just in case.
    const quoteData = marketData.data || marketData;

    return {
      symbol: quoteData.symbol,
      last: quoteData.last,
      bid: quoteData.bid,
      ask: quoteData.ask,
      volume: quoteData.volume,
    };
  } catch (error) {
    console.error(
      "Quote error details:",
      error.response?.data || error.message
    );
    throw new Error(`Failed to fetch quote for ${symbol}: ${error.message}`);
  }
}

async function findNextExpiration(chainResponse, today) {
  // Chain response structure might differ if SDK wraps it?
  // Assuming standard API response structure: { data: { items: [...] } } or { items: [...] }
  const data = chainResponse.data || chainResponse;

  if (!data?.items) {
    throw new Error("No option chain data received");
  }

  const option = data.items[0].expirations.find((expiration) => {
    const isWeeklyOrRegular = ["Weekly", "Regular"].includes(
      expiration["expiration-type"]
    );

    const daysToExpiration = expiration["days-to-expiration"];

    const isValidExpiration = daysToExpiration > 3 && daysToExpiration <= 10;

    return isWeeklyOrRegular && isValidExpiration;
  });

  if (!option) {
    throw new Error("No valid expiration found in option chain");
  }

  return option;
}

async function findStrikeAbovePrice(option, currentPrice) {
  const strike = option.strikes.find((strike) => {
    const isCall = strike.call !== null;
    const isAbovePrice = parseFloat(strike["strike-price"]) > currentPrice;
    return isCall && isAbovePrice;
  });

  if (!strike) {
    throw new Error("No valid strike found above current price");
  }

  return {
    ...option,
    symbol: strike.call,
    strike_price: strike["strike-price"],
  };
}

async function getOptionQuote(option) {
  const client = getClient();
  const optionQuoteResponse = await client.httpClient.getData(
    `/market-data/Equity Option/${option.symbol}`
  );

  const data = optionQuoteResponse.data || optionQuoteResponse;

  if (!data) {
    throw new Error("No option quote data received");
  }

  return {
    ...option,
    bid: data.bid,
    ask: data.ask,
    last: data.last,
  };
}

// Note: Removed sessionToken param
async function getNextOption(symbol, quoteData) {
  try {
    if (!quoteData) {
      throw new Error("Quote data is required");
    }

    const currentBid = parseFloat(quoteData.bid);
    const currentAsk = parseFloat(quoteData.ask);
    const currentPrice = (currentBid + currentAsk) / 2;
    const today = new Date().toISOString().split("T")[0];

    // Get the option chain data using SDK (InstrumentsService)
    // Or just fetch the nested chain URL directly like before if easier?
    // Let's use SDK service method properly.
    const client = getClient();
    // Use raw request for nested chain for simplicity matching old URL structure if SDK method is complex
    const chainResponse = await client.httpClient.getData(
      `/option-chains/${symbol}/nested`
    );

    // Find the next expiration
    const expiration = await findNextExpiration(chainResponse, today);

    // Find the strike above current price
    const strike = await findStrikeAbovePrice(expiration, currentPrice);

    // Get the option quote
    return await getOptionQuote(strike);
  } catch (error) {
    throw new Error(
      `Failed to fetch option chain for ${symbol}: ${error.message}`
    );
  }
}

// Note: Removed sessionToken param
async function getAccountHistory(startDate, endDate) {
  try {
    const defaultStartDate = "2024-11-01";
    const defaultEndDate = new Date().toISOString().split("T")[0];

    startDate = startDate || defaultStartDate;
    endDate = endDate || defaultEndDate;

    const client = getClient();

    // Using SDK Service
    // Note: getAccountTransactions takes (accountNumber, queryParams)
    // We map params to object
    let params = {
      sort: "Asc",
      "start-at": startDate,
      "end-date": endDate,
    };

    let response = await client.transactionsService.getAccountTransactions(
      process.env.TASTYTRADE_ACCOUNT_NUMBER,
      params
    );

    let data = response.data || response;

    if (!data?.items) {
      // Maybe wrapped differently?
      if (Array.isArray(response)) return response; // Some SDKs return array directly
      // Fallback
      throw new Error("No account history data received");
    }

    let allTransactions = data.items;

    // Pagination handling
    // We need to loop if pages exist
    while (
      data.pagination &&
      data.pagination["page-offset"] < data.pagination["total-pages"]
    ) {
      const nextPageOffset = data.pagination["page-offset"] + 1;
      params["page-offset"] = nextPageOffset;

      response = await client.transactionsService.getAccountTransactions(
        process.env.TASTYTRADE_ACCOUNT_NUMBER,
        params
      );

      data = response.data || response;
      if (!data?.items) {
        break;
      }
      allTransactions = allTransactions.concat(data.items);
    }
    return allTransactions;
  } catch (error) {
    console.error(
      "Account history error details:",
      error.response?.data || error.message
    );
    throw new Error(`Failed to fetch account history: ${error.message}`);
  }
}

// Note: Removed sessionToken param
async function getPositions() {
  try {
    const client = getClient();
    const response = await client.balancesAndPositionsService.getPositionsList(
      process.env.TASTYTRADE_ACCOUNT_NUMBER
    );

    const data = response.data || response;

    if (!data?.items) {
      throw new Error("No positions data received");
    }

    // Group positions by underlying symbol
    const positionsBySymbol = data.items.reduce((acc, item) => {
      const symbol = item["underlying-symbol"];
      if (!acc[symbol]) {
        acc[symbol] = {
          equity: null,
          option: null,
        };
      }

      if (item["instrument-type"] === "Equity") {
        acc[symbol].equity = item;
      } else if (item["instrument-type"] === "Equity Option") {
        acc[symbol].option = item;
      }
      return acc;
    }, {});

    // Convert grouped positions into aggregated records
    // Note: accountHistory was unused in original code, removing it.

    const aggregatedPositions = Object.entries(positionsBySymbol)
      .filter(([_, data]) => data.equity && data.option)
      .map(([symbol, data]) => {
        const optionSymbol = data.option.symbol;
        const match = optionSymbol.match(/(\d{5})(\d{3})$/);
        const optionPrice = match ? parseFloat(`${match[1]}.${match[2]}`) : 0;

        return {
          ...data.equity,
          "close-price": data.equity["close-price"],
          "option-price": optionPrice,
          "average-open-price": data.equity["average-open-price"],
        };
      });

    return aggregatedPositions;
  } catch (error) {
    console.error(
      "Positions error details:",
      error.response?.data || error.message
    );
    throw new Error(`Failed to fetch positions: ${error.message}`);
  }
}

async function logout() {
  try {
    const client = getClient();
    await client.sessionService.logout();
    console.log("Logged out successfully");
  } catch (error) {
    console.error("Logout error:", error.message);
    // Best effort logout
  }
}

module.exports = {
  initializeTastytrade,
  getQuote,
  getNextOption,
  getAccountHistory,
  getPositions,
  logout,
};
