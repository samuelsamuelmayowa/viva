const { sequelize, Warehouse, Product, Inventory, Movement, Approval, Distributor, SyncOperation, User } = require('../models');
const { checkLocation, can } = require('../middleware/auth');
const { assert } = require('../utils/errors');
const { reference, hash } = require('../utils/crypto');
const { audit, notifyAdmins } = require('./audit');
const { stockChange } = require('./stockMath');
const { movement } = require('../validators');
async function lockStock(user, warehouseId, productId, transaction) {
 const warehouse = await Warehouse.findByPk(warehouseId, { transaction, lock: transaction.LOCK.UPDATE });
 assert(warehouse?.active, 404, 'Warehouse is unavailable.');
 checkLocation(user, warehouse.locationId);
 const product = await Product.findByPk(productId, { transaction });
 assert(product?.active, 404, 'Product is unavailable.');
 let stock = await Inventory.findOne({ where: { warehouseId, productId }, transaction, lock: transaction.LOCK.UPDATE });
 if (!stock) stock = await Inventory.create({ warehouseId, productId }, { transaction });
 return { warehouse, stock, product };
}
async function postMovement(req, input, transaction, approved = false) {
 const data = movement.parse(input);
 const { warehouse, stock, product } = await lockStock(req.user, data.warehouseId, data.productId, transaction);
 assert(stock.version === data.expectedVersion, 409, 'Stock changed. Review current stock before resubmitting.', 'VERSION_CONFLICT');
 assert(new Date(data.occurredAt).getTime() <= Date.now() + 300000, 422, 'Operation time cannot be in the future.');
 if (data.type.startsWith('distributor_')) {
  assert(data.distributorId, 422, 'Choose a distributor.');
  const distributor = await Distributor.findByPk(data.distributorId, { transaction });
  assert(distributor?.active, 404, 'Distributor is unavailable.');
  checkLocation(req.user, distributor.locationId);
 }
 if (data.type === 'adjustment' && !approved) {
  assert(data.notes?.length >= 5 && data.direction, 422, 'An adjustment needs a direction and a reason.');
  const request = await Approval.create({ module: 'inventory', recordId: data.operationId, locationId: warehouse.locationId, type: 'stock_adjustment', originalData: stock.toJSON(), proposedData: data, reason: data.notes, requestedBy: req.user.id }, { transaction });
  await audit(req, 'update_request', 'inventory', request, stock.toJSON(), data, transaction);
  await notifyAdmins('Stock adjustment requested', 'A stock adjustment needs review.', transaction);
  return { approval: request, status: 'pending' };
 }
 const before = stock.toJSON();
 await stock.update(stockChange(stock, data.type, data.quantity, data.direction), { transaction });
 const record = await Movement.create({ ...data, locationId: warehouse.locationId, userId: req.user.id, number: reference(data.type === 'incoming' ? 'GRN' : 'MOV') }, { transaction });
 await audit(req, 'stock_movement', 'inventory', record, before, stock.toJSON(), transaction);
 if (Number(stock.quantity) - Number(stock.reserved) <= Number(product.minimumStock)) await notifyAdmins('Low inventory', `${product.name} at ${warehouse.name} is at or below its minimum stock.`, transaction);
 return record.toJSON();
}
async function submitOperation(req, input) {
 const data = movement.parse(input);
 assert(can(req.user, 'inventory.write'), 403, 'You cannot record stock movements.');
 const payloadHash = hash(JSON.stringify(data));
 try {
  return await sequelize.transaction(async transaction => {
   // Serialize retries from the same user before checking the operation ID.
   await User.findByPk(req.user.id, { transaction, lock: transaction.LOCK.UPDATE });
   const existing = await SyncOperation.findOne({ where: { operationId: data.operationId }, transaction });
   if (existing) {
    assert(existing.userId === req.user.id && existing.payloadHash === payloadHash, 409, 'Operation ID already used for different data.', 'DUPLICATE_OPERATION');
    assert(existing.status === 'synced', 409, existing.error || 'This operation needs review.', 'SYNC_CONFLICT');
    return existing.result;
   }
   const result = await postMovement(req, data, transaction);
   const warehouse = await Warehouse.findByPk(data.warehouseId, { transaction });
   await SyncOperation.create({ operationId: data.operationId, userId: req.user.id, locationId: warehouse.locationId, payloadHash, payload: data, result, status: 'synced', occurredAt: data.occurredAt }, { transaction });
   return result;
  });
 } catch (error) {
  if (error.status === 409 && !['DUPLICATE_OPERATION','SYNC_CONFLICT'].includes(error.code)) {
   const warehouse = await Warehouse.findByPk(data.warehouseId);
   await SyncOperation.findOrCreate({ where: { operationId: data.operationId }, defaults: { userId: req.user.id, locationId: warehouse?.locationId, payloadHash, payload: data, status: 'conflict', error: error.message, occurredAt: data.occurredAt } });
  }
  throw error;
 }
}
module.exports = { lockStock, postMovement, submitOperation };
