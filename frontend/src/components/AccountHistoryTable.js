import React, { useState, useEffect } from "react";
import DataTable from "./DataTable";
import {
  Box,
  Checkbox,
  FormControlLabel,
  TextField,
  Typography,
} from "@mui/material";

const AccountHistoryTable = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showMoneyMovement, setShowMoneyMovement] = useState(false);
  const [startDate, setStartDate] = useState("2024-11-01");
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `http://localhost:3001/api/account-history?start-date=${startDate}&end-date=${endDate}`
        );
        const data = await response.json();

        if (Array.isArray(data)) {
          const transformedData = data.map((value) => {
            return {
              Date: new Date(value["executed-at"]).toLocaleDateString(),
              Type: value["transaction-type"],
              Action: value.action,
              Symbol: value.symbol,
              Quantity: value.quantity,
              Price: value.price,
              Value:
                value["value-effect"] === "Debit" ? -value.value : value.value,
              Description: value.description,
            };
          });
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
    };

    fetchHistory();
  }, [startDate, endDate]);

  if (loading) return <Typography>Loading...</Typography>;
  if (error) return <Typography color="error">Error: {error}</Typography>;

  const columns = [
    "Date",
    "Type",
    "Action",
    "Symbol",
    "Quantity",
    "Price",
    "Value",
    "Description",
  ];

  const displayedHistory = showMoneyMovement
    ? history
    : history.filter((h) => h.Type !== "Money Movement");

  const totalValue = displayedHistory.reduce(
    (sum, item) => sum + (Number(item.Value) || 0),
    0
  );

  return (
    <Box sx={{ maxWidth: 1200, margin: "0 auto", padding: 2 }}>
      <Typography variant="h4" gutterBottom>
        Account History
      </Typography>
      <Box sx={{ display: "flex", gap: 2, marginBottom: 2 }}>
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
      </Box>
      <FormControlLabel
        control={
          <Checkbox
            checked={showMoneyMovement}
            onChange={(e) => setShowMoneyMovement(e.target.checked)}
          />
        }
        label="Show Money Movement"
      />
      <DataTable columns={columns} data={displayedHistory} />
      <Box sx={{ textAlign: "right", marginTop: 2 }}>
        <Typography variant="h6">
          Total Value: ${totalValue.toFixed(2)}
        </Typography>
      </Box>
    </Box>
  );
};

export default AccountHistoryTable;
