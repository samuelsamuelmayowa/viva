require("dotenv").config();

const { Sequelize } = require("sequelize");
const mysql2 = require("mysql2");

if (
  process.env.NODE_ENV !== "production" &&
  /prod/i.test(process.env.DB_NAME || "")
) {
  throw new Error(
    "Non-production process cannot connect to a production database."
  );
}

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),

    dialect: "mysql",

    // Explicit MySQL driver for Vercel
    dialectModule: mysql2,

    logging: false,

    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },

    dialectOptions:
      process.env.DB_SSL === "true"
        ? {
            ssl: {
              rejectUnauthorized: true,
              ...(process.env.DB_SSL_CA
                ? {
                    ca: process.env.DB_SSL_CA.replace(
                      /\\n/g,
                      "\n"
                    ),
                  }
                : {}),
            },
          }
        : {},
  }
);

module.exports = { sequelize };

// const { Sequelize } = require("sequelize");
// const mysql2 = require("mysql2");

// const sequelize = new Sequelize(
//   process.env.DB_NAME,
//   process.env.DB_USER,
//   process.env.DB_PASSWORD,
//   {
//     host: process.env.DB_HOST,
//     port: Number(process.env.DB_PORT || 3306),

//     dialect: "mysql",

//     // Important for Vercel/serverless bundling
//     dialectModule: mysql2,

//     logging: false,

//     pool: {
//       max: 5,
//       min: 0,
//       acquire: 30000,
//       idle: 10000,
//     },
//   }
// );

// module.exports = sequelize;
// // require("dotenv").config();
// // const { Sequelize } = require("sequelize");
// // if (
// //   process.env.NODE_ENV !== "production" &&
// //   /prod/i.test(process.env.DB_NAME || "")
// // )
// //   throw new Error(
// //     "Non-production process cannot connect to a production database.",
// //   );
// // const sequelize = new Sequelize(
// //   process.env.DB_NAME,
// //   process.env.DB_USER,
// //   process.env.DB_PASS,
// //   {
// //     host: process.env.DB_HOST || "localhost",
// //     port: Number(process.env.DB_PORT || 3306),
// //     dialect: "mysql",
// //     logging: false,
// //     pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
// //     dialectOptions:
// //       process.env.DB_SSL === "true"
// //         ? {
// //           ssl: {
// //             rejectUnauthorized: true,
// //             ...(process.env.DB_SSL_CA
// //               ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, "\n") }
// //               : {}),
// //           },
// //         }
// //         : {},
// //   },
// // );

// // module.exports = { sequelize };
