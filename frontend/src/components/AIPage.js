import React, { useState } from "react";
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  CircularProgress,
  Alert,
} from "@mui/material";
import client from "../api/client";

const AIPage = () => {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState("");
  const [error, setError] = useState(null);

  const handlePreview = async () => {
    setLoading(true);
    setError(null);
    setResponse("");

    try {
      const result = await client.post("/api/ai/consult", {
        preview: true,
      });
      setPrompt(result.data.prompt);
    } catch (err) {
      console.error("Error generating prompt:", err);
      setError(err.message || "Failed to generate prompt");
    } finally {
      setLoading(false);
    }
  };

  const handleConsult = async () => {
    setLoading(true);
    setError(null);
    setResponse("");

    try {
      const result = await client.post("/api/ai/consult", {
        // Token is handled by server env
      });
      setResponse(result.data.analysis);
    } catch (err) {
      console.error("Error consulting AI:", err);
      setError(err.message || "Failed to consult AI");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, margin: "0 auto" }}>
      <Typography variant="h4" gutterBottom>
        AI Portfolio Consultant
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 2 }}>
          {!prompt ? (
            <Button
              variant="contained"
              onClick={handlePreview}
              disabled={loading}
              sx={{ height: 56, alignSelf: "flex-start" }}
            >
              {loading ? <CircularProgress size={24} /> : "Generate Prompt"}
            </Button>
          ) : (
            <>
              <TextField
                label="Prompt Preview"
                value={prompt}
                multiline
                rows={15}
                fullWidth
                InputProps={{
                  readOnly: true,
                  style: { fontFamily: "monospace", fontSize: "0.875rem" },
                }}
                variant="outlined"
              />
              <Box sx={{ display: "flex", gap: 2 }}>
                <Button
                  variant="outlined"
                  onClick={handlePreview}
                  disabled={loading}
                >
                  Regenerate Prompt
                </Button>
                <Button
                  variant="contained"
                  onClick={handleConsult}
                  disabled={loading}
                  sx={{ minWidth: 120 }}
                >
                  {loading ? <CircularProgress size={24} /> : "Consult Gemini"}
                </Button>
              </Box>
            </>
          )}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
      </Paper>

      {response && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Analysis Result
          </Typography>
          <Box
            sx={{
              "& table": {
                width: "100%",
                borderCollapse: "collapse",
                marginTop: 2,
                marginBottom: 2,
              },
              "& th": {
                border: "1px solid #ddd",
                padding: 1,
                backgroundColor: "#f5f5f5",
                fontWeight: "bold",
                color: "black",
              },
              "& td": { border: "1px solid #ddd", padding: 1 },
              "& tr:nth-of-type(even)": { backgroundColor: "#fafafa" },
              "& tr:hover": { backgroundColor: "#f0f0f0" },
              "& li": { textAlign: "left" },
            }}
          >
            <div
              dangerouslySetInnerHTML={{
                __html: response.replace(/```html/g, "").replace(/```/g, ""),
              }}
            />
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default AIPage;
