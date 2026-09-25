const {target}=require('./test-env');
const {sequelize}=require('../models');
const {Sequelize}=require('sequelize');
const admin=new Sequelize('',process.env.DB_USER,process.env.DB_PASS,{host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),dialect:'mysql',logging:false,dialectOptions:sequelize.options.dialectOptions});
async function main(){await admin.query(`CREATE DATABASE IF NOT EXISTS \`${target}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await admin.close();await require('./migrate')();console.log('Isolated test database prepared.');}
main().catch(error=>{console.error('Test database preparation failed:',error.name);process.exitCode=1}).finally(async()=>{await admin.close().catch(()=>{});await sequelize.close()});
