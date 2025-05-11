import React from "react";
import DataTable from "./DataTable";
import "./AccountHistoryTable.css";

const AccountHistoryTable = () => {
  const [history, setHistory] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [showMoneyMovement, setShowMoneyMovement] = React.useState(false);
  const [startDate, setStartDate] = React.useState("2024-11-01");
  const [endDate, setEndDate] = React.useState(
    new Date().toISOString().split("T")[0]
  );

  React.useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `http://localhost:3001/api/account-history?start-date=${startDate}&end-date=${endDate}`
        );
        const data = await response.json();

        if (Array.isArray(data)) {
          // Transform the data to make it more readable
          const transformedData = data.map((value) => {
            return {
              Date: new Date(value["executed-at"]).toLocaleDateString(),
              Type: value["transaction-type"],
              Action: value.action,
              Symbol: value.symbol,
              Quantity: value.quantity,
              Price: value.price,
              Value:
                value["value-effect"] === "Debit" ? -value.value : value.value,
              Description: value.description,
            };
          });
          setHistory(transformedData);
        } else {
          throw new Error("Invalid account history data format");
        }
      } catch (err) {
        setError("Failed to fetch account history");
        console.error("Error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [startDate, endDate]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  const columns = [
    "Date",
    "Type",
    "Action",
    "Symbol",
    "Quantity",
    "Price",
    "Value",
    "Description",
  ];

  const displayedHistory = showMoneyMovement
    ? history
    : history.filter((h) => h.Type !== "Money Movement");

  const totalValue = displayedHistory.reduce(
    (sum, item) => sum + (Number(item.Value) || 0),
    0
  );

  return (
    <div className="account-history-container">
      <div className="date-filters">
        <label>
          Start Date:
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label>
          End Date:
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      </div>
      <label>
        <input
          type="checkbox"
          checked={showMoneyMovement}
          onChange={(e) => setShowMoneyMovement(e.target.checked)}
        />
        Show Money Movement
      </label>
      <DataTable columns={columns} data={displayedHistory} />
      <div className="summary-section">
        <h3>Total Value: ${totalValue.toFixed(2)}</h3>
      </div>
    </div>
  );
};

export default AccountHistoryTable;
