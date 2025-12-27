import React, { useState, useEffect, useCallback } from "react";
import { Box, Typography, CircularProgress } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import dayjs from "dayjs";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import client from "../api/client";

// Extend dayjs with the plugin
dayjs.extend(isSameOrBefore);

const BalanceChart = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState(() => {
    const savedStartDate = localStorage.getItem("accountHistoryStartDate");
    return savedStartDate ? dayjs(savedStartDate) : dayjs("2024-11-25");
  });
  const [endDate, setEndDate] = useState(dayjs());
  const [chartData, setChartData] = useState([]);
  const initialBalance = 0; // Always start with 0 balance

  // Save startDate to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(
      "accountHistoryStartDate",
      startDate.format("YYYY-MM-DD")
    );
  }, [startDate]);

  const calculateDailyBalance = useCallback((transactions, startingBalance) => {
    // Use the provided starting balance
    let currentCash = startingBalance;
    const positions = new Map(); // symbol -> { quantity, acquisitionPrice, totalValue }
    const dailyBalances = new Map();

    // Sort transactions chronologically
    const sortedTransactions = [...transactions].sort(
      (a, b) => new Date(a["executed-at"]) - new Date(b["executed-at"])
    );

    sortedTransactions.forEach((transaction) => {
      const {
        "executed-at": executedAt,
        "instrument-type": instrumentType,
        "transaction-type": transactionType,
        "value-effect": valueEffect,
        action,
        symbol,
        quantity: txQuantity,
        value: txValue,
      } = transaction;

      const quantity = parseFloat(txQuantity) || 0;
      const value = parseFloat(txValue) || 0;
      const date = dayjs(executedAt).format("YYYY-MM-DD");

      // Handle Money Movement transactions
      if (transactionType === "Money Movement") {
        if (valueEffect === "Credit") {
          // Add to cash for credits
          currentCash += value;
        } else if (valueEffect === "Debit") {
          // Reduce cash for debits
          currentCash -= value;
        }
      }
      // Process other transaction types based on instrument type and action
      else if (instrumentType === "Equity") {
        if (action === "Buy to Open") {
          // Reduce cash, increase asset position
          currentCash -= value;

          const currentPosition = positions.get(symbol) || {
            quantity: 0,
            acquisitionPrice: 0,
            totalValue: 0,
          };
          const newTotalQuantity = currentPosition.quantity + quantity;
          const newTotalValue = currentPosition.totalValue + value;
          const newAcquisitionPrice =
            newTotalQuantity > 0 ? newTotalValue / newTotalQuantity : 0;

          positions.set(symbol, {
            quantity: newTotalQuantity,
            acquisitionPrice: newAcquisitionPrice,
            totalValue: newTotalValue,
          });
        } else if (action === "Sell to Close" || action === "Receive Deliver") {
          // Increase cash, reduce asset position
          currentCash += value;

          const currentPosition = positions.get(symbol);
          if (currentPosition) {
            const newQuantity = currentPosition.quantity - quantity;
            const newTotalValue =
              newQuantity * currentPosition.acquisitionPrice;

            if (newQuantity <= 0) {
              positions.delete(symbol);
            } else {
              positions.set(symbol, {
                quantity: newQuantity,
                acquisitionPrice: currentPosition.acquisitionPrice,
                totalValue: newTotalValue,
              });
            }
          }
        }
      } else if (instrumentType === "Equity Option") {
        if (action === "Sell to Open") {
          // Increase cash (premium received)
          currentCash += value;
        } else if (action === "Receive Deliver" || action === "Buy to Close") {
          // Reduce cash (premium paid or closing cost)
          currentCash -= value;
        }
      }

      // Calculate total assets value (current market value)
      let totalAssetsValue = 0;
      positions.forEach((position) => {
        // For now, use acquisition value as approximation since we don't have real-time prices
        // In a real implementation, you'd multiply quantity by current market price
        totalAssetsValue += position.totalValue;
      });

      // Calculate total balance
      const totalBalance = currentCash + totalAssetsValue;

      // Store daily balance (overwrite if multiple transactions same day)
      dailyBalances.set(date, {
        date,
        cash: currentCash,
        assets: totalAssetsValue,
        total: totalBalance,
      });
    });

    // Convert to array and sort by date
    const sortedBalances = Array.from(dailyBalances.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // Fill in missing days with previous day's balance
    if (sortedBalances.length === 0) {
      return [];
    }

    const filledBalances = [];
    const startDateObj = dayjs(sortedBalances[0].date);
    const endDateObj = dayjs(sortedBalances[sortedBalances.length - 1].date);

    let currentDate = startDateObj;
    let balanceIndex = 0;
    let lastKnownBalance = {
      cash: startingBalance,
      assets: 0,
      total: startingBalance,
    };

    while (currentDate.isSameOrBefore(endDateObj)) {
      const dateStr = currentDate.format("YYYY-MM-DD");

      // Check if we have a balance for this date
      if (
        balanceIndex < sortedBalances.length &&
        sortedBalances[balanceIndex].date === dateStr
      ) {
        lastKnownBalance = sortedBalances[balanceIndex];
        filledBalances.push(lastKnownBalance);
        balanceIndex++;
      } else {
        // Use previous day's balance
        filledBalances.push({
          date: dateStr,
          cash: lastKnownBalance.cash,
          assets: lastKnownBalance.assets,
          total: lastKnownBalance.total,
        });
      }

      currentDate = currentDate.add(1, "day");
    }

    return filledBalances;
  }, []);

  const fetchBalanceData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch transaction data
      const historyResponse = await client.get(
        `/api/account-history?start-date=${startDate.format(
          "YYYY-MM-DD"
        )}&end-date=${endDate.format("YYYY-MM-DD")}`
      );

      // Process transactions starting with 0 balance
      const processedData = calculateDailyBalance(
        historyResponse.data,
        initialBalance
      );
      setChartData(processedData);
    } catch (err) {
      setError("Failed to fetch balance data: " + err.message);
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, calculateDailyBalance, initialBalance]);

  useEffect(() => {
    fetchBalanceData();
  }, [fetchBalanceData]);

  if (loading) {
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
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="400px"
      >
        <Typography color="error">{error}</Typography>
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
        <Typography variant="h6">Daily Balance</Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker
              label="Start Date"
              value={startDate}
              onChange={(newDate) => setStartDate(newDate)}
              slotProps={{ textField: { size: "small", fullWidth: true } }}
              sx={{ minWidth: 150 }}
            />
            <DatePicker
              label="End Date"
              value={endDate}
              onChange={(newDate) => setEndDate(newDate)}
              slotProps={{ textField: { size: "small", fullWidth: true } }}
              sx={{ minWidth: 150 }}
            />
          </LocalizationProvider>
        </Box>
      </Box>

      <Box sx={{ width: "100%", height: 500 }}>
        <ResponsiveContainer>
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 20, bottom: 50 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              angle={-45}
              textAnchor="end"
              height={80}
              interval={Math.max(1, Math.floor(chartData.length / 10))}
            />
            <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
            <Tooltip
              formatter={(value, name) => [`$${value.toLocaleString()}`, name]}
              labelFormatter={(date) => `Date: ${date}`}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="#2196f3"
              dot={false}
              strokeWidth={2}
              name="Total Balance"
            />
            <Line
              type="monotone"
              dataKey="cash"
              stroke="#4caf50"
              dot={false}
              strokeWidth={1}
              strokeDasharray="5 5"
              name="Cash"
            />
            <Line
              type="monotone"
              dataKey="assets"
              stroke="#ff9800"
              dot={false}
              strokeWidth={1}
              strokeDasharray="5 5"
              name="Assets"
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>

      {chartData.length > 0 && (
        <Box sx={{ mt: 2, display: "flex", gap: 4, justifyContent: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Initial Balance: $0
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Latest Balance: $
            {chartData[chartData.length - 1]?.total?.toLocaleString() || "0"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Cash: $
            {chartData[chartData.length - 1]?.cash?.toLocaleString() || "0"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Assets: $
            {chartData[chartData.length - 1]?.assets?.toLocaleString() || "0"}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default BalanceChart;
