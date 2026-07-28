import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db/database'
import type { AuditLog } from '../types/models'
import { Empty, PageHeader } from '../components/Common'
import { exportElementPdf, exportExcel } from '../services/export'

export default function Audit(){
  const [rows,setRows]=useState<AuditLog[]>([])
  const [query,setQuery]=useState('')
  const [entity,setEntity]=useState('')
  const [action,setAction]=useState('')
  const ref=useRef<HTMLDivElement>(null)
  useEffect(()=>{db.audit.orderBy('createdAt').reverse().toArray().then(setRows)},[])
  const filtered=useMemo(()=>rows.filter(r=>(!entity||r.entity===entity)&&(!action||r.action===action)&&(!query||`${r.description} ${r.entity} ${r.action} ${r.reason||''}`.toLowerCase().includes(query.toLowerCase()))),[rows,query,entity,action])
  const entities=[...new Set(rows.map(r=>r.entity))]
  const actions=[...new Set(rows.map(r=>r.action))]
  const exportRows=filtered.map(r=>({التاريخ:new Date(r.createdAt).toLocaleString('ar-SA'),القسم:r.entity,العملية:r.action,الوصف:r.description,السبب:r.reason||'',الإصدار:r.appVersion||''}))
  return <><PageHeader title="سجل العمليات" onExcel={()=>exportExcel(exportRows,'سجل_العمليات')} onPdf={()=>ref.current&&exportElementPdf(ref.current,'سجل_العمليات')}/>
    <div className="panel filters-bar"><label>بحث<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="الوصف أو السبب"/></label><label>القسم<select value={entity} onChange={e=>setEntity(e.target.value)}><option value="">الكل</option>{entities.map(x=><option key={x}>{x}</option>)}</select></label><label>العملية<select value={action} onChange={e=>setAction(e.target.value)}><option value="">الكل</option>{actions.map(x=><option key={x}>{x}</option>)}</select></label><button onClick={()=>{setQuery('');setEntity('');setAction('')}}>مسح الفلاتر</button><strong>النتائج: {filtered.length}</strong></div>
    <div className="panel" ref={ref}>{filtered.length?<table><thead><tr><th>التاريخ</th><th>القسم</th><th>العملية</th><th>الوصف</th><th>السبب</th><th>الإصدار</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td>{new Date(r.createdAt).toLocaleString('ar-SA')}</td><td>{r.entity}</td><td>{r.action}</td><td>{r.description}</td><td>{r.reason||'—'}</td><td>{r.appVersion||'—'}</td></tr>)}</tbody></table>:<Empty text="لا توجد عمليات مطابقة"/>}</div></>
}
