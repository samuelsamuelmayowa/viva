require("dotenv").config();

const app = require("./api/app.js");

const PORT = Number(process.env.PORT) || 10000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ VIVA API running on port ${PORT}`);
});