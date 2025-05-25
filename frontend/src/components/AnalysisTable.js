import React, { useState, useEffect } from "react";
import DataTable from "./DataTable";
import { Box, Typography, CircularProgress } from "@mui/material";

const AnalysisTable = () => {
  const [analysisData, setAnalysisData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAnalysis = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `${process.env.REACT_APP_API_URL}/api/trading-data`
        );
        const data = await response.json();

        if (Array.isArray(data)) {
          const transformedData = data.map((analysis) => ({
            Symbol: analysis.symbol,
            "Current Price": `$${analysis.current_price?.toFixed(2) || "N/A"}`,
            "Stock Spread": `$${analysis.stock_spread?.toFixed(2) || "N/A"}`,
            "Strike Price": `$${
              analysis.option_strike_price?.toFixed(2) || "N/A"
            }`,
            "Option Mid": `$${analysis.option_mid_price?.toFixed(2) || "N/A"}`,
            "Mid %": `${analysis.option_mid_percent?.toFixed(2)}%` || "N/A",
            Expiration: analysis.option_expiration_date
              ? new Date(analysis.option_expiration_date).toLocaleDateString()
              : "N/A",
            "Days to Earnings": analysis.days_to_earnings || "N/A",
            Status: analysis.status,
            Notes: analysis.notes,
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

    fetchAnalysis();
    // Refresh data every 5 minutes
    const interval = setInterval(fetchAnalysis, 300000);
    return () => clearInterval(interval);
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
  ];

  return (
    <Box sx={{ marginBottom: 3 }}>
      <Typography variant="h6" gutterBottom>
        Trading Analysis
      </Typography>
      <DataTable columns={columns} data={analysisData} />
    </Box>
  );
};

export default AnalysisTable;
