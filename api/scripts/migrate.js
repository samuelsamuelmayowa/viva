const { sequelize }=require('../models');
const { DataTypes }=require('sequelize');
async function migrate(){
 const qi=sequelize.getQueryInterface();
 await sequelize.authenticate();
 const connection=await sequelize.connectionManager.getConnection();
 const [lock]=await connection.promise().query("SELECT GET_LOCK('viva_schema_migration', 30) AS acquired");
 if(!lock[0].acquired)throw new Error('Another migration is running.');
 try{
  await qi.createTable('schema_migrations',{name:{type:DataTypes.STRING,primaryKey:true},appliedAt:{type:DataTypes.DATE,allowNull:false}});
  const [done]=await sequelize.query('SELECT name FROM schema_migrations WHERE name = :name',{replacements:{name:'001_initial'}});
  if(!done.length){
   await require('../migrations/001_initial').up(qi);
   await qi.bulkInsert('schema_migrations',[{name:'001_initial',appliedAt:new Date()}]);
  }
  await require('./permissions')();
  const [operations]=await sequelize.query('SELECT name FROM schema_migrations WHERE name = :name',{replacements:{name:'002_stock_operations'}});
  if(!operations.length){await require('../migrations/002_stock_operations').up(qi);await qi.bulkInsert('schema_migrations',[{name:'002_stock_operations',appliedAt:new Date()}]);}
  const [finance]=await sequelize.query('SELECT name FROM schema_migrations WHERE name = :name',{replacements:{name:'003_finance'}});
  if(!finance.length){await require('../migrations/003_finance').up(qi);await qi.bulkInsert('schema_migrations',[{name:'003_finance',appliedAt:new Date()}]);}
  console.log('Viva migrations and role permissions are up to date.');
 }finally{await connection.promise().query("SELECT RELEASE_LOCK('viva_schema_migration')");await sequelize.connectionManager.releaseConnection(connection);}
}
if(require.main===module)migrate().catch(e=>{console.error('Migration failed:',e.name,e.message);process.exitCode=1;}).finally(()=>sequelize.close());
module.exports=migrate;
