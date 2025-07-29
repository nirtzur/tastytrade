const axios = require("axios");
const sleep = require("./utils/sleep");
require("dotenv").config();

// Validate required environment variables
const REQUIRED_ENV_VARS = ["TASTYTRADE_BASE_URL", "TASTYTRADE_ACCOUNT_NUMBER"];

function validateEnvironment() {
  const missing = REQUIRED_ENV_VARS.filter((varName) => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

const baseUrl = process.env.TASTYTRADE_BASE_URL;

// Parse command line arguments for debug mode
const isDebug = process.argv.includes("-debug");

// Enhanced request handling with retries
async function makeRequest(
  method,
  endpoint,
  token = null,
  data = null,
  params = null,
  retries = 3
) {
  const config = {
    method,
    url: `${baseUrl}${endpoint}`,
    headers: {
      "User-Agent": "tastytrade-app/1.0",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 10000, // 10 second timeout
  };

  if (token) {
    config.headers.Authorization = token;
  }

  if (data) {
    config.data = data;
  }

  if (params) {
    config.params = params;
  }

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response?.status === 429 && retries > 0) {
      await sleep(100 * (4 - retries)); // Exponential backoff
      return makeRequest(method, endpoint, token, data, params, retries - 1);
    }

    const errorDetails = {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    };

    if (isDebug) {
      console.error("Request failed:", errorDetails);
    }

    throw new Error(`API request failed: ${error.message}`);
  }
}

async function initializeTastytrade({
  rememberMeToken = null,
  username = null,
  password = null,
}) {
  try {
    validateEnvironment();
    console.log(
      "Initializing Tastytrade with URL:",
      process.env.TASTYTRADE_BASE_URL
    );

    let data = { "remember-me": true, login: username }; // Always request a remember-me token

    let endpoint = "/sessions";

    if (rememberMeToken) {
      data["remember-token"] = rememberMeToken; // Use remember-me token to create session
    } else {
      data["password"] = password;
    }

    const response = await makeRequest("post", endpoint, null, data);

    console.log("Login response received:", {
      status: "success",
      hasData: !!response?.data,
      hasSessionToken: !!response?.data?.["session-token"],
      hasRememberToken: !!response?.data?.["remember-token"],
    });

    if (!response?.data?.["session-token"]) {
      throw new Error("No session token received in response");
    }

    if (!response.data?.["session-expiration"]) {
      throw new Error("No session expiration received in response");
    }

    // Return tokens, username and expiration time in consistent format
    return {
      sessionToken: response.data["session-token"].replace(/\n/g, ""),
      rememberMeToken: response.data["remember-token"],
      username: data.login, // Include username in response
      expiresAt: response.data["session-expiration"], // Use API-provided expiration time
    };
  } catch (error) {
    console.error("Authentication error details:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });
    throw new Error(`Failed to authenticate with Tastytrade: ${error.message}`);
  }
}

async function getQuote(symbol, sessionToken) {
  try {
    if (!sessionToken) {
      throw new Error("Session token is required");
    }

    // Get the quote data using market-data API
    const { data: quoteData } = await makeRequest(
      "GET",
      `/market-data/Equity/${symbol}`,
      sessionToken
    );

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
  if (!chainResponse?.data?.items) {
    throw new Error("No option chain data received");
  }

  const option = chainResponse.data.items[0].expirations.find((expiration) => {
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

async function getOptionQuote(option, sessionToken) {
  const optionQuoteResponse = await makeRequest(
    "GET",
    `/market-data/Equity Option/${option.symbol}`,
    sessionToken
  );

  if (!optionQuoteResponse?.data) {
    throw new Error("No option quote data received");
  }

  return {
    ...option,
    bid: optionQuoteResponse.data.bid,
    ask: optionQuoteResponse.data.ask,
    last: optionQuoteResponse.data.last,
  };
}

async function getNextOption(symbol, sessionToken, quoteData) {
  try {
    if (!sessionToken) {
      throw new Error("Session token is required");
    }

    if (!quoteData) {
      throw new Error("Quote data is required");
    }

    const currentBid = parseFloat(quoteData.bid);
    const currentAsk = parseFloat(quoteData.ask);
    const currentPrice = (currentBid + currentAsk) / 2;
    const today = new Date().toISOString().split("T")[0];

    // Get the option chain data
    const chainResponse = await makeRequest(
      "GET",
      `/option-chains/${symbol}/nested`,
      sessionToken
    );

    // Find the next expiration
    const expiration = await findNextExpiration(chainResponse, today);

    // Find the strike above current price
    const strike = await findStrikeAbovePrice(expiration, currentPrice);

    // Get the option quote
    return await getOptionQuote(strike, sessionToken);
  } catch (error) {
    if (isDebug) {
      console.error("Option chain error details:", error.message);
    }
    throw new Error(
      `Failed to fetch option chain for ${symbol}: ${error.message}`
    );
  }
}

async function getAccountHistory(sessionToken, startDate, endDate) {
  try {
    if (!sessionToken) {
      throw new Error("Session token is required");
    }

    const defaultStartDate = "2024-11-01";
    const defaultEndDate = new Date().toISOString().split("T")[0];

    startDate = startDate || defaultStartDate;
    endDate = endDate || defaultEndDate;

    let response = await makeRequest(
      "GET",
      `/accounts/${process.env.TASTYTRADE_ACCOUNT_NUMBER}/transactions?sort=Asc&start-at=${startDate}&end-date=${endDate}`,
      sessionToken
    );

    if (!response?.data) {
      throw new Error("No account history data received");
    }

    let allTransactions = response.data.items;
    while (
      response.pagination &&
      response.pagination["page-offset"] < response.pagination["total-pages"]
    ) {
      const nextPageOffset = response.pagination["page-offset"] + 1;
      response = await makeRequest(
        "GET",
        `/accounts/${process.env.TASTYTRADE_ACCOUNT_NUMBER}/transactions?sort=Asc&start-at=${startDate}&end-date=${endDate}&page-offset=${nextPageOffset}`,
        sessionToken
      );
      if (!response?.data) {
        throw new Error("No account history data received on next page");
      }
      allTransactions = allTransactions.concat(response.data.items);
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

async function getPositions(sessionToken) {
  try {
    if (!sessionToken) {
      throw new Error("Session token is required");
    }

    const response = await makeRequest(
      "GET",
      `/accounts/${process.env.TASTYTRADE_ACCOUNT_NUMBER}/positions`,
      sessionToken
    );

    if (!response?.data?.items) {
      throw new Error("No positions data received");
    }

    // Group positions by underlying symbol
    const positionsBySymbol = response.data.items.reduce((acc, item) => {
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
    const accountHistory = await getAccountHistory(sessionToken);

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

module.exports = {
  initializeTastytrade,
  getQuote,
  getNextOption,
  getAccountHistory,
  getPositions,
};
