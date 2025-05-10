const express = require("express");
const cors = require("cors");
const {
  initializeTastytrade,
  processSymbols,
  getAccountHistory,
} = require("./Analyze/index");

const app = express();
app.use(cors());
app.use(express.json());

// Load environment variables
require("dotenv").config();

// Initialize Tastytrade connection when server starts
let tastytradeSessionToken;
let accountHistory;

async function initializeServer() {
  try {
    console.log("Initializing Tastytrade connection...");
    tastytradeSessionToken = await initializeTastytrade();

    // Fetch account history
    accountHistory = await getAccountHistory(tastytradeSessionToken);
    console.log("Account history fetched successfully");

    console.log("Tastytrade connection established successfully");
  } catch (error) {
    console.error("Failed to initialize Tastytrade connection:", error);
    process.exit(1);
  }
}

// API endpoint to get account history
app.get("/api/account-history", async (req, res) => {
  try {
    if (!tastytradeClient) {
      throw new Error("Tastytrade connection not initialized");
    }

    res.json(accountHistory);
  } catch (error) {
    console.error("Error fetching account history:", error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to get trading data
app.get("/api/trading-data", async (req, res) => {
  try {
    if (!tastytradeClient) {
      throw new Error("Tastytrade connection not initialized");
    }

    const data = await processSymbols();
    res.json(data);
  } catch (error) {
    console.error("Error fetching trading data:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;

// Initialize server and start listening
initializeServer()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
