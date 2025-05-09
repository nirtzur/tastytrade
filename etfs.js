/**
 * List of major sector ETFs
 * @returns {string[]} Array of sector ETF symbols
 */
function getSectorETFs() {
  return [
    // Technology
    "XLK", // Technology Select Sector SPDR
    "SMH", // VanEck Semiconductor ETF
    "SOXX", // iShares Semiconductor ETF

    // Financials
    "XLF", // Financial Select Sector SPDR
    "KBE", // SPDR S&P Bank ETF

    // Healthcare
    "XLV", // Health Care Select Sector SPDR
    "IHI", // iShares U.S. Medical Devices ETF

    // Consumer
    "XLY", // Consumer Discretionary Select Sector SPDR
    "XLP", // Consumer Staples Select Sector SPDR

    // Energy
    "XLE", // Energy Select Sector SPDR
    "XOP", // SPDR S&P Oil & Gas Exploration & Production ETF

    // Materials
    "XLB", // Materials Select Sector SPDR

    // Industrials
    "XLI", // Industrial Select Sector SPDR

    // Utilities
    "XLU", // Utilities Select Sector SPDR

    // Real Estate
    "XLRE", // Real Estate Select Sector SPDR

    // Communication Services
    "XLC", // Communication Services Select Sector SPDR

    // Broad Market
    "SPY", // SPDR S&P 500 ETF
    "QQQ", // Invesco QQQ Trust
    "DIA", // SPDR Dow Jones Industrial Average ETF
    "IWM", // iShares Russell 2000 ETF
  ];
}

module.exports = {
  getSectorETFs,
};
