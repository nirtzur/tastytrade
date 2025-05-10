const axios = require("axios");
const sleep = require("./utils/sleep");
require("dotenv").config();

const baseUrl = process.env.TASTYTRADE_BASE_URL;

// Parse command line arguments for debug mode
const isDebug = process.argv.includes("-debug");

async function makeRequest(
  method,
  endpoint,
  token = null,
  data = null,
  params = null
) {
  const config = {
    method,
    url: `${baseUrl}${endpoint}`,
    headers: {
      "User-Agent": "tastytrade-app/1.0",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
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
    if (error.response?.status === 429) {
      await sleep();
      return makeRequest(method, endpoint, token, data, params);
    }
    console.error("Request failed:", error.message);
    console.error("Response status:", error.response?.status);
    console.error("Response data:", error.response?.data);
    throw error;
  }
}

async function initializeTastytrade() {
  try {
    const response = await makeRequest("post", "/sessions", null, {
      login: process.env.TASTYTRADE_USERNAME,
      password: process.env.TASTYTRADE_PASSWORD,
    });

    const sessionToken = response?.data?.["session-token"];
    if (!sessionToken) {
      throw new Error("No session token received in response");
    }

    // Remove any newline characters from the token
    const token = sessionToken.replace(/\n/g, "");
    return token;
  } catch (error) {
    console.error(
      "Authentication error details:",
      error.response?.data || error.message
    );
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

async function getAccountHistory(sessionToken) {
  try {
    if (!sessionToken) {
      throw new Error("Session token is required");
    }

    const response = await makeRequest(
      "GET",
      `/accounts/${process.env.TASTYTRADE_ACCOUNT_NUMBER}/transactions`,
      sessionToken
    );

    if (!response?.data) {
      throw new Error("No account history data received");
    }

    return response.data;
  } catch (error) {
    console.error(
      "Account history error details:",
      error.response?.data || error.message
    );
    throw new Error(`Failed to fetch account history: ${error.message}`);
  }
}

module.exports = {
  initializeTastytrade,
  getQuote,
  getNextOption,
  getAccountHistory,
};
