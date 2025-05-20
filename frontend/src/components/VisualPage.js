import React, { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Box, Typography, CircularProgress } from "@mui/material";

const createUTCDate = (year, month, day) => {
  return new Date(Date.UTC(year, month, day));
};

const getNextSunday = (date) => {
  const utcDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  utcDate.setUTCDate(utcDate.getUTCDate() + ((7 - utcDate.getUTCDay()) % 7));
  return utcDate;
};

const formatUTCDate = (date) => {
  return date.toISOString().split("T")[0];
};

const VisualPage = () => {
  const [weeklyData, setWeeklyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAndProcessData = async () => {
      setLoading(true);
      try {
        // Get data from the last year using UTC dates
        const now = new Date();
        const endDate = formatUTCDate(
          createUTCDate(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate()
          )
        );
        const storedStartDate = localStorage.getItem("accountHistoryStartDate");
        const startDate = storedStartDate
          ? formatUTCDate(new Date(storedStartDate))
          : formatUTCDate(
              createUTCDate(
                now.getUTCFullYear(),
                now.getUTCMonth() - 2,
                now.getUTCDate()
              )
            );

        const response = await fetch(
          `${process.env.REACT_APP_API_URL}/api/account-history?start-date=${startDate}&end-date=${endDate}`
        );
        const data = await response.json();

        // Generate all Sundays between start and end date using UTC
        const allWeeks = {};
        let currentDate = new Date(startDate);
        const endDateObj = createUTCDate(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate()
        );

        // Move both dates to their next Sundays
        currentDate = getNextSunday(currentDate);
        const endDateSunday = getNextSunday(endDateObj);

        // Generate a key for every Sunday using UTC
        while (currentDate <= endDateSunday) {
          const weekKey = formatUTCDate(currentDate);
          allWeeks[weekKey] = {
            week: weekKey,
            totalValue: 0,
            transactionCount: 0,
          };
          currentDate.setUTCDate(currentDate.getUTCDate() + 7); // Move to next Sunday
        }

        // Process and aggregate data by week
        const weeklyAggregated = data.reduce((acc, transaction) => {
          if (
            transaction["instrument-type"]?.toLowerCase().includes("option")
          ) {
            const date = new Date(transaction["executed-at"]);
            const sunday = getNextSunday(date);
            const weekKey = formatUTCDate(sunday);

            const numericValue = parseFloat(transaction.value);
            const value =
              transaction["value-effect"] === "Debit"
                ? -numericValue
                : numericValue;

            acc[weekKey].totalValue += value;
            acc[weekKey].transactionCount += 1;
          }
          return acc;
        }, allWeeks);

        // Convert to array and sort by date
        const sortedData = Object.values(weeklyAggregated).sort(
          (a, b) => new Date(a.week) - new Date(b.week)
        );

        // Calculate moving average for each week (4-week window)
        const windowSize = 4;
        sortedData.forEach((week, index) => {
          const startIndex = Math.max(0, index - windowSize + 1);
          const window = sortedData.slice(startIndex, index + 1);
          const sum = window.reduce((acc, curr) => acc + curr.totalValue, 0);
          week.averageValue = sum / window.length;
        });

        setWeeklyData(sortedData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAndProcessData();
  }, []);

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
    <Box p={3}>
      <Typography variant="h5" gutterBottom>
        Weekly Options Trading Summary
      </Typography>
      <Box height="500px">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={weeklyData}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 50,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="week"
              angle={-45}
              textAnchor="end"
              height={60}
              tickFormatter={(date) => {
                const utcDate = new Date(date);
                return `${utcDate.getUTCMonth() + 1}/${utcDate.getUTCDate()}`;
              }}
            />
            <YAxis />
            <Tooltip
              formatter={(value) => `$${value.toFixed(2)}`}
              labelFormatter={(date) => {
                const utcDate = new Date(date);
                return formatUTCDate(utcDate);
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="totalValue"
              name="Weekly P/L"
              stroke="#8884d8"
              dot={true}
            />
            <Line
              type="monotone"
              dataKey="averageValue"
              name="4-Week Average"
              stroke="#82ca9d"
              dot={false}
              strokeDasharray="3 3"
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};

export default VisualPage;
