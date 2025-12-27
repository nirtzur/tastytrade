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
        "https://api.exchangerate-api.com/v4/latest/USD"
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
        const cashSecuredPuts = positions.filter(
          (position) =>
            position.totalShares === 0 &&
            position.totalOptionContracts > 0 &&
            position.optionType === "P" &&
            position.strikePrice
        );

        if (cashSecuredPuts.length === 0) return null;

        const totalCashRequired = cashSecuredPuts.reduce((sum, position) => {
          return (
            sum + position.totalOptionContracts * position.strikePrice * 100
          );
        }, 0);

        return (
          <Box
            sx={{
              padding: 2,
              marginTop: 2,
              backgroundColor: "background.paper",
              borderRadius: 1,
              boxShadow: 1,
            }}
          >
            <Typography variant="h6" gutterBottom>
              Cash Secured Puts Summary
            </Typography>
            <Typography variant="body1">
              Total Cash Required to be Secured:{" "}
              {formatCurrency(totalCashRequired)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Based on {cashSecuredPuts.length} cash secured put position
              {cashSecuredPuts.length !== 1 ? "s" : ""}
            </Typography>
          </Box>
        );
      })()}
    </Box>
  );
}

export default OpenPositions;
