const {DataTypes:D}=require('sequelize');
const ref=table=>({type:D.UUID,allowNull:false,references:{model:table,key:'id'},onDelete:'RESTRICT'});
const common=()=>({id:{type:D.UUID,primaryKey:true},number:{type:D.STRING(64),allowNull:false,unique:true},productId:ref('products'),warehouseId:ref('warehouses'),locationId:ref('locations'),notes:D.TEXT,createdAt:{type:D.DATE,allowNull:false},updatedAt:{type:D.DATE,allowNull:false}});
exports.up=async qi=>{
 await qi.createTable('stock_counts',{...common(),countedBy:ref('users'),expectedQuantity:{type:D.DECIMAL(18,3),allowNull:false},countedQuantity:{type:D.DECIMAL(18,3),allowNull:false},variance:{type:D.DECIMAL(18,3),allowNull:false},approvalId:{...ref('approval_requests'),allowNull:true}});
 await qi.createTable('stock_reservations',{...common(),createdBy:ref('users'),quantity:{type:D.DECIMAL(18,3),allowNull:false},status:{type:D.STRING(32),allowNull:false,defaultValue:'reserved'},reference:D.STRING});
};
