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

const VisualPage = () => {
  const [weeklyData, setWeeklyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAndProcessData = async () => {
      setLoading(true);
      try {
        // Get data from the last year
        const endDate = new Date().toISOString().split("T")[0];
        const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const response = await fetch(
          `${process.env.REACT_APP_API_URL}/api/account-history?start-date=${startDate}&end-date=${endDate}`
        );
        const data = await response.json();

        // Process and aggregate data by week
        const weeklyAggregated = data.reduce((acc, transaction) => {
          if (
            transaction["instrument-type"]?.toLowerCase().includes("option")
          ) {
            const date = new Date(transaction["executed-at"]);
            // Get the monday of the week
            const monday = new Date(date);
            monday.setDate(date.getDate() - date.getDay() + 1);
            const weekKey = monday.toISOString().split("T")[0];

            if (!acc[weekKey]) {
              acc[weekKey] = {
                week: weekKey,
                totalValue: 0,
                transactionCount: 0,
              };
            }

            const value =
              transaction["value-effect"] === "Debit"
                ? -transaction.value
                : transaction.value;

            acc[weekKey].totalValue += value;
            acc[weekKey].transactionCount += 1;
          }
          return acc;
        }, {});

        // Convert to array and sort by date
        const sortedData = Object.values(weeklyAggregated).sort(
          (a, b) => new Date(a.week) - new Date(b.week)
        );

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
                return new Date(date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                });
              }}
            />
            <YAxis />
            <Tooltip
              formatter={(value) => `$${value.toFixed(2)}`}
              labelFormatter={(date) => {
                return new Date(date).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                });
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
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};

export default VisualPage;
