const {DataTypes:D}=require('sequelize');
const {sequelize}=require('../db');
const ref=table=>({type:D.UUID,allowNull:false,references:{model:table,key:'id'},onDelete:'RESTRICT'});
const common=()=>({id:{type:D.UUID,primaryKey:true,defaultValue:D.UUIDV4},number:{type:D.STRING(64),allowNull:false,unique:true},productId:ref('products'),warehouseId:ref('warehouses'),locationId:ref('locations'),notes:D.TEXT});
const StockCount=sequelize.define('stock_counts',{...common(),countedBy:ref('users'),expectedQuantity:{type:D.DECIMAL(18,3),allowNull:false},countedQuantity:{type:D.DECIMAL(18,3),allowNull:false},variance:{type:D.DECIMAL(18,3),allowNull:false},approvalId:{...ref('approval_requests'),allowNull:true}},{tableName:'stock_counts'});
const Reservation=sequelize.define('stock_reservations',{...common(),createdBy:ref('users'),quantity:{type:D.DECIMAL(18,3),allowNull:false},status:{type:D.STRING(32),allowNull:false,defaultValue:'reserved'},reference:D.STRING},{tableName:'stock_reservations'});
module.exports={StockCount,Reservation};
