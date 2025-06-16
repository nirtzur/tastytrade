const express = require("express");
const cors = require("cors");
const path = require("path");
const yahooFinance = require("yahoo-finance2").default;
const {
  initializeTastytrade,
  getAccountHistory,
  getPositions,
} = require("./Analyze/tastytrade");
const {
  processSymbols,
  processSymbolsWithProgress,
} = require("./Analyze/index");
const { getSP500Symbols } = require("./Analyze/sp500");
const { getSectorETFs } = require("./Analyze/etfs");
const sequelize = require("./models");
const TransactionHistory = require("./models/TransactionHistory");
const AnalysisResult = require("./models/AnalysisResult");

// Keep track of last sync time
async function getLastSyncTime() {
  try {
    const lastTransaction = await TransactionHistory.findOne({
      order: [["executed_at", "DESC"]],
      attributes: ["executed_at"],
    });
    return lastTransaction?.executed_at || new Date("2024-01-01");
  } catch (error) {
    console.error("Error getting last sync time:", error);
    return new Date("2024-01-01");
  }
}

async function syncTransactions() {
  try {
    const lastSync = await getLastSyncTime();
    const now = new Date();

    logInfo("Syncing transactions since:", lastSync);

    const formatDate = (date) => date.toISOString().split(".")[0];
    const transactions = await getAccountHistory(
      sessionToken,
      formatDate(lastSync),
      formatDate(now)
    );

    if (!Array.isArray(transactions) || transactions.length === 0) {
      logInfo("No new transactions to sync");
      return;
    }

    // Use Sequelize's bulkCreate with updateOnDuplicate
    await TransactionHistory.bulkCreate(
      transactions.map((tx) => ({
        transaction_id: tx.id,
        executed_at: new Date(tx["executed-at"]),
        transaction_type: tx["transaction-type"],
        instrument_type: tx["instrument-type"],
        action: tx.action,
        symbol: tx.symbol,
        quantity: tx.quantity,
        price: tx.price,
        value: Math.abs(tx.value),
        value_effect: tx["value-effect"],
        description: tx.description,
      })),
      {
        updateOnDuplicate: [
          "transaction_type",
          "instrument_type",
          "action",
          "symbol",
          "quantity",
          "price",
          "value",
          "value_effect",
          "description",
        ],
      }
    );

    logInfo(`Synced ${transactions.length} transactions`);
  } catch (error) {
    logError("Error syncing transactions:", error);
    throw error;
  }
}

const app = express();
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

// Load environment variables
require("dotenv").config();

// Enhanced logging configuration
const DEBUG = process.env.NODE_ENV !== "production";

function logInfo(...args) {
  console.log(new Date().toISOString(), ...args);
}

function logError(...args) {
  console.error(new Date().toISOString(), ...args);
}

// Validate environment variables
const REQUIRED_ENV_VARS = ["TASTYTRADE_BASE_URL", "TASTYTRADE_ACCOUNT_NUMBER"];

function validateEnvironment() {
  const missing = REQUIRED_ENV_VARS.filter((varName) => {
    const value = process.env[varName];
    return (
      !value ||
      value.startsWith("${sm://") ||
      value.includes("${GOOGLE_CLOUD_PROJECT}")
    );
  });

  if (missing.length > 0) {
    logError("Missing or unresolved environment variables:", missing);
    throw new Error(
      `Missing or unresolved environment variables: ${missing.join(", ")}`
    );
  }
}

// Log environment configuration
logInfo("Environment configuration:");
logInfo("NODE_ENV:", process.env.NODE_ENV);
try {
  validateEnvironment();
  logInfo("All required environment variables are present");
} catch (error) {
  logError("Environment validation failed:", error.message);
}

// Session management
let sessionToken = null;
let rememberMeToken = null;
let username = null; // Store username alongside tokens
let sessionExpiresAt = null; // Track session expiration time

// Authentication middleware
async function authenticate(req, res, next) {
  try {
    logInfo(`Authentication requested for route: ${req.method} ${req.path}`);

    // Check if we have a valid session
    if (sessionToken && sessionExpiresAt) {
      const now = new Date();
      const expiryDate = new Date(sessionExpiresAt);

      if (now < expiryDate) {
        logInfo("Using existing valid session token");
        next();
        return;
      }
      logInfo("Session token expired, will refresh using remember-me token");
    }

    // No valid session, try to refresh using remember-me token
    if (!rememberMeToken) {
      throw new Error("No remember-me token available");
    }

    logInfo("Attempting to initialize session with remember-me token...");
    try {
      ({
        sessionToken,
        rememberMeToken,
        username,
        expiresAt: sessionExpiresAt,
      } = await initializeTastytrade({
        rememberMeToken,
        username,
      }));
      logInfo("Successfully refreshed session using remember-me token");
    } catch (error) {
      // Clear all auth info if refresh fails
      sessionToken = null;
      rememberMeToken = null;
      username = null;
      sessionExpiresAt = null;
      throw error;
    }
    next();
  } catch (error) {
    logError("Authentication failed:", error);
    res.status(401).json({ error: "Authentication required" });
  }
}

// Static file serving with proper error handling
if (process.env.NODE_ENV === "production") {
  const staticOptions = {
    maxAge: "1h",
    setHeaders: (res, path) => {
      if (path.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  };

  app.use(
    express.static(path.join(__dirname, "frontend/build"), staticOptions)
  );
}

// Enhanced API endpoints with better error handling
app.get("/api/account-history", authenticate, async (req, res) => {
  try {
    logInfo("Received account-history request:", req.query);
    const { "start-date": startDate, "end-date": endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "Missing required query parameters",
        required: ["start-date", "end-date"],
      });
    }

    // Make end date inclusive by extending it to the end of the day
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);

    const transactions = await TransactionHistory.findAll({
      where: {
        executed_at: {
          [sequelize.Sequelize.Op.between]: [startDate, endOfDay],
        },
      },
      order: [["executed_at", "DESC"]],
      raw: true,
    });

    // Transform to match expected format
    const transformedData = transactions.map((tx) => ({
      "executed-at": tx.executed_at,
      "transaction-type": tx.transaction_type,
      "instrument-type": tx.instrument_type,
      action: tx.action,
      symbol: tx.symbol,
      quantity: tx.quantity,
      price: tx.price,
      value: tx.value,
      "value-effect": tx.value_effect,
      description: tx.description,
    }));

    logInfo("Successfully fetched account history");
    res.json(transformedData);
  } catch (error) {
    logError("Error in /api/account-history:", error);
    res.status(500).json({
      error: "Failed to fetch account history",
      message: error.message,
      retryAfter: Math.ceil(INIT_RETRY_INTERVAL / 1000),
    });
  }
});

app.get("/api/trading-data", authenticate, async (req, res) => {
  try {
    logInfo("Fetching trading data from database");

    const latestAnalyses = await AnalysisResult.findAll({
      attributes: [
        "symbol",
        [
          sequelize.Sequelize.fn("MAX", sequelize.Sequelize.col("analyzed_at")),
          "latest_at",
        ],
      ],
      group: ["symbol"],
    });

    const results = await Promise.all(
      latestAnalyses.map((analysis) =>
        AnalysisResult.findOne({
          where: {
            symbol: analysis.symbol,
            analyzed_at: analysis.get("latest_at"),
          },
          raw: true,
        })
      )
    );

    res.json(results);
  } catch (error) {
    logError("Error fetching trading data:", error);
    res.status(500).json({
      error: "Failed to fetch trading data",
      message: error.message,
    });
  }
});

app.get("/api/positions", authenticate, async (req, res) => {
  try {
    logInfo("Fetching positions");
    const positions = await getPositions(sessionToken);

    // Fetch Yahoo Finance prices for all symbols
    const symbolPrices = await Promise.all(
      positions.map(async (position) => {
        try {
          const quote = await yahooFinance.quote(position.symbol);
          return {
            symbol: position.symbol,
            yahooPrice: quote.regularMarketPrice,
          };
        } catch (error) {
          logError(`Error fetching Yahoo price for ${position.symbol}:`, error);
          return {
            symbol: position.symbol,
            yahooPrice: null,
          };
        }
      })
    );

    // Add Yahoo prices to positions data
    const positionsWithYahoo = positions.map((position) => {
      const yahooData = symbolPrices.find((p) => p.symbol === position.symbol);
      return {
        ...position,
        yahoo_price: yahooData?.yahooPrice || null,
      };
    });

    res.json(positionsWithYahoo);
  } catch (error) {
    logError("Error fetching positions:", error);
    res.status(500).json({
      error: "Failed to fetch positions",
      message: error.message,
    });
  }
});

app.get("/api/trading-data/refresh", authenticate, async (req, res) => {
  try {
    logInfo("Starting analysis refresh");
    // Get symbols
    const sp500Symbols = await getSP500Symbols();
    const etfSymbols = getSectorETFs();
    const symbolsToProcess = [...sp500Symbols, ...etfSymbols];

    logInfo(`Processing ${symbolsToProcess.length} symbols...`);

    // Set up Server-Sent Events for progress updates
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "http://localhost:3000",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type",
    });

    // Send initial progress
    res.write(
      `data: ${JSON.stringify({
        type: "start",
        total: symbolsToProcess.length,
        message: "Starting analysis...",
      })}\n\n`
    );

    // Process symbols with progress updates
    await processSymbolsWithProgress(
      symbolsToProcess,
      sessionToken,
      (progress) => {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
      }
    );

    // Send completion message
    res.write(
      `data: ${JSON.stringify({
        type: "complete",
        message: "Analysis refresh complete",
      })}\n\n`
    );

    res.end();
  } catch (error) {
    logError("Error refreshing analysis:", error);
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        message: error.message,
      })}\n\n`
    );
    res.end();
  }
});

app.post("/api/trading-data/refresh", authenticate, async (req, res) => {
  try {
    logInfo("Starting analysis refresh (legacy endpoint)");
    // Get symbols
    const sp500Symbols = await getSP500Symbols();
    const etfSymbols = getSectorETFs();
    const symbolsToProcess = [...sp500Symbols, ...etfSymbols];

    logInfo(`Processing ${symbolsToProcess.length} symbols...`);
    await processSymbols(symbolsToProcess, sessionToken);

    res.json({ success: true, message: "Analysis refresh complete" });
  } catch (error) {
    logError("Error refreshing analysis:", error);
    res.status(500).json({
      error: "Failed to refresh analysis",
      message: error.message,
    });
  }
});

app.post("/api/account-history/sync", authenticate, async (req, res) => {
  try {
    logInfo("Starting manual transaction sync");
    await syncTransactions();
    res.json({ success: true, message: "Transaction sync complete" });
  } catch (error) {
    logError("Error syncing transactions:", error);
    res.status(500).json({
      error: "Failed to sync transactions",
      message: error.message,
    });
  }
});

// Authentication endpoints
app.post("/api/auth/login", async (req, res) => {
  try {
    const { userLogin, password } = req.body;

    if (!userLogin || !password) {
      return res.status(400).json({
        error: "Username and password are required",
      });
    }

    // Initialize session with credentials
    ({
      sessionToken,
      rememberMeToken,
      username,
      expiresAt: sessionExpiresAt,
    } = await initializeTastytrade({
      username: userLogin,
      password,
    }));

    res.json({ success: true });
  } catch (error) {
    logError("Login failed:", error);
    res.status(401).json({
      error: "Authentication failed",
      message: error.message,
    });
  }
});

app.post("/api/auth/logout", authenticate, async (req, res) => {
  try {
    if (sessionToken) {
      // Call TastyTrade API to invalidate the session
      await makeRequest("DELETE", "/sessions", sessionToken);
    }

    // Clear tokens and user info
    sessionToken = null;
    rememberMeToken = null;
    username = null;
    sessionExpiresAt = null;

    res.json({ success: true });
  } catch (error) {
    logError("Logout failed:", error);
    res.status(500).json({
      error: "Logout failed",
      message: error.message,
    });
  }
});

app.get("/api/auth/check", authenticate, (req, res) => {
  res.json({ authenticated: true });
});

// Production routing
if (process.env.NODE_ENV === "production") {
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "frontend/build/index.html"));
  });
}

const PORT = process.env.PORT || 3001;

// Enhanced server startup
const server = app.listen(PORT, () => {
  logInfo(`Server starting on port ${PORT}`);
  logInfo("Node environment:", process.env.NODE_ENV);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logInfo("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    logInfo("HTTP server closed");
  });
});

// Initialize database connection when server starts
sequelize
  .authenticate()
  .then(() => {
    logInfo("Database connection established successfully");
  })
  .catch((error) => {
    logError("Unable to connect to the database:", error);
  });

// Constants
const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

function isOpeningTransaction(tx) {
  if (tx.instrument_type === "Equity") {
    return tx.action === "Buy to Open" || tx.action === "Buy";
  } else if (tx.instrument_type === "Equity Option") {
    return tx.action === "Sell to Open";
  }
  return false;
}

app.get("/api/positions/aggregated", authenticate, async (req, res) => {
  try {
    logInfo("Fetching aggregated positions from transaction history");

    // Get all transactions ordered by execution date
    const transactions = await TransactionHistory.findAll({
      order: [["executed_at", "ASC"]],
      raw: true,
    });

    // Group transactions by symbol and calculate position details
    const positionsBySymbol = {};

    transactions.forEach((tx) => {
      if (!tx.symbol) return;

      const symbol = tx.symbol.split(" ")[0];
      positionsBySymbol[symbol] ??= [];

      let currentPosition = positionsBySymbol[symbol].find((pos) => pos.isOpen);

      if (!currentPosition) {
        // Create a new position
        currentPosition = {
          symbol,
          totalShares: 0,
          totalCost: 0,
          totalProceeds: 0,
          avgCostBasis: 0,
          transactions: [],
          isOpen: true,
          totalOptionPremium: 0,
          totalOptionTransactions: 0,
          totalOptionContracts: 0, // Track net option contracts (sold - bought)
          firstTransactionDate: tx.executed_at,
          lastTransactionDate: tx.executed_at,
          equityTransactions: 0,
          totalSharesBought: 0,
          totalSharesSold: 0,
        };
        positionsBySymbol[symbol].push(currentPosition);
      }

      currentPosition.transactions.push(tx);
      currentPosition.lastTransactionDate = tx.executed_at;

      // Extract common values
      const quantity = Math.abs(tx.quantity || 0);
      const value = Math.abs(tx.value || 0);

      if (tx.instrument_type === "Equity") {
        currentPosition.equityTransactions++;

        if (isOpeningTransaction(tx)) {
          currentPosition.totalShares += quantity;
          currentPosition.totalSharesBought += quantity;
          currentPosition.totalCost += value;
        } else {
          currentPosition.totalShares -= quantity;
          currentPosition.totalSharesSold += quantity;
          currentPosition.totalProceeds += value;
        }
      }
      // Handle equity option transactions for this symbol
      else if (tx.instrument_type === "Equity Option") {
        currentPosition.totalOptionTransactions++;

        if (tx.value_effect === "Credit") {
          currentPosition.totalOptionPremium += value;
        } else if (tx.value_effect === "Debit") {
          currentPosition.totalOptionPremium -= value;
        }

        // Track net option contracts (sold options are positive, bought options are negative)
        if (isOpeningTransaction(tx)) {
          // Sell to Open
          currentPosition.totalOptionContracts += quantity;
        } else {
          // Buy to Close
          currentPosition.totalOptionContracts -= quantity;
        }
      }

      // Update position status - position is active if either shares > 0 OR option contracts > 0
      if (
        currentPosition.totalShares > 0 ||
        currentPosition.totalOptionContracts > 0
      ) {
        if (currentPosition.totalSharesBought > 0) {
          currentPosition.avgCostBasis =
            currentPosition.totalCost / currentPosition.totalSharesBought;
        }
        currentPosition.isOpen = true;
      } else {
        // Only mark position as inactive when BOTH equity and options are fully closed
        currentPosition.isOpen = false;
      }
    });

    // Convert to array and add additional calculations
    const aggregatedPositions = Object.values(positionsBySymbol)
      .flat() // Flatten the arrays of positions for each symbol
      .filter(
        (position) =>
          position.transactions.length > 0 &&
          position.totalOptionTransactions > 0
      )
      .map((position) => {
        // Calculate realized P&L
        let realizedPL = 0;
        if (position.totalShares <= 0 && position.totalOptionContracts <= 0) {
          // Position is fully closed - calculate P&L on all shares sold
          realizedPL = position.totalProceeds - position.totalCost;
        } else {
          // Position is still open - calculate P&L only on shares sold
          const avgCostPerShare =
            position.totalSharesBought > 0
              ? position.totalCost / position.totalSharesBought
              : 0;
          realizedPL =
            position.totalProceeds - position.totalSharesSold * avgCostPerShare;
        }

        const totalReturn = position.totalOptionPremium + realizedPL;

        // Calculate return percentage
        let returnPercentage = 0;
        if (position.totalCost > 0) {
          if (position.isOpen) {
            // For active positions: Total Return / Total Cost * 100
            returnPercentage = (totalReturn / position.totalCost) * 100;
          } else {
            // For closed positions: (Total Proceeds + Option Premium) / Total Cost - 1) * 100
            returnPercentage =
              ((position.totalProceeds + position.totalOptionPremium) /
                position.totalCost -
                1) *
              100;
          }
        }

        return {
          ...position,
          totalTransactions: position.transactions.length,
          realizedPL,
          totalReturn,
          returnPercentage,
          daysHeld: Math.ceil(
            (new Date(position.lastTransactionDate) -
              new Date(position.firstTransactionDate)) /
              MILLISECONDS_PER_DAY
          ),
        };
      })
      .sort(
        (a, b) =>
          new Date(b.firstTransactionDate) - new Date(a.firstTransactionDate)
      );

    res.json(aggregatedPositions);
  } catch (error) {
    logError("Error fetching aggregated positions:", error);
    res.status(500).json({
      error: "Failed to fetch aggregated positions",
      message: error.message,
    });
  }
});
