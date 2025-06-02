import React, { useState, useEffect } from "react";
import DataTable from "./DataTable";
import { Box, Typography, CircularProgress } from "@mui/material";
import client from "../api/client";

const PositionsTable = ({ onTotalValueChange, onLoadingChange }) => {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPositions = async () => {
      setLoading(true);
      onLoadingChange?.(true);
      try {
        const { data } = await client.get("/api/positions");

        if (Array.isArray(data)) {
          const transformedData = data.map(
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
              const quantity = parseFloat(rawQuantity) || 0;
              const acquisitionPrice = parseFloat(rawAcquisitionPrice) || 0;
              const yahooPrice = parseFloat(rawYahooPrice) || 0;

              const value = quantity * Math.min(yahooPrice, optionPrice);
              const acquisitionCost = quantity * acquisitionPrice;
              const pnl = value - acquisitionCost;

              return {
                Symbol: symbol,
                Quantity: quantity,
                "Strike Price": strikePrice,
                "Option Price": optionPrice,
                "Acquisition Price": acquisitionPrice,
                "Yahoo Price": yahooPrice ? yahooPrice.toFixed(2) : "N/A",
                Value: value.toFixed(2),
                "P/L": pnl.toFixed(2),
              };
            }
          );
          setPositions(transformedData);

          // Calculate and pass up total value
          const totalValue = transformedData.reduce(
            (sum, position) => sum + parseFloat(position.Value),
            0
          );
          if (onTotalValueChange) {
            onTotalValueChange(totalValue);
          }
        } else {
          throw new Error("Invalid positions data format");
        }
      } catch (err) {
        setError("Failed to fetch positions");
        console.error("Error:", err);
      } finally {
        setLoading(false);
        onLoadingChange?.(false);
      }
    };

    fetchPositions();
  }, [onTotalValueChange, onLoadingChange]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) return <Typography color="error">Error: {error}</Typography>;

  const columns = [
    "Symbol",
    "Quantity",
    "Strike Price",
    "Option Price",
    "Acquisition Price",
    "Yahoo Price",
    "Value",
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
