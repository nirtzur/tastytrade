import React, { useState, useMemo } from "react";
import "./DataTable.css";

const DataTable = ({ columns, data }) => {
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc"); // 'asc' or 'desc'

  const handleSort = (column) => {
    if (sortField === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(column);
      setSortDirection("asc");
    }
  };

  const sortedData = useMemo(() => {
    if (!sortField) return data;

    return [...data].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      // Handle React elements (like custom Link in Symbol)
      if (React.isValidElement(valA)) {
        valA = valA.props.children || "";
      }
      if (React.isValidElement(valB)) {
        valB = valB.props.children || "";
      }

      // If they are strings representing currency, numbers, etc. strip symbols to compare as numbers
      const cleanVal = (val) => {
        if (val === null || val === undefined) return "";
        const s = String(val).trim();
        // Check if it's a percentage or currency format
        if (s.startsWith("$")) {
          const num = parseFloat(s.replace(/[\$,]/g, ""));
          return isNaN(num) ? s : num;
        }
        if (s.endsWith("%")) {
          const num = parseFloat(s.replace(/%/g, ""));
          return isNaN(num) ? s : num;
        }
        // General float check
        const num = parseFloat(s);
        return isNaN(num) ? s.toLowerCase() : num;
      };

      const cleanA = cleanVal(valA);
      const cleanB = cleanVal(valB);

      if (cleanA < cleanB) return sortDirection === "asc" ? -1 : 1;
      if (cleanA > cleanB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortField, sortDirection]);

  return (
    <div className="data-table-container">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                key={index}
                onClick={() => handleSort(column)}
                style={{ cursor: "pointer", userSelect: "none" }}
              >
                <div style={{ display: "flex", alignItems: "center" }}>
                  {column}
                  {sortField === column && (
                    <span style={{ marginLeft: "5px" }}>
                      {sortDirection === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column, colIndex) => (
                <td key={colIndex}>{row[column]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;
