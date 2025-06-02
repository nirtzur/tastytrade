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
import LoginPage from "./components/LoginPage";

// All authentication is handled by the server endpoints
// Components will get redirected to login if their API calls return 401
function RequireAuth({ children }) {
  return children;
}

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
          <Tabs
            value={location.pathname}
            onChange={handleTabChange}
            indicatorColor="primary"
            textColor="primary"
          >
            <Tab label="Account History" value="/account-history" />
            <Tab label="Analysis" value="/analysis" />
            <Tab label="Value Over Time" value="/value" />
            <Tab label="Visual" value="/visual" />
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
          <Route
            path="/account-history"
            element={
              <RequireAuth>
                <AccountHistoryTable />
              </RequireAuth>
            }
          />
          <Route
            path="/analysis"
            element={
              <RequireAuth>
                <AnalysisTable />
              </RequireAuth>
            }
          />
          <Route
            path="/value"
            element={
              <RequireAuth>
                <ValueOverTime />
              </RequireAuth>
            }
          />
          <Route
            path="/visual"
            element={
              <RequireAuth>
                <VisualPage />
              </RequireAuth>
            }
          />
        </Routes>
      </Box>
    </div>
  );
}

export default App;
