import {openDB} from 'idb'
import {api,message} from './api'
const db=openDB('viva-operations',1,{upgrade(database){database.createObjectStore('operations',{keyPath:'id'});database.createObjectStore('cache',{keyPath:'key'})}})
const changed=()=>window.dispatchEvent(new Event('viva-sync'))
export async function cacheData(userId,key,data){await(await db).put('cache',{key:`${userId}:${key}`,data,cachedAt:new Date().toISOString()})}
export async function cachedData(userId,key){return(await(await db).get('cache',`${userId}:${key}`))?.data}
export async function rememberProfile(user,expiresAt){await(await db).put('cache',{key:'offline-profile',user,expiresAt})}
export async function offlineProfile(){const profile=await(await db).get('cache','offline-profile');return profile&&Date.parse(profile.expiresAt)>Date.now()?profile.user:null}
export async function forgetProfile(){await(await db).delete('cache','offline-profile')}
export async function queueOperation(userId,payload){const item={id:payload.operationId,userId,payload,status:'pending',createdAt:new Date().toISOString(),attempts:0};await(await db).put('operations',item);changed();if('serviceWorker'in navigator)navigator.serviceWorker.getRegistration().then(registration=>registration?.sync?.register('viva-stock-sync')).catch(()=>{});return item}
export async function operations(userId){return(await(await db).getAll('operations')).filter(o=>o.userId===userId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
let activeSync=null
export async function synchronize(userId){
 if(activeSync){await activeSync;return synchronize(userId)}
 if(!navigator.onLine)return
 activeSync=(async()=>{for(const op of (await operations(userId)).filter(o=>['pending','failed'].includes(o.status)).reverse()){
  let stop=false
  try{const {data}=await api.post('/sync',op.payload,{headers:{'X-Viva-User':userId}});op.status='synced';op.serverRecord=data;op.syncedAt=new Date().toISOString();delete op.error}
  catch(error){stop=[401,403].includes(error.response?.status);op.status=error.response?.status===409?'conflict':'failed';op.error=message(error)}
  op.attempts++;await(await db).put('operations',op);changed();if(stop||(op.status==='failed'&&!navigator.onLine))break
 }})()
 try{await activeSync}finally{activeSync=null;changed()}
}
export async function clearCachedData(userId){const database=await db;const tx=database.transaction('cache','readwrite');for(const key of await tx.store.getAllKeys())if(key.startsWith(`${userId}:`))await tx.store.delete(key);await tx.done}
