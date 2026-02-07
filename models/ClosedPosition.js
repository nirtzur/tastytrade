const { Model, DataTypes } = require("sequelize");
const sequelize = require("./index");

class ClosedPosition extends Model {}

ClosedPosition.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    symbol: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    grouping_key: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    total_shares: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    total_cost: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    total_proceeds: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    realized_pl: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    total_option_premium: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    total_return: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    return_percentage: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    first_transaction_date: {
      type: DataTypes.DATE,
    },
    last_transaction_date: {
      type: DataTypes.DATE,
    },
    total_option_contracts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    total_option_transactions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    equity_transactions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    avg_cost_basis: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    closed_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: "ClosedPosition",
    tableName: "closed_positions",
    underscored: true,
    timestamps: true,
  }
);

module.exports = ClosedPosition;
