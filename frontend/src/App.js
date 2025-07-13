import "./App.css";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { AppBar, Tabs, Tab, Box, Typography } from "@mui/material";
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

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const isLoginPage = location.pathname === "/login";

  const handleTabChange = (event, newValue) => {
    navigate(newValue);
  };

  return (
    <div className="App">
      {!isLoginPage && (
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
          <Route path="/transaction-history" element={<TransactionHistory />} />
          <Route path="/open-positions" element={<OpenPositions />} />
          <Route path="/analysis" element={<AnalysisTable />} />
          <Route path="/value" element={<ValueOverTime />} />
          <Route path="/balance" element={<BalanceChart />} />
          <Route path="/visual" element={<VisualPage />} />
          <Route path="/positions" element={<Positions />} />
          <Route path="/funding" element={<Funding />} />
        </Routes>
      </Box>
    </div>
  );
}

export default App;
