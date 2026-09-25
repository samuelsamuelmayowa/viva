require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { rateLimit } = require("express-rate-limit");

const logger = require("./utils/logger");

const app = express();

app.disable("x-powered-by");


if (process.env.TRUST_PROXY === "1") {
    app.set("trust proxy", 1);
}

const allowedOrigins = [
    "http://localhost:5173",
    "https://vivafrontend-teal.vercel.app",
];

// Add APP_ORIGIN from environment variables
if (process.env.APP_ORIGIN) {
    const envOrigin = process.env.APP_ORIGIN
        .trim()
        .replace(/\/$/, "");

    if (
        process.env.NODE_ENV === "production" &&
        !envOrigin.startsWith("https://")
    ) {
        throw new Error(
            "Production APP_ORIGIN must use HTTPS."
        );
    }

    if (!allowedOrigins.includes(envOrigin)) {
        allowedOrigins.push(envOrigin);
    }
}

app.use(
    helmet(),

    cors({
        origin: (requestOrigin, callback) => {
            // Allow requests with no Origin header
            // Example: curl, server-to-server, health checks
            if (!requestOrigin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(requestOrigin)) {
                return callback(null, true);
            }

            return callback(
                new Error(
                    `CORS blocked origin: ${requestOrigin}`
                )
            );
        },

        credentials: true,

        methods: [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "OPTIONS",
        ],

        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-CSRF-Token",
        ],
    }),

    express.json({
        limit: "256kb",
    }),

    cookieParser(),
);


// ========================================
// REQUEST LOGGER
// ========================================

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

            res: (res) => ({
                statusCode: res.statusCode,
            }),
        },

        autoLogging:
            process.env.NODE_ENV !== "test",
    })
);


// ========================================
// HEALTH CHECKS
// ========================================

app.get("/", (_req, res) => {
    return res.status(200).json({
        status: "ok",
        message: "VIVA Backend API is running",
        environment:
            process.env.NODE_ENV || "development",
    });
});

app.get("/health", (_req, res) => {
    return res.status(200).json({
        status: "ok",
    });
});


// ========================================
// API RATE LIMITING
// ========================================

app.use(
    "/api",

    rateLimit({
        windowMs: 60 * 1000,
        limit: 300,

        standardHeaders: "draft-7",
        legacyHeaders: false,
    })
);


// ========================================
// API SECURITY
// ========================================

app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");

    const safeMethods = [
        "GET",
        "HEAD",
        "OPTIONS",
    ];

    // For changing requests such as POST/PUT/PATCH/DELETE,
    // verify that the browser Origin is allowed.
    if (!safeMethods.includes(req.method)) {
        const requestOrigin = req.get("origin");

        if (
            requestOrigin &&
            !allowedOrigins.includes(requestOrigin)
        ) {
            return res.status(403).json({
                message:
                    "Request origin is not allowed.",
                code: "ORIGIN_REJECTED",
            });
        }
    }

    next();
});


// ========================================
// API ROUTES
// ========================================

app.use(
    "/api",
    require("./routes")
);


// ========================================
// 404 HANDLER
// ========================================

app.use((_req, res) => {
    return res.status(404).json({
        message: "Endpoint not found.",
        code: "NOT_FOUND",
    });
});


// ========================================
// ERROR HANDLER
// ========================================

app.use((error, req, res, _next) => {
    console.error("");
    console.error(
        "================================================="
    );
    console.error("🔥 API ERROR");
    console.error(
        "================================================="
    );

    console.error(
        "Request ID:",
        req.id
    );

    console.error(
        "Method:",
        req.method
    );

    console.error(
        "URL:",
        req.originalUrl
    );

    console.error(
        "Error name:",
        error?.name || "UnknownError"
    );

    console.error(
        "Error message:",
        error?.message || "No error message"
    );

    console.error(
        "Error code:",
        error?.code
    );

    console.error(
        "Error status:",
        error?.status
    );


    // ========================================
    // SEQUELIZE DEBUGGING
    // ========================================

    if (error?.sql) {
        console.error("SQL:");
        console.error(error.sql);
    }

    if (error?.parent) {
        console.error(
            "Sequelize parent error:"
        );

        console.error(
            error.parent
        );
    }

    if (error?.original) {
        console.error(
            "Sequelize original error:"
        );

        console.error(
            error.original
        );
    }

    if (error?.parent?.sqlMessage) {
        console.error(
            "SQL MESSAGE:",
            error.parent.sqlMessage
        );
    }

    if (error?.original?.sqlMessage) {
        console.error(
            "ORIGINAL SQL MESSAGE:",
            error.original.sqlMessage
        );
    }

    console.error("STACK:");

    console.error(
        error?.stack
    );

    console.error(
        "================================================="
    );

    console.error("");


    // ========================================
    // DEFAULT ERROR RESPONSE
    // ========================================

    let status =
        error?.status ||
        error?.statusCode ||
        500;

    let message =
        error?.message ||
        "Internal server error.";

    let code =
        error?.code ||
        "INTERNAL_ERROR";


    // ========================================
    // ZOD VALIDATION
    // ========================================

    if (error?.name === "ZodError") {
        status = 422;

        message = error.issues
            .map(
                (issue) =>
                    `${issue.path.join(".")}: ${issue.message}`
            )
            .join("; ");

        code =
            "VALIDATION_ERROR";
    }


    // ========================================
    // SEQUELIZE UNIQUE
    // ========================================

    if (
        error?.name ===
        "SequelizeUniqueConstraintError"
    ) {
        status = 409;

        message =
            "A record with this unique value already exists.";

        code =
            "DUPLICATE_RECORD";
    }


    // ========================================
    // SEQUELIZE FOREIGN KEY
    // ========================================

    if (
        error?.name ===
        "SequelizeForeignKeyConstraintError"
    ) {
        status = 422;

        message =
            "A referenced record is unavailable.";

        code =
            "INVALID_REFERENCE";
    }


    // ========================================
    // SERVER ERROR LOGGING
    // ========================================

    if (status >= 500) {
        logger.error(
            {
                err: error,

                code,

                errorType:
                    error?.name,

                errorMessage:
                    error?.message,

                requestId:
                    req.id,

                method:
                    req.method,

                url:
                    req.originalUrl,
            },

            "Request failed"
        );


        // Try to save the error in SystemLog
        try {
            const {
                SystemLog,
            } = require("./models");

            SystemLog.create({
                level: "error",

                code:
                    "REQUEST_FAILED",

                message:
                    error?.message ||
                    "An API operation failed.",

                userId:
                    req.user?.id ||
                    null,
            }).catch((logError) => {
                console.error(
                    "Unable to save SystemLog:",
                    logError.message
                );
            });

        } catch (logError) {
            console.error(
                "Unable to load SystemLog:",
                logError.message
            );
        }


        // Never expose internal server
        // errors in production
        if (
            process.env.NODE_ENV ===
            "production"
        ) {
            message =
                "The service could not complete this request. Please try again.";
        }
    }


    // ========================================
    // RESPONSE
    // ========================================

    const response = {
        message,
        code,
        requestId:
            req.id,
    };


    // Only expose debugging information locally
    if (
        process.env.NODE_ENV ===
            "development" &&
        status >= 500
    ) {
        response.debug = {
            errorType:
                error?.name ||
                null,

            errorMessage:
                error?.message ||
                null,

            sqlMessage:
                error?.parent?.sqlMessage ||
                error?.original?.sqlMessage ||
                null,
        };
    }


    return res
        .status(status)
        .json(response);
});


module.exports = app;
