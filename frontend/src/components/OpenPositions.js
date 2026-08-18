import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Alert,
  CircularProgress,
  Chip,
  Button,
} from "@mui/material";
import { Refresh as RefreshIcon } from "@mui/icons-material";
import dayjs from "dayjs";
import client from "../api/client";

function OpenPositions() {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [usdIlsRate, setUsdIlsRate] = useState(null);
  const [exchangeRateLoading, setExchangeRateLoading] = useState(true);

  const fetchExchangeRate = async () => {
    try {
      setExchangeRateLoading(true);
      // Using a free exchange rate API
      const response = await fetch(
        "https://api.exchangerate-api.com/v4/latest/USD",
      );
      const data = await response.json();
      setUsdIlsRate(data.rates.ILS);
    } catch (err) {
      console.error("Error fetching exchange rate:", err);
      // Fallback to approximate rate if API fails
      setUsdIlsRate(3.7);
    } finally {
      setExchangeRateLoading(false);
    }
  };

  const fetchPositions = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const response = await client.get("/api/positions/aggregated");
      // Filter to show only open positions
      const openPositions = response.data.filter((position) => position.isOpen);
      setPositions(openPositions);
    } catch (err) {
      setError("Failed to fetch positions data");
      console.error("Error fetching positions:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPositions();
    fetchExchangeRate();
  }, []);

  const handleRefresh = () => {
    fetchPositions(true);
    fetchExchangeRate();
  };

  // Calculate total positions value
  const positionsTotalValue = positions.reduce((sum, position) => {
    return sum + (parseFloat(position.currentMarketValue) || 0);
  }, 0);

  const formatCurrency = (value) => {
    if (value === null || value === undefined) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatCurrencyILS = (value) => {
    if (value === null || value === undefined) return "N/A";
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: "ILS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return "N/A";
    return `${value.toFixed(2)}%`;
  };

  const getReturnColor = (value) => {
    if (value > 0) return "success.main";
    if (value < 0) return "error.main";
    return "text.primary";
  };

  if (loading && !refreshing) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="400px"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Typography variant="h5">Open Positions</Typography>
        <Button
          variant="outlined"
          startIcon={
            refreshing ? <CircularProgress size={20} /> : <RefreshIcon />
          }
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </Box>

      {/* Positions Value Summary */}
      <Box
        sx={{
          padding: 2,
          marginBottom: 2,
          backgroundColor: "background.paper",
          borderRadius: 1,
          boxShadow: 1,
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography variant="h6">
            Positions Total Value:{" "}
            {loading ? (
              <Box
                component="span"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <CircularProgress size={20} />
                <Typography component="span" color="text.secondary">
                  Loading...
                </Typography>
              </Box>
            ) : (
              formatCurrency(positionsTotalValue)
            )}
          </Typography>
          {!loading && usdIlsRate && (
            <Box
              sx={{ display: "flex", gap: 3, pl: 2, color: "text.secondary" }}
            >
              <Typography variant="body2">
                USD: {formatCurrency(positionsTotalValue)}
              </Typography>
              <Typography variant="body2">
                ILS: {formatCurrencyILS(positionsTotalValue * usdIlsRate)}
              </Typography>
              <Typography variant="body2">
                Exchange Rate: 1 USD = {usdIlsRate?.toFixed(4)} ILS
                {exchangeRateLoading && (
                  <CircularProgress size={12} sx={{ ml: 1 }} />
                )}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {positions.length === 0 ? (
        <Alert severity="info">No open positions found.</Alert>
      ) : (
        <TableContainer
          component={Paper}
          sx={{
            maxHeight: "70vh",
            overflow: "auto",
          }}
        >
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell
                  sx={{
                    backgroundColor: "background.paper",
                    fontWeight: "bold",
                  }}
                >
                  <strong>Symbol</strong>
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    backgroundColor: "background.paper",
                    fontWeight: "bold",
                  }}
                >
                  <strong>Status</strong>
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    backgroundColor: "background.paper",
                    fontWeight: "bold",
                  }}
                >
                  <strong>Shares</strong>
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    backgroundColor: "background.paper",
                    fontWeight: "bold",
                  }}
                >
                  <strong>Avg Cost</strong>
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    backgroundColor: "background.paper",
                    fontWeight: "bold",
                  }}
                >
                  <strong>Current Price</strong>
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    backgroundColor: "background.paper",
                    fontWeight: "bold",
                  }}
                >
                  <strong>Market Value</strong>
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    backgroundColor: "background.paper",
                    fontWeight: "bold",
                  }}
                >
                  <strong>Option Premium</strong>
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    backgroundColor: "background.paper",
                    fontWeight: "bold",
                  }}
                >
                  <strong>Total Return</strong>
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    backgroundColor: "background.paper",
                    fontWeight: "bold",
                  }}
                >
                  <strong>Return %</strong>
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    backgroundColor: "background.paper",
                    fontWeight: "bold",
                  }}
                >
                  <strong>Days Held</strong>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {positions.map((position, index) => (
                <TableRow
                  key={`${position.symbol}-${index}`}
                  sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                >
                  <TableCell component="th" scope="row">
                    <strong>{position.symbol}</strong>
                  </TableCell>
                  <TableCell align="right">
                    {position.totalShares === 0 &&
                    position.totalOptionContracts > 0 &&
                    position.optionType === "P" ? (
                      <Chip
                        label="Cash Secured Put"
                        color="warning"
                        size="small"
                        variant="outlined"
                      />
                    ) : position.totalShares > 0 &&
                      position.totalOptionContracts > 0 &&
                      position.optionType === "C" ? (
                      <Chip
                        label="Covered Call"
                        color="secondary"
                        size="small"
                        variant="outlined"
                      />
                    ) : (
                      <Chip
                        label="Open"
                        color="success"
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {position.totalShares?.toLocaleString() || "0"}
                  </TableCell>
                  <TableCell align="right">
                    {formatCurrency(position.avgCostBasis)}
                  </TableCell>
                  <TableCell align="right">
                    {formatCurrency(position.currentPrice)}
                  </TableCell>
                  <TableCell align="right">
                    {formatCurrency(position.currentMarketValue)}
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      color={getReturnColor(position.totalOptionPremium)}
                    >
                      {formatCurrency(position.totalOptionPremium)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography color={getReturnColor(position.totalReturn)}>
                      {formatCurrency(position.totalReturn)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      color={getReturnColor(position.returnPercentage)}
                    >
                      {formatPercent(position.returnPercentage)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{position.daysHeld}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Cash Secured Puts Summary */}
      {(() => {
        // Extract individual active CSP contract positions from the transaction history of positions
        const individualCSPs = [];

        positions.forEach((position) => {
          const contractsByOptionSymbol = {};

          if (position.transactions && Array.isArray(position.transactions)) {
            position.transactions.forEach((tx) => {
              if (tx.instrument_type !== "Equity Option") return;
              const optSymbol = tx.symbol;
              contractsByOptionSymbol[optSymbol] ??= {
                symbol: optSymbol,
                netContracts: 0,
              };

              const quantity = Math.abs(parseFloat(tx.quantity) || 0);
              const isOpening =
                tx.action === "Sell to Open" || tx.action === "Buy to Open";
              if (isOpening) {
                contractsByOptionSymbol[optSymbol].netContracts += quantity;
              } else {
                contractsByOptionSymbol[optSymbol].netContracts -= quantity;
              }
            });
          }

          // Generate individual CSP objects
          Object.values(contractsByOptionSymbol).forEach((opt) => {
            if (opt.netContracts <= 0) return;

            // Match OCC format (e.g. "MRNA  260814P00056000")
            const match = opt.symbol.match(/^(.+?)\s+(\d{6})([CP])(\d{8})$/);
            if (!match) return;

            const [, underlying, dateStr, type, strikeStr] = match;
            if (type !== "P") return; // Only Puts for Cash Secured Puts

            const strikePrice = parseFloat(strikeStr) / 1000;
            const year = "20" + dateStr.substring(0, 2);
            const month = dateStr.substring(2, 4);
            const day = dateStr.substring(4, 6);
            const expirationDate = `${year}-${month}-${day}`;

            individualCSPs.push({
              symbol: opt.symbol,
              underlying,
              strikePrice,
              totalOptionContracts: opt.netContracts,
              optionExpirationDate: expirationDate,
              currentPrice: position.currentPrice,
            });
          });
        });

        if (individualCSPs.length === 0) return null;

        const totalCashRequired = individualCSPs.reduce((sum, item) => {
          return sum + item.totalOptionContracts * item.strikePrice * 100;
        }, 0);

        // Group by expiration date
        const groupedByWeek = {};

        individualCSPs.forEach((item) => {
          const dateStr = item.optionExpirationDate || "Unknown";
          if (!groupedByWeek[dateStr]) {
            groupedByWeek[dateStr] = {
              date: dateStr,
              positions: [],
              totalCash: 0,
            };
          }
          const cashRequired =
            item.totalOptionContracts * item.strikePrice * 100;
          groupedByWeek[dateStr].positions.push({
            ...item,
            cashRequired,
          });
          groupedByWeek[dateStr].totalCash += cashRequired;
        });

        // Sort groups by date ascending (closest expiration first)
        const sortedGroups = Object.values(groupedByWeek).sort((a, b) => {
          if (a.date === "Unknown") return 1;
          if (b.date === "Unknown") return -1;
          return a.date.localeCompare(b.date);
        });

        const getExpirationBadge = (dateStr) => {
          if (dateStr === "Unknown") {
            return (
              <Chip
                label="Unknown Expiration"
                size="small"
                variant="outlined"
              />
            );
          }

          const exp = dayjs(dateStr);
          const today = dayjs().startOf("day");
          const diffDays = exp.diff(today, "day");

          if (diffDays === 0) {
            return (
              <Chip
                label="Expiring Tonight"
                color="error"
                size="small"
                variant="filled"
                sx={{ fontWeight: "bold" }}
              />
            );
          } else if (diffDays === 1) {
            return (
              <Chip
                label="Expiring Tomorrow"
                color="warning"
                size="small"
                variant="filled"
                sx={{ fontWeight: "bold" }}
              />
            );
          } else if (diffDays < 0) {
            return (
              <Chip
                label={`Expired ${Math.abs(diffDays)}d ago`}
                color="default"
                size="small"
                variant="outlined"
              />
            );
          } else {
            return (
              <Chip
                label={`${diffDays} days left`}
                color="primary"
                size="small"
                variant="outlined"
              />
            );
          }
        };

        const formatGroupHeaderDate = (dateStr) => {
          if (dateStr === "Unknown") return "Unknown Expiration";
          return dayjs(dateStr).format("dddd, MMMM D, YYYY");
        };

        return (
          <Box
            sx={{
              padding: 3,
              marginTop: 4,
              backgroundColor: "background.paper",
              borderRadius: 2,
              boxShadow: 2,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                mb: 3,
                flexWrap: "wrap",
                gap: 1,
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                Cash Secured Puts Summary
              </Typography>
              <Typography
                variant="h6"
                color="primary.main"
                sx={{ fontWeight: "bold" }}
              >
                Total Secured Cash: {formatCurrency(totalCashRequired)}
              </Typography>
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Based on {individualCSPs.length} cash secured put position
              {individualCSPs.length !== 1 ? "s" : ""}
            </Typography>

            {/* Weekly Breakdown Grid/Stack */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {sortedGroups.map((group) => (
                <Paper
                  key={group.date}
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderColor: "divider",
                    backgroundColor: "background.default",
                  }}
                >
                  {/* Group Header */}
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 2,
                      flexWrap: "wrap",
                      gap: 1.5,
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        flexWrap: "wrap",
                      }}
                    >
                      <Typography
                        variant="subtitle1"
                        sx={{ fontWeight: "bold" }}
                      >
                        {formatGroupHeaderDate(group.date)}
                      </Typography>
                      {getExpirationBadge(group.date)}
                    </Box>
                    <Typography
                      variant="subtitle1"
                      sx={{ fontWeight: "bold", color: "text.primary" }}
                    >
                      Secured: {formatCurrency(group.totalCash)}
                    </Typography>
                  </Box>

                  {/* Group Positions Table */}
                  <TableContainer
                    component={Paper}
                    elevation={0}
                    variant="outlined"
                  >
                    <Table size="small">
                      <TableHead sx={{ backgroundColor: "action.hover" }}>
                        <TableRow>
                          <TableCell>
                            <strong>Symbol</strong>
                          </TableCell>
                          <TableCell align="right">
                            <strong>Strike Price</strong>
                          </TableCell>
                          <TableCell align="right">
                            <strong>Contracts</strong>
                          </TableCell>
                          <TableCell align="right">
                            <strong>Current Price</strong>
                          </TableCell>
                          <TableCell align="right">
                            <strong>Secured Cash</strong>
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {group.positions.map((pos, pIndex) => (
                          <TableRow
                            key={`${pos.symbol}-${pIndex}`}
                            sx={{
                              "&:last-child td, &:last-child th": { border: 0 },
                            }}
                          >
                            <TableCell component="th" scope="row">
                              <strong>{pos.symbol}</strong>
                            </TableCell>
                            <TableCell align="right">
                              {formatCurrency(pos.strikePrice)}
                            </TableCell>
                            <TableCell align="right">
                              {pos.totalOptionContracts}
                            </TableCell>
                            <TableCell align="right">
                              {formatCurrency(pos.currentPrice)}
                            </TableCell>
                            <TableCell align="right">
                              <strong>
                                {formatCurrency(pos.cashRequired)}
                              </strong>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              ))}
            </Box>
          </Box>
        );
      })()}

      {/* Covered Calls Summary */}
      {(() => {
        // Extract individual active Covered Call contract positions from the transaction history of positions
        const individualCCs = [];

        positions.forEach((position) => {
          const contractsByOptionSymbol = {};

          if (position.transactions && Array.isArray(position.transactions)) {
            position.transactions.forEach((tx) => {
              if (tx.instrument_type !== "Equity Option") return;
              const optSymbol = tx.symbol;
              contractsByOptionSymbol[optSymbol] ??= {
                symbol: optSymbol,
                netContracts: 0,
              };

              const quantity = Math.abs(parseFloat(tx.quantity) || 0);
              const isOpening =
                tx.action === "Sell to Open" || tx.action === "Buy to Open";
              if (isOpening) {
                contractsByOptionSymbol[optSymbol].netContracts += quantity;
              } else {
                contractsByOptionSymbol[optSymbol].netContracts -= quantity;
              }
            });
          }

          // Generate individual Covered Call objects
          Object.values(contractsByOptionSymbol).forEach((opt) => {
            if (opt.netContracts <= 0) return;

            // Match OCC format (e.g. "MRNA  260814C00056000")
            const match = opt.symbol.match(/^(.+?)\s+(\d{6})([CP])(\d{8})$/);
            if (!match) return;

            const [, underlying, dateStr, type, strikeStr] = match;
            if (type !== "C") return; // Only Calls for Covered Calls

            const strikePrice = parseFloat(strikeStr) / 1000;
            const year = "20" + dateStr.substring(0, 2);
            const month = dateStr.substring(2, 4);
            const day = dateStr.substring(4, 6);
            const expirationDate = `${year}-${month}-${day}`;

            individualCCs.push({
              symbol: opt.symbol,
              underlying,
              strikePrice,
              totalOptionContracts: opt.netContracts,
              optionExpirationDate: expirationDate,
              currentPrice: position.currentPrice,
            });
          });
        });

        if (individualCCs.length === 0) return null;

        const totalSharesCovered = individualCCs.reduce((sum, item) => {
          return sum + item.totalOptionContracts * 100;
        }, 0);

        const totalNotionalValue = individualCCs.reduce((sum, item) => {
          return sum + item.totalOptionContracts * item.strikePrice * 100;
        }, 0);

        // Group by expiration date
        const groupedByWeek = {};

        individualCCs.forEach((item) => {
          const dateStr = item.optionExpirationDate || "Unknown";
          if (!groupedByWeek[dateStr]) {
            groupedByWeek[dateStr] = {
              date: dateStr,
              positions: [],
              totalShares: 0,
              totalNotional: 0,
            };
          }
          const sharesCovered = item.totalOptionContracts * 100;
          const notionalValue =
            item.totalOptionContracts * item.strikePrice * 100;
          groupedByWeek[dateStr].positions.push({
            ...item,
            sharesCovered,
            notionalValue,
          });
          groupedByWeek[dateStr].totalShares += sharesCovered;
          groupedByWeek[dateStr].totalNotional += notionalValue;
        });

        // Sort groups by date ascending (closest expiration first)
        const sortedGroups = Object.values(groupedByWeek).sort((a, b) => {
          if (a.date === "Unknown") return 1;
          if (b.date === "Unknown") return -1;
          return a.date.localeCompare(b.date);
        });

        const getExpirationBadge = (dateStr) => {
          if (dateStr === "Unknown") {
            return (
              <Chip
                label="Unknown Expiration"
                size="small"
                variant="outlined"
              />
            );
          }

          const exp = dayjs(dateStr);
          const today = dayjs().startOf("day");
          const diffDays = exp.diff(today, "day");

          if (diffDays === 0) {
            return (
              <Chip
                label="Expiring Tonight"
                color="error"
                size="small"
                variant="filled"
                sx={{ fontWeight: "bold" }}
              />
            );
          } else if (diffDays === 1) {
            return (
              <Chip
                label="Expiring Tomorrow"
                color="warning"
                size="small"
                variant="filled"
                sx={{ fontWeight: "bold" }}
              />
            );
          } else if (diffDays < 0) {
            return (
              <Chip
                label={`Expired ${Math.abs(diffDays)}d ago`}
                color="default"
                size="small"
                variant="outlined"
              />
            );
          } else {
            return (
              <Chip
                label={`${diffDays} days left`}
                color="primary"
                size="small"
                variant="outlined"
              />
            );
          }
        };

        const formatGroupHeaderDate = (dateStr) => {
          if (dateStr === "Unknown") return "Unknown Expiration";
          return dayjs(dateStr).format("dddd, MMMM D, YYYY");
        };

        return (
          <Box
            sx={{
              padding: 3,
              marginTop: 4,
              backgroundColor: "background.paper",
              borderRadius: 2,
              boxShadow: 2,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                mb: 3,
                flexWrap: "wrap",
                gap: 1.5,
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                Covered Calls Summary
              </Typography>
              <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                <Typography
                  variant="subtitle1"
                  color="text.secondary"
                  sx={{ fontWeight: "bold" }}
                >
                  Total Covered Shares: {totalSharesCovered.toLocaleString()}
                </Typography>
                <Typography
                  variant="h6"
                  color="primary.main"
                  sx={{ fontWeight: "bold" }}
                >
                  Total Notional Value: {formatCurrency(totalNotionalValue)}
                </Typography>
              </Box>
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Based on {individualCCs.length} covered call position
              {individualCCs.length !== 1 ? "s" : ""}
            </Typography>

            {/* Weekly Breakdown Grid/Stack */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {sortedGroups.map((group) => (
                <Paper
                  key={group.date}
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderColor: "divider",
                    backgroundColor: "background.default",
                  }}
                >
                  {/* Group Header */}
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 2,
                      flexWrap: "wrap",
                      gap: 1.5,
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        flexWrap: "wrap",
                      }}
                    >
                      <Typography
                        variant="subtitle1"
                        sx={{ fontWeight: "bold" }}
                      >
                        {formatGroupHeaderDate(group.date)}
                      </Typography>
                      {getExpirationBadge(group.date)}
                    </Box>
                    <Box sx={{ display: "flex", gap: 3 }}>
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: "bold", color: "text.secondary" }}
                      >
                        Covered Shares: {group.totalShares.toLocaleString()}
                      </Typography>
                      <Typography
                        variant="subtitle1"
                        sx={{ fontWeight: "bold", color: "text.primary" }}
                      >
                        Notional: {formatCurrency(group.totalNotional)}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Group Positions Table */}
                  <TableContainer
                    component={Paper}
                    elevation={0}
                    variant="outlined"
                  >
                    <Table size="small">
                      <TableHead sx={{ backgroundColor: "action.hover" }}>
                        <TableRow>
                          <TableCell>
                            <strong>Symbol</strong>
                          </TableCell>
                          <TableCell align="right">
                            <strong>Strike Price</strong>
                          </TableCell>
                          <TableCell align="right">
                            <strong>Contracts</strong>
                          </TableCell>
                          <TableCell align="right">
                            <strong>Current Price</strong>
                          </TableCell>
                          <TableCell align="right">
                            <strong>Covered Shares</strong>
                          </TableCell>
                          <TableCell align="right">
                            <strong>Notional Value</strong>
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {group.positions.map((pos, pIndex) => (
                          <TableRow
                            key={`${pos.symbol}-${pIndex}`}
                            sx={{
                              "&:last-child td, &:last-child th": { border: 0 },
                            }}
                          >
                            <TableCell component="th" scope="row">
                              <strong>{pos.symbol}</strong>
                            </TableCell>
                            <TableCell align="right">
                              {formatCurrency(pos.strikePrice)}
                            </TableCell>
                            <TableCell align="right">
                              {pos.totalOptionContracts}
                            </TableCell>
                            <TableCell align="right">
                              {formatCurrency(pos.currentPrice)}
                            </TableCell>
                            <TableCell align="right">
                              {pos.sharesCovered.toLocaleString()}
                            </TableCell>
                            <TableCell align="right">
                              <strong>
                                {formatCurrency(pos.notionalValue)}
                              </strong>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              ))}
            </Box>
          </Box>
        );
      })()}
    </Box>
  );
}

export default OpenPositions;
