import React from 'react';
import DataTable from './DataTable';
import './AccountHistoryTable.css';

const AccountHistoryTable = () => {
  const [history, setHistory] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/account-history');
        const data = await response.json();
        
        if (Array.isArray(data)) {
          // Transform the data to make it more readable
          const transformedData = data.map(item => {
            return {
              'Date': new Date(item.timestamp).toLocaleDateString(),
              'Type': item.transaction_type,
              'Symbol': item.symbol,
              'Quantity': item.quantity,
              'Price': item.price,
              'Amount': item.amount,
              'Description': item.description,
              'Status': item.status
            };
          });
          setHistory(transformedData);
        } else {
          throw new Error('Invalid account history data format');
        }
      } catch (err) {
        setError('Failed to fetch account history');
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  const columns = [
    'Date',
    'Type',
    'Symbol',
    'Quantity',
    'Price',
    'Amount',
    'Description',
    'Status'
  ];

  return (
    <div className="account-history-container">
      <h2>Account History</h2>
      <DataTable columns={columns} data={history} />
    </div>
  );
};

export default AccountHistoryTable;
