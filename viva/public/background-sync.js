/* Background delivery is opportunistic; browsers without SyncManager use foreground retries. */
const openQueue = () => new Promise((resolve,reject)=>{const request=indexedDB.open('viva-operations',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onupgradeneeded=()=>{request.result.createObjectStore('operations',{keyPath:'id'});request.result.createObjectStore('cache',{keyPath:'key'});};});
const readQueue = db => new Promise((resolve,reject)=>{const request=db.transaction('operations').objectStore('operations').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const saveQueue = (db,record) => new Promise((resolve,reject)=>{const transaction=db.transaction('operations','readwrite');transaction.objectStore('operations').put(record);transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);});
async function deliverPending(){
 const session=await fetch('/api/auth/me',{credentials:'include',cache:'no-store'});
 if(!session.ok)throw new Error('An active session is required.');
 const {user,csrfToken}=await session.json(),database=await openQueue();
 try{
  const records=(await readQueue(database)).filter(r=>r.userId===user.id&&['pending','failed'].includes(r.status)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  for(const record of records){
   const response=await fetch('/api/sync',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken,'X-Viva-User':user.id},body:JSON.stringify(record.payload)});
   if([401,403,429].includes(response.status)||response.status>=500)throw new Error('Synchronization will retry when the service is available.');
   const result=await response.json();record.attempts++;
   if(response.ok){record.status='synced';record.serverRecord=result;record.syncedAt=new Date().toISOString();delete record.error;}
   else{record.status=response.status===409?'conflict':'failed';record.error=result.message||'The operation could not be accepted.';}
   await saveQueue(database,record);
  }
 }finally{database.close();const windows=await self.clients.matchAll({type:'window'});for(const client of windows)client.postMessage({type:'viva-sync'});}
}
self.addEventListener('sync',event=>{if(event.tag==='viva-stock-sync')event.waitUntil(deliverPending());});
