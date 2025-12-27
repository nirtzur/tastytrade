import React, { useState, useEffect, useCallback } from "react";
import DataTable from "./DataTable";
import {
  Box,
  Checkbox,
  FormControlLabel,
  TextField,
  Typography,
  CircularProgress,
  IconButton,
  Tooltip,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import client from "../api/client";

const savedStartDate =
  localStorage.getItem("accountHistoryStartDate") || "2024-11-25";
// Use local date for default end date to avoid timezone issues
const defaultEndDate = new Date().toLocaleDateString("en-CA");

const TransactionHistory = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [showMoneyMovement, setShowMoneyMovement] = useState(false);
  const [startDate, setStartDate] = useState(savedStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);

  // Save startDate to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("accountHistoryStartDate", startDate);
  }, [startDate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Convert local dates to ISO strings with time to ensure full day coverage in UTC
      const startIso = new Date(startDate + "T00:00:00").toISOString();
      const endIso = new Date(endDate + "T23:59:59.999").toISOString();

      const historyData = await client.get(
        `/api/account-history?start-date=${startIso}&end-date=${endIso}`
      );

      // Process history data
      if (Array.isArray(historyData.data)) {
        const transformedData = historyData.data.map(
          ({
            "executed-at": executedAt,
            "transaction-type": transactionType,
            action,
            symbol,
            quantity,
            price,
            value,
            "value-effect": valueEffect,
            description,
          }) => ({
            Date: new Date(executedAt).toLocaleDateString(),
            Type: transactionType,
            Action: action,
            Symbol: symbol,
            Quantity: quantity,
            Price: price,
            Value: valueEffect === "Debit" ? -value : value,
            Description: description,
          })
        );
        setHistory(transformedData);
      }
    } catch (err) {
      setError("Failed to fetch transaction history");
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await client.post("/api/account-history/sync");
      // Automatically refresh the transaction data after successful sync
      await fetchData();
    } catch (err) {
      setError("Failed to sync transactions");
      console.error("Error:", err);
    } finally {
      setSyncing(false);
    }
  };

  if (error) return <Typography color="error">Error: {error}</Typography>;

  const columns = [
    "Date",
    "Symbol",
    "Quantity",
    "Price",
    "Value",
    "Description",
    "Type",
    "Action",
  ];

  const displayedHistory = showMoneyMovement
    ? history
    : history.filter((h) => h.Type !== "Money Movement");

  const historyTotal = displayedHistory.reduce(
    (sum, item) => sum + (Number(item.Value) || 0),
    0
  );

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Filters */}
      <Box
        sx={{
          display: "flex",
          gap: 2,
          marginBottom: 2,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <TextField
          label="Start Date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          disabled={loading || syncing}
          sx={{ minWidth: 150 }}
        />
        <TextField
          label="End Date"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          disabled={loading || syncing}
          sx={{ minWidth: 150 }}
        />
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={showMoneyMovement}
                onChange={(e) => setShowMoneyMovement(e.target.checked)}
                disabled={loading}
              />
            }
            label="Show Money Movement"
          />
          <Tooltip title="Sync latest transactions">
            <span>
              <IconButton onClick={handleSync} disabled={syncing || loading}>
                {syncing ? <CircularProgress size={24} /> : <RefreshIcon />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {/* Value Summary */}
      <Box
        sx={{
          padding: 2,
          marginY: 2,
          backgroundColor: "background.paper",
          borderRadius: 1,
          boxShadow: 1,
        }}
      >
        <Typography variant="h6">
          Transaction Total Value:{" "}
          {loading ? (
            <Box
              component="span"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <CircularProgress size={20} />
              <Typography component="span" color="text.secondary">
                Loading...
              </Typography>
            </Box>
          ) : (
            `$${historyTotal.toFixed(2)}`
          )}
        </Typography>
      </Box>

      {/* Transaction History Table */}
      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        <Typography variant="h6" gutterBottom>
          Transaction History
        </Typography>
        {loading ? (
          <Box display="flex" justifyContent="center" p={3}>
            <CircularProgress />
          </Box>
        ) : (
          <DataTable columns={columns} data={displayedHistory} />
        )}
      </Box>
    </Box>
  );
};

export default TransactionHistory;
