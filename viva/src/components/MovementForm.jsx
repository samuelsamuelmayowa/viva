import {useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {WifiOff,ShieldCheck} from 'lucide-react'
import {useApp,useData} from '../lib/context'
import {message,number,human} from '../lib/api'
import {queueOperation,synchronize,operations} from '../lib/offline'
import {Modal,Field,Submit} from './ui'
import {ReferenceInput} from './RecordForm'
const types=['incoming','outgoing','returned','damaged','distributor_allocation','distributor_return','adjustment']
export default function MovementForm({initialType='incoming',onClose}){
 const {user,online,notify,can}=useApp(),client=useQueryClient()
 const [values,setValues]=useState({type:initialType,productId:'',warehouseId:'',quantity:'',cost:0,reference:'',counterparty:'',delivery:'',notes:'',direction:'add',distributorId:''}),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const change=(key,value)=>setValues(v=>({...v,[key]:value}))
 const stock=useData('/inventory',{warehouseId:values.warehouseId,productId:values.productId,limit:200},!!values.warehouseId&&!!values.productId)
 const current=stock.data?.data?.[0],distribution=values.type.startsWith('distributor_')
 async function submit(e){e.preventDefault();setBusy(true);setError('');try{
  if(!stock.data)throw new Error('Load this product’s current stock while online before recording a movement.')
  const prior=(await operations(user.id)).filter(o=>o.status==='pending'&&o.payload.warehouseId===values.warehouseId&&o.payload.productId===values.productId&&o.payload.type!=='adjustment')
  const payload={...values,quantity:Number(values.quantity),cost:Number(values.cost),expectedVersion:(current?.version||0)+prior.length,operationId:crypto.randomUUID(),occurredAt:new Date().toISOString()}
  if(!distribution)delete payload.distributorId
  if(values.type!=='adjustment')delete payload.direction
  await queueOperation(user.id,payload)
  if(online){await synchronize(user.id);const saved=(await operations(user.id)).find(o=>o.id===payload.operationId);notify(saved.status==='synced'?(saved.serverRecord?.approval?'Adjustment submitted for approval.':'Stock movement recorded.'):saved.status==='conflict'?'Conflict detected. Review it in Sync Center.':'Operation retained in Sync Center for retry.',saved.status==='synced'?'success':'error')}
  else notify('Saved on this device. It will synchronize when connected.')
  await client.invalidateQueries();onClose()
 }catch(err){setError(message(err))}finally{setBusy(false)}}
 return <Modal title="Record stock movement" description="Every movement is validated and added to the audit trail." onClose={onClose}><form onSubmit={submit}>
  {!online&&<div className="mb-5 flex gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800"><WifiOff size={18}/>Offline mode. This operation is provisional until the server validates current stock and permissions.</div>}
  <div className="grid gap-4 sm:grid-cols-2"><Field label="Movement type" required><select value={values.type} onChange={e=>change('type',e.target.value)}>{types.map(t=><option key={t} value={t}>{human(t)}</option>)}</select></Field><Field label="Warehouse" required><ReferenceInput field={{name:'warehouseId',label:'Warehouse',source:'warehouses',required:true}} value={values.warehouseId} onChange={v=>change('warehouseId',v)}/></Field><Field label="Product" required><ReferenceInput field={{name:'productId',label:'Product',source:'products',required:true}} value={values.productId} onChange={v=>change('productId',v)}/></Field><Field label="Quantity" required><input type="number" min="0.001" step="0.001" max="999999999" required value={values.quantity} onChange={e=>change('quantity',e.target.value)}/><p className="mt-2 text-[11px] text-slate-400">{stock.data?`Available: ${number(current?.available||0)} · version ${current?.version||0}`:stock.error?'Stock not cached for this selection.':'Select a warehouse and product.'}</p></Field>
  {distribution&&<Field label="Distributor" required><ReferenceInput field={{name:'distributorId',label:'Distributor',source:'distributors',required:true}} value={values.distributorId} onChange={v=>change('distributorId',v)}/></Field>}
  {values.type==='adjustment'&&<Field label="Adjustment direction"><select value={values.direction} onChange={e=>change('direction',e.target.value)}><option value="add">Add stock</option><option value="remove">Remove stock</option></select></Field>}
  <Field label={values.type==='incoming'?'Supplier / source':'Destination / customer'}><input maxLength={255} value={values.counterparty} onChange={e=>change('counterparty',e.target.value)}/></Field><Field label="Batch / external reference"><input maxLength={255} value={values.reference} onChange={e=>change('reference',e.target.value)}/></Field>
  {can('finance.read')&&<Field label="Unit cost (₦)"><input type="number" min="0" step="0.01" value={values.cost} onChange={e=>change('cost',e.target.value)}/></Field>}
  <Field label="Delivery information"><input maxLength={1000} value={values.delivery} onChange={e=>change('delivery',e.target.value)}/></Field><div className="sm:col-span-2"><Field label={values.type==='adjustment'?'Reason for adjustment':'Notes'} required={values.type==='adjustment'}><textarea rows={3} maxLength={2000} minLength={values.type==='adjustment'?5:undefined} required={values.type==='adjustment'} value={values.notes} onChange={e=>change('notes',e.target.value)}/></Field></div></div>
  <div className="mt-4 flex items-center gap-2 text-xs text-slate-400"><ShieldCheck size={15}/>{values.type==='adjustment'?'An administrator must approve this adjustment.':'The server checks stock availability before confirmation.'}</div>{error&&<p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}<div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-5"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><Submit busy={busy||!stock.data}>{online?'Record movement':'Save offline'}</Submit></div></form></Modal>
}
