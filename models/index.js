const { Sequelize } = require("sequelize");
const config = require("../config/database");

const env = process.env.NODE_ENV || "development";
const dbConfig = config[env];

let sequelize;
if (dbConfig.use_env_variable) {
  const connectionUrl = process.env[dbConfig.use_env_variable];
  if (connectionUrl) {
    console.log(
      "Initializing Sequelize with URL:",
      connectionUrl.replace(/:([^:@]+)@/, ":****@")
    );
  }
  sequelize = new Sequelize(connectionUrl, {
    logging: console.log,
    ...dbConfig,
  });
} else {
  sequelize = new Sequelize(
    dbConfig.database,
    dbConfig.username,
    dbConfig.password,
    {
      logging: console.log,
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
      ...dbConfig,
    }
  );
}

module.exports = sequelize;
