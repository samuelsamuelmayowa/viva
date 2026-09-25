require('../scripts/test-env');
const {test,after,before}=require('node:test');
const assert=require('node:assert/strict');
const request=require('supertest');
const {randomUUID}=require('node:crypto');
const bcrypt=require('bcryptjs');
const {Op}=require('sequelize');
const app=require('../app');
const m=require('../models');
const origin=process.env.APP_ORIGIN||'http://localhost:5173';
const ids={users:[],locations:[],warehouses:[],products:[],categories:[]};
let admin,reviewer,staff,outsider,distributor,warehouse,destination,product,location,otherLocation;
async function makeUser(role,locations=[]){const u=await m.User.create({name:`TEST ${role}`,email:`test-${randomUUID()}@viva.invalid`,passwordHash:await bcrypt.hash('Integration-test-only-2026!',12)});ids.users.push(u.id);await u.addRole(await m.Role.findOne({where:{name:role}}));await u.setLocations(locations);const agent=request.agent(app);const login=await agent.post('/api/auth/login').set('Origin',origin).send({email:u.email,password:'Integration-test-only-2026!'});assert.equal(login.status,200,JSON.stringify(login.body));assert.match(login.headers['set-cookie'][0],/HttpOnly/i);assert.match(login.headers['set-cookie'][0],/SameSite=Strict/i);const me=await agent.get('/api/auth/me');return {agent,csrf:me.body.csrfToken,id:u.id};}
const send=(actor,method,path,data)=>actor.agent[method](`/api${path}`).set('Origin',origin).set('x-csrf-token',actor.csrf).send(data);
const movement=(overrides={})=>({type:'incoming',productId:product.id,warehouseId:warehouse.id,quantity:20,cost:100,expectedVersion:0,operationId:randomUUID(),occurredAt:new Date().toISOString(),...overrides});
before(async()=>{
 await m.sequelize.authenticate();
 location=await m.Location.create({name:'TEST Lagos',state:'Lagos',city:'Ikeja'});ids.locations.push(location.id);
 otherLocation=await m.Location.create({name:'TEST Abuja',state:'FCT',city:'Abuja'});ids.locations.push(otherLocation.id);
 warehouse=await m.Warehouse.create({name:'TEST warehouse',code:randomUUID().slice(0,12),locationId:location.id});ids.warehouses.push(warehouse.id);
 destination=await m.Warehouse.create({name:'TEST destination',code:randomUUID().slice(0,12),locationId:otherLocation.id});ids.warehouses.push(destination.id);
 product=await m.Product.create({name:'TEST Soap',sku:randomUUID(),unit:'carton',costPrice:100,sellingPrice:150,minimumStock:1});ids.products.push(product.id);
 admin=await makeUser('Admin');reviewer=await makeUser('Admin');staff=await makeUser('Staff',[location]);outsider=await makeUser('Staff',[otherLocation]);distributor=await makeUser('Distributor');
});
after(async()=>{
 const userWhere={userId:{[Op.in]:ids.users}},locationWhere={locationId:{[Op.in]:ids.locations}};
 const fm=require('../models/finance');
 await fm.CashEntry.destroy({where:locationWhere});await fm.Sale.destroy({where:locationWhere});await fm.Account.destroy({where:locationWhere});
 await require('../models/stock').StockCount.destroy({where:locationWhere});await require('../models/stock').Reservation.destroy({where:locationWhere});
 await m.Notification.destroy({where:userWhere});await m.Session.destroy({where:userWhere});await m.SyncOperation.destroy({where:userWhere});await m.SystemLog.destroy({where:userWhere});await m.Audit.destroy({where:userWhere});
 await m.Approval.destroy({where:{requestedBy:{[Op.in]:ids.users}}});await m.Movement.destroy({where:userWhere});await m.Transfer.destroy({where:{requestedBy:{[Op.in]:ids.users}}});await m.Expense.destroy({where:{createdBy:{[Op.in]:ids.users}},force:true});await m.Distributor.destroy({where:locationWhere,force:true});await m.Inventory.destroy({where:{warehouseId:{[Op.in]:ids.warehouses}}});
 await m.Product.destroy({where:{id:{[Op.in]:ids.products}},force:true});await m.UserLocation.destroy({where:userWhere});await m.UserRole.destroy({where:userWhere});await m.User.destroy({where:{id:{[Op.in]:ids.users}},force:true});await m.Warehouse.destroy({where:{id:{[Op.in]:ids.warehouses}},force:true});await m.Location.destroy({where:{id:{[Op.in]:ids.locations}},force:true});await m.ExpenseCategory.destroy({where:{id:{[Op.in]:ids.categories}}});await m.sequelize.close();
});
test('anonymous, CSRF, role, and location boundaries',async()=>{
 const recovered=await admin.agent.get('/api/auth/me');assert.equal(recovered.body.csrfToken,admin.csrf);
 assert.equal((await request(app).get('/api/inventory')).status,401);
 assert.equal((await admin.agent.post('/api/locations').set('Origin',origin).send({})).status,403);
 assert.equal((await send(admin,'post','/locations',{}).set('Origin','https://untrusted.invalid')).status,403);
 assert.equal((await send(staff,'post','/users',{})).status,403);
 assert.equal((await send(admin,'post','/sync',movement()).set('X-Viva-User',staff.id)).status,403);
 assert.equal((await distributor.agent.get('/api/expenses')).status,403);
 assert.equal((await distributor.agent.get('/api/inventory')).status,403);
 assert.equal((await send(outsider,'post','/inventory/movements',movement())).status,403);
 const users=await admin.agent.get('/api/users');assert.equal(users.status,200);assert.ok(!JSON.stringify(users.body).includes('passwordHash'));
});
test('receipt is atomic and duplicate retries do not double-count',async()=>{
 const payload=movement();const first=await send(staff,'post','/incoming',payload);assert.equal(first.status,201,JSON.stringify(first.body));
 const repeat=await send(staff,'post','/incoming',payload);assert.equal(repeat.status,201);assert.equal(repeat.body.id,first.body.id);
 const altered=await send(staff,'post','/incoming',{...payload,quantity:21});assert.equal(altered.status,409);
 const stock=await m.Inventory.findOne({where:{productId:product.id,warehouseId:warehouse.id}});assert.equal(Number(stock.quantity),20);assert.equal(stock.version,1);
 const scoped=await outsider.agent.get(`/api/inventory?warehouseId=${warehouse.id}`);assert.equal(scoped.body.total,0);
 const staffProducts=await staff.agent.get('/api/products');assert.ok(!JSON.stringify(staffProducts.body).includes('costPrice'));
});
test('competing withdrawals use version checks and never oversell',async()=>{
 const results=await Promise.all([send(staff,'post','/outgoing',movement({type:'outgoing',quantity:15,expectedVersion:1})),send(admin,'post','/outgoing',movement({type:'outgoing',quantity:15,expectedVersion:1}))]);
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 const stock=await m.Inventory.findOne({where:{productId:product.id,warehouseId:warehouse.id}});assert.equal(Number(stock.quantity),5);assert.equal(stock.version,2);
 const oversell=await send(staff,'post','/outgoing',movement({type:'outgoing',quantity:6,expectedVersion:2}));assert.equal(oversell.status,409);assert.equal(oversell.body.code,'STOCK_CONFLICT');
 assert.ok(await m.SyncOperation.count({where:{status:'conflict',locationId:location.id}})>=2);
});
test('protected correction requires independent review and rejects stale proposals',async()=>{
 const request1=await send(admin,'post',`/products/${product.id}/corrections`,{reason:'Correct catalog naming',proposedData:{name:'TEST Soap corrected'}});assert.equal(request1.status,201,JSON.stringify(request1.body));
 const request2=await send(admin,'post',`/products/${product.id}/corrections`,{reason:'Another catalog correction',proposedData:{name:'TEST Stale'}});assert.equal(request2.status,201);
 assert.equal((await product.reload()).name,'TEST Soap');
 assert.equal((await send(admin,'post',`/approvals/${request1.body.id}/review`,{decision:'approved',comments:'Verified by creator'})).status,403);
 const approved=await send(reviewer,'post',`/approvals/${request1.body.id}/review`,{decision:'approved',comments:'Verified supplier catalog'});assert.equal(approved.status,200,JSON.stringify(approved.body));
 assert.equal((await product.reload()).name,'TEST Soap corrected');
 assert.equal((await send(reviewer,'post',`/approvals/${request2.body.id}/review`,{decision:'approved',comments:'Verified again'})).status,409);
});
test('adjustments wait for approval and preserve ledger consistency',async()=>{
 const response=await send(staff,'post','/inventory/movements',movement({type:'adjustment',quantity:10,expectedVersion:2,direction:'add',notes:'Count reconciliation'}));assert.equal(response.status,201,JSON.stringify(response.body));
 let stock=await m.Inventory.findOne({where:{productId:product.id,warehouseId:warehouse.id}});assert.equal(Number(stock.quantity),5);
 const approve=await send(admin,'post',`/approvals/${response.body.approval.id}/review`,{decision:'approved',comments:'Count verified'});assert.equal(approve.status,200,JSON.stringify(approve.body));
 await stock.reload();assert.equal(Number(stock.quantity),15);
});
test('transfer workflow conserves stock and rejects duplicate receipt',async()=>{
 const created=await send(staff,'post','/transfers',{productId:product.id,sourceWarehouseId:warehouse.id,destinationWarehouseId:destination.id,quantity:4});assert.equal(created.status,201,JSON.stringify(created.body));const path=`/transfers/${created.body.id}/action`;
 assert.equal((await send(staff,'post',path,{action:'release'})).status,409);
 assert.equal((await send(admin,'post',path,{action:'approve'})).status,200);
 assert.equal((await send(staff,'post',path,{action:'release'})).status,200);
 assert.equal((await send(staff,'post',path,{action:'receive'})).status,403);
 assert.equal((await send(outsider,'post',path,{action:'receive'})).status,200);
 assert.equal((await send(outsider,'post',path,{action:'receive'})).status,409);
 const stocks=await m.Inventory.findAll({where:{productId:product.id}});assert.equal(stocks.reduce((n,s)=>n+Number(s.quantity),0),15);
});
test('expenses, reporting, dashboard, audit, and health are connected',async()=>{
 const category=await m.ExpenseCategory.create({name:`TEST-${randomUUID()}`});ids.categories.push(category.id);
 const response=await send(admin,'post','/expenses',{categoryId:category.id,description:'TEST delivery fuel',amount:12500.50,locationId:location.id,warehouseId:warehouse.id,paymentMethod:'bank_transfer',expenseDate:'2026-09-24'});assert.equal(response.status,201,JSON.stringify(response.body));
 const approval=await m.Approval.findOne({where:{recordId:response.body.id}});assert.equal((await send(reviewer,'post',`/approvals/${approval.id}/review`,{decision:'approved',comments:'Receipt verified'})).status,200);
 for(const path of ['/dashboard','/system-health','/audit','/reports/expenses','/notifications','/sync']){const result=await admin.agent.get(`/api${path}`);assert.equal(result.status,200,`${path}: ${JSON.stringify(result.body)}`);}
 const csv=await admin.agent.get('/api/reports/movements?format=csv');assert.equal(csv.status,200);assert.match(csv.headers['content-type'],/text\/csv/);
 const logout=await send(staff,'post','/auth/logout',{});assert.equal(logout.status,204);assert.equal((await staff.agent.get('/api/inventory')).status,401);
});
test('reservations protect availability and stock counts create approval requests',async()=>{
 const current=await m.Inventory.findOne({where:{productId:product.id,warehouseId:warehouse.id}});
 const payload={productId:product.id,warehouseId:warehouse.id,quantity:8,expectedVersion:current.version,notes:'Hold for customer collection'};
 const reservation=await send(admin,'post','/reservations',payload);assert.equal(reservation.status,201,JSON.stringify(reservation.body));
 const attempt=await send(admin,'post','/outgoing',movement({type:'outgoing',quantity:4,expectedVersion:current.version+1}));assert.equal(attempt.status,409);
 assert.equal((await send(reviewer,'post',`/reservations/${reservation.body.id}/release`,{})).status,200);
 assert.equal((await send(reviewer,'post',`/reservations/${reservation.body.id}/release`,{})).status,409);
 await current.reload();assert.equal(Number(current.reserved),0);
 const count=await send(admin,'post','/stock-counts',{...payload,quantity:10,expectedVersion:current.version,notes:'Physical count witnessed by supervisor'});assert.equal(count.status,201,JSON.stringify(count.body));assert.ok(count.body.approvalId);
 await current.reload();assert.equal(Number(current.quantity),11);
 const decision=await send(reviewer,'post',`/approvals/${count.body.approvalId}/review`,{decision:'approved',comments:'Physical count verified'});assert.equal(decision.status,200,JSON.stringify(decision.body));await current.reload();assert.equal(Number(current.quantity),10);
});
test('distributors confirm only their own allocated deliveries without financial exposure',async()=>{
 const partner=await m.Distributor.create({name:'TEST distributor',userId:distributor.id,locationId:location.id});
 const current=await m.Inventory.findOne({where:{productId:product.id,warehouseId:warehouse.id}});
 const allocation=await send(admin,'post','/inventory/movements',movement({type:'distributor_allocation',distributorId:partner.id,quantity:2,expectedVersion:current.version}));assert.equal(allocation.status,201,JSON.stringify(allocation.body));
 const list=await distributor.agent.get('/api/distribution');assert.equal(list.status,200);assert.ok(list.body.data.some(r=>r.id===allocation.body.id));assert.ok(!JSON.stringify(list.body).includes('cost'));
 const receipt=await send(distributor,'post',`/distribution/${allocation.body.id}/receive`,{});assert.equal(receipt.status,200,JSON.stringify(receipt.body));assert.equal(receipt.body.status,'delivered');
 assert.equal((await send(distributor,'post',`/distribution/${allocation.body.id}/receive`,{})).status,409);
});
