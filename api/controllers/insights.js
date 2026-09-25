const { Op, fn, col, literal } = require("sequelize");
const m = require("../models");
const { scope, can } = require("../middleware/auth");
const { assert } = require("../utils/errors");
const { configs, filters } = require("./resources");
async function dashboard(req, res) {
    if (
        can(req.user, "distribution.read") &&
        !can(req.user, "inventory.read")
    )
        return distribution(req, res);
    const scoped = scope(req.user),
        warehouseWhere = { ...scoped };
    if (req.query.locationId)
        warehouseWhere[Op.and] = [scoped, { locationId: req.query.locationId }];
    const warehouses = await m.Warehouse.findAll({
        where: warehouseWhere,
        attributes: ["id", "name", "locationId"],
    });
    const warehouseIds = warehouses.map((w) => w.id);
    const movementWhere = { warehouseId: { [Op.in]: warehouseIds } };
    const inventory = can(req.user, "inventory.read")
        ? await m.Inventory.findAll({ where: movementWhere, include: [m.Product] })
        : [];
    const finance = can(req.user, "finance.read");
    const since = new Date(Date.now() - 30 * 86400000);
    const movementTotals = can(req.user, "inventory.read")
        ? await m.Movement.findAll({
            attributes: ["type", [fn("SUM", col("quantity")), "total"]],
            where: { ...movementWhere, occurredAt: { [Op.gte]: since } },
            group: ["type"],
            raw: true,
        })
        : [];
    const recent = can(req.user, "inventory.read")
        ? await m.Movement.findAll({
            where: movementWhere,
            attributes: [
                "id",
                "number",
                "type",
                "quantity",
                "occurredAt",
                "status",
            ],
            include: [
                { model: m.Product, attributes: ["name", "sku"] },
                { model: m.Warehouse, attributes: ["name"] },
            ],
            order: [["createdAt", "DESC"]],
            limit: 6,
        })
        : [];
    const expensesWhere = {
        [Op.and]: [
            scoped,
            ...(req.query.locationId ? [{ locationId: req.query.locationId }] : []),
        ],
    };
    const expenses = finance
        ? await m.Expense.sum("amount", {
            where: {
                ...expensesWhere,
                status: "approved",
                expenseDate: { [Op.gte]: since.toISOString().slice(0, 10) },
            },
        })
        : null;
    const pending = can(req.user, "approvals.read")
        ? await m.Approval.count({
            where: {
                ...scoped,
                status: "pending",
                ...(!can(req.user, "approvals.review")
                    ? { requestedBy: req.user.id }
                    : {}),
            },
        })
        : 0;
    const trend = can(req.user, "inventory.read")
        ? await m.Movement.findAll({
            attributes: [
                [fn("DATE", col("occurredAt")), "date"],
                "type",
                [fn("SUM", col("quantity")), "quantity"],
            ],
            where: { ...movementWhere, occurredAt: { [Op.gte]: since } },
            group: [fn("DATE", col("occurredAt")), "type"],
            order: [[fn("DATE", col("occurredAt")), "ASC"]],
            raw: true,
        })
        : [];
    const expenseTrend = finance
        ? await m.Expense.findAll({
            attributes: ["expenseDate", [fn("SUM", col("amount")), "amount"]],
            where: {
                ...expensesWhere,
                status: "approved",
                expenseDate: { [Op.gte]: since.toISOString().slice(0, 10) },
            },
            group: ["expenseDate"],
            order: [["expenseDate", "ASC"]],
            raw: true,
        })
        : [];
    const lowStock = inventory
        .filter(
            (i) =>
                Number(i.quantity) - Number(i.reserved) <=
                Number(i.product?.minimumStock),
        )
        .slice(0, 8)
        .map((i) => ({
            id: i.id,
            name: i.product?.name,
            sku: i.product?.sku,
            available: Number(i.quantity) - Number(i.reserved),
            minimum: Number(i.product?.minimumStock),
            warehouse: warehouses.find((w) => w.id === i.warehouseId)?.name,
        }));
    const total = (type) =>
        Number(movementTotals.find((x) => x.type === type)?.total || 0);
    res.json({
        role: req.user.roles[0],
        warehouseCount: warehouses.length,
        totalInventory: inventory.reduce((n, i) => n + Number(i.quantity), 0),
        stockValue: finance
            ? inventory.reduce(
                (n, i) => n + Number(i.quantity) * Number(i.product?.costPrice || 0),
                0,
            )
            : null,
        incoming: total("incoming"),
        outgoing: total("outgoing"),
        distribution: total("distributor_allocation"),
        expenses: Number(expenses || 0),
        pending,
        recent,
        trend,
        expenseTrend,
        lowStock,
        warehouseComparison: warehouses.map((w) => ({
            id: w.id,
            name: w.name,
            quantity: inventory
                .filter((i) => i.warehouseId === w.id)
                .reduce((n, i) => n + Number(i.quantity), 0),
        })),
    });
}
async function distribution(req, res) {
    const distributor = await m.Distributor.findOne({
        where: { userId: req.user.id, active: true },
    });
    const records = distributor
        ? await m.Movement.findAll({
            where: { distributorId: distributor.id },
            attributes: [
                "id",
                "number",
                "type",
                "quantity",
                "status",
                "occurredAt",
                "reference",
                "delivery",
            ],
            include: [{ model: m.Product, attributes: ["name", "sku", "unit"] }],
            order: [["occurredAt", "DESC"]],
            limit: 200,
        })
        : [];
    res.json({
        distributor: distributor
            ? { id: distributor.id, name: distributor.name }
            : null,
        data: records,
        total: records.length,
    });
}
async function health(req, res) {
    let database = "healthy";
    try {
        await m.sequelize.authenticate();
    } catch {
        database = "critical";
    }
    if (database === "critical")
        return res
            .status(503)
            .json({
                status: "critical",
                api: "healthy",
                database,
                errors: [],
                conflicts: 0,
            });
    const [errors, conflicts, negative, loginFailures] = await Promise.all([
        m.SystemLog.findAll({
            where: { resolvedAt: null },
            order: [["createdAt", "DESC"]],
            limit: 30,
        }),
        m.SyncOperation.count({ where: { status: "conflict" } }),
        m.Inventory.count({ where: { quantity: { [Op.lt]: 0 } } }),
        m.SystemLog.count({
            where: {
                code: "LOGIN_FAILED",
                createdAt: { [Op.gte]: new Date(Date.now() - 3600000) },
            },
        }),
    ]);
    res.json({
        status: negative
            ? "critical"
            : errors.length || conflicts
                ? "warning"
                : "healthy",
        api: "healthy",
        database,
        conflicts,
        negativeStock: negative,
        loginFailures,
        errors,
        time: new Date().toISOString(),
    });
}
const reportPermissions = {
    inventory: "inventory.read",
    incoming: "inventory.read",
    outgoing: "inventory.read",
    movements: "inventory.read",
    warehouses: "locations.read",
    locations: "locations.read",
    expenses: "finance.read",
    distributors: "distributors.read",
    audit: "audit.read",
    approvals: "approvals.read",
    damaged: "inventory.read",
};
async function report(req, res) {
    const type = req.params.type;
    assert(reportPermissions[type], 404, "Unknown report.");
    assert(
        can(req.user, reportPermissions[type]),
        403,
        "You cannot access this report.",
    );
    let rows;
    if (type === "inventory") {
        const warehouses = await m.Warehouse.findAll({
            where: {
                [Op.and]: [
                    scope(req.user),
                    ...(req.query.locationId
                        ? [{ locationId: req.query.locationId }]
                        : []),
                ],
            },
            attributes: ["id"],
        });
        rows = await m.Inventory.findAll({
            where: {
                warehouseId: { [Op.in]: warehouses.map((w) => w.id) },
                ...(req.query.warehouseId
                    ? { [Op.and]: [{ warehouseId: req.query.warehouseId }] }
                    : {}),
                ...(req.query.productId ? { productId: req.query.productId } : {}),
            },
            limit: 10000,
        });
    } else {
        const config =
            type === "damaged"
                ? { ...configs.movements, fixed: { type: "damaged" } }
                : configs[type];
        rows = await config.model.findAll({
            where: filters(req, config),
            limit: 10000,
            order: [["createdAt", "DESC"]],
        });
    }
    const data = rows.map((row) => {
        const r = row.toJSON();
        if (!can(req.user, "finance.read")) {
            delete r.cost;
            delete r.costPrice;
            delete r.sellingPrice;
        }
        return r;
    });
    if (req.query.format !== "csv")
        return res.json({ data, total: data.length, limit: 10000 });
    const keys = data.length ? Object.keys(data[0]) : ["No records"];
    const cell = (value) => {
        let str =
            value == null
                ? ""
                : typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value);
        if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
        return `"${str.replaceAll('"', '""')}"`;
    };
    res
        .set("Content-Type", "text/csv; charset=utf-8")
        .set("Content-Disposition", `attachment; filename="viva-${type}.csv"`)
        .send(
            "\uFEFF" +
            [
                keys.map(cell).join(","),
                ...data.map((row) => keys.map((k) => cell(row[k])).join(",")),
            ].join("\r\n"),
        );
}
module.exports = { dashboard, distribution, health, report };
