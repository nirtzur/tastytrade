const express = require("express");
const cors = require("cors");
const path = require("path");
const {
  initializeTastytrade,
  processSymbols,
  getAccountHistory,
  getPositions,
} = require("./Analyze/tastytrade");

const app = express();
app.use(cors());
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
const REQUIRED_ENV_VARS = [
  "TASTYTRADE_BASE_URL",
  "TASTYTRADE_USERNAME",
  "TASTYTRADE_PASSWORD",
  "TASTYTRADE_ACCOUNT_NUMBER",
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

// Session management with enhanced error handling
let tastytradeSessionToken = null;
let initializationInProgress = false;
let lastInitAttempt = 0;
const INIT_RETRY_INTERVAL = 30000; // 30 seconds
const MAX_RETRIES = 3;
let retryCount = 0;

async function initializeServer() {
  if (initializationInProgress) {
    logInfo("Initialization already in progress...");
    return false;
  }

  const now = Date.now();
  if (now - lastInitAttempt < INIT_RETRY_INTERVAL) {
    logInfo("Too soon to retry initialization");
    return false;
  }

  if (retryCount >= MAX_RETRIES) {
    logError("Max retry attempts reached. Manual intervention required.");
    return false;
  }

  initializationInProgress = true;
  lastInitAttempt = now;
  retryCount++;

  try {
    logInfo(
      "Starting Tastytrade initialization attempt",
      retryCount,
      "of",
      MAX_RETRIES
    );

    if (
      !process.env.TASTYTRADE_BASE_URL ||
      !process.env.TASTYTRADE_USERNAME ||
      !process.env.TASTYTRADE_PASSWORD
    ) {
      throw new Error("Missing required environment variables");
    }

    tastytradeSessionToken = await initializeTastytrade();
    logInfo("Tastytrade connection established successfully");
    retryCount = 0; // Reset counter on success
    return true;
  } catch (error) {
    logError("Failed to initialize Tastytrade connection:", {
      attempt: retryCount,
      error: error.message,
      stack: DEBUG ? error.stack : undefined,
    });
    return false;
  } finally {
    initializationInProgress = false;
  }
}

// Enhanced middleware with better error handling
async function ensureSession(req, res, next) {
  try {
    if (!tastytradeSessionToken) {
      logInfo("No session token found, attempting initialization...");
      const initialized = await initializeServer();
      if (!initialized) {
        logError("Session initialization failed");
        return res.status(503).json({
          error: "Service temporarily unavailable",
          retryAfter: Math.ceil(INIT_RETRY_INTERVAL / 1000),
        });
      }
    }
    next();
  } catch (error) {
    logError("Error in ensureSession middleware:", error);
    return res.status(503).json({
      error: "Service error during session initialization",
      retryAfter: Math.ceil(INIT_RETRY_INTERVAL / 1000),
    });
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
app.get("/api/account-history", ensureSession, async (req, res) => {
  try {
    logInfo("Received account-history request:", req.query);
    const { "start-date": startDate, "end-date": endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "Missing required query parameters",
        required: ["start-date", "end-date"],
      });
    }

    logInfo("Fetching account history");
    const filteredHistory = await getAccountHistory(
      tastytradeSessionToken,
      startDate,
      endDate
    );
    logInfo("Successfully fetched account history");
    res.json(filteredHistory);
  } catch (error) {
    logError("Error in /api/account-history:", {
      error: error.message,
      stack: DEBUG ? error.stack : undefined,
    });

    res.status(500).json({
      error: "Failed to fetch account history",
      message: error.message,
      retryAfter: Math.ceil(INIT_RETRY_INTERVAL / 1000),
    });
  }
});

app.get("/api/trading-data", ensureSession, async (req, res) => {
  try {
    logInfo("Fetching trading data");
    const data = await processSymbols();
    res.json(data);
  } catch (error) {
    logError("Error fetching trading data:", error);
    res.status(500).json({
      error: "Failed to fetch trading data",
      message: error.message,
    });
  }
});

app.get("/api/positions", ensureSession, async (req, res) => {
  try {
    logInfo("Fetching positions");
    const positions = await getPositions(tastytradeSessionToken);
    res.json(positions);
  } catch (error) {
    logError("Error fetching positions:", error);
    res.status(500).json({
      error: "Failed to fetch positions",
      message: error.message,
    });
  }
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

  // Attempt initial connection with enhanced error handling
  initializeServer().catch((error) => {
    logError("Initial connection attempt failed:", {
      error: error.message,
      stack: DEBUG ? error.stack : undefined,
    });
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logInfo("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    logInfo("HTTP server closed");
  });
});
