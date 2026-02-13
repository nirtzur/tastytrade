const express = require("express");
require("dotenv").config();
const cors = require("cors");
const path = require("path");
const finnhub = require("finnhub");
const { GoogleGenAI } = require("@google/genai");

// Configure Finnhub
const finnhubClient = new finnhub.DefaultApi();
finnhubClient.apiKey = process.env.FINNHUB_API_KEY;

const {
  initializeTastytrade,
  getAccountHistory,
  getPositions,
  logout,
} = require("./Analyze/tastytrade");
const {
  processSymbols,
  processSymbolsWithProgress,
} = require("./Analyze/index");
const { getSP500Symbols } = require("./Analyze/sp500");
const { getSectorETFs } = require("./Analyze/etfs");
const sequelize = require("./models");
const TransactionHistory = require("./models/TransactionHistory");
const ClosedPosition = require("./models/ClosedPosition");
const AnalysisResult = require("./models/AnalysisResult");
const ProgressState = require("./models/ProgressState");
const DescopeClient = require("@descope/node-sdk");

// Helper function to fetch Finnhub price with retry logic
async function fetchFinnhubPriceWithRetry(symbol, maxRetries = 2) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      logInfo(`Fetching Finnhub price for: ${symbol}`);
      const quote = await new Promise((resolve, reject) => {
        finnhubClient.quote(symbol, (error, data, response) => {
          if (error) {
            reject(error);
          } else {
            resolve(data);
          }
        });
      });
      // Finnhub returns c (current price)
      return quote.c;
    } catch (error) {
      const isRateLimit =
        error.status === 429 ||
        (error.message && error.message.includes("Too Many Requests"));

      if (isRateLimit && retries < maxRetries - 1) {
        retries++;
        const delay = 1000; // Fixed 1 second delay
        logInfo(
          `Rate limit hit for ${symbol}, retrying in ${delay}ms (Attempt ${retries}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

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
      formatDate(lastSync),
      formatDate(now)
    );

    if (!Array.isArray(transactions) || transactions.length === 0) {
      logInfo("No new transactions to sync");
      return;
    }

    // Filter out transactions that already exist to avoid duplicates/updates
    const transactionIds = transactions.map((tx) => String(tx.id));
    logInfo("Transaction IDs to check:", transactionIds);
    const existingTransactions = await TransactionHistory.findAll({
      where: {
        transaction_id: transactionIds,
      },
      attributes: ["transaction_id"],
      raw: true,
    });

    const existingIds = new Set(
      existingTransactions.map((tx) => String(tx.transaction_id))
    );
    const newTransactions = transactions.filter(
      (tx) => !existingIds.has(String(tx.id))
    );

    if (newTransactions.length === 0) {
      logInfo("No new transactions to sync (all duplicates)");
      return;
    }

    logInfo(`Found ${newTransactions.length} new transactions to sync`);

    // Use Sequelize's bulkCreate with updateOnDuplicate
    await TransactionHistory.bulkCreate(
      newTransactions.map((tx) => ({
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

    // Check if progress is recent (within last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (progress.updated_at < oneHourAgo) {
      // Clean up old progress
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

// Request logging middleware
app.use((req, res, next) => {
  logInfo(`Incoming request: ${req.method} ${req.url}`);
  next();
});

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
const REQUIRED_ENV_VARS = [
  "TASTYTRADE_BASE_URL",
  "TASTYTRADE_ACCOUNT_NUMBER",
  "DESCOPE_PROJECT_ID",
];

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

// Initialize Descope Client
const descopeClient = DescopeClient({
  projectId: process.env.DESCOPE_PROJECT_ID,
});

// Descope Authentication Middleware
const requireDescopeAuth = async (req, res, next) => {
  // Skip auth for login/public endpoints if any (though we protect everything usually)
  if (req.path === "/api/health") return next();

  const authHeader = req.headers["authorization"];
  let token = authHeader && authHeader.split(" ")[1];

  // Also check query parameter for EventSource connections
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    logError("No Descope token provided");
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const authInfo = await descopeClient.validateSession(token);
    req.user = authInfo;
    next();
  } catch (error) {
    logError("Descope authentication failed:", error.message);
    res.status(401).json({ error: "Invalid session" });
  }
};

// Apply Descope auth to all API routes
app.use("/api", requireDescopeAuth);

// Session management (Legacy - Removed)
// let sessionToken = null;  // No longer needed
// let rememberMeToken = null; // No longer needed
// let username = null; // No longer needed
// let sessionExpiresAt = null; // No longer needed

// Authentication middleware
// Simplified to just ensure the client is initialized
async function authenticate(req, res, next) {
  try {
    logInfo(`Authentication check for route: ${req.method} ${req.path}`);

    // Lazy initialization of the Tastytrade client if not already done
    // Since initializeTastytrade is idempotent-ish and safe to call
    await initializeTastytrade();

    // We could check if we got a success from it, but if it throws, it goes to catch.

    next();
  } catch (error) {
    logError("Authentication failed:", error);
    res.status(401).json({
      error: "Tastytrade authentication required",
      message: error.message,
    });
  }
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
    // Only if it's a simple date string (YYYY-MM-DD)
    const endOfDay = new Date(endDate);
    if (endDate.length === 10) {
      endOfDay.setHours(23, 59, 59, 999);
    }

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
      order: [["updated_at", "DESC"]],
    });

    if (activeProgress) {
      // Check if progress is recent (within last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      if (activeProgress.updated_at < oneHourAgo) {
        // Clean up old progress
        await activeProgress.destroy();
      } else if (["start", "progress"].includes(activeProgress.type)) {
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
    const positions = await getPositions();

    // Extract unique underlying symbols to minimize API calls
    const uniqueSymbols = [
      ...new Set(
        positions.map((p) => {
          const optionMatch = p.symbol.match(/^(.+?)\s+(\d{6})([CP])(\d{8})$/);
          return optionMatch ? optionMatch[1].trim() : p.symbol;
        })
      ),
    ];

    logInfo(
      `Fetching Finnhub prices for ${uniqueSymbols.length} unique symbols`
    );

    const priceMap = {};
    const batchSize = 2; // Reduced from 5 to 2

    // Process in batches to avoid rate limits
    for (let i = 0; i < uniqueSymbols.length; i += batchSize) {
      const batch = uniqueSymbols.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (symbol) => {
          try {
            const price = await fetchFinnhubPriceWithRetry(symbol);
            priceMap[symbol] = price;
          } catch (error) {
            logError(
              `Error fetching Finnhub price for ${symbol}:`,
              error.message
            ); // Log message only to reduce noise
            priceMap[symbol] = null;
          }
        })
      );

      // Increased delay between batches
      if (i + batchSize < uniqueSymbols.length) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Increased from 500ms to 2000ms
      }
    }

    // Add Finnhub prices to positions data
    const positionsWithPrices = positions.map((position) => {
      const optionMatch = position.symbol.match(
        /^(.+?)\s+(\d{6})([CP])(\d{8})$/
      );
      const underlyingSymbol = optionMatch
        ? optionMatch[1].trim()
        : position.symbol;
      return {
        ...position,
        current_price: priceMap[underlyingSymbol] || null,
      };
    });

    res.json(positionsWithPrices);
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
    await processSymbolsWithProgress(symbolsToProcess, async (progress) => {
      // Add session ID to progress
      const progressWithSession = { ...progress, sessionId };

      // Save progress state to database
      await saveProgressState(sessionId, progressWithSession);

      res.write(`data: ${JSON.stringify(progressWithSession)}\n\n`);
    });

    // Send completion message
    const completeProgress = {
      type: "complete",
      message: "Analysis refresh complete",
      sessionId: sessionId,
    };

    // Save completion state
    await saveProgressState(sessionId, completeProgress);
    // await clearProgressState(sessionId); // Keep state for a while so client can see it

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
    await processSymbols(symbolsToProcess);

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

// Authentication endpoints (Modified for OAuth compatibility)
app.post("/api/auth/login", async (req, res) => {
  try {
    const { userLogin, password } = req.body;

    if (userLogin && password) {
      // Perform login to establish session/refresh tokens
      await initializeTastytrade({ username: userLogin, password });
    } else {
      // Just ensure client is initialized (if already logged in)
      await initializeTastytrade();
    }

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
    // Call TastyTrade API to invalidate the session
    await logout();

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

// Production routing - Static files
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

const PORT = process.env.PORT || 3001;

// Constants
const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

function isOpeningTransaction(tx) {
  if (tx.instrument_type === "Equity") {
    return tx.action === "Buy to Open" || tx.action === "Buy";
  } else if (tx.instrument_type === "Equity Option") {
    return tx.action === "Sell to Open" || tx.action === "Buy to Open";
  }
  return false;
}

async function fetchAggregatedPositions() {
  logInfo("Fetching aggregated positions with caching logic...");

  // 1. Fetch persistent closed positions
  let dbClosedPositions = [];
  try {
    // Reading from DB
    dbClosedPositions = await ClosedPosition.findAll({
      order: [["closed_at", "DESC"]],
      raw: true,
    });
  } catch (err) {
    logError("Error fetching closed positions DB:", err.message);
  }

  const formattedDbClosedPositions = dbClosedPositions.map((cp) => ({
    symbol: cp.symbol,
    groupingKey: cp.grouping_key,
    totalShares: parseFloat(cp.total_shares),
    totalCost: parseFloat(cp.total_cost),
    totalProceeds: parseFloat(cp.total_proceeds),
    avgCostBasis: parseFloat(cp.avg_cost_basis),
    transactions: [],
    isOpen: false,
    totalOptionPremium: parseFloat(cp.total_option_premium),
    totalOptionTransactions: cp.total_option_transactions,
    totalOptionContracts: cp.total_option_contracts,
    equityTransactions: cp.equity_transactions,
    firstTransactionDate: cp.first_transaction_date,
    lastTransactionDate: cp.last_transaction_date,
    realizedPL: parseFloat(cp.realized_pl),
    totalReturn: parseFloat(cp.total_return),
    returnPercentage: parseFloat(cp.return_percentage),
    daysHeld: Math.ceil(
      (new Date(cp.last_transaction_date) -
        new Date(cp.first_transaction_date)) /
        MILLISECONDS_PER_DAY
    ),
    totalTransactions: cp.equity_transactions + cp.total_option_transactions,
    // We don't store individual transaction count (length of array) in DB explicitly,
    // but equity+option transaction counts are close enough proxies for summary.
  }));

  // 2. Get unassigned transactions
  const transactions = await TransactionHistory.findAll({
    where: { closed_position_id: null },
    order: [["executed_at", "ASC"]],
    raw: true,
  });

  logInfo(`Fetched ${transactions.length} active/unassigned transactions`);

  const positionsBySymbol = {};

  transactions.forEach((tx) => {
    if (!tx.symbol) return;

    let groupingKey;
    let displaySymbol;

    if (tx.instrument_type === "Equity Option") {
      displaySymbol = tx.symbol.split(" ")[0];
      groupingKey = displaySymbol;
    } else {
      displaySymbol = tx.symbol.split(" ")[0];
      groupingKey = displaySymbol;
    }

    positionsBySymbol[groupingKey] ??= [];

    let currentPosition = positionsBySymbol[groupingKey].find(
      (pos) => pos.isOpen
    );

    if (!currentPosition) {
      currentPosition = {
        symbol: displaySymbol,
        groupingKey: groupingKey,
        totalShares: 0,
        totalCost: 0,
        totalProceeds: 0,
        avgCostBasis: 0,
        transactions: [],
        isOpen: true,
        totalOptionPremium: 0,
        totalOptionTransactions: 0,
        totalOptionContracts: 0,
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
    } else if (tx.instrument_type === "Equity Option") {
      currentPosition.totalOptionTransactions++;
      if (tx.value_effect === "Credit") {
        currentPosition.totalOptionPremium += value;
      } else if (tx.value_effect === "Debit") {
        currentPosition.totalOptionPremium -= value;
      }

      if (isOpeningTransaction(tx)) {
        currentPosition.totalOptionContracts += quantity;
      } else {
        currentPosition.totalOptionContracts -= quantity;
      }
    }

    const EPSILON = 0.001;
    if (
      currentPosition.totalShares > EPSILON ||
      currentPosition.totalOptionContracts > EPSILON
    ) {
      if (currentPosition.totalSharesBought > 0) {
        currentPosition.avgCostBasis =
          currentPosition.totalCost / currentPosition.totalSharesBought;
      }
      currentPosition.isOpen = true;
    } else {
      currentPosition.isOpen = false;
    }
  });

  const positionsArray = Object.values(positionsBySymbol)
    .flat()
    .filter(
      (position) =>
        position.transactions.length > 0 && position.totalOptionTransactions > 0
    );

  const newlyClosedPositions = [];
  const openPositions = [];

  for (const position of positionsArray) {
    let realizedPL = 0;
    if (position.totalShares <= 0 && position.totalOptionContracts <= 0) {
      realizedPL = position.totalProceeds - position.totalCost;
    } else {
      const avgCostPerShare =
        position.totalSharesBought > 0
          ? position.totalCost / position.totalSharesBought
          : 0;
      realizedPL =
        position.totalProceeds - position.totalSharesSold * avgCostPerShare;
    }
    position.realizedPL = realizedPL;

    let strikePrice = null;
    let optionType = null;
    let latestOptionDate = null;

    for (const tx of position.transactions) {
      if (tx.instrument_type === "Equity Option") {
        const txDate = new Date(tx.executed_at);
        if (!latestOptionDate || txDate > latestOptionDate) {
          const match = tx.symbol.match(/([CP])(\d{8})$/);
          if (match) {
            optionType = match[1];
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
    position.strikePrice = strikePrice;
    position.optionType = optionType;

    if (!position.isOpen) {
      // CLOSED LOGIC
      const totalReturn = position.totalOptionPremium + realizedPL;
      let returnPercentage = 0;
      if (position.totalCost > 0) {
        returnPercentage =
          ((position.totalProceeds + position.totalOptionPremium) /
            position.totalCost -
            1) *
          100;
      }

      // CSP Adjustment for Closed
      if (position.totalShares === 0 && optionType === "P" && strikePrice) {
        const contractsTraded =
          Math.abs(position.totalOptionContracts) ||
          Math.abs(position.totalOptionTransactions);
        if (contractsTraded > 0) {
          const totalCashAtRisk = strikePrice * contractsTraded * 100;
          returnPercentage = (totalReturn / totalCashAtRisk) * 100;
        }
      }

      position.totalReturn = totalReturn;
      position.returnPercentage = returnPercentage;
      position.daysHeld = Math.ceil(
        (new Date(position.lastTransactionDate) -
          new Date(position.firstTransactionDate)) /
          MILLISECONDS_PER_DAY
      );
      position.totalTransactions = position.transactions.length;

      try {
        const createdCp = await ClosedPosition.create({
          symbol: position.symbol,
          grouping_key: position.groupingKey,
          total_shares: position.totalShares,
          total_cost: position.totalCost,
          total_proceeds: position.totalProceeds,
          realized_pl: realizedPL,
          total_option_premium: position.totalOptionPremium,
          total_return: totalReturn,
          return_percentage: returnPercentage,
          first_transaction_date: position.firstTransactionDate,
          last_transaction_date: position.lastTransactionDate,
          total_option_contracts: position.totalOptionContracts,
          total_option_transactions: position.totalOptionTransactions,
          equity_transactions: position.equityTransactions,
          avg_cost_basis: position.avgCostBasis,
        });

        const txIds = position.transactions.map((t) => t.transaction_id);
        await TransactionHistory.update(
          { closed_position_id: createdCp.id },
          { where: { transaction_id: txIds } }
        );

        newlyClosedPositions.push(position);
      } catch (err) {
        logError(
          `Failed to archive closed position ${position.symbol}:`,
          err.message
        );
        newlyClosedPositions.push(position);
      }
    } else {
      openPositions.push(position);
    }
  }

  const finnhubPrices = {};
  if (openPositions.length > 0) {
    const uniqueSymbols = [
      ...new Set(
        openPositions.map((p) => {
          const optionMatch = p.symbol.match(/^(.+?)\s+(\d{6})([CP])(\d{8})$/);
          return optionMatch ? optionMatch[1].trim() : p.symbol;
        })
      ),
    ];

    // Process in batches
    const priceMap = {};
    const batchSize = 5;
    for (let i = 0; i < uniqueSymbols.length; i += batchSize) {
      const batch = uniqueSymbols.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (symbol) => {
          try {
            const price = await fetchFinnhubPriceWithRetry(symbol);
            priceMap[symbol] = price;
          } catch (error) {
            priceMap[symbol] = null;
          }
        })
      );
      if (i + batchSize < uniqueSymbols.length) {
        await new Promise((resolve) => setTimeout(resolve, 334));
      }
    }
    openPositions.forEach((position) => {
      const optionMatch = position.symbol.match(
        /^(.+?)\s+(\d{6})([CP])(\d{8})$/
      );
      const underlyingSymbol = optionMatch
        ? optionMatch[1].trim()
        : position.symbol;
      finnhubPrices[position.symbol] = priceMap[underlyingSymbol] || null;
    });
  }

  const finalOpenPositions = openPositions.map((position) => {
    const currentPrice = finnhubPrices[position.symbol];
    const strikePrice = position.strikePrice;
    const optionType = position.optionType;

    let effectivePrice = currentPrice;
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

    if (
      position.isOpen &&
      position.totalShares === 0 &&
      position.totalOptionContracts > 0 &&
      optionType === "P" &&
      currentPrice &&
      strikePrice
    ) {
      currentMarketValue = position.totalOptionContracts * 100 * effectivePrice;
    }

    let totalReturn;
    if (position.isOpen && currentMarketValue > 0) {
      totalReturn =
        position.totalProceeds +
        currentMarketValue +
        position.totalOptionPremium -
        position.totalCost;
    } else {
      totalReturn = position.totalOptionPremium + position.realizedPL;
    }

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

    let returnPercentage = 0;
    if (position.totalCost > 0) {
      if (position.isOpen && currentMarketValue > 0) {
        returnPercentage = (totalReturn / position.totalCost) * 100;
      } else if (position.isOpen) {
        returnPercentage = (totalReturn / position.totalCost) * 100;
      }
    }

    if (position.totalShares === 0 && optionType === "P" && strikePrice) {
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
      totalReturn,
      returnPercentage,
      currentPrice,
      currentMarketValue,
      effectivePrice,
      daysHeld: Math.ceil(
        (new Date() - new Date(position.firstTransactionDate)) /
          MILLISECONDS_PER_DAY
      ),
    };
  });

  const allPositions = [
    ...formattedDbClosedPositions,
    ...newlyClosedPositions,
    ...finalOpenPositions,
  ];
  return allPositions.sort(
    (a, b) =>
      new Date(b.firstTransactionDate) - new Date(a.firstTransactionDate)
  );
}

app.get("/api/positions/aggregated", authenticate, async (req, res) => {
  try {
    const aggregatedPositions = await fetchAggregatedPositions();

    logInfo(`Returning ${aggregatedPositions.length} aggregated positions`);
    if (aggregatedPositions.length > 0) {
      logInfo(
        "Sample position data (first item):",
        JSON.stringify(
          {
            symbol: aggregatedPositions[0].symbol,
            isOpen: aggregatedPositions[0].isOpen,
            totalReturn: aggregatedPositions[0].totalReturn,
            returnPercentage: aggregatedPositions[0].returnPercentage,
          },
          null,
          2
        )
      );
    }

    res.json(aggregatedPositions);
  } catch (error) {
    logError("Error fetching aggregated positions:", error);
    res.status(500).json({
      error: "Failed to fetch aggregated positions",
      message: error.message,
    });
  }
});

app.post("/api/ai/consult", authenticate, async (req, res) => {
  try {
    const token = req.body.token || process.env.GEMINI_TOKEN;
    if (!token) {
      return res.status(400).json({
        error:
          "Gemini token is required (provide in request or set GEMINI_TOKEN env var)",
      });
    }

    // 1. Fetch current positions
    const positions = await fetchAggregatedPositions();

    // Filter for open Cash Secured Puts
    const openCSPs = positions.filter(
      (p) =>
        p.isOpen &&
        p.optionType === "P" &&
        p.totalShares === 0 &&
        p.totalOptionContracts > 0
    );

    const totalAllocation = openCSPs.reduce((sum, p) => {
      // Allocation = contracts * 100 * strike
      return sum + p.totalOptionContracts * 100 * p.strikePrice;
    }, 0);

    // 2. Fetch latest analysis
    // Get the maximum analyzed_at date
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

    let analysisResults = [];
    if (maxDateResult && maxDateResult.max_date) {
      analysisResults = await AnalysisResult.findAll({
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
    }

    // Filter analysis: days to earnings >= 8 or days to earnings < 0 (past earnings)
    const filteredAnalysis = analysisResults.filter((a) => {
      if (a.days_to_earnings !== null && a.days_to_earnings !== undefined) {
        // Keep if earnings are far enough in future (>= 8 days) OR in the past (< 0 days)
        // Filter out if earnings are coming up soon (0 <= days < 8)
        return a.days_to_earnings >= 8 || a.days_to_earnings < 0;
      }
      return true; // Keep if unknown
    });

    // 3. Consult Gemini
    const genAI = new GoogleGenAI({ apiKey: token });

    const prompt = `
      I need your help to allocate my portfolio for Cash Secured Puts.
      
      Current Status:
      - Total Allocated Capital in CSPs: $${totalAllocation.toFixed(2)}
      - Current Open CSP Positions: ${openCSPs
        .map((p) => `${p.symbol} ($${p.strikePrice} Strike)`)
        .join(", ")}

      Available Analysis (Top Candidates):
      ${filteredAnalysis
        .slice(0, 20)
        .map((a) => {
          const earningsInfo =
            a.days_to_earnings < 0
              ? `Last earnings ${Math.abs(a.days_to_earnings)} days ago`
              : `Earnings in ${a.days_to_earnings} days`;
          return `- ${a.symbol}: Price $${a.current_price}, Strike $${a.option_strike_price}, Mid % ${a.option_mid_percent}%, ${earningsInfo}`;
        })
        .join("\n")}

      Task:
      Recommend a list of new allocations.
      - Each allocation should be between $20,000 and $40,000.
      - Allocation amount = Number of contracts * 100 * Strike Price.
      - Prioritize symbols with the highest 'Mid %'.
      - You may recommend symbols I already have open positions for.
      - The total sum of all recommended allocations must not exceed $${(
        totalAllocation + 15000
      ).toFixed(2)}.
      - Provide the ENTIRE response as valid HTML.
      - The main content should be an HTML table with columns: Symbol, Strike, Contracts, Allocation Amount, Mid %.
      - Include the brief reasoning for the selection as HTML paragraphs or lists below the table.
      - Do not use Markdown.
    `;

    if (req.body.preview) {
      return res.json({ prompt });
    }

    let contents;
    if (req.body.messages) {
      contents = req.body.messages;
    } else if (req.body.customPrompt) {
      contents = [{ role: "user", parts: [{ text: req.body.customPrompt }] }];
    } else {
      contents = [{ role: "user", parts: [{ text: prompt }] }];
    }

    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
    });

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

    res.json({ analysis: text });
  } catch (error) {
    logError("Error in AI consult:", error);
    res.status(500).json({
      error: "Failed to consult AI",
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

// Production routing - Catch all handler
if (process.env.NODE_ENV === "production") {
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "frontend/build/index.html"));
  });
}

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
