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

function Positions() {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

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
              {positions.map((position, index) => {
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

                return (
                  <TableRow
                    key={`${position.symbol}-${position.firstTransactionDate}-${index}`}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {position.symbol}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {formatDate(position.firstTransactionDate)} -{" "}
                        {formatDate(position.lastTransactionDate)}
                      </Typography>
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
                        {position.isOpen && position.currentMarketValue > 0 && (
                          <div>
                            <Typography variant="caption" color="textSecondary">
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
                                position.effectivePrice || position.currentPrice
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
                                    (capped at strike ${position.strikePrice})
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
                      {position.returnPercentage !== undefined ? (
                        <Chip
                          label={`${position.returnPercentage.toFixed(1)}%`}
                          color={getProfitLossColor(position.returnPercentage)}
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
