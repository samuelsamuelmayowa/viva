const { sequelize, Approval, Product, Expense, Location, Warehouse, Distributor, Movement } = require('../models');
const { schemas, z } = require('../validators');
const { checkLocation } = require('../middleware/auth');
const { assert } = require('../utils/errors');
const { audit, notify, notifyAdmins } = require('./audit');
const { postMovement } = require('./inventory');
const protectedModels = { products: Product, expenses: Expense, locations: Location, warehouses: Warehouse, distributors: Distributor, movements: Movement };
async function requestChange(req, module, id, input) {
 const { reason, proposedData } = z.object({ reason: z.string().trim().min(5).max(2000), proposedData: schemas[module].partial() }).strict().parse(input);
 assert(Object.keys(proposedData).length, 422, 'Include at least one change.');
 assert(!['locationId','userId'].some(key => key in proposedData), 422, 'Location and account assignments cannot be changed through this form.');
 return sequelize.transaction(async transaction => {
  const record = await protectedModels[module].findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  assert(record, 404, 'Record not found.');
  if (record.locationId || module === 'locations') checkLocation(req.user, record.locationId || record.id);
  if (module === 'products') assert(req.user.organizationWide, 403, 'Organization-wide access required.');
  if (module === 'expenses' && proposedData.warehouseId) {
   const w = await Warehouse.findByPk(proposedData.warehouseId, { transaction });
   assert(w?.locationId === record.locationId, 422, 'Warehouse must belong to the expense location.');
  }
  const result = await Approval.create({ module, recordId: id, locationId: record.locationId || (module === 'locations' ? record.id : null), type: 'correction', originalData: record.toJSON(), proposedData, reason, requestedBy: req.user.id }, { transaction });
  await audit(req, 'update_request', module, record, record.toJSON(), proposedData, transaction);
  await notifyAdmins('Correction requested', `${module} correction needs review.`, transaction);
  return result;
 });
}
async function review(req, id, decision, comments) {
 return sequelize.transaction(async transaction => {
  const request = await Approval.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  assert(request, 404, 'Approval not found.');
  if (request.locationId) checkLocation(req.user, request.locationId); else assert(req.user.organizationWide, 403, 'Organization-wide access required.');
  assert(request.status === 'pending', 409, 'This request has already been reviewed.');
  assert(request.requestedBy !== req.user.id, 403, 'You cannot review your own request.');
  if (decision === 'approved') {
   if (request.module === 'inventory') await postMovement(req, request.proposedData, transaction, true);
   else {
    const Model = protectedModels[request.module];
    assert(Model, 422, 'Unsupported approval module.');
    const record = await Model.findByPk(request.recordId, { transaction, lock: transaction.LOCK.UPDATE });
    assert(record && record.version === request.originalData.version, 409, 'Record changed after this request. Submit a new request.', 'VERSION_CONFLICT');
    await record.update({ ...request.proposedData, version: record.version + 1 }, { transaction });
   }
  }
  if (decision === 'rejected' && request.type === 'expense_authorization') {
   const expense=await Expense.findByPk(request.recordId,{transaction,lock:transaction.LOCK.UPDATE});
   if(expense?.status==='pending'&&expense.version===request.originalData.version)await expense.update({status:'rejected',version:expense.version+1},{transaction});
  }
  await request.update({ status: decision, reviewedBy: req.user.id, reviewedAt: new Date(), reviewComments: comments }, { transaction });
  await audit(req, decision === 'approved' ? 'approval' : 'rejection', request.module, request, request.originalData, request.proposedData, transaction);
  await notify(request.requestedBy, `Request ${decision}`, comments || `Your ${request.module} request was ${decision}.`, '/approvals', transaction);
  return request;
 });
}
module.exports = { requestChange, review, protectedModels };
