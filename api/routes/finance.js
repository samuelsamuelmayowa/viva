const router = require("express").Router();
const { permit } = require("../middleware/auth");
const finance = require("../services/finance");
router.use(permit("finance.read"));
// router.get("/", async (req, res) => res.json(await finance.summary(req)));

router.get("/", async (req, res, next) => {
    try {
        console.log("=== FINANCE SUMMARY START ===");
        console.log("User:", req.user?.id);
        console.log("Query:", req.query);

        const result = await finance.summary(req);

        console.log("=== FINANCE SUMMARY SUCCESS ===");

        res.json(result);
    } catch (error) {
        console.error("====================================");
        console.error("FINANCE SUMMARY FAILED");
        console.error("Name:", error.name);
        console.error("Message:", error.message);
        console.error("SQL:", error.sql);
        console.error("Parent:", error.parent);
        console.error("Original:", error.original);
        console.error("Stack:", error.stack);
        console.error("====================================");

        next(error);
    }
});
router.get("/dispatches", async (req, res) => {
    const { Movement } = require("../models");
    const { Sale } = require("../models/finance");
    const { scope } = require("../middleware/auth");
    const { Op } = require("sequelize");
    const sales = await Sale.findAll({
        where: scope(req.user),
        attributes: ["movementId"],
    });
    res.json(
        await Movement.findAll({
            where: {
                ...scope(req.user),
                type: { [Op.in]: ["outgoing", "distributor_allocation"] },
                ...(sales.length
                    ? { id: { [Op.notIn]: sales.map((s) => s.movementId) } }
                    : {}),
            },
            attributes: ["id", "number", "quantity", "counterparty", "locationId"],
            order: [["occurredAt", "DESC"]],
        }),
    );
});
for (const [path, handler] of [
    ["accounts", finance.createAccount],
    ["sales", finance.createSale],
    ["cash", finance.postCash],
])
    router.post("/" + path, permit("finance.write"), async (req, res) =>
        res.status(201).json(await handler(req)),
    );
module.exports = router;
