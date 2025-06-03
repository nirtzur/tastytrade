import React, { useState, useEffect } from "react";
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
const defaultEndDate = new Date().toISOString().split("T")[0];

const AccountHistoryTable = () => {
  const [history, setHistory] = useState([]);
  const [positions, setPositions] = useState([]);
  const [positionsTotalValue, setPositionsTotalValue] = useState(0);
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

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch both sets of data in parallel
        const [historyData, positionsData] = await Promise.all([
          client.get(
            `/api/account-history?start-date=${startDate}&end-date=${endDate}`
          ),
          client.get("/api/positions"),
        ]);

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

        // Process positions data
        if (Array.isArray(positionsData.data)) {
          const processedPositions = positionsData.data.map(
            ({
              symbol,
              quantity: rawQuantity,
              "close-price": rawStrikePrice,
              "option-price": rawOptionPrice,
              "average-open-price": rawAcquisitionPrice,
              yahoo_price: rawYahooPrice,
            }) => {
              const strikePrice = parseFloat(rawStrikePrice) || 0;
              const optionPrice = parseFloat(rawOptionPrice) || 0;
              const acquisitionPrice = parseFloat(rawAcquisitionPrice) || 0;
              const yahooPrice = parseFloat(rawYahooPrice) || 0;
              const quantity = parseFloat(rawQuantity) || 0;
              const value = quantity * strikePrice;
              const profitLoss = value - quantity * acquisitionPrice;

              return {
                Symbol: symbol,
                Quantity: quantity,
                "Strike Price": `$${strikePrice.toFixed(2)}`,
                "Option Price": optionPrice
                  ? `$${optionPrice.toFixed(2)}`
                  : "N/A",
                "Acquisition Price": `$${acquisitionPrice.toFixed(2)}`,
                "Yahoo Price": yahooPrice ? `$${yahooPrice.toFixed(2)}` : "N/A",
                Value: `$${value.toFixed(2)}`,
                "P/L": `$${profitLoss.toFixed(2)}`,
              };
            }
          );
          setPositions(processedPositions);
          const totalValue = processedPositions.reduce((sum, position) => {
            return sum + (parseFloat(position.Value.replace("$", "")) || 0);
          }, 0);
          setPositionsTotalValue(totalValue);
        }
      } catch (err) {
        setError("Failed to fetch data");
        console.error("Error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [startDate, endDate]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await client.post("/api/account-history/sync");
      // Refetch data after sync by updating endDate
      setEndDate(new Date().toISOString().split("T")[0]);
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
          disabled={loading || syncing}
        />
        <TextField
          label="End Date"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          disabled={loading || syncing}
        />
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
            <IconButton
              onClick={handleSync}
              disabled={syncing || loading}
              sx={{ ml: "auto" }}
            >
              {syncing ? <CircularProgress size={24} /> : <RefreshIcon />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Box
        sx={{
          padding: 2,
          marginY: 2,
          backgroundColor: "background.paper",
          borderRadius: 1,
          boxShadow: 1,
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography variant="h6">
            Total Value:{" "}
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
              `$${totalValue.toFixed(2)}`
            )}
          </Typography>
          {!loading && (
            <Box
              sx={{ display: "flex", gap: 3, pl: 2, color: "text.secondary" }}
            >
              <Typography variant="body2">
                History: ${historyTotal.toFixed(2)}
              </Typography>
              <Typography variant="body2">
                Positions: ${positionsTotalValue.toFixed(2)}
              </Typography>
            </Box>
          )}
        </Box>
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

      <Box sx={{ marginBottom: 3 }}>
        <Typography variant="h6" gutterBottom>
          Open Positions
        </Typography>
        {loading ? (
          <Box display="flex" justifyContent="center" p={3}>
            <CircularProgress />
          </Box>
        ) : (
          <DataTable
            columns={[
              "Symbol",
              "Quantity",
              "Strike Price",
              "Option Price",
              "Acquisition Price",
              "Yahoo Price",
              "Value",
              "P/L",
            ]}
            data={positions}
          />
        )}
      </Box>
    </Box>
  );
};

export default AccountHistoryTable;
