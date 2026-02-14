const axios = require("axios");
const sleep = require("./utils/sleep");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
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
// Since password login is removed, TASTYTRADE_REFRESH_TOKEN is now mandatory.
const REQUIRED_ENV_VARS = [
  "TASTYTRADE_BASE_URL",
  "TASTYTRADE_ACCOUNT_NUMBER",
  "TASTYTRADE_CLIENT_SECRET",
  "TASTYTRADE_REFRESH_TOKEN",
];

function validateEnvironment() {
  const missing = REQUIRED_ENV_VARS.filter((varName) => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}

const baseUrl = process.env.TASTYTRADE_BASE_URL;

let tastytradeClient = null;
let sessionExpiration = 0;

function handleApiError(error) {
  if (
    error.response?.status === 401 ||
    (error.message && error.message.includes("401"))
  ) {
    console.log("Session expired or invalid (401). Resetting session.");
    sessionExpiration = 0;
    tastytradeClient = null;
  }
}

async function initializeTastytrade() {
  try {
    validateEnvironment();

    // 1. Check if session is explicitly valid based on time
    if (tastytradeClient && Date.now() < sessionExpiration) {
      return { success: true };
    }

    const config = {
      baseUrl: process.env.TASTYTRADE_BASE_URL,
      accountStreamerUrl: "wss://streamer.tastyworks.com",
      clientSecret: process.env.TASTYTRADE_CLIENT_SECRET,
      oauthScopes: ["read", "trade"],
    };

    // 2. Initialize with Refresh Token from Environment
    if (process.env.TASTYTRADE_REFRESH_TOKEN) {
      config.refreshToken = process.env.TASTYTRADE_REFRESH_TOKEN;

      console.log("Initializing/Refreshing Tastytrade session...");
      tastytradeClient = new TastytradeClient(config);

      // Trigger an initial session validation to ensure we are actually connected
      try {
        await tastytradeClient.sessionService.validate();
        console.log("Session validated successfully via SDK");
      } catch (valError) {
        // If generic validation fails, we might still be okay if sdk auto-refreshes,
        // but logging it is good.
        console.warn(
          "Initial session validation warn (might auto-resolve):",
          valError.message,
        );
      }

      // We assume the new client will obtain an access token shortly.
      // Set expiration to 15 minutes from now.
      sessionExpiration = Date.now() + 15 * 60 * 1000;

      return { success: true };
    }

    // This part should be unreachable now due to validateEnvironment,
    // but throwing explicitly is safer.
    throw new Error("No refresh token available to initialize session");
  } catch (error) {
    console.error("Authentication error details:", {
      message: error.message,
      stack: error.stack,
    });
    sessionExpiration = 0;
    tastytradeClient = null;
    throw new Error(`Failed to authenticate with Tastytrade: ${error.message}`);
  }
}

function isLoggedIn() {
  return !!tastytradeClient && Date.now() < sessionExpiration;
}

function getClient() {
  if (!tastytradeClient) {
    throw new Error("Tastytrade client not initialized");
  }
  if (!isLoggedIn()) {
    throw new Error("Tastytrade session is not active. Please log in.");
  }
  return tastytradeClient;
}

// Service Wrappers

const RATE_LIMIT_DELAY = 300;
const MAX_RETRIES = 3;

async function getQuotes(symbols) {
  if (!Array.isArray(symbols)) {
    return [await getQuote(symbols)];
  }

  const chunks = [];
  for (let i = 0; i < symbols.length; i += 50) {
    chunks.push(symbols.slice(i, i + 50));
  }

  const results = [];

  for (const chunk of chunks) {
    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        // Auto-reconnect logic
        if (!isLoggedIn()) {
          console.log("Session inactive. Attempting re-login...");
          await initializeTastytrade();
          if (!isLoggedIn()) {
            throw new Error("Tastytrade session is not active. Please log in.");
          }
        }

        const client = getClient();
        const indices = ["SPX", "VIX", "RUT", "NDX", "DJX"];
        let url = "";

        // Determine if any symbol is likely an index
        const hasIndex = chunk.some((s) => indices.includes(s));

        if (hasIndex) {
          const equitySyms = chunk.filter((s) => !indices.includes(s));
          const indexSyms = chunk.filter((s) => indices.includes(s));

          let queryParts = [];
          if (equitySyms.length > 0)
            queryParts.push(`equity=${equitySyms.join(",")}`);
          if (indexSyms.length > 0)
            queryParts.push(`index=${indexSyms.join(",")}`);

          url = `/market-data/by-type?${queryParts.join("&")}`;
        } else {
          url = `/market-data/by-type?equity=${chunk.join(",")}`;
        }

        console.log(`Fetching quotes URL: ${url}`);
        const marketData = await client.httpClient.getData(url);

        console.log(`Received market data for ${chunk.length} symbols`);

        if (marketData.headers && marketData.headers["x-ratelimit-remaining"]) {
          const remaining = parseInt(
            marketData.headers["x-ratelimit-remaining"],
            10,
          );
          if (remaining < 10) {
            console.warn(
              `Rate limit warning for chunk: ${remaining} requests remaining.`,
            );
          }
        }

        const responseBody = marketData.data || marketData;

        // Simplified extraction as per verified structure:
        // { data: { items: [...] } }
        const items = responseBody.data?.items || [];
        const quotes = items.map((quoteData) => ({
          symbol: quoteData.symbol,
          last: quoteData.last,
          bid: quoteData.bid,
          ask: quoteData.ask,
          volume: quoteData.volume,
        }));

        results.push(...quotes);
        break; // Success, move to next chunk
      } catch (error) {
        // Handle 401 Unauthorized - Re-login attempt
        if (error.response?.status === 401) {
          console.warn(
            "Received 401 Unauthorized. Invalidating session and retrying...",
          );
          handleApiError(error); // Marks session inactive
          retries++;
          await sleep(1000); // Wait a bit before re-login attempt
          continue;
        }

        if (error.response?.status === 429) {
          retries++;
          if (retries >= MAX_RETRIES) {
            console.error(
              `Max retries reached for chunk starting with ${chunk[0]} after 429 Token limit`,
            );
            // Instead of throwing, maybe return empty for this chunk or rethrow?
            // Throwing stops everything. Let's throw to be consistent with existing logic,
            // but caller needs to handle it.
            // Actually, if we throw, we lose partial results.
            // But existing code throws on single symbol failure.
            throw new Error(
              `Failed to fetch quotes for chunk: Rate limit exceeded`,
            );
          }
          let delay = RATE_LIMIT_DELAY * Math.pow(2, retries - 1);

          if (error.response?.headers) {
            const reset = error.response.headers["x-ratelimit-reset"];
            if (reset) {
              const resetTime = parseInt(reset, 10);
              const resetMs =
                resetTime < 100000000000 ? resetTime * 1000 : resetTime;
              const now = Date.now();

              if (resetMs > now) {
                delay = resetMs - now + 200;
                console.log(
                  `Rate limit reset detected. Adjusting wait to ${delay}ms.`,
                );
              }
            }
          }

          console.log(
            `Rate limit 429 hit for chunk. Retrying in ${delay}ms...`,
          );
          await sleep(delay);
          continue;
        }

        handleApiError(error);
        console.error(
          "Quote chunk error details:",
          error.response?.data || error.message,
        );
        // If one chunk fails non-429, we probably want to continue with others?
        // But throwing is safer to alert issues.
        // We'll throw, and caller decides.
        throw new Error(`Failed to fetch quotes for chunk: ${error.message}`);
      }
    }
  }
  return results;
}

async function getQuote(symbol) {
  const result = await getQuotes([symbol]);
  return result[0];
}

async function findNextExpiration(chainResponse, today) {
  const responseBody = chainResponse.data || chainResponse;

  // The structure is typically { data: { items: [...] }, context: ... }
  // So we need to look into responseBody.data.items
  let items = responseBody.data?.items;

  // Fallback if structure is different (e.g. direct items array)
  if (!items) {
    if (responseBody.items) items = responseBody.items;
    else if (Array.isArray(responseBody)) items = responseBody;
  }

  if (!items || items.length === 0) {
    // console.error("Option chain response structure invalid:", JSON.stringify(responseBody, null, 2));
    throw new Error("No option chain data received or invalid structure");
  }

  // Ensure we have expirations array in the first item
  if (!items[0] || !items[0].expirations) {
    throw new Error("Option chain data missing expirations");
  }

  const option = items[0].expirations.find((expiration) => {
    const isWeeklyOrRegular = ["Weekly", "Regular"].includes(
      expiration["expiration-type"],
    );
    const daysToExpiration = expiration["days-to-expiration"];
    return isWeeklyOrRegular && daysToExpiration > 3 && daysToExpiration <= 10;
  });

  if (!option) throw new Error("No valid expiration found in option chain");
  return option;
}

async function findStrikeAbovePrice(option, currentPrice) {
  const strike = option.strikes.find((strike) => {
    return (
      strike.call !== null && parseFloat(strike["strike-price"]) > currentPrice
    );
  });

  if (!strike) throw new Error("No valid strike found above current price");

  return {
    ...option,
    symbol: strike.call,
    strike_price: strike["strike-price"],
  };
}

async function getOptionQuote(option) {
  const client = getClient();
  const optionQuoteResponse = await client.httpClient.getData(
    `/market-data/Equity Option/${option.symbol}`,
  );
  const data = optionQuoteResponse.data || optionQuoteResponse;
  if (!data) throw new Error("No option quote data received");
  return {
    ...option,
    bid: data.bid,
    ask: data.ask,
    last: data.last,
  };
}

async function getNextOption(symbol, quoteData) {
  try {
    if (!isLoggedIn()) {
      await initializeTastytrade();
    }

    if (!quoteData) throw new Error("Quote data is required");

    const currentBid = parseFloat(quoteData.bid);
    const currentAsk = parseFloat(quoteData.ask);
    const currentPrice = (currentBid + currentAsk) / 2;
    const today = new Date().toISOString().split("T")[0];

    const client = getClient();
    const chainResponse = await client.httpClient.getData(
      `/option-chains/${symbol}/nested`,
    );

    const expiration = await findNextExpiration(chainResponse, today);
    const strike = await findStrikeAbovePrice(expiration, currentPrice);
    return await getOptionQuote(strike);
  } catch (error) {
    handleApiError(error);
    throw new Error(
      `Failed to fetch option chain for ${symbol}: ${error.message}`,
    );
  }
}

async function getAccountHistory(startDate, endDate) {
  try {
    if (!isLoggedIn()) {
      await initializeTastytrade();
    }
    const client = getClient();
    const defaultStartDate = "2024-11-01";
    const defaultEndDate = new Date().toISOString().split("T")[0];

    let params = {
      sort: "Asc",
      "start-at": startDate || defaultStartDate,
      "end-date": endDate || defaultEndDate,
    };

    let response = await client.transactionsService.getAccountTransactions(
      process.env.TASTYTRADE_ACCOUNT_NUMBER,
      params,
    );

    let data = response.data || response;
    if (!data?.items) {
      if (Array.isArray(response)) return response;
      throw new Error("No account history data received");
    }

    let allTransactions = data.items;
    while (
      data.pagination &&
      data.pagination["page-offset"] < data.pagination["total-pages"]
    ) {
      params["page-offset"] = data.pagination["page-offset"] + 1;
      response = await client.transactionsService.getAccountTransactions(
        process.env.TASTYTRADE_ACCOUNT_NUMBER,
        params,
      );
      data = response.data || response;
      if (!data?.items) break;
      allTransactions = allTransactions.concat(data.items);
    }
    return allTransactions;
  } catch (error) {
    handleApiError(error);
    console.error(
      "Account history error details:",
      error.response?.data || error.message,
    );
    throw new Error(`Failed to fetch account history: ${error.message}`);
  }
}

async function getPositions() {
  try {
    if (!isLoggedIn()) {
      await initializeTastytrade();
    }
    const client = getClient();
    const response = await client.balancesAndPositionsService.getPositionsList(
      process.env.TASTYTRADE_ACCOUNT_NUMBER,
    );

    const data = response.data || response;
    if (!data?.items) throw new Error("No positions data received");

    const positionsBySymbol = data.items.reduce((acc, item) => {
      const symbol = item["underlying-symbol"];
      if (!acc[symbol]) acc[symbol] = { equity: null, option: null };
      if (item["instrument-type"] === "Equity") acc[symbol].equity = item;
      else if (item["instrument-type"] === "Equity Option")
        acc[symbol].option = item;
      return acc;
    }, {});

    return Object.entries(positionsBySymbol)
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
  } catch (error) {
    handleApiError(error);
    console.error(
      "Positions error details:",
      error.response?.data || error.message,
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
  } finally {
    sessionExpiration = 0;
    tastytradeClient = null;
  }
}

module.exports = {
  initializeTastytrade,
  getQuote,
  getQuotes,
  getNextOption,
  getAccountHistory,
  getPositions,
  logout,
  isLoggedIn,
};
