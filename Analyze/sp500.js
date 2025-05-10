const axios = require("axios");

async function getSP500Symbols() {
  try {
    // Using a reliable source for S&P 500 symbols
    const response = await axios.get(
      "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv"
    );
    const lines = response.data.split("\n");

    // Skip header and process symbols
    return lines
      .slice(1)
      .map((line) => line.split(",")[0])
      .filter((symbol) => symbol && symbol.trim() !== "");
  } catch (error) {
    throw new Error(`Failed to fetch S&P 500 symbols: ${error.message}`);
  }
}

module.exports = {
  getSP500Symbols,
};
