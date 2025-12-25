const { Model, DataTypes } = require("sequelize");
const sequelize = require("./index");

class TransactionHistory extends Model {}

TransactionHistory.init(
  {
    transaction_id: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    executed_at: {
      type: "TIMESTAMP",
      allowNull: false,
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
    },
    transaction_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    instrument_type: {
      type: DataTypes.STRING,
    },
    action: {
      type: DataTypes.STRING,
    },
    symbol: {
      type: DataTypes.STRING,
    },
    quantity: {
      type: DataTypes.DECIMAL(10, 2),
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
    },
    value: {
      type: DataTypes.DECIMAL(10, 2),
    },
    value_effect: {
      type: DataTypes.ENUM("Credit", "Debit", "None"),
    },
    description: {
      type: DataTypes.TEXT,
    },
  },
  {
    sequelize,
    modelName: "TransactionHistory",
    tableName: "transactions_history",
    timestamps: false,
  }
);

module.exports = TransactionHistory;
