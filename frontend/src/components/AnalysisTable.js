import React, { useState, useEffect } from "react";
import DataTable from "./DataTable";
import { Box, Typography, CircularProgress, Button } from "@mui/material";

const AnalysisTable = () => {
  const [analysisData, setAnalysisData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchAnalysisData = async () => {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/trading-data`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch analysis data");
      }
      const data = await response.json();

      if (Array.isArray(data)) {
        const transformedData = data.map((analysis) => ({
          Symbol: analysis.symbol,
          "Current Price": `$${analysis.current_price || "N/A"}`,
          "Stock Spread": `$${analysis.stock_spread || "N/A"}`,
          "Strike Price": `$${analysis.option_strike_price || "N/A"}`,
          "Option Mid": `$${analysis.option_mid_price || "N/A"}`,
          "Mid %": `${analysis.option_mid_percent}%` || "N/A",
          Expiration: analysis.option_expiration_date
            ? new Date(analysis.option_expiration_date).toLocaleDateString()
            : "N/A",
          "Days to Earnings": analysis.days_to_earnings || "N/A",
          Status: analysis.status,
          Notes: analysis.notes,
          "Analyzed At": new Date(analysis.analyzed_at).toLocaleString(),
        }));
        setAnalysisData(transformedData);
      } else {
        throw new Error("Invalid analysis data format");
      }
    } catch (err) {
      setError("Failed to fetch analysis data");
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      setError(null);

      // Start the analysis refresh
      const refreshResponse = await fetch(
        `${process.env.REACT_APP_API_URL}/api/trading-data/refresh`,
        { method: "POST" }
      );

      if (!refreshResponse.ok) {
        throw new Error("Failed to refresh analysis");
      }

      // Wait for analysis to complete and get results
      await fetchAnalysisData();
    } catch (err) {
      setError("Failed to refresh analysis data");
      console.error("Error:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalysisData();
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

  const columns = [
    "Symbol",
    "Current Price",
    "Stock Spread",
    "Strike Price",
    "Option Mid",
    "Mid %",
    "Expiration",
    "Days to Earnings",
    "Status",
    "Notes",
    "Analyzed At",
  ];

  return (
    <Box sx={{ marginBottom: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="h6">Trading Analysis</Typography>
        <Button
          variant="contained"
          onClick={handleRefresh}
          disabled={refreshing}
          sx={{ minWidth: 120 }}
        >
          {refreshing ? (
            <CircularProgress size={24} color="inherit" />
          ) : (
            "Refresh Data"
          )}
        </Button>
      </Box>
      <DataTable columns={columns} data={analysisData} />
    </Box>
  );
};

export default AnalysisTable;
