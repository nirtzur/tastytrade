"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable("analysis_results");
    if (!tableInfo.delta) {
      await queryInterface.addColumn("analysis_results", "delta", {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable("analysis_results");
    if (tableInfo.delta) {
      await queryInterface.removeColumn("analysis_results", "delta");
    }
  },
};
