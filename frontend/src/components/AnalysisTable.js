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
  Link,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import client from "../api/client";

const AnalysisTable = () => {
  const [rawData, setRawData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState("hide_low");
  const [selectedDate, setSelectedDate] = useState(null);
  const [excludedStatuses] = useState({
    LOW_STOCK_PRICE: true,
    LOW_MID_PERCENT: true,
  });

  const applyFilters = useCallback(
    (data) => {
      // First apply status filter
      let filtered = data;
      if (selectedStatuses !== "all") {
        if (selectedStatuses === "hide_low") {
          filtered = data.filter((row) => !excludedStatuses[row.Status]);
        } else {
          filtered = data.filter((row) => row.Status === selectedStatuses);
        }
      }

      // Then apply date filter
      const filterDate = selectedDate || dayjs();
      return filtered.filter((row) => {
        const analyzedDate = dayjs(row["Analyzed At"]);
        return (
          analyzedDate.format("YYYY-MM-DD") === filterDate.format("YYYY-MM-DD")
        );
      });
    },
    [excludedStatuses, selectedStatuses, selectedDate]
  );

  const openYahooFinance = (symbol) => {
    window.open(
      `https://finance.yahoo.com/chart/${symbol}?period1=${Math.floor(
        (Date.now() - 180 * 24 * 60 * 60 * 1000) / 1000
      )}&period2=${Math.floor(
        Date.now() / 1000
      )}&interval=1d&includePrePost=true`,
      "_blank",
      "width=1200,height=800"
    );
  };

  const fetchAnalysisData = useCallback(async () => {
    try {
      const { data } = await client.get("/api/trading-data");

      if (Array.isArray(data)) {
        const transformedData = data.map(
          ({
            symbol,
            current_price,
            stock_spread,
            option_strike_price,
            option_mid_price,
            option_mid_percent,
            option_expiration_date,
            days_to_earnings,
            status,
            notes,
            analyzed_at,
          }) => ({
            Symbol: (
              <Link
                component="button"
                onClick={() => openYahooFinance(symbol)}
                sx={{
                  textDecoration: "none",
                  "&:hover": {
                    textDecoration: "underline",
                    cursor: "pointer",
                  },
                }}
              >
                {symbol}
              </Link>
            ),
            "Current Price": `$${current_price || "N/A"}`,
            "Stock Spread": `$${stock_spread || "N/A"}`,
            "Strike Price": `$${option_strike_price || "N/A"}`,
            "Option Mid": `$${option_mid_price || "N/A"}`,
            "Mid %": `${option_mid_percent}%` || "N/A",
            Expiration: option_expiration_date
              ? new Date(option_expiration_date).toLocaleDateString()
              : "N/A",
            "Days to Earnings": days_to_earnings || "N/A",
            Status: status,
            Notes: notes,
            "Analyzed At": new Date(analyzed_at).toLocaleString(),
            analyzed_at, // Keep original date for sorting
          })
        );

        // Find the latest date
        const latestDate = transformedData.reduce((latest, current) => {
          const currentDate = dayjs(current.analyzed_at);
          return latest.isAfter(currentDate) ? latest : currentDate;
        }, dayjs(transformedData[0]?.analyzed_at));

        // Set the initial date only if it hasn't been set yet
        if (!selectedDate) {
          setSelectedDate(latestDate);
        }

        setRawData(transformedData);
        setFilteredData(applyFilters(transformedData));
      } else {
        throw new Error("Invalid analysis data format");
      }
    } catch (err) {
      setError("Failed to fetch analysis data");
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  }, [applyFilters, selectedDate]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      setError(null);

      await client.post("/api/trading-data/refresh");

      await fetchAnalysisData();
    } catch (err) {
      setError("Failed to refresh analysis data");
      console.error("Error:", err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
    setFilteredData(applyFilters(rawData));
  };

  const handleStatusChange = (event) => {
    setSelectedStatuses(event.target.value);
    setFilteredData(applyFilters(rawData));
  };

  useEffect(() => {
    fetchAnalysisData();
  }, [fetchAnalysisData]);

  useEffect(() => {
    setFilteredData(applyFilters(rawData));
  }, [rawData, applyFilters]);

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
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker
              label="Analysis Date"
              value={selectedDate}
              onChange={handleDateChange}
              slotProps={{ textField: { size: "small" } }}
              sx={{ minWidth: 200 }}
            />
          </LocalizationProvider>
          <FormControl sx={{ minWidth: 200 }} size="small">
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
