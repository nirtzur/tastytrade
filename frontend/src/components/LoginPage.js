import React from "react";
import { Descope } from "@descope/react-sdk";
import { useNavigate } from "react-router-dom";
import { Box, Paper, Typography } from "@mui/material";

const LoginPage = () => {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
      }}
    >
      <Paper
        elevation={3}
        sx={{
          p: 4,
          width: "100%",
          maxWidth: 400,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Typography variant="h5" gutterBottom align="center">
          Welcome to Papoy
        </Typography>
        <Descope
          flowId="sign-up-or-in"
          onSuccess={(e) => {
            console.log("Logged in!");
            navigate("/transaction-history");
          }}
          onError={(e) => console.log("Could not log in!", e)}
        />
      </Paper>
    </Box>
  );
};

export default LoginPage;
