import "./App.css";
import { Navigate, Route, Routes } from "react-router-dom";
import AccountHistoryTable from "./components/AccountHistoryTable";

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<Navigate to="/account-history" replace />} />
        <Route path="/account-history" element={<AccountHistoryTable />} />
      </Routes>
    </div>
  );
}

export default App;
