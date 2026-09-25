const Decimal = require("decimal.js");
const { Op } = require("sequelize");
const { sequelize, Location, Movement, Expense } = require("../models");
const { Account, Sale, CashEntry } = require("../models/finance");
const { z } = require("../validators");
const { checkLocation, scope } = require("../middleware/auth");
const { assert } = require("../utils/errors");
const { reference, hash } = require("../utils/crypto");
const { audit } = require("./audit");
const uuid = z.string().uuid();
const money = z.coerce
    .number()
    .finite()
    .nonnegative()
    .max(999999999)
    .multipleOf(0.01);
const text = z.string().trim().min(1).max(255);
const date = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
        (v) =>
            !Number.isNaN(Date.parse(v)) &&
            new Date(v).toISOString().slice(0, 10) === v &&
            v <= new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }),
        "Use a valid date, no later than today.",
    );
const kinds = {
    customer_payment: "in",
    other_income: "in",
    capital: "in",
    loan_received: "in",
    expense_payment: "out",
    supplier_payment: "out",
    loan_repayment: "out",
    owner_withdrawal: "out",
};
const total = (rows, field) =>
    rows.reduce((sum, row) => sum.plus(row[field]), new Decimal(0));
async function createAccount(req) {
    const data = z
        .object({ name: text, locationId: uuid, openingBalance: money.default(0) })
        .strict()
        .parse(req.body);
    checkLocation(req.user, data.locationId);
    return sequelize.transaction(async (transaction) => {
        assert(
            await Location.findByPk(data.locationId, { transaction }),
            404,
            "Location not found.",
        );
        const record = await Account.create(
            { ...data, createdBy: req.user.id },
            { transaction },
        );
        await audit(
            req,
            "create",
            "finance_accounts",
            record,
            null,
            record.toJSON(),
            transaction,
        );
        return record;
    });
}

async function createSale(req) {
    const data = z
        .object({
            movementId: uuid,
            customer: text,
            saleDate: date,
            unitPrice: money,
            unitCost: money,
        })
        .strict()
        .parse(req.body);
    return sequelize.transaction(async (transaction) => {
        const movement = await Movement.findByPk(data.movementId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        assert(
            movement &&
            ["outgoing", "distributor_allocation"].includes(movement.type),
            422,
            "Select an outgoing goods or distributor allocation record.",
        );
        checkLocation(req.user, movement.locationId);
        assert(
            !(await Sale.findOne({
                where: { movementId: movement.id },
                transaction,
            })),
            409,
            "This dispatch already has a sale.",
        );
        assert(
            data.saleDate >=
            new Date(movement.occurredAt).toLocaleDateString("en-CA", {
                timeZone: "Africa/Lagos",
            }),
            422,
            "Sale date cannot precede dispatch.",
        );
        const record = await Sale.create(
            {
                ...data,
                number: reference("SAL"),
                locationId: movement.locationId,
                quantity: movement.quantity,
                revenue: new Decimal(movement.quantity)
                    .times(data.unitPrice)
                    .toFixed(2),
                costOfGoods: new Decimal(movement.quantity)
                    .times(data.unitCost)
                    .toFixed(2),
                createdBy: req.user.id,
            },
            { transaction },
        );
        await audit(
            req,
            "create",
            "sales",
            record,
            null,
            record.toJSON(),
            transaction,
        );
        return record;
    });
}

async function postCash(req) {
    const data = z
        .object({
            operationId: uuid,
            accountId: uuid,
            kind: z.enum(Object.keys(kinds)),
            amount: money.positive(),
            saleId: uuid.optional(),
            expenseId: uuid.optional(),
            entryDate: date,
            description: text,
            reference: z.string().trim().max(255).default(""),
        })
        .strict()
        .parse(req.body);
    assert(
        (data.kind === "customer_payment") === !!data.saleId,
        422,
        "Customer payments require a sale; other entries cannot link a sale.",
    );
    assert(
        (data.kind === "expense_payment") === !!data.expenseId,
        422,
        "Expense payments require an approved expense; other entries cannot link an expense.",
    );
    return sequelize.transaction(async (transaction) => {
        const account = await Account.findByPk(data.accountId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        assert(account, 404, "Account not found.");
        checkLocation(req.user, account.locationId);
        const payloadHash = hash(JSON.stringify(data));
        const existing = await CashEntry.findOne({
            where: { operationId: data.operationId },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (existing) {
            assert(
                existing.createdBy === req.user.id &&
                existing.payloadHash === payloadHash,
                409,
                "Operation ID already used.",
            );
            return existing;
        }
        if (data.saleId || data.expenseId) {
            const model = data.saleId ? Sale : Expense,
                field = data.saleId ? "saleId" : "expenseId";
            const record = await model.findByPk(data[field], {
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            assert(
                record && record.locationId === account.locationId,
                422,
                "Record and account must belong to the same location.",
            );
            if (data.expenseId)
                assert(
                    record.status === "approved",
                    422,
                    "Only approved expenses can be paid.",
                );
            assert(
                data.entryDate >= (data.saleId ? record.saleDate : record.expenseDate),
                422,
                "Payment cannot precede the business record.",
            );
            const paid = await CashEntry.findAll({
                where: { [field]: record.id },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            assert(
                total(paid, "amount")
                    .plus(data.amount)
                    .lte(data.saleId ? record.revenue : record.amount),
                409,
                "Payment exceeds the outstanding amount.",
            );
        }
        if (kinds[data.kind] === "out") {
            const entries = await CashEntry.findAll({
                where: { accountId: account.id },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            const balance = entries.reduce(
                (v, row) =>
                    row.direction === "in" ? v.plus(row.amount) : v.minus(row.amount),
                new Decimal(account.openingBalance),
            );
            assert(
                balance.gte(data.amount),
                409,
                "Insufficient recorded account balance. Record missing receipts first.",
            );
        }
        const record = await CashEntry.create(
            {
                ...data,
                number: reference("CASH"),
                payloadHash,
                direction: kinds[data.kind],
                locationId: account.locationId,
                createdBy: req.user.id,
            },
            { transaction },
        );
        await audit(
            req,
            "create",
            "cash_entries",
            record,
            null,
            record.toJSON(),
            transaction,
        );
        return record;
    });
}

// async function summary(req) {
//     const query = z
//         .object({
//             from: date.optional(),
//             to: date.optional(),
//             locationId: uuid.optional(),
//         })
//         .strict()
//         .parse(req.query);
//     assert(
//         !query.from || !query.to || query.from <= query.to,
//         422,
//         "Start date must precede end date.",
//     );
//     const where = scope(req.user);
//     if (query.locationId) {
//         checkLocation(req.user, query.locationId);
//         where.locationId = query.locationId;
//     }
//     const inPeriod = (value) =>
//         (!query.from || value >= query.from) && (!query.to || value <= query.to);
//     return sequelize.transaction(
//         { isolationLevel: "REPEATABLE READ", readOnly: true },
//         async (transaction) => {
//             const [accounts, sales, cash, expenses] = await Promise.all([
//                 Account.findAll({ where, transaction }),
//                 Sale.findAll({ where, order: [["saleDate", "DESC"]], transaction }),
//                 CashEntry.findAll({
//                     where,
//                     order: [["entryDate", "DESC"]],
//                     transaction,
//                 }),
//                 Expense.findAll({
//                     where: { ...where, status: "approved" },
//                     transaction,
//                 }),
//             ]);
//             const entries = cash.filter((r) => inPeriod(r.entryDate)),
//                 periodSales = sales.filter((r) => inPeriod(r.saleDate));
//             const revenue = total(periodSales, "revenue"),
//                 cost = total(periodSales, "costOfGoods"),
//                 costs = total(
//                     expenses.filter((r) => inPeriod(r.expenseDate)),
//                     "amount",
//                 );
//             const cashIn = total(
//                 entries.filter((r) => r.direction === "in"),
//                 "amount",
//             ),
//                 cashOut = total(
//                     entries.filter((r) => r.direction === "out"),
//                     "amount",
//                 ),
//                 otherIncome = total(
//                     entries.filter((r) => r.kind === "other_income"),
//                     "amount",
//                 );
//             return {
//                 totals: {
//                     cashIn: cashIn.toFixed(2),
//                     cashOut: cashOut.toFixed(2),
//                     netCash: cashIn.minus(cashOut).toFixed(2),
//                     revenue: revenue.toFixed(2),
//                     costOfGoods: cost.toFixed(2),
//                     grossProfit: revenue.minus(cost).toFixed(2),
//                     expenses: costs.toFixed(2),
//                     otherIncome: otherIncome.toFixed(2),
//                     operatingProfit: revenue
//                         .minus(cost)
//                         .minus(costs)
//                         .plus(otherIncome)
//                         .toFixed(2),
//                 },
//                 accounts: accounts.map((a) => ({
//                     ...a.toJSON(),
//                     balance: cash
//                         .filter((r) => r.accountId === a.id)
//                         .reduce(
//                             (v, r) =>
//                                 r.direction === "in" ? v.plus(r.amount) : v.minus(r.amount),
//                             new Decimal(a.openingBalance),
//                         )
//                         .toFixed(2),
//                 })),
//                 sales: sales.map((s) => ({
//                     ...s.toJSON(),
//                     outstanding: new Decimal(s.revenue)
//                         .minus(
//                             total(
//                                 cash.filter((r) => r.saleId === s.id),
//                                 "amount",
//                             ),
//                         )
//                         .toFixed(2),
//                 })),
//                 expenses: expenses.map((e) => ({
//                     ...e.toJSON(),
//                     outstanding: new Decimal(e.amount)
//                         .minus(
//                             total(
//                                 cash.filter((r) => r.expenseId === e.id),
//                                 "amount",
//                             ),
//                         )
//                         .toFixed(2),
//                 })),
//                 entries: entries.map((r) => {
//                     const { payloadHash: _hash, ...data } = r.toJSON();
//                     return data;
//                 }),
//             };
//         },
//     );
// }

async function summary(req) {
    const query = z
        .object({
            from: date.optional(),
            to: date.optional(),
            locationId: uuid.optional(),
        })
        .strict()
        .parse(req.query);

    assert(
        !query.from || !query.to || query.from <= query.to,
        422,
        "Start date must precede end date.",
    );

    const where = { ...(scope(req.user) || {}) };

    if (query.locationId) {
        checkLocation(req.user, query.locationId);
        where.locationId = query.locationId;
    }

    const inPeriod = (value) => {
        if (!value) return false;

        const normalized =
            value instanceof Date
                ? value.toISOString().slice(0, 10)
                : String(value).slice(0, 10);

        return (
            (!query.from || normalized >= query.from) &&
            (!query.to || normalized <= query.to)
        );
    };

    const decimal = (value) => {
        if (value === null || value === undefined || value === "") {
            return new Decimal(0);
        }

        return new Decimal(value);
    };

    const safeTotal = (rows, field) =>
        rows.reduce(
            (sum, row) => sum.plus(decimal(row[field])),
            new Decimal(0),
        );

    return sequelize.transaction(
        {
            isolationLevel: "REPEATABLE READ",
            readOnly: true,
        },
        async (transaction) => {
            let accounts;
            let sales;
            let cash;
            let expenses;

            try {
                accounts = await Account.findAll({
                    where,
                    transaction,
                });
            } catch (error) {
                console.error("FINANCE Account.findAll FAILED:", error);
                throw new Error(
                    `Finance accounts query failed: ${error.message}`,
                );
            }

            try {
                sales = await Sale.findAll({
                    where,
                    order: [["saleDate", "DESC"]],
                    transaction,
                });
            } catch (error) {
                console.error("FINANCE Sale.findAll FAILED:", error);
                throw new Error(
                    `Finance sales query failed: ${error.message}`,
                );
            }

            try {
                cash = await CashEntry.findAll({
                    where,
                    order: [["entryDate", "DESC"]],
                    transaction,
                });
            } catch (error) {
                console.error("FINANCE CashEntry.findAll FAILED:", error);
                throw new Error(
                    `Finance cash entries query failed: ${error.message}`,
                );
            }

            try {
                expenses = await Expense.findAll({
                    where: {
                        ...where,
                        status: "approved",
                    },
                    transaction,
                });
            } catch (error) {
                console.error("FINANCE Expense.findAll FAILED:", error);
                throw new Error(
                    `Finance expenses query failed: ${error.message}`,
                );
            }

            const entries = cash.filter((record) =>
                inPeriod(record.entryDate),
            );

            const periodSales = sales.filter((record) =>
                inPeriod(record.saleDate),
            );

            const periodExpenses = expenses.filter((record) =>
                inPeriod(record.expenseDate),
            );

            const revenue = safeTotal(periodSales, "revenue");
            const cost = safeTotal(periodSales, "costOfGoods");
            const costs = safeTotal(periodExpenses, "amount");

            const cashIn = safeTotal(
                entries.filter(
                    (record) => record.direction === "in",
                ),
                "amount",
            );

            const cashOut = safeTotal(
                entries.filter(
                    (record) => record.direction === "out",
                ),
                "amount",
            );

            const otherIncome = safeTotal(
                entries.filter(
                    (record) => record.kind === "other_income",
                ),
                "amount",
            );

            return {
                totals: {
                    cashIn: cashIn.toFixed(2),
                    cashOut: cashOut.toFixed(2),
                    netCash: cashIn.minus(cashOut).toFixed(2),

                    revenue: revenue.toFixed(2),
                    costOfGoods: cost.toFixed(2),
                    grossProfit: revenue.minus(cost).toFixed(2),

                    expenses: costs.toFixed(2),
                    otherIncome: otherIncome.toFixed(2),

                    operatingProfit: revenue
                        .minus(cost)
                        .minus(costs)
                        .plus(otherIncome)
                        .toFixed(2),
                },

                accounts: accounts.map((account) => {
                    const accountCash = cash.filter(
                        (record) =>
                            record.accountId === account.id,
                    );

                    const balance = accountCash.reduce(
                        (value, record) =>
                            record.direction === "in"
                                ? value.plus(
                                      decimal(record.amount),
                                  )
                                : value.minus(
                                      decimal(record.amount),
                                  ),
                        decimal(account.openingBalance),
                    );

                    return {
                        ...account.toJSON(),
                        balance: balance.toFixed(2),
                    };
                }),

                sales: sales.map((sale) => {
                    const payments = safeTotal(
                        cash.filter(
                            (record) =>
                                record.saleId === sale.id,
                        ),
                        "amount",
                    );

                    return {
                        ...sale.toJSON(),

                        outstanding: decimal(sale.revenue)
                            .minus(payments)
                            .toFixed(2),
                    };
                }),

                expenses: expenses.map((expense) => {
                    const payments = safeTotal(
                        cash.filter(
                            (record) =>
                                record.expenseId === expense.id,
                        ),
                        "amount",
                    );

                    return {
                        ...expense.toJSON(),

                        outstanding: decimal(expense.amount)
                            .minus(payments)
                            .toFixed(2),
                    };
                }),

                entries: entries.map((record) => {
                    const {
                        payloadHash: _hash,
                        ...data
                    } = record.toJSON();

                    return data;
                }),
            };
        },
    );
}

module.exports = { createAccount, createSale, postCash, summary, kinds };
