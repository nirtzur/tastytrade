import React, { useState, useEffect, useCallback } from "react";
import DataTable from "./DataTable";
import PositionsTable from "./PositionsTable";
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

const AccountHistoryTable = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [showMoneyMovement, setShowMoneyMovement] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const savedStartDate = localStorage.getItem("accountHistoryStartDate");
    return savedStartDate || "2024-11-25";
  });
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [positionsTotalValue, setPositionsTotalValue] = useState(0);
  const [isPositionsLoading, setIsPositionsLoading] = useState(true);

  // Save startDate to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("accountHistoryStartDate", startDate);
  }, [startDate]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/account-history?start-date=${startDate}&end-date=${endDate}`
      );
      const data = await response.json();

      if (Array.isArray(data)) {
        const transformedData = data.map(
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
      } else {
        throw new Error("Invalid account history data format");
      }
    } catch (err) {
      setError("Failed to fetch account history");
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/account-history/sync`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error("Failed to sync transactions");
      }

      // Fetch updated data after sync
      await fetchHistory();
    } catch (err) {
      setError("Failed to sync transactions");
      console.error("Error:", err);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

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

  const totalValue = historyTotal + positionsTotalValue;

  return (
    <Box
      sx={{
        width: "100%",
        height: "100vh",
        padding: { xs: 1, sm: 2, md: 3 },
        display: "flex",
        flexDirection: "column",
      }}
    >
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
        />
        <TextField
          label="End Date"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={showMoneyMovement}
              onChange={(e) => setShowMoneyMovement(e.target.checked)}
            />
          }
          label="Show Money Movement"
        />
        <Tooltip title="Sync latest transactions">
          <IconButton
            onClick={handleSync}
            disabled={syncing || loading}
            sx={{ ml: "auto" }}
          >
            {syncing ? <CircularProgress size={24} /> : <RefreshIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      <PositionsTable
        onTotalValueChange={setPositionsTotalValue}
        onLoadingChange={setIsPositionsLoading}
      />

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
          Total Value:{" "}
          {loading || isPositionsLoading ? (
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
            `$${totalValue.toFixed(2)}`
          )}
        </Typography>
      </Box>

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

export default AccountHistoryTable;
