import React, { useState, useEffect } from "react";
import DataTable from "./DataTable";
import { Box, Typography } from "@mui/material";

const PositionsTable = () => {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPositions = async () => {
      setLoading(true);
      try {
        const response = await fetch("http://localhost:3001/api/positions");
        const data = await response.json();

        if (Array.isArray(data)) {
          const transformedData = data.map((position) => {
            const strikePrice = parseFloat(position["close-price"]) || 0;
            const optionPrice = parseFloat(position["option-price"]) || 0;
            const quantity = parseFloat(position.quantity) || 0;
            const acquisitionPrice =
              parseFloat(position["average-open-price"]) || 0;

            const value = quantity * Math.min(strikePrice, optionPrice);
            const acquisitionCost = quantity * acquisitionPrice;
            const pnl = value - acquisitionCost;

            return {
              Symbol: position.symbol,
              Quantity: quantity,
              "Strike Price": strikePrice,
              "Option Price": optionPrice,
              "Acquisition Price": acquisitionPrice,
              Value: value.toFixed(2),
              "P/L": pnl.toFixed(2),
            };
          });
          setPositions(transformedData);
        } else {
          throw new Error("Invalid positions data format");
        }
      } catch (err) {
        setError("Failed to fetch positions");
        console.error("Error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPositions();
  }, []);

  if (loading) return <Typography>Loading positions...</Typography>;
  if (error) return <Typography color="error">Error: {error}</Typography>;

  const columns = [
    "Symbol",
    "Quantity",
    "Strike Price",
    "Option Price",
    "Acquisition Price",
    "Value",
    "P/L",
  ];

  const totalValue = positions.reduce(
    (sum, position) => sum + parseFloat(position.Value),
    0
  );
  const totalPnL = positions.reduce(
    (sum, position) => sum + parseFloat(position["P/L"]),
    0
  );

  return (
    <Box sx={{ marginBottom: 3 }}>
      <Typography variant="h6" gutterBottom>
        Open Positions
      </Typography>
      <DataTable columns={columns} data={positions} />
      <Box sx={{ mt: 2, display: "flex", gap: 4, justifyContent: "flex-end" }}>
        <Typography>Total Value: ${totalValue.toFixed(2)}</Typography>
        <Typography>Total P/L: ${totalPnL.toFixed(2)}</Typography>
      </Box>
    </Box>
  );
};

export default PositionsTable;
