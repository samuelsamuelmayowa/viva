// Versioned schema snapshot; later schema changes belong in a new migration.
const models=require('./schema-v1');
exports.up=async qi=>{
 for(const model of Object.values(models).filter(m=>m?.rawAttributes)){
  await qi.createTable(model.tableName,model.rawAttributes);
  const indexes=await qi.showIndex(model.tableName);
  for(const index of model.options.indexes){
   if(!indexes.some(existing=>existing.name===index.name))await qi.addIndex(model.tableName,index);
  }
 }
};
