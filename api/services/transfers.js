const { sequelize, Transfer, Warehouse, Inventory, Movement, Product } = require('../models');
const { checkLocation, can } = require('../middleware/auth');
const { assert } = require('../utils/errors');
const { reference } = require('../utils/crypto');
const { audit, notifyAdmins } = require('./audit');
const { stockChange } = require('./stockMath');
async function createTransfer(req, data) {
 return sequelize.transaction(async transaction => {
  const source = await Warehouse.findByPk(data.sourceWarehouseId, { transaction });
  const destination = await Warehouse.findByPk(data.destinationWarehouseId, { transaction });
  assert(source?.active && destination?.active, 404, 'Warehouse unavailable.');
  checkLocation(req.user, source.locationId);
  assert(await Product.findByPk(data.productId, { transaction }), 404, 'Product unavailable.');
  const result = await Transfer.create({ ...data, locationId: source.locationId, destinationLocationId: destination.locationId, number: reference('TRF'), requestedBy: req.user.id }, { transaction });
  await audit(req, 'create', 'transfers', result, null, result.toJSON(), transaction);
  await notifyAdmins('Transfer requested', `${result.number} needs review.`, transaction);
  return result;
 });
}
async function transition(req, id, action) {
 return sequelize.transaction(async transaction => {
  const record = await Transfer.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  assert(record, 404, 'Transfer not found.');
  const previous = record.toJSON();
  checkLocation(req.user, action === 'receive' ? record.destinationLocationId : record.locationId);
  if (['approve','reject'].includes(action)) {
   assert(can(req.user, 'approvals.review'), 403, 'Approval permission required.');
   assert(record.requestedBy !== req.user.id, 403, 'Another administrator must review your transfer.');
   assert(record.status === 'pending', 409, 'Transfer has already been reviewed.');
   record.status = action === 'approve' ? 'approved' : 'rejected';
  } else if (action === 'cancel') {
   assert(['pending','approved'].includes(record.status), 409, 'Released transfers cannot be cancelled.');
   assert(record.requestedBy === req.user.id || can(req.user, 'approvals.review'), 403, 'You cannot cancel this transfer.');
   record.status = 'cancelled';
  } else {
   assert(can(req.user, 'inventory.write'), 403, 'Stock movement permission required.');
   const release = action === 'release';
   assert(record.status === (release ? 'approved' : 'in_transit'), 409, 'Invalid transfer transition.');
   const warehouseId = release ? record.sourceWarehouseId : record.destinationWarehouseId;
   await Warehouse.findByPk(warehouseId, { transaction, lock: transaction.LOCK.UPDATE });
   let stock = await Inventory.findOne({ where: { warehouseId, productId: record.productId }, transaction, lock: transaction.LOCK.UPDATE });
   if (!stock) stock = await Inventory.create({ warehouseId, productId: record.productId }, { transaction });
   await stock.update(stockChange(stock, release ? 'transfer_release' : 'transfer_receipt', record.quantity), { transaction });
   await Movement.create({ number: reference('MOV'), type: release ? 'transfer_release' : 'transfer_receipt', productId: record.productId, warehouseId, destinationWarehouseId: record.destinationWarehouseId, locationId: release ? record.locationId : record.destinationLocationId, quantity: record.quantity, userId: req.user.id, occurredAt: new Date(), reference: record.number }, { transaction });
   record.status = release ? 'in_transit' : 'received';
   if (!release) { record.receivedBy = req.user.id; await notifyAdmins('Transfer received', `${record.number} was received.`, transaction); }
  }
  record.version += 1;
  await record.save({ transaction });
  await audit(req, action, 'transfers', record, previous, record.toJSON(), transaction);
  return record;
 });
}
module.exports = { createTransfer, transition };
