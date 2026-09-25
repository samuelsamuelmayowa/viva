import axios from 'axios'
export const api=axios.create({baseURL:'/api',withCredentials:true,timeout:20000})
let csrfToken=''
export function setCsrf(value){csrfToken=value}
api.interceptors.request.use(config=>{if(!['get','head','options'].includes(config.method))config.headers['X-CSRF-Token']=csrfToken;return config})
api.interceptors.response.use(response=>response,async error=>{
 const original=error.config
 if(error.response?.data?.code==='CSRF_INVALID'&&!original?._csrfRetried){original._csrfRetried=true;const {data}=await api.get('/auth/me');setCsrf(data.csrfToken);return api(original)}
 return Promise.reject(error)
})
export const message=error=>error.response?.data?.message||error.message||'Something went wrong. Please try again.'
export const money=value=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(value||0)
export const number=value=>new Intl.NumberFormat('en-NG',{maximumFractionDigits:3}).format(value||0)
export const date=value=>value?new Intl.DateTimeFormat('en-NG',{dateStyle:'medium',timeZone:'Africa/Lagos'}).format(new Date(value)):'—'
export const human=value=>String(value||'').replaceAll('_',' ').replaceAll('-',' ')
