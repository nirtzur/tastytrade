const { Model, DataTypes } = require("sequelize");
const sequelize = require("./index");

class AnalysisResult extends Model {}

AnalysisResult.init(
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
    current_price: {
      type: DataTypes.DECIMAL(10, 2),
    },
    stock_bid: {
      type: DataTypes.DECIMAL(10, 2),
    },
    stock_ask: {
      type: DataTypes.DECIMAL(10, 2),
    },
    stock_spread: {
      type: DataTypes.DECIMAL(10, 2),
    },
    option_strike_price: {
      type: DataTypes.DECIMAL(10, 2),
    },
    option_bid: {
      type: DataTypes.DECIMAL(10, 2),
    },
    option_ask: {
      type: DataTypes.DECIMAL(10, 2),
    },
    option_mid_price: {
      type: DataTypes.DECIMAL(10, 2),
    },
    option_mid_percent: {
      type: DataTypes.DECIMAL(10, 2),
    },
    option_expiration_date: {
      type: DataTypes.DATE,
    },
    days_to_earnings: {
      type: DataTypes.INTEGER,
    },
    status: {
      type: DataTypes.STRING,
    },
    notes: {
      type: DataTypes.TEXT,
    },
    analyzed_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: "AnalysisResult",
    tableName: "analysis_results",
    timestamps: false,
  }
);

module.exports = AnalysisResult;
