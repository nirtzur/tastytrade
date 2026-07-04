"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable("analysis_results");
    if (!tableInfo.ivr) {
      await queryInterface.addColumn("analysis_results", "ivr", {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable("analysis_results");
    if (tableInfo.ivr) {
      await queryInterface.removeColumn("analysis_results", "ivr");
    }
  },
};
