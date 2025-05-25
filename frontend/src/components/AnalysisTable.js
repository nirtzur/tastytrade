import React, { useState, useEffect, useCallback } from "react";
import DataTable from "./DataTable";
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";

const AnalysisTable = () => {
  const [rawData, setRawData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState("hide_low");
  const [excludedStatuses] = useState({
    LOW_STOCK_PRICE: true,
    LOW_MID_PERCENT: true,
  });

  const applyStatusFilters = useCallback(
    (data) => {
      if (selectedStatuses === "all") {
        return data;
      } else if (selectedStatuses === "hide_low") {
        return data.filter((row) => !excludedStatuses[row.Status]);
      }
      // Filter for specific status
      return data.filter((row) => row.Status === selectedStatuses);
    },
    [excludedStatuses, selectedStatuses]
  );

  const fetchAnalysisData = useCallback(async () => {
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
        setRawData(transformedData);
        setFilteredData(applyStatusFilters(transformedData));
      } else {
        throw new Error("Invalid analysis data format");
      }
    } catch (err) {
      setError("Failed to fetch analysis data");
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  }, [applyStatusFilters]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      setError(null);

      const refreshResponse = await fetch(
        `${process.env.REACT_APP_API_URL}/api/trading-data/refresh`,
        { method: "POST" }
      );

      if (!refreshResponse.ok) {
        throw new Error("Failed to refresh analysis");
      }

      await fetchAnalysisData();
    } catch (err) {
      setError("Failed to refresh analysis data");
      console.error("Error:", err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleStatusChange = (event) => {
    setSelectedStatuses(event.target.value);
    setFilteredData(applyStatusFilters(rawData));
  };

  useEffect(() => {
    fetchAnalysisData();
  }, [fetchAnalysisData]);

  useEffect(() => {
    setFilteredData(applyStatusFilters(rawData));
  }, [rawData, applyStatusFilters]);

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
          gap: 2,
        }}
      >
        <Typography variant="h6">Trading Analysis</Typography>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel id="status-filter-label">Filter Status</InputLabel>
            <Select
              labelId="status-filter-label"
              id="status-filter"
              value={selectedStatuses}
              label="Filter Status"
              onChange={handleStatusChange}
            >
              <MenuItem value="all">Show All</MenuItem>
              <MenuItem value="hide_low">Hide Low Status</MenuItem>
              <MenuItem value="READY">Ready Only</MenuItem>
              <MenuItem value="ANALYZING">Analyzing Only</MenuItem>
              <MenuItem value="LOW_STOCK_PRICE">Low Stock Price Only</MenuItem>
              <MenuItem value="LOW_MID_PERCENT">Low Mid Percent Only</MenuItem>
            </Select>
          </FormControl>
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
      </Box>
      <DataTable columns={columns} data={filteredData} />
    </Box>
  );
};

export default AnalysisTable;
