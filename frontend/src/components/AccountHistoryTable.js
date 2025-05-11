import React, { useState, useEffect } from "react";
import DataTable from "./DataTable";
import PositionsTable from "./PositionsTable";
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
  const [startDate, setStartDate] = useState("2024-11-25");
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [funding, setFunding] = useState(111000);
  const [positionsTotalValue, setPositionsTotalValue] = useState(0);

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
          label="Funding"
          type="number"
          value={funding}
          onChange={(e) => setFunding(Number(e.target.value))}
          sx={{ width: 150 }}
          InputProps={{
            startAdornment: "$",
          }}
        />
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
      </Box>

      <PositionsTable onTotalValueChange={setPositionsTotalValue} />

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
          Total Value: ${totalValue.toFixed(2)}
        </Typography>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        <Typography variant="h6" gutterBottom>
          Transaction History
        </Typography>
        <DataTable columns={columns} data={displayedHistory} />
      </Box>
    </Box>
  );
};

export default AccountHistoryTable;
