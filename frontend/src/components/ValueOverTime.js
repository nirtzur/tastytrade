import React, { useState, useEffect, useCallback } from "react";
import { Box, Typography, CircularProgress, Paper } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import {
  BarChart,
  Bar,
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
  const [tooltipData, setTooltipData] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const tooltipRef = React.useRef(null);
  let tooltipTimeout = null;

  // Save startDate to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(
      "accountHistoryStartDate",
      startDate.format("YYYY-MM-DD")
    );
  }, [startDate]);

  const fetchValueData = useCallback(async () => {
    const processTransactions = (transactions) => {
      const weeklyData = new Map();
      const start = startDate.startOfCustomWeek();
      const end = endDate.endOfCustomWeek();

      // Initialize all weeks in the range
      let currentWeek = start;
      while (currentWeek.isBefore(end) || currentWeek.isSame(end, "day")) {
        const weekKey = currentWeek.format("YYYY-MM-DD");
        weeklyData.set(weekKey, {
          date: weekKey,
          value: 0,
          transactions: [],
          weekStart: currentWeek.format("MM/DD"),
          weekEnd: currentWeek.endOf("isoWeek").format("MM/DD"),
        });
        currentWeek = currentWeek.add(1, "week");
      }

      // Group transactions by week
      transactions.forEach((tx) => {
        const txDate = dayjs(tx["executed-at"]);
        const weekKey = txDate.startOfCustomWeek().format("YYYY-MM-DD");
        if (weeklyData.has(weekKey)) {
          weeklyData.get(weekKey).transactions.push(tx);
        }
      });

      // Calculate weekly value (not cumulative)
      const sortedWeeks = Array.from(weeklyData.keys()).sort();

      for (const weekKey of sortedWeeks) {
        const week = weeklyData.get(weekKey);
        const weeklyTransactionValue = week.transactions.reduce((sum, tx) => {
          const value = parseFloat(tx.value) || 0;
          return tx["value-effect"] === "Debit" ? sum - value : sum + value;
        }, 0);
        week.value = weeklyTransactionValue;
      }

      return Array.from(weeklyData.values());
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

  // Filter out future weeks from chartData
  const today = dayjs().format("YYYY-MM-DD");
  const filteredChartData = chartData.filter((d) => d.date <= today);

  const handleMouseMove = (e) => {
    if (e.activePayload && e.activePayload.length > 0) {
      clearTimeout(tooltipTimeout);
      setTooltipData(e.activePayload[0].payload);
      setTooltipPosition({ x: e.chartX, y: e.chartY });
      setIsTooltipVisible(true);
    } else {
      tooltipTimeout = setTimeout(() => {
        if (!document.querySelector(".custom-tooltip:hover")) {
          setIsTooltipVisible(false);
        }
      }, 300);
    }
  };

  const handleMouseLeave = () => {
    tooltipTimeout = setTimeout(() => {
      if (!document.querySelector(".custom-tooltip:hover")) {
        setIsTooltipVisible(false);
      }
    }, 300);
  };

  const CustomTooltip = ({ data }) => {
    if (!data) return null;

    const getPosition = () => {
      if (!tooltipRef.current) {
        return { top: 0, left: 0, opacity: 0 };
      }

      const tooltipWidth = tooltipRef.current.offsetWidth;
      const tooltipHeight = tooltipRef.current.offsetHeight;
      const chartWrapper =
        tooltipRef.current.parentElement.getBoundingClientRect();

      let left = tooltipPosition.x;
      let top = tooltipPosition.y - tooltipHeight - 15; // 15px offset above cursor

      // Adjust horizontal position
      if (left + tooltipWidth / 2 > chartWrapper.right) {
        left = chartWrapper.right - tooltipWidth / 2 - 10; // Adjust to stay inside right edge
      }
      if (left - tooltipWidth / 2 < chartWrapper.left) {
        left = chartWrapper.left + tooltipWidth / 2 + 10; // Adjust to stay inside left edge
      }

      // Adjust vertical position
      if (top < chartWrapper.top) {
        top = tooltipPosition.y + 25; // Move below cursor if not enough space above
      }

      return {
        top: top,
        left: left,
        transform: "translateX(-50%)",
        opacity: 1,
        transition: "opacity 0.1s ease-in-out, top 0.2s, left 0.2s",
      };
    };

    const { weekStart, value, transactions } = data;
    return (
      <Paper
        ref={tooltipRef}
        className="custom-tooltip"
        onMouseLeave={handleMouseLeave}
        sx={{
          p: 2,
          maxWidth: 550,
          backdropFilter: "blur(5px)",
          backgroundColor: "rgba(255, 255, 255, 0.8)",
          position: "fixed", // Use fixed for positioning relative to viewport
          pointerEvents: "auto",
          zIndex: 1000,
          ...getPosition(),
        }}
      >
        <Typography variant="h6" gutterBottom>
          Week of {weekStart}
        </Typography>
        <Typography
          variant="body1"
          gutterBottom
          sx={{ fontWeight: "bold", mb: 2 }}
        >
          Ending Value:{" "}
          {new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
          }).format(value)}
        </Typography>
        {transactions.length > 0 ? (
          <Box>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: "bold" }}>
              Transactions this week:
            </Typography>
            <Box sx={{ maxHeight: 200, overflowY: "auto", pr: 1 }}>
              {transactions.map((tx, index) => {
                const isDebit = tx["value-effect"] === "Debit";
                const txValue = parseFloat(tx.value) || 0;
                return (
                  <Box
                    key={index}
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      py: 1,
                      borderBottom: (theme) =>
                        `1px solid ${theme.palette.divider}`,
                      "&:last-child": { borderBottom: 0 },
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        flexGrow: 1,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                        sx={{ minWidth: 90, mr: 1 }}
                      >
                        {dayjs(tx["executed-at"]).format("MMM DD, YYYY")}
                      </Typography>
                      <Typography
                        component="span"
                        sx={{ whiteSpace: "nowrap" }}
                      >
                        {tx.description}
                      </Typography>
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: "bold",
                        color: isDebit ? "error.main" : "success.main",
                        minWidth: 80,
                        textAlign: "right",
                      }}
                    >
                      {isDebit ? "-" : "+"}
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(txValue)}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No transactions this week.
          </Typography>
        )}
      </Paper>
    );
  };

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
    return <Typography color="error">Error: {error}</Typography>;
  }

  return (
    <Box sx={{ p: 3, position: "relative" }}>
      <Typography variant="h5" gutterBottom>
        Weekly Account Value
      </Typography>
      <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <DatePicker
            label="Start Date"
            value={startDate}
            onChange={(newValue) => setStartDate(newValue)}
          />
          <DatePicker
            label="End Date"
            value={endDate}
            onChange={(newValue) => setEndDate(newValue)}
          />
        </LocalizationProvider>
      </Box>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={filteredChartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={(tick) => dayjs(tick).format("MMM D")}
          />
          <YAxis
            tickFormatter={(value) =>
              new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                notation: "compact",
              }).format(value)
            }
          />
          <Tooltip content={<span />} cursor={false} />
          <Bar dataKey="value" fill="#8884d8" />
        </BarChart>
      </ResponsiveContainer>
      {isTooltipVisible && <CustomTooltip data={tooltipData} />}
    </Box>
  );
};

export default ValueOverTime;
