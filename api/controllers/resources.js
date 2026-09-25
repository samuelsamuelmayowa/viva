const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");
const m = require("../models");
const { scope, checkLocation } = require("../middleware/auth");
const { assert } = require("../utils/errors");
const { reference } = require("../utils/crypto");
const { audit, notifyAdmins } = require("../services/audit");
const { schemas, z } = require("../validators");
const configs = {
    locations: { model: m.Location, search: ["name", "state", "city"] },
    warehouses: { model: m.Warehouse, search: ["name", "code"] },
    products: {
        model: m.Product,
        search: ["name", "sku"],
        include: [m.ProductCategory],
    },
    distributors: { model: m.Distributor, search: ["name", "phone"] },
    expenses: {
        model: m.Expense,
        search: ["number", "description"],
        include: [m.ExpenseCategory],
    },
    incoming: {
        model: m.Movement,
        search: ["number", "reference", "counterparty"],
        fixed: { type: "incoming" },
        include: [m.Product, m.Warehouse],
    },
    outgoing: {
        model: m.Movement,
        search: ["number", "reference", "counterparty"],
        fixed: { type: "outgoing" },
        include: [m.Product, m.Warehouse],
    },
    movements: {
        model: m.Movement,
        search: ["number", "reference"],
        include: [m.Product, m.Warehouse],
    },
    transfers: { model: m.Transfer, search: ["number"] },
    approvals: { model: m.Approval, search: ["reason", "module"] },
    audit: { model: m.Audit, search: ["action", "module"] },
    "product-categories": { model: m.ProductCategory, search: ["name"] },
    "expense-categories": { model: m.ExpenseCategory, search: ["name"] },
    users: {
        model: m.User,
        search: ["name", "email"],
        attributes: ["id", "name", "email", "active", "createdAt"],
        include: [
            {
                model: m.Role,
                attributes: ["id", "name"],
                through: { attributes: [] },
            },
            {
                model: m.Location,
                attributes: ["id", "name"],
                through: { attributes: [] },
            },
        ],
    },
    roles: {
        model: m.Role,
        search: ["name"],
        include: [{ model: m.Permission, through: { attributes: [] } }],
    },
    permissions: { model: m.Permission, search: ["key"] },
};
function filters(req, config) {
    const { model, search, fixed } = config;
    const clauses = [fixed || {}];
    if (model.rawAttributes.locationId) clauses.push(scope(req.user));
    if (model === m.Location && !req.user.organizationWide)
        clauses.push({ id: { [Op.in]: req.user.locationIds } });
    if (model === m.Transfer && !req.user.organizationWide) {
        clauses.pop();
        clauses.push({
            [Op.or]: [
                { locationId: { [Op.in]: req.user.locationIds } },
                { destinationLocationId: { [Op.in]: req.user.locationIds } },
            ],
        });
    }
    if (req.query.q)
        clauses.push({
            [Op.or]: search.map((field) => ({
                [field]: { [Op.like]: `%${String(req.query.q).slice(0, 100)}%` },
            })),
        });
    for (const field of [
        "locationId",
        "warehouseId",
        "productId",
        "status",
        "categoryId",
    ])
        if (req.query[field] && model.rawAttributes[field])
            clauses.push({ [field]: req.query[field] });
    const dateField =
        model === m.Expense
            ? "expenseDate"
            : model === m.Movement
                ? "occurredAt"
                : "createdAt";
    if (req.query.from || req.query.to) {
        const range = {};
        for (const key of ["from", "to"])
            if (req.query[key])
                assert(
                    /^\d{4}-\d{2}-\d{2}$/.test(req.query[key]) &&
                    !isNaN(Date.parse(req.query[key])),
                    422,
                    "Invalid date filter.",
                );
        if (req.query.from) range[Op.gte] = new Date(String(req.query.from));
        if (req.query.to)
            range[Op.lt] = new Date(
                new Date(String(req.query.to)).getTime() + 86400000,
            );
        clauses.push({ [dateField]: range });
    }
    if (
        model === m.Approval &&
        !req.user.permissions.includes("approvals.review")
    )
        clauses.push({ requestedBy: req.user.id });
    return { [Op.and]: clauses };
}
async function list(req, res) {
    const config = configs[req.params.module];
    const page = Math.max(1, Math.min(Number(req.query.page) || 1, 100000));
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 25, 200));
    const result = await config.model.findAndCountAll({
        where: filters(req, config),
        include: config.include,
        attributes: config.attributes,
        order: [["createdAt", "DESC"]],
        distinct: true,
        limit,
        offset: (page - 1) * limit,
    });
    let rows = result.rows.map((r) => r.toJSON());
    if (!req.user.permissions.includes("finance.read"))
        rows = rows.map((row) => {
            delete row.cost;
            delete row.costPrice;
            delete row.sellingPrice;
            if (row.product) {
                delete row.product.costPrice;
                delete row.product.sellingPrice;
            }
            return row;
        });
    res.json({ data: rows, total: result.count, page, limit });
}
async function create(req, res) {
    const module = req.params.module;
    let data = schemas[module]
        ? schemas[module].parse(req.body)
        : z
            .object({ name: z.string().trim().min(1).max(255) })
            .strict()
            .parse(req.body);
    if (data.locationId) checkLocation(req.user, data.locationId);
    const result = await m.sequelize.transaction(async (transaction) => {
        if (data.warehouseId) {
            const warehouse = await m.Warehouse.findByPk(data.warehouseId, {
                transaction,
            });
            assert(
                warehouse?.locationId === data.locationId,
                422,
                "Warehouse must belong to the selected location.",
            );
        }
        if (module === "expenses")
            data = {
                ...data,
                number: reference("EXP"),
                createdBy: req.user.id,
                status: "pending",
            };
        const record = await configs[module].model.create(data, { transaction });
        await audit(
            req,
            "create",
            module,
            record,
            null,
            record.toJSON(),
            transaction,
        );
        if (module === "expenses") {
            await m.Approval.create(
                {
                    module,
                    recordId: record.id,
                    locationId: data.locationId,
                    type: "expense_authorization",
                    originalData: record.toJSON(),
                    proposedData: { status: "approved" },
                    reason: "Authorize recorded expense",
                    requestedBy: req.user.id,
                },
                { transaction },
            );
            await notifyAdmins(
                "Expense approval requested",
                `${record.number} needs authorization.`,
                transaction,
            );
        }
        return record;
    });
    res.status(201).json(result);
}
async function inventory(req, res) {
    const warehouses = await m.Warehouse.findAll({
        where: {
            ...scope(req.user),
            ...(req.query.warehouseId ? { id: req.query.warehouseId } : {}),
            ...(req.query.locationId
                ? { [Op.and]: [scope(req.user), { locationId: req.query.locationId }] }
                : {}),
        },
        attributes: ["id"],
    });
    const where = { warehouseId: { [Op.in]: warehouses.map((w) => w.id) } };
    if (req.query.productId) where.productId = req.query.productId;
    const page = Math.max(1, Number(req.query.page) || 1),
        limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
    const productAttributes = req.user.permissions.includes("finance.read")
        ? undefined
        : { exclude: ["costPrice", "sellingPrice"] };
    const result = await m.Inventory.findAndCountAll({
        where,
        include: [
            {
                model: m.Product,
                attributes: productAttributes,
                ...(req.query.q
                    ? {
                        where: {
                            name: { [Op.like]: `%${String(req.query.q).slice(0, 100)}%` },
                        },
                    }
                    : {}),
            },
            m.Warehouse,
        ],
        limit,
        offset: (page - 1) * limit,
        order: [["updatedAt", "DESC"]],
    });
    res.json({
        data: result.rows.map((row) => ({
            ...row.toJSON(),
            available: Number(row.quantity) - Number(row.reserved),
        })),
        total: result.count,
        page,
        limit,
    });
}
async function createUser(req, res) {
    const data = z
        .object({
            name: z.string().trim().min(2).max(255),
            email: z.string().email().max(255),
            password: z.string().min(12).max(128),
            roleIds: z.array(z.string().uuid()).min(1),
            locationIds: z.array(z.string().uuid()).default([]),
        })
        .strict()
        .parse(req.body);
    const result = await m.sequelize.transaction(async (transaction) => {
        const user = await m.User.create(
            {
                name: data.name,
                email: data.email.toLowerCase(),
                passwordHash: await bcrypt.hash(data.password, 12),
            },
            { transaction },
        );
        await user.setRoles(data.roleIds, { transaction });
        await user.setLocations(data.locationIds, { transaction });
        await audit(
            req,
            "user_management",
            "users",
            user,
            null,
            {
                name: user.name,
                email: user.email,
                roleIds: data.roleIds,
                locationIds: data.locationIds,
            },
            transaction,
        );
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            active: user.active,
        };
    });
    res.status(201).json(result);
}
async function updateUser(req, res) {
    const data = z
        .object({
            active: z.boolean().optional(),
            roleIds: z.array(z.string().uuid()).min(1).optional(),
            locationIds: z.array(z.string().uuid()).optional(),
        })
        .strict()
        .parse(req.body);
    assert(
        req.params.id !== req.user.id,
        422,
        "Another administrator must change your access.",
    );
    await m.sequelize.transaction(async (transaction) => {
        const user = await m.User.findByPk(req.params.id, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        assert(user, 404, "User not found.");
        const before = {
            active: user.active,
            roleIds: (await user.getRoles({ transaction })).map((r) => r.id),
            locationIds: (await user.getLocations({ transaction })).map((l) => l.id),
        };
        if (data.active !== undefined)
            await user.update({ active: data.active }, { transaction });
        if (data.roleIds) await user.setRoles(data.roleIds, { transaction });
        if (data.locationIds)
            await user.setLocations(data.locationIds, { transaction });
        await m.Session.destroy({ where: { userId: user.id }, transaction });
        await audit(
            req,
            "permission_changes",
            "users",
            user,
            before,
            data,
            transaction,
        );
    });
    res.json({ ok: true });
}
async function createRole(req, res) {
    const data = z
        .object({
            name: z.string().trim().min(2).max(64),
            organizationWide: z.boolean(),
            permissionIds: z.array(z.string().uuid()),
        })
        .strict()
        .parse(req.body);
    const role = await m.sequelize.transaction(async (transaction) => {
        const r = await m.Role.create(data, { transaction });
        await r.setPermissions(data.permissionIds, { transaction });
        await audit(req, "role_changes", "roles", r, null, data, transaction);
        return r;
    });
    res.status(201).json(role);
}
module.exports = {
    configs,
    filters,
    list,
    create,
    inventory,
    createUser,
    updateUser,
    createRole,
};
