"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create closed_positions table
    await queryInterface.createTable("closed_positions", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      symbol: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      grouping_key: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      total_shares: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
      },
      total_cost: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
      },
      total_proceeds: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
      },
      realized_pl: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
      },
      total_option_premium: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
      },
      total_return: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
      },
      return_percentage: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
      },
      first_transaction_date: {
        type: Sequelize.DATE,
      },
      last_transaction_date: {
        type: Sequelize.DATE,
      },
      total_option_contracts: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      total_option_transactions: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      equity_transactions: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      avg_cost_basis: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
      },
      closed_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // 2. Add closed_position_id column to transactions_history table
    // Check if column exists first to be safe, or just add it (assuming migration order)
    const tableInfo = await queryInterface.describeTable(
      "transactions_history"
    );
    if (!tableInfo.closed_position_id) {
      await queryInterface.addColumn(
        "transactions_history",
        "closed_position_id",
        {
          type: Sequelize.INTEGER,
          allowNull: true,
        }
      );
    }
  },

  down: async (queryInterface, Sequelize) => {
    // 1. Remove closed_position_id column
    await queryInterface.removeColumn(
      "transactions_history",
      "closed_position_id"
    );

    // 2. Drop closed_positions table
    await queryInterface.dropTable("closed_positions");
  },
};
