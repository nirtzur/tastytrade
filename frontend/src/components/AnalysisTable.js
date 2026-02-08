import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  LinearProgress,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import client from "../api/client";

const excludedStatusesConst = {
  LOW_STOCK_PRICE: true,
  LOW_MID_PERCENT: true,
};

const AnalysisTable = () => {
  const [rawData, setRawData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedStatuses, setSelectedStatuses] = useState("all");
  const [selectedDate, setSelectedDate] = useState(null);
  const [progressInfo, setProgressInfo] = useState(null);

  const openYahooFinance = useCallback((symbol) => {
    window.open(
      `https://finance.yahoo.com/chart/${symbol}?period1=${Math.floor(
        (Date.now() - 180 * 24 * 60 * 60 * 1000) / 1000
      )}&period2=${Math.floor(
        Date.now() / 1000
      )}&interval=1d&includePrePost=true`,
      "_blank",
      "width=1200,height=800"
    );
  }, []);

  const transformData = useCallback(
    (data) => {
      return data.map(
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
          "Stock Spread":
            stock_spread !== null && stock_spread !== undefined
              ? `$${Number(stock_spread).toFixed(2)}`
              : "N/A",
          "Strike Price": `$${option_strike_price || "N/A"}`,
          "Option Mid":
            option_mid_price !== null && option_mid_price !== undefined
              ? `$${Number(option_mid_price).toFixed(2)}`
              : "N/A",
          "Mid %":
            option_mid_percent !== null && option_mid_percent !== undefined
              ? `${Number(option_mid_percent).toFixed(4)}%`
              : "N/A",
          Expiration: option_expiration_date
            ? new Date(option_expiration_date).toLocaleDateString()
            : "N/A",
          "Days to Earnings": days_to_earnings || "N/A",
          Status: status,
          Notes: notes,
          "Analyzed At": new Date(analyzed_at).toLocaleString(),
          analyzed_at,
        })
      );
    },
    [openYahooFinance]
  );

  const applyFilters = useCallback(
    (data) => {
      if (!data.length) return [];

      // First apply status filter
      let filtered = data;
      if (selectedStatuses !== "all") {
        if (selectedStatuses === "hide_low") {
          filtered = data.filter((row) => !excludedStatusesConst[row.Status]);
        } else {
          filtered = data.filter((row) => row.Status === selectedStatuses);
        }
      }

      // Then apply date filter
      const filterDate = selectedDate || dayjs();
      return filtered.filter((row) => {
        const analyzedDate = dayjs(row.analyzed_at);
        return (
          analyzedDate.format("YYYY-MM-DD") === filterDate.format("YYYY-MM-DD")
        );
      });
    },
    [selectedStatuses, selectedDate]
  ); // Fetch initial data
  useEffect(() => {
    let mounted = true;

    const fetchAnalysisData = async () => {
      if (!mounted) return;

      try {
        setLoading(true);
        const { data } = await client.get("/api/trading-data");

        if (!mounted) return;

        if (Array.isArray(data)) {
          const transformedData = transformData(data);

          // Find the latest date
          if (transformedData.length > 0 && !selectedDate) {
            const latestDate = transformedData.reduce((latest, current) => {
              const currentDate = dayjs(current.analyzed_at);
              return latest.isAfter(currentDate) ? latest : currentDate;
            }, dayjs(transformedData[0].analyzed_at));

            setSelectedDate(latestDate);
          }

          setRawData(transformedData);
        } else {
          throw new Error("Invalid analysis data format");
        }
      } catch (err) {
        if (mounted) {
          setError("Failed to fetch analysis data");
          console.error("Error:", err);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchAnalysisData();
    return () => {
      mounted = false;
    };
  }, [selectedDate, transformData]);

  // Check for existing progress state on component mount
  useEffect(() => {
    let mounted = true;

    const checkExistingProgress = async () => {
      if (!mounted) return;

      try {
        const { data } = await client.get("/api/progress-state");

        if (!mounted) return;

        if (data.hasProgress) {
          console.log("Found existing progress state:", data);
          setRefreshing(true);
          setProgressInfo({
            current: data.current,
            total: data.total,
            symbol: data.symbol || "",
            message: data.message || "Analysis in progress...",
          });

          // For existing progress, we need to connect to SSE in monitoring mode
          // We'll create a special endpoint or use a parameter to indicate we're monitoring
          const token = localStorage.getItem("DS");
          const monitorEventSource = new EventSource(
            `${
              process.env.REACT_APP_API_URL || "http://localhost:3001"
            }/api/progress-monitor?sessionId=${data.sessionId}&token=${token}`,
            {
              withCredentials: true,
            }
          );

          monitorEventSource.onmessage = (event) => {
            const progressData = JSON.parse(event.data);

            switch (progressData.type) {
              case "progress":
                setProgressInfo({
                  current: progressData.current,
                  total: progressData.total,
                  symbol: progressData.symbol,
                  message: progressData.message,
                });
                break;
              case "complete":
                setProgressInfo(null);
                setRefreshing(false);
                // Fetch updated data
                client.get("/api/trading-data").then(({ data }) => {
                  if (Array.isArray(data)) {
                    setRawData(transformData(data));
                  }
                });
                break;
              case "error":
                setError("Analysis failed: " + progressData.message);
                setProgressInfo(null);
                setRefreshing(false);
                break;
              case "no-progress":
                // Analysis already completed or no longer running
                setProgressInfo(null);
                setRefreshing(false);
                break;
              default:
                console.log("Unknown SSE message type:", progressData.type);
                break;
            }
          };

          monitorEventSource.onerror = (error) => {
            console.error("SSE Error during progress monitoring:", error);
            // If monitoring fails, clear progress state
            setProgressInfo(null);
            setRefreshing(false);
            monitorEventSource.close();
          };

          // Close event source when monitoring completes
          monitorEventSource.addEventListener("message", (event) => {
            const progressData = JSON.parse(event.data);
            if (
              progressData.type === "complete" ||
              progressData.type === "error" ||
              progressData.type === "no-progress"
            ) {
              monitorEventSource.close();
            }
          });
        }
      } catch (err) {
        console.error("Error checking existing progress:", err);
        // Don't show error to user for this check, just log it
      }
    };

    // Only check for existing progress on initial mount
    checkExistingProgress();

    return () => {
      mounted = false;
    };
  }, [transformData]); // Include transformData dependency

  // Apply filters whenever dependencies change
  useEffect(() => {
    setFilteredData(applyFilters(rawData));
  }, [rawData, selectedDate, selectedStatuses, applyFilters]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      setError(null);
      setProgressInfo(null);

      const token = localStorage.getItem("DS");

      // Use EventSource for Server-Sent Events
      const eventSource = new EventSource(
        `${
          process.env.REACT_APP_API_URL || "http://localhost:3001"
        }/api/trading-data/refresh?token=${token}`,
        {
          withCredentials: true,
        }
      );

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "start":
            setProgressInfo({
              current: 0,
              total: data.total,
              symbol: "",
              message: data.message,
            });
            break;
          case "progress":
            setProgressInfo({
              current: data.current,
              total: data.total,
              symbol: data.symbol,
              message: data.message,
            });
            break;
          case "complete":
            setProgressInfo(null);
            // Fetch updated data
            client.get("/api/trading-data").then(({ data }) => {
              if (Array.isArray(data)) {
                setRawData(transformData(data));
              }
            });
            break;
          case "error":
            setError("Failed to refresh analysis data: " + data.message);
            setProgressInfo(null);
            break;
          default:
            console.log("Unknown SSE message type:", data.type);
            break;
        }
      };

      eventSource.onerror = (error) => {
        console.error("SSE Error:", error);
        setError("Connection error during refresh");
        setProgressInfo(null);
        eventSource.close();
        setRefreshing(false);
      };

      // Close event source when refresh completes
      eventSource.addEventListener("message", (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "complete" || data.type === "error") {
          eventSource.close();
          setRefreshing(false);
        }
      });
    } catch (err) {
      setError("Failed to start refresh");
      console.error("Error:", err);
      setRefreshing(false);
      setProgressInfo(null);
    }
  };

  const columns = useMemo(
    () => [
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
    ],
    []
  );

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
    <Box sx={{ marginBottom: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="h6">Trading Analysis</Typography>
        <Box
          sx={{
            display: "flex",
            gap: 2,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker
              label="Analysis Date"
              value={selectedDate}
              onChange={setSelectedDate}
              slotProps={{ textField: { size: "small", fullWidth: true } }}
              sx={{ minWidth: 200, flex: 1 }}
            />
          </LocalizationProvider>
          <FormControl sx={{ minWidth: 200, flex: 1 }} size="small">
            <InputLabel id="status-filter-label">Filter Status</InputLabel>
            <Select
              labelId="status-filter-label"
              id="status-filter"
              value={selectedStatuses}
              label="Filter Status"
              onChange={(e) => setSelectedStatuses(e.target.value)}
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

      {/* Progress Information */}
      {progressInfo && (
        <Box
          sx={{
            mb: 3,
            p: 2,
            bgcolor: "background.paper",
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
          }}
        >
          <Typography variant="h6" gutterBottom>
            Analysis Progress
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {progressInfo.message}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box sx={{ width: "100%" }}>
              <LinearProgress
                variant="determinate"
                value={(progressInfo.current / progressInfo.total) * 100}
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ minWidth: "80px" }}
            >
              {progressInfo.current}/{progressInfo.total}
            </Typography>
          </Box>
        </Box>
      )}

      <DataTable columns={columns} data={filteredData} />
    </Box>
  );
};

export default AnalysisTable;
