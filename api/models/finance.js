const { DataTypes: D } = require("sequelize");
const { sequelize } = require("./index");
const id = () => ({ type: D.UUID, primaryKey: true, defaultValue: D.UUIDV4 });
const ref = (table) => ({
    type: D.UUID,
    allowNull: false,
    references: { model: table, key: "id" },
});
const amount = () => ({ type: D.DECIMAL(18, 2), allowNull: false });
const Account = sequelize.define(
    "finance_account",
    {
        id: id(),
        name: { type: D.STRING, allowNull: false },
        locationId: ref("locations"),
        openingBalance: { ...amount(), defaultValue: 0 },
        createdBy: ref("users"),
    },
    { tableName: "finance_accounts" },
);
const Sale = sequelize.define(
    "sale",
    {
        id: id(),
        number: { type: D.STRING(64), unique: true, allowNull: false },
        movementId: { ...ref("inventory_transactions"), unique: true },
        locationId: ref("locations"),
        customer: { type: D.STRING, allowNull: false },
        saleDate: { type: D.DATEONLY, allowNull: false },
        quantity: { type: D.DECIMAL(18, 3), allowNull: false },
        unitPrice: amount(),
        unitCost: amount(),
        revenue: amount(),
        costOfGoods: amount(),
        createdBy: ref("users"),
    },
    { tableName: "sales" },
);
const CashEntry = sequelize.define(
    "cash_entry",
    {
        id: id(),
        operationId: { type: D.UUID, unique: true, allowNull: false },
        payloadHash: { type: D.STRING(64), allowNull: false },
        number: { type: D.STRING(64), unique: true, allowNull: false },
        accountId: ref("finance_accounts"),
        locationId: ref("locations"),
        kind: { type: D.STRING(32), allowNull: false },
        direction: { type: D.STRING(8), allowNull: false },
        amount: amount(),
        saleId: { ...ref("sales"), allowNull: true },
        expenseId: { ...ref("expenses"), allowNull: true },
        entryDate: { type: D.DATEONLY, allowNull: false },
        reference: D.STRING,
        description: { type: D.STRING, allowNull: false },
        createdBy: ref("users"),
    },
    {
        tableName: "cash_entries",
        indexes: [
            { fields: ["locationId", "entryDate"] },
            { fields: ["accountId"] },
        ],
    },
);
module.exports = { Account, Sale, CashEntry };
