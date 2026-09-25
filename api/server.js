const app = require("./app");
const { sequelize } = require("./db");
const logger = require("./utils/logger");

const server = app.listen(Number(process.env.PORT || 8000), () =>
  logger.info({ port: Number(process.env.PORT || 8000) }, "Viva API listening"),
);

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(async () => {
      await sequelize.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
