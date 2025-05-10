import './App.css';
import DataTable from './components/DataTable';
import AccountHistoryTable from './components/AccountHistoryTable';
import { useEffect, useState } from 'react';

function App() {
  const [columns, setColumns] = useState([]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTradingData = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/trading-data');
        const tradingData = await response.json();

        // Extract column names from the first data object
        if (tradingData.length > 0) {
          setColumns(Object.keys(tradingData[0]));
          setData(tradingData);
        }
      } catch (err) {
        setError('Failed to fetch trading data');
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTradingData();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="App">
      <h1>Trading Dashboard</h1>
      <div className="tables-container">
        <div className="table-section">
          <h2>Current Trading Data</h2>
          <DataTable columns={columns} data={data} />
        </div>
        <div className="table-section">
          <AccountHistoryTable />
        </div>
      </div>
    </div>
  );
}

export default App;
