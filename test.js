require("dotenv").config();
const {
  initializeTastytrade,
  getQuote,
  getOptionChain,
} = require("./tastytrade");

async function testTastytrade() {
  try {
    // Initialize with credentials from .env
    const sessionToken = await initializeTastytrade();
    console.log("Successfully authenticated with Tastytrade");

    // Test quote retrieval
    const quote = await getQuote("AAPL", sessionToken);
    console.log("Quote for AAPL:", quote);

    // Test option chain retrieval
    const optionChain = await getOptionChain("AAPL", sessionToken);
    console.log("Option chain for AAPL:", optionChain);
  } catch (error) {
    console.error("Test failed:", error.message);
    if (error.response?.data) {
      console.error("Error details:", error.response.data);
    }
  }
}

testTastytrade();
