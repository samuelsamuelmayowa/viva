import {createContext,useContext,useEffect,useState} from 'react'
import {useQueryClient,useQuery} from '@tanstack/react-query'
import {api,setCsrf,message} from './api'
import {synchronize,cacheData,cachedData,clearCachedData,operations,rememberProfile,offlineProfile,forgetProfile} from './offline'
const Context=createContext(null)
export function AppProvider({children}){
 const [user,setUser]=useState(null),[loading,setLoading]=useState(true),[authError,setAuthError]=useState(''),[online,setOnline]=useState(navigator.onLine),[toast,setToast]=useState(null),[pending,setPending]=useState(0)
 const client=useQueryClient()
 const notify=(text,type='success')=>setToast({text,type})
 useEffect(()=>{let active=true;async function recover(){try{if(!navigator.onLine){const profile=await offlineProfile();if(active){setUser(profile);if(!profile)setAuthError('Connect to sign in. No current offline workspace is available.')}return}const {data}=await api.get('/auth/me');if(active){setUser(data.user);setCsrf(data.csrfToken);await rememberProfile(data.user,data.expiresAt)}}catch(error){if(active&&error.response?.status!==401)setAuthError(message(error));if(error.response?.status===401)await forgetProfile()}finally{if(active)setLoading(false)}}recover();return()=>{active=false}},[])
 useEffect(()=>{const on=()=>setOnline(true),off=()=>setOnline(false);window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)}},[])
 useEffect(()=>{if(!toast)return;const timeout=setTimeout(()=>setToast(null),6000);return()=>clearTimeout(timeout)},[toast])
 useEffect(()=>{
  if(!user)return
  const refresh=()=>operations(user.id).then(rows=>setPending(rows.filter(r=>r.status!=='synced').length)).catch(()=>notify('Offline storage is unavailable. Keep this device online.','error'))
  const sync=()=>{if(navigator.onLine)synchronize(user.id).then(()=>client.invalidateQueries()).catch(()=>notify('Synchronization failed. Your queued records are retained.','error'))}
  refresh();sync();const interval=setInterval(sync,30000);window.addEventListener('viva-sync',refresh);window.addEventListener('online',sync)
  return()=>{clearInterval(interval);window.removeEventListener('viva-sync',refresh);window.removeEventListener('online',sync)}
 },[user,client])
 async function login(email,password){await api.post('/auth/login',{email,password});const {data}=await api.get('/auth/me');setCsrf(data.csrfToken);await rememberProfile(data.user,data.expiresAt);setUser(data.user);setAuthError('')}
 async function logout(){await api.post('/auth/logout');await clearCachedData(user.id);await forgetProfile();setCsrf('');setUser(null);client.clear()}
 return <Context.Provider value={{user,loading,authError,login,logout,online,pending,notify,can:permission=>user?.permissions.includes(permission)}}>{children}{toast&&<div role="status" className={`fixed bottom-5 right-5 z-[100] max-w-sm rounded-xl px-5 py-4 text-sm shadow-lg ${toast.type==='error'?'bg-red-700':'bg-brand-900'} text-white`}>{toast.text}<button className="ml-4" onClick={()=>setToast(null)} aria-label="Dismiss notification">×</button></div>}</Context.Provider>
}
export function useApp(){return useContext(Context)}
export function useData(path,params={},enabled=true){
 const {user,online}=useApp()
 return useQuery({queryKey:[user?.id,path,params],enabled:!!user&&enabled,networkMode:'always',queryFn:async()=>{
  const key=`${path}?${new URLSearchParams(params)}`
  if(!online){const cached=await cachedData(user.id,key);if(cached)return cached;throw new Error('This information has not been cached on this device. Connect to load it.')}
  const {data}=await api.get(path,{params});cacheData(user.id,key,data).catch(()=>{});return data
 },retry:1,staleTime:15000})
}
