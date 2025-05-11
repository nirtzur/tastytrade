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
          const transformedData = data.map((position) => ({
            Symbol: position.symbol,
            Quantity: position.quantity,
            "Strike Price": position["close-price"],
            "Option Price": position["option-price"],
            "Acquisition Price": position["average-open-price"],
            Cost: position["average-cost"],
            "P/L": position["unrealized-gain-loss"],
          }));
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
    "Cost",
    "P/L",
  ];

  return (
    <Box sx={{ marginBottom: 3 }}>
      <Typography variant="h6" gutterBottom>
        Open Positions
      </Typography>
      <DataTable columns={columns} data={positions} />
    </Box>
  );
};

export default PositionsTable;
