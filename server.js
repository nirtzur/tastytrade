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
const ProgressState = require("./models/ProgressState");

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

// Progress state management functions
async function saveProgressState(sessionId, progressData) {
  try {
    await ProgressState.upsert({
      session_id: sessionId,
      type: progressData.type,
      current: progressData.current || 0,
      total: progressData.total || 0,
      symbol: progressData.symbol || null,
      message: progressData.message || null,
      updated_at: new Date(),
      completed_at:
        progressData.type === "complete" || progressData.type === "error"
          ? new Date()
          : null,
      error_message:
        progressData.type === "error" ? progressData.message : null,
    });
  } catch (error) {
    logError("Error saving progress state:", error);
  }
}

async function getProgressState(sessionId) {
  try {
    const progress = await ProgressState.findOne({
      where: { session_id: sessionId },
      order: [["updated_at", "DESC"]],
    });

    if (!progress) return null;

    // Check if progress is recent (within last hour) and not completed
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (
      progress.updated_at < oneHourAgo ||
      progress.type === "complete" ||
      progress.type === "error"
    ) {
      // Clean up old/completed progress
      await progress.destroy();
      return null;
    }

    return {
      type: progress.type,
      current: progress.current,
      total: progress.total,
      symbol: progress.symbol,
      message: progress.message,
      started_at: progress.started_at,
      updated_at: progress.updated_at,
    };
  } catch (error) {
    logError("Error getting progress state:", error);
    return null;
  }
}

async function clearProgressState(sessionId) {
  try {
    await ProgressState.destroy({
      where: { session_id: sessionId },
    });
  } catch (error) {
    logError("Error clearing progress state:", error);
  }
}

const app = express();

// Dynamic CORS configuration
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  process.env.FRONTEND_URL,
  process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : null,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (
        allowedOrigins.indexOf(origin) !== -1 ||
        process.env.NODE_ENV !== "production"
      ) {
        callback(null, true);
      } else {
        console.log("Blocked by CORS:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
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

  // Check for database config (either DATABASE_URL or individual vars)
  if (
    !process.env.DATABASE_URL &&
    (!process.env.DB_HOST || !process.env.DB_USERNAME)
  ) {
    missing.push("DATABASE_URL or (DB_HOST and DB_USERNAME)");
  }

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

    // Get the maximum analyzed_at date (date only, not timestamp)
    const maxDateResult = await AnalysisResult.findOne({
      attributes: [
        [
          sequelize.Sequelize.fn(
            "DATE",
            sequelize.Sequelize.fn(
              "MAX",
              sequelize.Sequelize.col("analyzed_at")
            )
          ),
          "max_date",
        ],
      ],
      raw: true,
    });

    if (!maxDateResult || !maxDateResult.max_date) {
      return res.json([]);
    }

    // Fetch all symbols that match the maximum date (by date, not timestamp)
    const results = await AnalysisResult.findAll({
      where: {
        [sequelize.Sequelize.Op.and]: [
          sequelize.Sequelize.where(
            sequelize.Sequelize.fn(
              "DATE",
              sequelize.Sequelize.col("analyzed_at")
            ),
            maxDateResult.max_date
          ),
        ],
      },
      order: [["option_mid_percent", "DESC"]],
      raw: true,
    });

    res.json(results);
  } catch (error) {
    logError("Error fetching trading data:", error);
    res.status(500).json({
      error: "Failed to fetch trading data",
      message: error.message,
    });
  }
});

// Get current progress state
app.get("/api/progress-state", authenticate, async (req, res) => {
  try {
    // Look for any active progress state (we'll use a simple approach since we typically only have one analysis running)
    const activeProgress = await ProgressState.findOne({
      where: {
        type: {
          [sequelize.Sequelize.Op.in]: ["start", "progress"],
        },
      },
      order: [["updated_at", "DESC"]],
    });

    if (activeProgress) {
      // Check if progress is recent (within last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (activeProgress.updated_at >= oneHourAgo) {
        res.json({
          hasProgress: true,
          sessionId: activeProgress.session_id,
          type: activeProgress.type,
          current: activeProgress.current,
          total: activeProgress.total,
          symbol: activeProgress.symbol,
          message: activeProgress.message,
          started_at: activeProgress.started_at,
          updated_at: activeProgress.updated_at,
        });
        return;
      } else {
        // Clean up old progress
        await activeProgress.destroy();
      }
    }

    res.json({ hasProgress: false });
  } catch (error) {
    logError("Error getting progress state:", error);
    res.status(500).json({
      error: "Failed to get progress state",
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

    // Generate unique session ID for this analysis
    const sessionId = `analysis_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Get symbols
    const sp500Symbols = await getSP500Symbols();
    const etfSymbols = getSectorETFs();
    const symbolsToProcess = [...sp500Symbols, ...etfSymbols];

    logInfo(
      `Processing ${symbolsToProcess.length} symbols with session ID: ${sessionId}`
    );

    // Set up Server-Sent Events for progress updates
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "http://localhost:3000",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type",
    });

    // Send initial progress with session ID
    const startProgress = {
      type: "start",
      total: symbolsToProcess.length,
      message: "Starting analysis...",
      sessionId: sessionId,
    };

    // Save initial progress state to database
    await saveProgressState(sessionId, startProgress);

    res.write(`data: ${JSON.stringify(startProgress)}\n\n`);

    // Process symbols with progress updates
    await processSymbolsWithProgress(
      symbolsToProcess,
      sessionToken,
      async (progress) => {
        // Add session ID to progress
        const progressWithSession = { ...progress, sessionId };

        // Save progress state to database
        await saveProgressState(sessionId, progressWithSession);

        res.write(`data: ${JSON.stringify(progressWithSession)}\n\n`);
      }
    );

    // Send completion message
    const completeProgress = {
      type: "complete",
      message: "Analysis refresh complete",
      sessionId: sessionId,
    };

    // Save completion state and clean up
    await saveProgressState(sessionId, completeProgress);
    await clearProgressState(sessionId);

    res.write(`data: ${JSON.stringify(completeProgress)}\n\n`);

    res.end();
  } catch (error) {
    logError("Error refreshing analysis:", error);

    const errorProgress = {
      type: "error",
      message: error.message,
    };

    // Try to save error state if we have a session ID
    let currentSessionId;
    try {
      currentSessionId = sessionId;
    } catch (e) {
      // sessionId might not be defined if error occurred before initialization
    }

    if (currentSessionId) {
      errorProgress.sessionId = currentSessionId;
      await saveProgressState(currentSessionId, errorProgress);
    }

    res.write(`data: ${JSON.stringify(errorProgress)}\n\n`);
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

      // Determine the grouping key based on transaction type
      let groupingKey;
      let displaySymbol;

      if (tx.instrument_type === "Equity Option") {
        // Check if it's a put option
        const match = tx.symbol.match(/([CP])(\d{8})$/);
        if (match && match[1] === "P") {
          // For puts, use the full option symbol as the grouping key
          groupingKey = tx.symbol.trim();
          displaySymbol = tx.symbol.trim();
        } else {
          // For calls, use the underlying stock symbol
          displaySymbol = tx.symbol.split(" ")[0];
          groupingKey = displaySymbol;
        }
      } else {
        // For equity transactions, use the stock symbol
        displaySymbol = tx.symbol.split(" ")[0];
        groupingKey = displaySymbol;
      }

      positionsBySymbol[groupingKey] ??= [];

      let currentPosition = positionsBySymbol[groupingKey].find(
        (pos) => pos.isOpen
      );

      if (!currentPosition) {
        // Create a new position
        currentPosition = {
          symbol: displaySymbol,
          groupingKey: groupingKey, // Store the grouping key for reference
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
        positionsBySymbol[groupingKey].push(currentPosition);
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
        // Note: value_effect can also be "none" - in this case, no premium adjustment is made

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

    // Convert to array and filter positions
    const positionsArray = Object.values(positionsBySymbol)
      .flat() // Flatten the arrays of positions for each symbol
      .filter(
        (position) =>
          position.transactions.length > 0 &&
          position.totalOptionTransactions > 0
      );

    // Fetch Yahoo Finance prices for open positions
    const openPositions = positionsArray.filter((position) => position.isOpen);
    const yahooFinancePrices = {};

    if (openPositions.length > 0) {
      await Promise.all(
        openPositions.map(async (position) => {
          try {
            // For option symbols, extract the underlying stock symbol for Yahoo Finance
            let yahooSymbol = position.symbol;

            // Check if this is a full option symbol (contains spaces and option format)
            const optionMatch = position.symbol.match(
              /^(.+?)\s+(\d{6})([CP])(\d{8})$/
            );
            if (optionMatch) {
              // Extract underlying symbol from option symbol
              yahooSymbol = optionMatch[1].trim();
            }

            const quote = await yahooFinance.quote(yahooSymbol);
            yahooFinancePrices[position.symbol] =
              quote.regularMarketPrice || null;
          } catch (error) {
            logError(
              `Error fetching Yahoo price for ${position.symbol}:`,
              error
            );
            yahooFinancePrices[position.symbol] = null;
          }
        })
      );
    }

    // Add additional calculations with Yahoo Finance data
    const aggregatedPositions = positionsArray
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

        // Extract strike price and option type from the latest option transaction
        let strikePrice = null;
        let optionType = null; // 'C' for call, 'P' for put
        let latestOptionDate = null;

        for (const tx of position.transactions) {
          if (tx.instrument_type === "Equity Option") {
            const txDate = new Date(tx.executed_at);

            // Only process if this is the latest option transaction
            if (!latestOptionDate || txDate > latestOptionDate) {
              // Option symbols typically end with C/P followed by 8 digits for TastyTrade format
              // Example: "MCHP  251031P00064000" where P is the option type and 00064000 is the strike
              const match = tx.symbol.match(/([CP])(\d{8})$/);
              if (match) {
                optionType = match[1]; // 'C' or 'P'
                const strikePart = match[2];
                const strikeValue = parseFloat(strikePart) / 1000;
                if (strikeValue > 0) {
                  strikePrice = strikeValue;
                  latestOptionDate = txDate;
                }
              }
            }
          }
        }

        // Get current market value for open positions
        const currentPrice = yahooFinancePrices[position.symbol];
        let effectivePrice = currentPrice;

        // Adjust effective price for options: cap/floor at strike for both calls and puts
        if (
          currentPrice &&
          strikePrice &&
          (optionType === "C" || optionType === "P")
        ) {
          effectivePrice = Math.min(currentPrice, strikePrice);
        }

        let currentMarketValue = 0;
        if (position.isOpen && effectivePrice) {
          currentMarketValue = effectivePrice * position.totalShares;
        }

        // For put options with no underlying shares (cash-secured puts), use effective price
        if (
          position.isOpen &&
          position.totalShares === 0 &&
          position.totalOptionContracts > 0 &&
          optionType === "P" &&
          currentPrice &&
          strikePrice
        ) {
          currentMarketValue =
            position.totalOptionContracts * 100 * effectivePrice;
        }

        // Calculate total return
        let totalReturn;
        if (position.isOpen && currentMarketValue > 0) {
          // For open positions: Total proceeds + current market value + option premium - total cost
          totalReturn =
            position.totalProceeds +
            currentMarketValue +
            position.totalOptionPremium -
            position.totalCost;
        } else {
          // For closed positions: option premium + realized P&L
          totalReturn = position.totalOptionPremium + realizedPL;
        }

        // For cash-secured puts, adjust total return to premium minus intrinsic value
        if (
          position.isOpen &&
          position.totalShares === 0 &&
          position.totalOptionContracts > 0 &&
          optionType === "P" &&
          currentPrice &&
          strikePrice
        ) {
          const intrinsicValue = Math.max(strikePrice - currentPrice, 0);
          totalReturn =
            position.totalOptionPremium -
            position.totalOptionContracts * 100 * intrinsicValue;
        }

        // Calculate return percentage
        let returnPercentage = 0;
        if (position.totalCost > 0) {
          if (position.isOpen && currentMarketValue > 0) {
            // For active positions with current market value
            returnPercentage = (totalReturn / position.totalCost) * 100;
          } else if (position.isOpen) {
            // For active positions without current market value (fallback)
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

        // For cash-secured puts (open or closed), return percentage is total return as portion of strike price
        if (position.totalShares === 0 && optionType === "P" && strikePrice) {
          // For closed puts, use the absolute value of contracts that were traded
          const contractsTraded =
            Math.abs(position.totalOptionContracts) ||
            Math.abs(position.totalOptionTransactions);
          if (contractsTraded > 0) {
            const totalCashAtRisk = strikePrice * contractsTraded * 100;
            returnPercentage = (totalReturn / totalCashAtRisk) * 100;
          }
        }

        return {
          ...position,
          totalTransactions: position.transactions.length,
          realizedPL,
          totalReturn,
          returnPercentage,
          currentPrice,
          currentMarketValue,
          strikePrice,
          optionType, // Include option type in response
          effectivePrice,
          daysHeld: Math.ceil(
            (new Date(
              position.isOpen ? Date.now() : position.lastTransactionDate
            ) -
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

// Monitor existing progress state via SSE
app.get("/api/progress-monitor", authenticate, async (req, res) => {
  try {
    const { sessionId } = req.query;

    logInfo(`Monitoring progress for session: ${sessionId}`);

    // Set up Server-Sent Events for progress monitoring
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "http://localhost:3000",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type",
    });

    // Check if the specified session still has active progress
    const currentProgress = await getProgressState(sessionId);

    if (!currentProgress) {
      // No active progress found
      res.write(
        `data: ${JSON.stringify({
          type: "no-progress",
          message: "Analysis no longer active",
        })}\n\n`
      );
      res.end();
      return;
    }

    // Send current progress state
    res.write(
      `data: ${JSON.stringify({
        type: currentProgress.type,
        current: currentProgress.current,
        total: currentProgress.total,
        symbol: currentProgress.symbol,
        message: currentProgress.message,
        sessionId: sessionId,
      })}\n\n`
    );

    // Set up polling to check for progress updates
    const checkInterval = setInterval(async () => {
      try {
        const updatedProgress = await getProgressState(sessionId);

        if (!updatedProgress) {
          // Progress completed or removed
          res.write(
            `data: ${JSON.stringify({
              type: "complete",
              message: "Analysis completed",
            })}\n\n`
          );
          clearInterval(checkInterval);
          res.end();
          return;
        }

        // Send updated progress
        res.write(
          `data: ${JSON.stringify({
            type: updatedProgress.type,
            current: updatedProgress.current,
            total: updatedProgress.total,
            symbol: updatedProgress.symbol,
            message: updatedProgress.message,
            sessionId: sessionId,
          })}\n\n`
        );

        // If progress is complete or error, end monitoring
        if (
          updatedProgress.type === "complete" ||
          updatedProgress.type === "error"
        ) {
          clearInterval(checkInterval);
          res.end();
        }
      } catch (error) {
        logError("Error monitoring progress:", error);
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            message: error.message,
          })}\n\n`
        );
        clearInterval(checkInterval);
        res.end();
      }
    }, 1000); // Check every second

    // Clean up on client disconnect
    req.on("close", () => {
      clearInterval(checkInterval);
      logInfo(`Progress monitoring closed for session: ${sessionId}`);
    });
  } catch (error) {
    logError("Error setting up progress monitoring:", error);
    res.status(500).json({
      error: "Failed to monitor progress",
      message: error.message,
    });
  }
});
