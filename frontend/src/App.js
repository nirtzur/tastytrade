import "./App.css";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { AppBar, Tabs, Tab, Box } from "@mui/material";
import AccountHistoryTable from "./components/AccountHistoryTable";
import VisualPage from "./components/VisualPage";
import AnalysisTable from "./components/AnalysisTable";
import ValueOverTime from "./components/ValueOverTime";
import BalanceChart from "./components/BalanceChart";
import LoginPage from "./components/LoginPage";

function App() {
  console.log("App component rendered");
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
          <Tabs
            value={location.pathname}
            onChange={handleTabChange}
            indicatorColor="primary"
            textColor="primary"
          >
            <Tab label="Account History" value="/account-history" />
            <Tab label="Analysis" value="/analysis" />
            <Tab label="Weekly Value" value="/value" />
            <Tab label="Balance" value="/balance" />
            <Tab label="Weekly Options" value="/visual" />
          </Tabs>
        </AppBar>
      )}
      <Box sx={{ p: 3 }}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={<Navigate to="/account-history" replace />}
          />
          <Route path="/account-history" element={<AccountHistoryTable />} />
          <Route path="/analysis" element={<AnalysisTable />} />
          <Route path="/value" element={<ValueOverTime />} />
          <Route path="/balance" element={<BalanceChart />} />
          <Route path="/visual" element={<VisualPage />} />
        </Routes>
      </Box>
    </div>
  );
}

export default App;
