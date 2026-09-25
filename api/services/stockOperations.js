const Decimal=require('decimal.js');
const {randomUUID}=require('node:crypto');
const {sequelize,Movement}=require('../models');
const {StockCount,Reservation}=require('../models/stock');
const {lockStock,postMovement}=require('./inventory');
const {assert}=require('../utils/errors');
const {reference}=require('../utils/crypto');
const {audit}=require('./audit');
const {z}=require('../validators');
const base=z.object({warehouseId:z.string().uuid(),productId:z.string().uuid(),quantity:z.coerce.number().finite().nonnegative().max(999999999).multipleOf(.001),expectedVersion:z.number().int().nonnegative(),notes:z.string().trim().min(5).max(2000),reference:z.string().max(255).optional()}).strict();
async function count(req){const data=base.parse(req.body);return sequelize.transaction(async transaction=>{
 const {stock,warehouse}=await lockStock(req.user,data.warehouseId,data.productId,transaction);assert(stock.version===data.expectedVersion,409,'Stock changed. Reload before recording this count.');
 const variance=new Decimal(data.quantity).minus(stock.quantity);let approvalId=null;
 if(!variance.isZero()){const result=await postMovement(req,{type:'adjustment',productId:data.productId,warehouseId:data.warehouseId,quantity:variance.abs().toNumber(),expectedVersion:stock.version,operationId:randomUUID(),occurredAt:new Date().toISOString(),notes:data.notes,direction:variance.isPositive()?'add':'remove'},transaction);approvalId=result.approval.id;}
 const record=await StockCount.create({number:reference('CNT'),productId:data.productId,warehouseId:data.warehouseId,locationId:warehouse.locationId,countedBy:req.user.id,expectedQuantity:stock.quantity,countedQuantity:data.quantity,variance:variance.toFixed(3),approvalId,notes:data.notes},{transaction});
 await audit(req,'stock_count','inventory',record,null,record.toJSON(),transaction);return record;
});}
async function reserve(req){const data=base.parse(req.body);assert(data.quantity>0,422,'Reservation quantity must be positive.');return sequelize.transaction(async transaction=>{
 const {stock,warehouse}=await lockStock(req.user,data.warehouseId,data.productId,transaction);assert(stock.version===data.expectedVersion,409,'Stock changed. Reload before reserving.');assert(new Decimal(stock.quantity).minus(stock.reserved).gte(data.quantity),409,'Insufficient available stock.');
 const previous=stock.toJSON();await stock.update({reserved:new Decimal(stock.reserved).plus(data.quantity).toFixed(3),version:stock.version+1},{transaction});
 const record=await Reservation.create({...data,number:reference('RSV'),locationId:warehouse.locationId,createdBy:req.user.id},{transaction});
 await Movement.create({number:reference('MOV'),type:'reservation',productId:data.productId,warehouseId:data.warehouseId,locationId:warehouse.locationId,quantity:data.quantity,userId:req.user.id,occurredAt:new Date(),reference:record.number},{transaction});
 await audit(req,'stock_reservation','inventory',record,previous,stock.toJSON(),transaction);return record;
});}
async function release(req,id){return sequelize.transaction(async transaction=>{
 const record=await Reservation.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});assert(record,404,'Reservation not found.');assert(record.status==='reserved',409,'Reservation is already released.');
 const {stock}=await lockStock(req.user,record.warehouseId,record.productId,transaction);const previous=stock.toJSON();assert(new Decimal(stock.reserved).gte(record.quantity),409,'Reservation balance requires administrator review.');
 await stock.update({reserved:new Decimal(stock.reserved).minus(record.quantity).toFixed(3),version:stock.version+1},{transaction});await record.update({status:'released'},{transaction});
 await Movement.create({number:reference('MOV'),type:'reservation_release',productId:record.productId,warehouseId:record.warehouseId,locationId:record.locationId,quantity:record.quantity,userId:req.user.id,occurredAt:new Date(),reference:record.number},{transaction});
 await audit(req,'reservation_release','inventory',record,previous,stock.toJSON(),transaction);return record;
});}
module.exports={count,reserve,release};
