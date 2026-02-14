const axios = require("axios");
const sleep = require("./utils/sleep");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const TastytradeClient = require("@tastytrade/api").default;

const SESSION_FILE = path.join(__dirname, "../tastytrade-session.json");

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
let isSessionActive = false;

function handleApiError(error) {
  if (
    error.response?.status === 401 ||
    (error.message && error.message.includes("401"))
  ) {
    console.log("Session expired or invalid, marking session as inactive.");
    isSessionActive = false;
    tastytradeClient = null;
    // Do NOT delete the session file here.
    // The session file contains the 'remember-token' (Refresh Token) which is long-lived.
    // We need it to re-login when initializeTastytrade() is called next.
    // If that re-login fails, initializeTastytrade will handle the deletion.
  }
}

async function initializeTastytrade({ username = null, password = null } = {}) {
  try {
    validateEnvironment();

    const config = {
      baseUrl: process.env.TASTYTRADE_BASE_URL,
      accountStreamerUrl: "wss://streamer.tastyworks.com",
      clientSecret: process.env.TASTYTRADE_CLIENT_SECRET,
      oauthScopes: ["read", "trade"],
    };

    if (process.env.TASTYTRADE_REFRESH_TOKEN) {
      config.refreshToken = process.env.TASTYTRADE_REFRESH_TOKEN;
    }

    // 1. Explicit Login Request
    if (username && password) {
      console.log(
        "Initializing Tastytrade with URL:",
        process.env.TASTYTRADE_BASE_URL
      );
      tastytradeClient = new TastytradeClient(config);

      console.log("Logging in with username/password...");
      const sessionData = await tastytradeClient.sessionService.login(
        username,
        password,
        true
      );
      isSessionActive = true;
      console.log("Login successful via SDK");

      try {
        if (sessionData["remember-token"]) {
          const saveData = {
            username: username,
            rememberToken: sessionData["remember-token"],
          };
          fs.writeFileSync(SESSION_FILE, JSON.stringify(saveData, null, 2));
          console.log("Session saved to disk");
        }
      } catch (saveError) {
        console.error("Failed to save session to disk:", saveError.message);
      }
      return { success: true };
    }

    // 2. Already Active
    if (tastytradeClient && isSessionActive) {
      return { success: true };
    }

    // 3. Environmental Refresh Token (Implicit Login)
    if (process.env.TASTYTRADE_REFRESH_TOKEN) {
      if (!tastytradeClient) {
        tastytradeClient = new TastytradeClient(config);
      }
      isSessionActive = true;
      console.log(
        "Initialized using TASTYTRADE_REFRESH_TOKEN from environment."
      );
      return { success: true };
    }

    // 4. Auto-Login from Disk
    if (fs.existsSync(SESSION_FILE)) {
      try {
        const savedSession = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
        if (savedSession.username && savedSession.rememberToken) {
          if (!tastytradeClient)
            tastytradeClient = new TastytradeClient(config);

          console.log("Attempting auto-login from disk...");
          const sessionData =
            await tastytradeClient.sessionService.loginWithRememberToken(
              savedSession.username,
              savedSession.rememberToken,
              true
            );

          isSessionActive = true;
          console.log("Auto-login successful using saved session");

          if (
            sessionData["remember-token"] &&
            sessionData["remember-token"] !== savedSession.rememberToken
          ) {
            const saveData = {
              username: savedSession.username,
              rememberToken: sessionData["remember-token"],
            };
            fs.writeFileSync(SESSION_FILE, JSON.stringify(saveData, null, 2));
          }
          return { success: true };
        }
      } catch (autoLoginError) {
        console.error("Auto-login from disk failed:", autoLoginError.message);
        try {
          fs.unlinkSync(SESSION_FILE);
        } catch (e) {}
      }
    }

    // 5. Fallback Initializer (Anonymous)
    if (!tastytradeClient) {
      tastytradeClient = new TastytradeClient(config);
    }

    return { success: false, message: "Client initialized but not logged in" };
  } catch (error) {
    console.error("Authentication error details:", {
      message: error.message,
      stack: error.stack,
    });
    if (username && password) {
      isSessionActive = false;
      tastytradeClient = null;
    }
    throw new Error(`Failed to authenticate with Tastytrade: ${error.message}`);
  }
}

function isLoggedIn() {
  return !!tastytradeClient && isSessionActive;
}

function getClient() {
  if (!tastytradeClient) {
    throw new Error("Tastytrade client not initialized");
  }
  if (!isSessionActive) {
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
        if (!isSessionActive) {
          console.log("Session inactive. Attempting re-login...");
          await initializeTastytrade();
          if (!isSessionActive) {
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
            10
          );
          if (remaining < 10) {
            console.warn(
              `Rate limit warning for chunk: ${remaining} requests remaining.`
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
            "Received 401 Unauthorized. Invalidating session and retrying..."
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
              `Max retries reached for chunk starting with ${chunk[0]} after 429 Token limit`
            );
            // Instead of throwing, maybe return empty for this chunk or rethrow?
            // Throwing stops everything. Let's throw to be consistent with existing logic,
            // but caller needs to handle it.
            // Actually, if we throw, we lose partial results.
            // But existing code throws on single symbol failure.
            throw new Error(
              `Failed to fetch quotes for chunk: Rate limit exceeded`
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
                  `Rate limit reset detected. Adjusting wait to ${delay}ms.`
                );
              }
            }
          }

          console.log(
            `Rate limit 429 hit for chunk. Retrying in ${delay}ms...`
          );
          await sleep(delay);
          continue;
        }

        handleApiError(error);
        console.error(
          "Quote chunk error details:",
          error.response?.data || error.message
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
  const data = chainResponse.data || chainResponse;
  if (!data?.items) throw new Error("No option chain data received");

  const option = data.items[0].expirations.find((expiration) => {
    const isWeeklyOrRegular = ["Weekly", "Regular"].includes(
      expiration["expiration-type"]
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
    `/market-data/Equity Option/${option.symbol}`
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
    if (!quoteData) throw new Error("Quote data is required");

    const currentBid = parseFloat(quoteData.bid);
    const currentAsk = parseFloat(quoteData.ask);
    const currentPrice = (currentBid + currentAsk) / 2;
    const today = new Date().toISOString().split("T")[0];

    const client = getClient();
    const chainResponse = await client.httpClient.getData(
      `/option-chains/${symbol}/nested`
    );

    const expiration = await findNextExpiration(chainResponse, today);
    const strike = await findStrikeAbovePrice(expiration, currentPrice);
    return await getOptionQuote(strike);
  } catch (error) {
    handleApiError(error);
    throw new Error(
      `Failed to fetch option chain for ${symbol}: ${error.message}`
    );
  }
}

async function getAccountHistory(startDate, endDate) {
  try {
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
      params
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
        params
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
      error.response?.data || error.message
    );
    throw new Error(`Failed to fetch account history: ${error.message}`);
  }
}

async function getPositions() {
  try {
    const client = getClient();
    const response = await client.balancesAndPositionsService.getPositionsList(
      process.env.TASTYTRADE_ACCOUNT_NUMBER
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
  } finally {
    isSessionActive = false;
    tastytradeClient = null;
    try {
      if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
    } catch (e) {}
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
