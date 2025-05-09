require("dotenv").config();

const RATE_LIMIT_DELAY_MS = parseInt(process.env.RATE_LIMIT_DELAY_MS) || 100;

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Number of milliseconds to sleep (defaults to RATE_LIMIT_DELAY_MS)
 * @returns {Promise<void>}
 */
async function sleep(ms = RATE_LIMIT_DELAY_MS) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = sleep;
