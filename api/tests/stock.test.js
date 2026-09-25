const test=require('node:test');const assert=require('node:assert/strict');
const {stockChange}=require('../services/stockMath');
test('outgoing stock cannot consume reserved stock',()=>assert.throws(()=>stockChange({quantity:'10',reserved:'4',damaged:'0',version:0},'outgoing',7),e=>e.code==='STOCK_CONFLICT'));
test('decimal quantities remain exact',()=>assert.equal(stockChange({quantity:'0.200',reserved:'0',damaged:'0',version:0},'incoming',0.1).quantity,'0.300'));
test('damaged goods leave available stock and enter damaged balance',()=>assert.deepEqual(stockChange({quantity:'10',reserved:'0',damaged:'1',version:2},'damaged',2),{quantity:'8.000',damaged:'3.000',version:3}));
test('negative quantities rejected',()=>assert.throws(()=>stockChange({quantity:'10',reserved:'0',damaged:'0',version:0},'incoming',-1)));
test('transfer release cannot oversell',()=>assert.throws(()=>stockChange({quantity:'1',reserved:'0',damaged:'0',version:0},'transfer_release',2)));
test('approved adjustment supports explicit removal',()=>assert.equal(stockChange({quantity:'10',reserved:'0',damaged:'0',version:0},'adjustment',2,'remove').quantity,'8.000'));
