require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { rateLimit } = require("express-rate-limit");
const logger = require("./utils/logger");
const app = express();
app.disable("x-powered-by");


if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

const origin = process.env.APP_ORIGIN || "http://localhost:5173";

if (process.env.NODE_ENV === "production" && !origin.startsWith("https://"))
    throw new Error("Production APP_ORIGIN must use HTTPS.");

app.use(
    helmet(),
    cors({ origin, credentials: true }),
    express.json({ limit: "256kb" }),
    cookieParser(),
);

app.use(
    require("pino-http")({
        logger,
        serializers: {
            req: (req) => ({
                id: req.id,
                method: req.method,
                url: req.url,
                remoteAddress: req.remoteAddress,
            }),
            res: (res) => ({ statusCode: res.statusCode }),
        },
        autoLogging: process.env.NODE_ENV !== "test",
    }),
);

app.use(
    "/api",
    rateLimit({
        windowMs: 60000,
        limit: 300,
        standardHeaders: "draft-7",
        legacyHeaders: false,
    }),
);

app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        req.get("origin") !== origin
    )
        return res.status(403).json({
            message: "Request origin is not allowed.",
            code: "ORIGIN_REJECTED",
        });
    next();
});

app.use("/api", require("./routes"));

app.use((_req, res) =>
    res.status(404).json({ message: "Endpoint not found." }),
);

// app.use((error, req, res, _next) => {
//     let status = error.status || 500, message = error.message, code = error.code || "INTERNAL_ERROR";
//     if (error.name === "ZodError") {
//         status = 422;
//         message = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
//         code = "VALIDATION_ERROR";
//     }
//     if (error.name === "SequelizeUniqueConstraintError") {
//         status = 409;
//         message = "A record with this unique value already exists.";
//         code = "DUPLICATE_RECORD";
//     }
//     if (error.name === "SequelizeForeignKeyConstraintError") {
//         status = 422;
//         message = "A referenced record is unavailable.";
//         code = "INVALID_REFERENCE";
//     }
//     if (status >= 500) {
//         message = "The service could not complete this request. Please try again.";
//         logger.error(
//             { code, errorType: error.name, requestId: req.id },
//             "Request failed",
//         );
//         require("./models")
//             .SystemLog.create({
//                 level: "error",
//                 code: "REQUEST_FAILED",
//                 message: "An API operation failed.",
//                 userId: req.user?.id,
//             })
//             .catch(() => { });
//     }

//     res.status(status).json({ message, code, requestId: req.id });

// });

app.use((error, req, res, _next) => {
    console.error("");
    console.error(
        "=================================================",
    );
    console.error("🔥 API ERROR");
    console.error(
        "=================================================",
    );

    console.error("Request ID:", req.id);
    console.error("Method:", req.method);
    console.error("URL:", req.originalUrl);

    console.error(
        "Error name:",
        error?.name || "UnknownError",
    );

    console.error(
        "Error message:",
        error?.message || "No error message",
    );

    console.error("Error code:", error?.code);
    console.error("Error status:", error?.status);

    /*
     * Sequelize errors
     */

    if (error?.sql) {
        console.error("SQL:");
        console.error(error.sql);
    }

    if (error?.parent) {
        console.error("Sequelize parent error:");
        console.error(error.parent);
    }

    if (error?.original) {
        console.error("Sequelize original error:");
        console.error(error.original);
    }

    if (error?.parent?.sqlMessage) {
        console.error(
            "SQL MESSAGE:",
            error.parent.sqlMessage,
        );
    }

    if (error?.original?.sqlMessage) {
        console.error(
            "ORIGINAL SQL MESSAGE:",
            error.original.sqlMessage,
        );
    }

    console.error("STACK:");
    console.error(error?.stack);

    console.error(
        "=================================================",
    );
    console.error("");


    let status = error?.status || 500;

    let message =
        error?.message || "Internal server error.";

    let code =
        error?.code || "INTERNAL_ERROR";

    if (error?.name === "ZodError") {
        status = 422;

        message = error.issues
            .map(
                (issue) =>
                    `${issue.path.join(".")}: ${issue.message}`,
            )
            .join("; ");

        code = "VALIDATION_ERROR";
    }

    if (
        error?.name ===
        "SequelizeUniqueConstraintError"
    ) {
        status = 409;

        message =
            "A record with this unique value already exists.";

        code = "DUPLICATE_RECORD";
    }

    if (
        error?.name ===
        "SequelizeForeignKeyConstraintError"
    ) {
        status = 422;

        message =
            "A referenced record is unavailable.";

        code = "INVALID_REFERENCE";
    }

    if (status >= 500) {
        logger.error(
            {
                err: error,
                code,
                errorType: error?.name,
                errorMessage: error?.message,
                requestId: req.id,
                method: req.method,
                url: req.originalUrl,
            },
            "Request failed",
        );

        try {
            const { SystemLog } = require("./models");

            SystemLog.create({
                level: "error",
                code: "REQUEST_FAILED",
                message:
                    error?.message ||
                    "An API operation failed.",
                userId: req.user?.id || null,
            }).catch((logError) => {
                console.error(
                    "Unable to save SystemLog:",
                    logError.message,
                );
            });
        } catch (logError) {
            console.error(
                "Unable to load SystemLog:",
                logError.message,
            );
        }

        if (
            process.env.NODE_ENV === "production"
        ) {
            message =
                "The service could not complete this request. Please try again.";
        }
    }


    const response = {
        message,
        code,
        requestId: req.id,
    };

    if (
        process.env.NODE_ENV === "development" &&
        status >= 500
    ) {
        response.debug = {
            errorType: error?.name || null,

            errorMessage:
                error?.message || null,

            sqlMessage:
                error?.parent?.sqlMessage ||
                error?.original?.sqlMessage ||
                null,
        };
    }

    return res.status(status).json(response);
});

module.exports = app;
