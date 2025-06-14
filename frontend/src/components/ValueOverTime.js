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
import isoWeek from "dayjs/plugin/isoWeek";
import client from "../api/client";

// Define custom week plugin for Tuesday-based weeks
const customWeek = (option, dayjsClass) => {
  const weekStart = 2; // Tuesday

  dayjsClass.prototype.startOfCustomWeek = function () {
    const day = this.$W;
    const diff = (day < weekStart ? 7 : 0) + day - weekStart;
    return this.subtract(diff, "day");
  };

  dayjsClass.prototype.endOfCustomWeek = function () {
    return this.startOfCustomWeek().add(6, "day");
  };
};

// Add plugins
dayjs.extend(isoWeek);
dayjs.extend(customWeek);

const ValueOverTime = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState(() => {
    const savedStartDate = localStorage.getItem("accountHistoryStartDate");
    return savedStartDate ? dayjs(savedStartDate) : dayjs("2024-11-25");
  });
  const [endDate, setEndDate] = useState(dayjs());
  const [chartData, setChartData] = useState([]);

  // Save startDate to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(
      "accountHistoryStartDate",
      startDate.format("YYYY-MM-DD")
    );
  }, [startDate]);

  const fetchValueData = useCallback(async () => {
    const processTransactions = (transactions) => {
      // Create a map to store weekly totals
      const weeklyValues = new Map();

      // Get start and end of weeks
      const start = startDate.startOfCustomWeek();
      const end = endDate.endOfCustomWeek();
      let currentWeek = start;

      // Create entries for each week
      while (currentWeek.isBefore(end) || currentWeek.isSame(end, "week")) {
        const weekKey = currentWeek.format("YYYY-MM-DD");
        weeklyValues.set(weekKey, {
          date: weekKey,
          value: 0,
          weekStart: currentWeek.format("MM/DD"),
          weekEnd: currentWeek.endOf("isoWeek").format("MM/DD"),
        });
        currentWeek = currentWeek.add(1, "week");
      }

      // Process transactions chronologically
      let runningTotal = 0;
      transactions.sort(
        (a, b) => new Date(a["executed-at"]) - new Date(b["executed-at"])
      );

      transactions.forEach(
        ({
          "executed-at": executedAt,
          value: txValue,
          "value-effect": valueEffect,
        }) => {
          const txDate = dayjs(executedAt);
          const value = parseFloat(txValue) || 0;

          // Update running total based on transaction type
          if (valueEffect === "Debit") {
            runningTotal -= value;
          } else {
            runningTotal += value;
          }

          // Update all weeks from this transaction forward
          currentWeek = txDate.startOfCustomWeek();
          while (currentWeek.isBefore(end) || currentWeek.isSame(end, "week")) {
            const weekKey = currentWeek.format("YYYY-MM-DD");
            weeklyValues.set(weekKey, {
              date: weekKey,
              value: runningTotal,
              weekStart: currentWeek.format("MM/DD"),
              weekEnd: currentWeek.endOf("isoWeek").format("MM/DD"),
            });
            currentWeek = currentWeek.add(1, "week");
          }
        }
      );

      // Convert map to array and sort by date
      return Array.from(weeklyValues.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );
    };

    try {
      setLoading(true);
      const { data } = await client.get(
        `/api/account-history?start-date=${startDate.format(
          "YYYY-MM-DD"
        )}&end-date=${endDate.format("YYYY-MM-DD")}`
      );
      const processedData = processTransactions(data);
      setChartData(processedData);
    } catch (err) {
      setError("Failed to fetch value data: " + err.message);
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchValueData();
  }, [fetchValueData]);

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
        }}
      >
        <Typography variant="h6">Weekly Value</Typography>
        <Box sx={{ display: "flex", gap: 2 }}>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker
              label="Start Date"
              value={startDate}
              onChange={(newDate) => setStartDate(newDate)}
              slotProps={{ textField: { size: "small" } }}
            />
            <DatePicker
              label="End Date"
              value={endDate}
              onChange={(newDate) => setEndDate(newDate)}
              slotProps={{ textField: { size: "small" } }}
            />
          </LocalizationProvider>
        </Box>
      </Box>

      <Box sx={{ width: "100%", height: 400 }}>
        <ResponsiveContainer>
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 20, bottom: 30 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="weekStart"
              angle={-45}
              textAnchor="end"
              height={60}
              interval={0}
            />
            <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
            <Tooltip
              formatter={(value) => [
                `$${value.toLocaleString()}`,
                "Account Value",
              ]}
              labelFormatter={(weekStart) => `Week of ${weekStart}`}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#8884d8"
              dot={true}
              name="Account Value"
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};

export default ValueOverTime;
