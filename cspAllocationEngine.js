/**
 * Unified Cash Secured Put (CSP) Allocation Engine
 * Combines liquidity accounting, earnings pre-filtering, and AI prompt generation in one file.
 */

/**
 * 1. Deterministic Cash Accounting
 * Separates locked collateral from usable cash based on the deployment mode.
 *
 * @param {Object} balances - The account balances
 * @param {number} balances.netLiquidatingValue
 * @param {number} balances.cashBalance
 * @param {number} balances.derivativeBuyingPower
 * @param {Array<Object>} positions - Array of active positions
 * @param {string} mode - 'MID_WEEK_DEPLOYMENT' | 'NEXT_CYCLE_ROLL'
 * @param {string} [targetCycleExp='N/A'] - The target cycle expiration date (YYYY-MM-DD)
 */
function calculateLiquidity(balances, positions, mode, targetCycleExp = "N/A") {
  const maxSinglePositionCap = balances.netLiquidatingValue * 0.08;

  const csps = positions.filter((p) => p.type === "CSP");
  const ccs = positions.filter((p) => p.type === "CC");

  const otmCsps = csps.filter((p) => p.strike < p.underlyerPrice);
  const itmCsps = csps.filter((p) => p.strike >= p.underlyerPrice);

  const otmCcs = ccs.filter((p) => p.strike > p.underlyerPrice);
  const itmCcs = ccs.filter((p) => p.strike <= p.underlyerPrice);

  const totalActiveCspCollateral = csps.reduce(
    (sum, p) => sum + p.strike * 100 * p.contracts,
    0,
  );
  const itmCspCashRequired = itmCsps.reduce(
    (sum, p) => sum + p.strike * 100 * p.contracts,
    0,
  );
  const itmCcCashGenerated = itmCcs.reduce(
    (sum, p) => sum + p.strike * 100 * p.contracts,
    0,
  );

  let availableBudget = 0;
  let explanation = "";

  if (mode === "MID_WEEK_DEPLOYMENT") {
    // Current cash minus cash actively locking existing CSPs
    availableBudget = Math.max(
      0,
      balances.cashBalance - totalActiveCspCollateral,
    );
    explanation = `
- Mode: Mid-Week Deployment (Allocating idle unencumbered cash today)
- Current Cash Balance: $${balances.cashBalance.toFixed(2)}
- Less Active Locked CSP Collateral: -$${totalActiveCspCollateral.toFixed(2)}
- Unencumbered Liquid Cash Available for New CSPs Today: $${availableBudget.toFixed(2)}
    `.trim();
  } else {
    // Roll mode: Post-expiration calculation for upcoming cycle
    const projectedCash =
      balances.cashBalance - itmCspCashRequired + itmCcCashGenerated;
    availableBudget = Math.max(0, projectedCash);
    const otmCollateralReleased = otmCsps.reduce(
      (s, p) => s + p.strike * 100 * p.contracts,
      0,
    );

    explanation = `
- Mode: Next Cycle Roll (Planning deployment for cycle expiring ${targetCycleExp})
- Current Cash Balance: $${balances.cashBalance.toFixed(2)}
- Less ITM CSP Assignments (Cash required to buy assigned stock): -$${itmCspCashRequired.toFixed(2)}
- Plus ITM Covered Calls (Cash proceeds from shares called away): +$${itmCcCashGenerated.toFixed(2)}
- Collateral Released on Expiration: $${otmCollateralReleased.toFixed(2)} from OTM CSPs
- Projected Net Liquid Cash Budget for Next Cycle: $${availableBudget.toFixed(2)}
    `.trim();
  }

  return {
    maxSinglePositionCap,
    availableBudget,
    totalActiveCspCollateral,
    explanation,
    otmCsps,
    itmCsps,
    otmCcs,
    itmCcs,
  };
}

/**
 * 2. Pre-Filtering Candidates
 * Eliminates invalid trades in code so the AI doesn't hallucinate dates or position limits.
 *
 * @param {Array<Object>} candidates - The array of candidate stocks and metrics
 * @param {number} targetDte - Days to target expiration
 * @param {number} maxSinglePositionCap - 8% net liquidating value single-contract limit
 */
function filterCandidates(candidates, targetDte, maxSinglePositionCap) {
  return candidates.filter((c) => {
    // Single contract cannot exceed 8% NLV
    if (c.strike * 100 > maxSinglePositionCap) {
      return false;
    }
    // Option must expire at least 2 days before earnings
    if (c.daysToEarnings < targetDte + 2) {
      return false;
    }
    return true;
  });
}

/**
 * 3. Unified Prompt Generator
 * Assembles the full prompt requesting standard Markdown tables and clear budget rules.
 *
 * @param {Object} input - Input parameters containing balances, positions, candidates, and cycle details
 */
function generateAllocationPrompt(input) {
  const {
    balances,
    positions,
    candidates,
    mode,
    todayDate,
    currentCycleExp,
    targetCycleExp,
    targetDte,
  } = input;

  const liquidity = calculateLiquidity(
    balances,
    positions,
    mode,
    targetCycleExp,
  );
  const eligible = filterCandidates(
    candidates,
    targetDte,
    liquidity.maxSinglePositionCap,
  );

  const candidateRows = eligible
    .map(
      (c) =>
        `- ${c.symbol}: Price $${c.price.toFixed(2)}, Strike $${c.strike}, Mid % ${c.midPct.toFixed(2)}%, IVR ${c.ivr.toFixed(2)}, Delta ${c.delta}, Expiration ${c.expiration}, Earnings in ${c.daysToEarnings} days`,
    )
    .join("\n");

  return `
I need your help to allocate my portfolio for Cash Secured Puts.

Timeline & Context:
- Today's Date: ${todayDate}
- Current Expiring Cycle: ${currentCycleExp}
- Target Expiration for New Allocations: ${targetCycleExp} (DTE: ${targetDte} days)
- Planning Mode: ${mode === "NEXT_CYCLE_ROLL" ? "Weekly Roll for Next Cycle" : "Mid-Week Immediate Deployment"}

Account Balances from Tastytrade:
- Raw Net Liquidating Value: $${balances.netLiquidatingValue.toFixed(2)}
- 8% Single Position Cap: $${liquidity.maxSinglePositionCap.toFixed(2)}
- Raw Cash Balance: $${balances.cashBalance.toFixed(2)}
- Raw Buying Power: $${balances.derivativeBuyingPower.toFixed(2)}

Cash Breakdown & Calculation:
${liquidity.explanation}
- Target Allocation Budget: $${liquidity.availableBudget.toFixed(2)}

Existing Active Positions (Expiring ${currentCycleExp}):
- OTM CSPs: ${liquidity.otmCsps.map((p) => `${p.symbol} ($${p.strike})`).join(", ") || "None"}
- ITM CSPs: ${liquidity.itmCsps.map((p) => `${p.symbol} ($${p.strike})`).join(", ") || "None"}
- ITM CCs: ${liquidity.itmCcs.map((p) => `${p.symbol} ($${p.strike})`).join(", ") || "None"}

Pre-Filtered Candidates (Pre-verified for earnings safety and position size):
${candidateRows || "No candidates met the screening criteria."}

Task:
Recommend a list of new CSP allocations targeting the ${targetCycleExp} expiration.

Rules:
1. **Total Budget**: Allocate as close to 100% of the available budget ($${liquidity.availableBudget.toFixed(2)}) as possible without exceeding it. Do not leave large cash cushions.
2. **Position Cap**: Total allocation per symbol (Contracts * 100 * Strike) must not exceed $${liquidity.maxSinglePositionCap.toFixed(2)}. ${
    mode === "NEXT_CYCLE_ROLL"
      ? "Because existing positions expire on " +
        currentCycleExp +
        ", their collateral releases for this new cycle. Do NOT penalize expiring symbols from being selected for the new cycle."
      : "Subtract active position collateral from the 8% limit when checking open symbols."
  }
3. **Prioritization**: Prioritize symbols with the highest Mid % and highest IVR, aiming for Delta near -0.35.
4. **Format Requirements**:
   - Format the entire response in clean, human-readable Markdown (do NOT use raw HTML tags).
   - Start directly with a brief bulleted summary of the Liquidity Calculation.
   - Present the portfolio allocations in a Markdown table with columns: Symbol, Strike, Contracts, Allocation Amount, Mid %, IVR, Delta, Earnings In.
   - Format the Symbol as a Yahoo Finance Markdown link: [SYMBOL](https://finance.yahoo.com/quote/SYMBOL).
   - End with concise bullet points explaining selection and capital efficiency.
`.trim();
}

module.exports = {
  calculateLiquidity,
  filterCandidates,
  generateAllocationPrompt,
};
