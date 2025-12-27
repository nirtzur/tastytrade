import "./App.css";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { AppBar, Tabs, Tab, Box, Typography, Button } from "@mui/material";
import TransactionHistory from "./components/TransactionHistory";
import OpenPositions from "./components/OpenPositions";
import VisualPage from "./components/VisualPage";
import AnalysisTable from "./components/AnalysisTable";
import ValueOverTime from "./components/ValueOverTime";
import BalanceChart from "./components/BalanceChart";
import Positions from "./components/Positions";
import Funding from "./components/Funding";
import LoginPage from "./components/LoginPage";
import { ReactComponent as PapoyIcon } from "./papoy-icon.svg";
import { useSession, useDescope } from "@descope/react-sdk";
import TastyTradeLoginDialog from "./components/TastyTradeLoginDialog";
import { useState, useEffect } from "react";

function App() {
  const { isAuthenticated, isSessionLoading } = useSession();
  const { logout } = useDescope();
  const navigate = useNavigate();
  const location = useLocation();
  const isLoginPage = location.pathname === "/login";
  const [showTastyTradeLogin, setShowTastyTradeLogin] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  // Setup global error handler for TastyTrade auth
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401) {
        const data = await response
          .clone()
          .json()
          .catch(() => ({}));
        if (data.code === "TASTYTRADE_AUTH_REQUIRED") {
          setShowTastyTradeLogin(true);
        }
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const handleTabChange = (event, newValue) => {
    navigate(newValue);
  };

  if (isSessionLoading) {
    return <div className="App">Loading...</div>;
  }

  const ProtectedRoute = ({ children }) => {
    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
    }
    return children;
  };

  return (
    <div className="App">
      {!isLoginPage && isAuthenticated && (
        <AppBar position="static" color="default">
          <Box sx={{ display: "flex", alignItems: "center", paddingLeft: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", marginRight: 3 }}>
              <PapoyIcon style={{ width: 32, height: 32, marginRight: 8 }} />
              <Typography
                variant="h6"
                sx={{ fontWeight: "bold", color: "#1B8EC7" }}
              >
                Papoy
              </Typography>
            </Box>
            <Tabs
              value={location.pathname}
              onChange={handleTabChange}
              indicatorColor="primary"
              textColor="primary"
            >
              <Tab label="Transaction History" value="/transaction-history" />
              <Tab label="Open Positions" value="/open-positions" />
              <Tab label="Analysis" value="/analysis" />
              <Tab label="Weekly Value" value="/value" />
              <Tab label="Balance" value="/balance" />
              <Tab label="Weekly Options" value="/visual" />
              <Tab label="Positions" value="/positions" />
              <Tab label="Funding" value="/funding" />
            </Tabs>
            <Box sx={{ flexGrow: 1 }} />
            <Button color="inherit" onClick={handleLogout} sx={{ mr: 2 }}>
              Logout
            </Button>
          </Box>
        </AppBar>
      )}
      <Box sx={{ p: 3 }}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={<Navigate to="/transaction-history" replace />}
          />
          <Route
            path="/transaction-history"
            element={
              <ProtectedRoute>
                <TransactionHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/open-positions"
            element={
              <ProtectedRoute>
                <OpenPositions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analysis"
            element={
              <ProtectedRoute>
                <AnalysisTable />
              </ProtectedRoute>
            }
          />
          <Route
            path="/value"
            element={
              <ProtectedRoute>
                <ValueOverTime />
              </ProtectedRoute>
            }
          />
          <Route
            path="/balance"
            element={
              <ProtectedRoute>
                <BalanceChart />
              </ProtectedRoute>
            }
          />
          <Route
            path="/visual"
            element={
              <ProtectedRoute>
                <VisualPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/positions"
            element={
              <ProtectedRoute>
                <Positions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/funding"
            element={
              <ProtectedRoute>
                <Funding />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Box>
      <TastyTradeLoginDialog
        open={showTastyTradeLogin}
        onClose={() => setShowTastyTradeLogin(false)}
      />
    </div>
  );
}

export default App;
