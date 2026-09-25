const {Router}=require('express');
const {sequelize,Distributor,Movement}=require('../models');
const {permit}=require('../middleware/auth');
const {assert}=require('../utils/errors');
const {audit,notifyAdmins}=require('../services/audit');
const router=Router();
router.post('/:id/receive',permit('distribution.read'),async(req,res)=>{
 const result=await sequelize.transaction(async transaction=>{
  const distributor=await Distributor.findOne({where:{userId:req.user.id,active:true},transaction});assert(distributor,403,'No active distributor profile is linked to this account.');
  const record=await Movement.findOne({where:{id:req.params.id,distributorId:distributor.id,type:'distributor_allocation'},transaction,lock:transaction.LOCK.UPDATE});assert(record,404,'Allocation not found.');assert(record.status==='confirmed',409,'Delivery has already been confirmed.');
  const previous={status:record.status};await record.update({status:'delivered',version:record.version+1},{transaction});
  await audit(req,'delivery_received','distribution',record,previous,{status:'delivered'},transaction);await notifyAdmins('Distributor delivery received',`${record.number} was confirmed by the distributor.`,transaction);
  return {id:record.id,status:record.status};
 });res.json(result);
});
module.exports=router;
