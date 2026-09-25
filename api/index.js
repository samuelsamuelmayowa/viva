require("dotenv").config();

const express = require("express");
const apiApp = require("./api/app.js");

const app = express();

app.disable("x-powered-by");

// Your existing Express application
app.use(apiApp);

module.exports = app;