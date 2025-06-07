import React from "react";
import { Box, Typography } from "@mui/material";

const BalanceChart = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Balance Chart
      </Typography>
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "400px",
          border: "2px dashed #ccc",
          borderRadius: 2,
          backgroundColor: "#f9f9f9",
        }}
      >
        <Typography variant="h6" color="text.secondary">
          Balance chart content will be implemented here
        </Typography>
      </Box>
    </Box>
  );
};

export default BalanceChart;
