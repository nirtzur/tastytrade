import React from "react";
import DataTable from "./DataTable";
import "./AccountHistoryTable.css";

const AccountHistoryTable = () => {
  const [history, setHistory] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(
          "http://localhost:3001/api/account-history"
        );
        const data = await response.json();

        if (typeof data === "object") {
          // Transform the data to make it more readable
          const transformedData = Object.entries(data).map(([key, value]) => {
            return {
              Date: new Date(value.timestamp).toLocaleDateString(),
              Type: value.transaction_type,
              Symbol: value.symbol,
              Quantity: value.quantity,
              Price: value.price,
              Amount: value.amount,
              Description: value.description,
              Status: value.status,
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
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  const columns = [
    "Date",
    "Type",
    "Symbol",
    "Quantity",
    "Price",
    "Amount",
    "Description",
    "Status",
  ];

  return (
    <div className="account-history-container">
      <h2>Account History</h2>
      <DataTable columns={columns} data={history} />
    </div>
  );
};

export default AccountHistoryTable;
