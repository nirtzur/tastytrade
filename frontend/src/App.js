import "./App.css";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  AppBar,
  Tabs,
  Tab,
  Box,
  Typography,
  IconButton,
  Tooltip,
} from "@mui/material";
import { Logout } from "@mui/icons-material";
import TransactionHistory from "./components/TransactionHistory";
import OpenPositions from "./components/OpenPositions";
import VisualPage from "./components/VisualPage";
import AnalysisTable from "./components/AnalysisTable";
import ValueOverTime from "./components/ValueOverTime";
import BalanceChart from "./components/BalanceChart";
import Positions from "./components/Positions";
import Funding from "./components/Funding";
import AIPage from "./components/AIPage";
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
  const [upcomingHoliday, setUpcomingHoliday] = useState(null);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  // Check for upcoming holidays in the next 14 days
  useEffect(() => {
    const checkUpcomingHoliday = () => {
      const today = new Date();
      const years = [today.getFullYear(), today.getFullYear() + 1];
      const allHolidays = [];

      years.forEach((year) => {
        const holidays = [];

        const addHoliday = (name, date) => {
          let d = new Date(date);
          const day = d.getDay();
          if (day === 0) {
            // Sunday -> observed Monday
            d.setDate(d.getDate() + 1);
          } else if (day === 6) {
            // Saturday -> observed Friday
            d.setDate(d.getDate() - 1);
          }
          holidays.push({ name, date: d });
        };

        // 1. New Year's Day
        const newYear = new Date(year, 0, 1);
        if (newYear.getDay() === 6) {
          holidays.push({
            name: "New Year's Day (Observed)",
            date: new Date(year - 1, 11, 31),
          });
        } else if (newYear.getDay() === 0) {
          holidays.push({
            name: "New Year's Day (Observed)",
            date: new Date(year, 0, 2),
          });
        } else {
          holidays.push({ name: "New Year's Day", date: newYear });
        }

        // 2. Martin Luther King Jr. Day (3rd Monday in Jan)
        let mlk = new Date(year, 0, 1);
        while (mlk.getDay() !== 1) mlk.setDate(mlk.getDate() + 1);
        mlk.setDate(mlk.getDate() + 14);
        holidays.push({ name: "Martin Luther King Jr. Day", date: mlk });

        // 3. Presidents' Day (3rd Monday in Feb)
        let pres = new Date(year, 1, 1);
        while (pres.getDay() !== 1) pres.setDate(pres.getDate() + 1);
        pres.setDate(pres.getDate() + 14);
        holidays.push({ name: "Presidents' Day", date: pres });

        // 4. Good Friday (Friday before Easter)
        const f = Math.floor,
          a = year % 19,
          b = f(year / 100),
          c = year % 100,
          d = f(b / 4),
          e = b % 4,
          g = f((8 * b + 13) / 25),
          h = (19 * a + b - d - g + 15) % 30,
          i = f(c / 4),
          k = c % 4,
          l = (32 + 2 * e + 2 * i - h - k) % 7,
          m = f((a + 11 * h + 22 * l) / 451),
          month = f((h + l - 7 * m + 114) / 31),
          day = ((h + l - 7 * m + 114) % 31) + 1;
        const easter = new Date(year, month - 1, day);
        const goodFriday = new Date(easter);
        goodFriday.setDate(goodFriday.getDate() - 2);
        holidays.push({ name: "Good Friday", date: goodFriday });

        // 5. Memorial Day (last Monday in May)
        let mem = new Date(year, 4, 31);
        while (mem.getDay() !== 1) mem.setDate(mem.getDate() - 1);
        holidays.push({ name: "Memorial Day", date: mem });

        // 6. Juneteenth (June 19)
        addHoliday(
          "Juneteenth National Independence Day",
          new Date(year, 5, 19),
        );

        // 7. Independence Day (July 4)
        addHoliday("Independence Day", new Date(year, 6, 4));

        // 8. Labor Day (1st Monday in Sep)
        let lab = new Date(year, 8, 1);
        while (lab.getDay() !== 1) lab.setDate(lab.getDate() + 1);
        holidays.push({ name: "Labor Day", date: lab });

        // 9. Thanksgiving (4th Thursday in Nov)
        let thg = new Date(year, 10, 1);
        while (thg.getDay() !== 4) thg.setDate(thg.getDate() + 1);
        thg.setDate(thg.getDate() + 21);
        holidays.push({ name: "Thanksgiving Day", date: thg });

        // 10. Christmas Day (Dec 25)
        addHoliday("Christmas Day", new Date(year, 11, 25));

        allHolidays.push(...holidays);
      });

      const startRange = new Date(today);
      startRange.setHours(0, 0, 0, 0);

      const endRange = new Date(today);
      endRange.setDate(endRange.getDate() + 14);
      endRange.setHours(23, 59, 59, 999);

      const holidaysInRange = allHolidays
        .filter((h) => h.date >= startRange && h.date <= endRange)
        .sort((a, b) => a.date - b.date);

      if (holidaysInRange.length > 0) {
        const firstHoliday = holidaysInRange[0];
        setUpcomingHoliday({
          name: firstHoliday.name,
          formattedDate: firstHoliday.date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          }),
        });
      } else {
        setUpcomingHoliday(null);
      }
    };

    checkUpcomingHoliday();
  }, []);

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
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                marginRight: { xs: 1, sm: 3 },
              }}
            >
              <PapoyIcon style={{ width: 32, height: 32, marginRight: 8 }} />
              <Typography
                variant="h6"
                sx={{
                  fontWeight: "bold",
                  color: "#1B8EC7",
                  display: { xs: "none", sm: "block" },
                }}
              >
                Papoy
              </Typography>
            </Box>
            <Tabs
              value={location.pathname}
              onChange={handleTabChange}
              indicatorColor="primary"
              textColor="primary"
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
            >
              <Tab label="Transaction History" value="/transaction-history" />
              <Tab label="Open Positions" value="/open-positions" />
              <Tab label="Analysis" value="/analysis" />
              <Tab label="Weekly Value" value="/value" />
              <Tab label="Balance" value="/balance" />
              <Tab label="Weekly Options" value="/visual" />
              <Tab label="Positions" value="/positions" />
              <Tab label="Funding" value="/funding" />
              <Tab label="AI" value="/ai" />
            </Tabs>
            <Box sx={{ flexGrow: 1 }} />
            {upcomingHoliday && (
              <Box
                sx={{
                  bgcolor: "#ffebee",
                  color: "#c62828",
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 10,
                  fontSize: "0.85rem",
                  fontWeight: "bold",
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  mr: 2,
                  border: "1px solid #ffcdd2",
                }}
              >
                🎉 Market Closed Holiday: {upcomingHoliday.name} (
                {upcomingHoliday.formattedDate})
              </Box>
            )}
            <Tooltip title="Logout">
              <IconButton color="inherit" onClick={handleLogout} sx={{ mr: 2 }}>
                <Logout />
              </IconButton>
            </Tooltip>
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
          <Route
            path="/ai"
            element={
              <ProtectedRoute>
                <AIPage />
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
