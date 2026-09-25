const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env')});
const primary=process.env.DB_NAME;
const target=process.env.TEST_DB_NAME||`${primary}_test`;
if(!primary||target===primary||!/^\w+_test$/.test(target))throw new Error('Use a separate TEST_DB_NAME ending in _test.');
process.env.DB_NAME=target;
process.env.NODE_ENV='test';
module.exports={target};
