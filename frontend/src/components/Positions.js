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
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  Tooltip,
} from "@mui/material";
import { Refresh as RefreshIcon } from "@mui/icons-material";
import client from "../api/client";

function Positions() {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openClosedFilter, setOpenClosedFilter] = useState("open"); // "open" or "closed"
  const [symbolFilter, setSymbolFilter] = useState("");

  const fetchPositions = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const response = await client.get("/api/positions/aggregated");
      setPositions(response.data);
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
  }, []);

  const handleRefresh = () => {
    fetchPositions(true);
  };

  const formatCurrency = (value) => {
    if (value === null || value === undefined) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  const getProfitLossColor = (value) => {
    if (value > 0) return "success";
    if (value < 0) return "error";
    return "default";
  };

  const formatSymbolDisplay = (symbol) => {
    // Check if this is a full option symbol (contains spaces and ends with option format)
    const optionMatch = symbol.match(/^(.+?)\s+(\d{6})([CP])(\d{8})$/);
    if (optionMatch) {
      const [, underlying, date, type, strike] = optionMatch;
      const strikePrice = (parseInt(strike) / 1000).toFixed(2);
      const optionType = type === "C" ? "Call" : "Put";

      // Format date as MM/DD/YY
      const year = "20" + date.substring(0, 2);
      const month = date.substring(2, 4);
      const day = date.substring(4, 6);
      const formattedDate = `${month}/${day}/${year.substring(2)}`;

      return {
        main: underlying,
        details: `${formattedDate} ${optionType} $${strikePrice}`,
      };
    }

    // Return regular symbol
    return {
      main: symbol,
      details: null,
    };
  };

  const renderTransactionTable = (transactions) => {
    if (!transactions || transactions.length === 0) {
      return <Typography variant="body2">No transactions found</Typography>;
    }

    return (
      <Table size="small" sx={{ minWidth: 900 }}>
        <TableHead>
          <TableRow>
            <TableCell
              sx={{
                py: 0.5,
                fontSize: "0.75rem",
                fontWeight: "bold",
                color: "white",
              }}
            >
              Date
            </TableCell>
            <TableCell
              sx={{
                py: 0.5,
                fontSize: "0.75rem",
                fontWeight: "bold",
                color: "white",
              }}
            >
              Symbol
            </TableCell>
            <TableCell
              sx={{
                py: 0.5,
                fontSize: "0.75rem",
                fontWeight: "bold",
                color: "white",
              }}
            >
              Action
            </TableCell>
            <TableCell
              sx={{
                py: 0.5,
                fontSize: "0.75rem",
                fontWeight: "bold",
                color: "white",
              }}
            >
              Type
            </TableCell>
            <TableCell
              sx={{
                py: 0.5,
                fontSize: "0.75rem",
                fontWeight: "bold",
                color: "white",
              }}
              align="right"
            >
              Qty
            </TableCell>
            <TableCell
              sx={{
                py: 0.5,
                fontSize: "0.75rem",
                fontWeight: "bold",
                color: "white",
              }}
              align="right"
            >
              Price
            </TableCell>
            <TableCell
              sx={{
                py: 0.5,
                fontSize: "0.75rem",
                fontWeight: "bold",
                color: "white",
              }}
              align="right"
            >
              Value
            </TableCell>
            <TableCell
              sx={{
                py: 0.5,
                fontSize: "0.75rem",
                fontWeight: "bold",
                color: "white",
              }}
            >
              Effect
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {transactions.map((tx, index) => {
            const date = new Date(tx.executed_at).toLocaleDateString();
            const quantity = Math.abs(tx.quantity || 0);
            const price = tx.price
              ? `$${parseFloat(tx.price).toFixed(2)}`
              : "N/A";
            const value = tx.value
              ? `$${parseFloat(tx.value).toFixed(2)}`
              : "N/A";

            return (
              <TableRow key={index}>
                <TableCell sx={{ py: 0.5, fontSize: "0.7rem", color: "white" }}>
                  {date}
                </TableCell>
                <TableCell sx={{ py: 0.5, fontSize: "0.7rem", color: "white" }}>
                  {tx.symbol}
                </TableCell>
                <TableCell sx={{ py: 0.5, fontSize: "0.7rem", color: "white" }}>
                  {tx.action}
                </TableCell>
                <TableCell sx={{ py: 0.5, fontSize: "0.7rem", color: "white" }}>
                  {tx.instrument_type}
                </TableCell>
                <TableCell
                  sx={{ py: 0.5, fontSize: "0.7rem", color: "white" }}
                  align="right"
                >
                  {quantity}
                </TableCell>
                <TableCell
                  sx={{ py: 0.5, fontSize: "0.7rem", color: "white" }}
                  align="right"
                >
                  {price}
                </TableCell>
                <TableCell
                  sx={{ py: 0.5, fontSize: "0.7rem", color: "white" }}
                  align="right"
                >
                  {value}
                </TableCell>
                <TableCell sx={{ py: 0.5, fontSize: "0.7rem", color: "white" }}>
                  {tx.value_effect || "N/A"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
        sx={{ flexWrap: "wrap", gap: 2 }}
      >
        <Typography variant="h4" component="h1">
          Position History & Summary
        </Typography>
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
      {/* Filter Toggle */}
      <Box mb={2} sx={{ display: "flex", gap: 2, alignItems: "center" }}>
        <ToggleButtonGroup
          value={openClosedFilter}
          exclusive
          onChange={(e, val) => {
            if (val !== null) setOpenClosedFilter(val);
          }}
          size="small"
        >
          <ToggleButton value="open">Open Positions</ToggleButton>
          <ToggleButton value="closed">Closed Positions</ToggleButton>
          <ToggleButton value="all">All</ToggleButton>
        </ToggleButtonGroup>

        <TextField
          label="Filter Symbol"
          variant="outlined"
          size="small"
          value={symbolFilter}
          onChange={(e) => setSymbolFilter(e.target.value)}
          sx={{ minWidth: 150 }}
        />
      </Box>

      {positions.length === 0 ? (
        <Alert severity="info">No positions found.</Alert>
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
                  <strong>Avg Cost Basis</strong>
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    backgroundColor: "background.paper",
                    fontWeight: "bold",
                  }}
                >
                  <strong>Total Cost</strong>
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    backgroundColor: "background.paper",
                    fontWeight: "bold",
                  }}
                >
                  <strong>Total Proceeds</strong>
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
                <TableCell
                  align="right"
                  sx={{
                    backgroundColor: "background.paper",
                    fontWeight: "bold",
                  }}
                >
                  <strong>Activity</strong>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {positions
                .filter((position) => {
                  // Filter by status (Open/Closed)
                  if (openClosedFilter === "open" && !position.isOpen) return false;
                  if (openClosedFilter === "closed" && position.isOpen) return false;

                  // Filter by Symbol
                  if (symbolFilter) {
                    const filter = symbolFilter.toUpperCase().trim();
                    const symbol = (position.symbol || "").toUpperCase();
                    if (!symbol.includes(filter)) return false;
                  }

                  return true; // all
                })
                .map((position, index) => {
                  const formatDate = (date) => {
                    return new Date(date).toLocaleDateString();
                  };

                  const getStatusChip = (isOpen) => {
                    return (
                      <Chip
                        label={isOpen ? "Open" : "Closed"}
                        color={isOpen ? "primary" : "default"}
                        size="small"
                      />
                    );
                  };

                  const returnPercentage =
                    position.returnPercentage !== undefined
                      ? position.returnPercentage
                      : position.totalCost > 0
                      ? (position.totalReturn / position.totalCost) * 100
                      : undefined;

                  return (
                    <TableRow
                      key={`${position.symbol}-${position.firstTransactionDate}-${index}`}
                    >
                      <TableCell>
                        {(() => {
                          const symbolInfo = formatSymbolDisplay(
                            position.symbol
                          );
                          return (
                            <div>
                              <Typography variant="body2" fontWeight="bold">
                                {symbolInfo.main}
                              </Typography>
                              {symbolInfo.details && (
                                <Typography
                                  variant="caption"
                                  display="block"
                                  color="primary"
                                >
                                  {symbolInfo.details}
                                </Typography>
                              )}
                              <Typography
                                variant="caption"
                                color="textSecondary"
                              >
                                {formatDate(position.firstTransactionDate)} -{" "}
                                {formatDate(position.lastTransactionDate)}
                              </Typography>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell align="right">
                        {getStatusChip(position.isOpen)}
                      </TableCell>
                      <TableCell align="right">
                        {position.totalShares?.toLocaleString() || 0}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(position.avgCostBasis)}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(position.totalCost)}
                      </TableCell>
                      <TableCell align="right">
                        <div>
                          <Typography variant="body2" fontWeight="bold">
                            {formatCurrency(position.totalProceeds)}
                          </Typography>
                          {position.isOpen &&
                            position.currentMarketValue > 0 && (
                              <div>
                                <Typography
                                  variant="caption"
                                  color="textSecondary"
                                >
                                  Current:{" "}
                                  {formatCurrency(position.currentMarketValue)}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  display="block"
                                  color="textSecondary"
                                >
                                  @{" "}
                                  {formatCurrency(
                                    position.effectivePrice ||
                                      position.currentPrice
                                  )}
                                  /share
                                  {position.strikePrice &&
                                    position.currentPrice >
                                      position.strikePrice && (
                                      <span
                                        style={{
                                          color: "orange",
                                          fontWeight: "bold",
                                        }}
                                      >
                                        {" "}
                                        (capped at strike $
                                        {position.strikePrice})
                                      </span>
                                    )}
                                </Typography>
                              </div>
                            )}
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={formatCurrency(position.totalOptionPremium)}
                          color={
                            position.totalOptionPremium > 0
                              ? "success"
                              : position.totalOptionPremium < 0
                              ? "error"
                              : "default"
                          }
                          size="small"
                        />
                        {position.totalOptionTransactions > 0 && (
                          <Typography
                            variant="caption"
                            display="block"
                            color="textSecondary"
                          >
                            {position.totalOptionTransactions} option trades
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={formatCurrency(position.totalReturn)}
                          color={getProfitLossColor(position.totalReturn)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        {returnPercentage !== undefined ? (
                          <Chip
                            label={`${returnPercentage.toFixed(1)}%`}
                            color={getProfitLossColor(returnPercentage)}
                            size="small"
                          />
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {position.daysHeld} days
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip
                          title={
                            <Box
                              sx={{
                                minWidth: "900px",
                                maxWidth: "none",
                                maxHeight: "400px",
                                overflow: "auto",
                                p: 1,
                              }}
                            >
                              <Typography
                                variant="subtitle2"
                                sx={{ mb: 1, fontWeight: "bold" }}
                              >
                                Transactions for {position.symbol}
                              </Typography>
                              {renderTransactionTable(
                                position.transactions || []
                              )}
                            </Box>
                          }
                          placement="left"
                          arrow
                          componentsProps={{
                            tooltip: {
                              sx: {
                                maxWidth: "none",
                                backgroundColor: "grey.800",
                              },
                            },
                          }}
                        >
                          <Box
                            sx={{
                              cursor: "help",
                              "&:hover": {
                                backgroundColor: "action.hover",
                              },
                              p: 0.5,
                              borderRadius: 1,
                            }}
                          >
                            <Typography variant="body2">
                              {position.totalTransactions} total
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {position.equityTransactions || 0} equity,{" "}
                              {position.totalOptionTransactions || 0} options
                            </Typography>
                            {position.totalSharesBought > 0 && (
                              <Typography
                                variant="caption"
                                display="block"
                                color="textSecondary"
                              >
                                Bought: {position.totalSharesBought}, Sold:{" "}
                                {position.totalSharesSold || 0}
                              </Typography>
                            )}
                          </Box>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

export default Positions;
