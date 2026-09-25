const { DataTypes: D } = require('sequelize');
const ref = table => ({ type: D.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT' });
const amount = () => ({ type: D.DECIMAL(18, 2), allowNull: false });
const common = () => ({ id: { type: D.UUID, primaryKey: true }, locationId: ref('locations'), createdBy: ref('users'), createdAt: { type: D.DATE, allowNull: false }, updatedAt: { type: D.DATE, allowNull: false } });
exports.up = async qi => {
 await qi.createTable('finance_accounts', { ...common(), name: { type: D.STRING, allowNull: false }, openingBalance: { ...amount(), defaultValue: 0 } });
 await qi.createTable('sales', { ...common(), number: { type: D.STRING(64), unique: true, allowNull: false }, movementId: { ...ref('inventory_transactions'), unique: true }, customer: { type: D.STRING, allowNull: false }, saleDate: { type: D.DATEONLY, allowNull: false }, quantity: { type: D.DECIMAL(18, 3), allowNull: false }, unitPrice: amount(), unitCost: amount(), revenue: amount(), costOfGoods: amount() });
 await qi.createTable('cash_entries', { ...common(), operationId: { type: D.UUID, unique: true, allowNull: false }, payloadHash: { type: D.STRING(64), allowNull: false }, number: { type: D.STRING(64), unique: true, allowNull: false }, accountId: ref('finance_accounts'), kind: { type: D.STRING(32), allowNull: false }, direction: { type: D.STRING(8), allowNull: false }, amount: amount(), saleId: { ...ref('sales'), allowNull: true }, expenseId: { ...ref('expenses'), allowNull: true }, entryDate: { type: D.DATEONLY, allowNull: false }, reference: D.STRING, description: { type: D.STRING, allowNull: false } });
 await qi.addIndex('cash_entries', ['locationId', 'entryDate']);
 const { Role, Permission } = require('../models');
 const [permission] = await Permission.findOrCreate({ where: { key: 'finance.write' } });
 for (const name of ['Admin', 'Accountant']) { const role = await Role.findOne({ where: { name } }); if (role) await role.addPermission(permission); }
};
