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

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleTabChange = (event, newValue) => {
    navigate(newValue);
  };

  return (
    <div className="App">
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
      <Box sx={{ p: 3 }}>
        <Routes>
          <Route
            path="/"
            element={<Navigate to="/account-history" replace />}
          />
          <Route path="/account-history" element={<AccountHistoryTable />} />
          <Route path="/analysis" element={<AnalysisTable />} />
          <Route path="/value" element={<ValueOverTime />} />
          <Route path="/visual" element={<VisualPage />} />
        </Routes>
      </Box>
    </div>
  );
}

export default App;
