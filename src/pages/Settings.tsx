import { useEffect,useRef,useState } from 'react'
import { db,ensureSettings,audit } from '../db/database'
import type { AppSettings } from '../types/models'
import { PageHeader } from '../components/Common'
import { createBackup,deleteAllApplicationData,inspectBackup,restoreBackup,type BackupPreview,type RestoreMode } from '../services/backup'

function bytes(value?:number){if(!value)return '—';if(value<1024)return `${value} B`;if(value<1024*1024)return `${(value/1024).toFixed(1)} KB`;return `${(value/1024/1024).toFixed(2)} MB`}

export default function Settings(){
  const [s,setS]=useState<AppSettings|null>(null)
  const [preview,setPreview]=useState<BackupPreview|null>(null)
  const [restoreFile,setRestoreFile]=useState<File|null>(null)
  const [restoreMode,setRestoreMode]=useState<RestoreMode>('replace')
  const [busy,setBusy]=useState(false)
  const fileRef=useRef<HTMLInputElement>(null)
  useEffect(()=>{ensureSettings().then(()=>db.settings.get('main').then(x=>setS(x||null)))},[])
  if(!s)return null
  async function save(e:React.FormEvent){e.preventDefault();const old=await db.settings.get('main');await db.settings.put(s!);await audit('settings','main','update','تحديث الإعدادات',old,s);alert('تم الحفظ')}
  async function chooseBackup(file?:File){if(!file)return;try{setBusy(true);const info=await inspectBackup(file);setRestoreFile(file);setPreview(info)}catch(err){alert((err as Error).message);setRestoreFile(null);setPreview(null)}finally{setBusy(false)}}
  async function runRestore(){if(!restoreFile||!preview)return;const warning=restoreMode==='replace'?'سيتم استبدال جميع البيانات الحالية بعد التحقق من النسخة.':'سيتم دمج السجلات ومنع التكرار حسب المعرفات.';if(!confirm(`${warning}\nهل تريد المتابعة؟`))return;try{setBusy(true);await restoreBackup(restoreFile,restoreMode);alert('تمت الاستعادة بنجاح');location.reload()}catch(err){alert((err as Error).message)}finally{setBusy(false)}}
  async function clearAll(){
    if(!confirm('سيتم حذف جميع السجلات والمرفقات والإعدادات والكاش. يُنصح بإنشاء نسخة احتياطية أولاً.'))return
    const text=prompt('اكتب العبارة التالية تماماً:\nحذف جميع البيانات')
    if(text!=='حذف جميع البيانات'){alert('لم تتطابق عبارة التأكيد، ولم يتم الحذف.');return}
    if(!confirm('تأكيد نهائي: لا يمكن التراجع عن الحذف دون نسخة احتياطية.'))return
    try{setBusy(true);await deleteAllApplicationData();alert('تم حذف جميع البيانات وإعادة تهيئة التطبيق');location.reload()}catch(err){alert((err as Error).message)}finally{setBusy(false)}
  }
  return <><PageHeader title="الإعدادات"/><div className="settings-grid">
    <form className="panel form-grid" onSubmit={save}><h2 className="full">هوية العمارة والإعدادات المالية</h2><label>اسم العمارة<input value={s.buildingName} onChange={e=>setS({...s,buildingName:e.target.value})}/></label><label>العنوان<input value={s.address} onChange={e=>setS({...s,address:e.target.value})}/></label><label>الجوال<input value={s.phone} onChange={e=>setS({...s,phone:e.target.value})}/></label><label>العملة<input value={s.currency} onChange={e=>setS({...s,currency:e.target.value})}/></label><label>رمز العملة<input value={s.currencySymbol} onChange={e=>setS({...s,currencySymbol:e.target.value})}/></label><label>الرصيد الافتتاحي<input type="number" value={s.openingBalance} onChange={e=>setS({...s,openingBalance:Number(e.target.value)})}/></label><label>الاشتراك الافتراضي<input type="number" value={s.defaultMonthlyFee} onChange={e=>setS({...s,defaultMonthlyFee:Number(e.target.value)})}/></label><label>بادئة الإيصال<input value={s.receiptPrefix} onChange={e=>setS({...s,receiptPrefix:e.target.value})}/></label><label className="full">قالب تذكير WhatsApp<textarea value={s.whatsappTemplate} onChange={e=>setS({...s,whatsappTemplate:e.target.value})}/><small>المتغيرات: [الاسم] [الشقة] [الشهر] [السنة] [المطلوب] [المدفوع] [المتبقي] [العمارة]</small></label><label className="full">قالب ملخص التقرير<textarea value={s.whatsappReportTemplate || ''} onChange={e=>setS({...s,whatsappReportTemplate:e.target.value})}/><small>المتغيرات: [العمارة] [الفترة] [الإيرادات] [المصروفات] [المتأخرات] [الرصيد] [التاريخ]</small></label><label>اسم الجهة المرسلة<input value={s.senderName || ''} onChange={e=>setS({...s,senderName:e.target.value})}/></label><label>رمز الدولة الافتراضي<input value={s.countryCode} onChange={e=>setS({...s,countryCode:e.target.value})}/></label><button className="primary full" disabled={busy}>حفظ الإعدادات</button></form>
    <div>
      <div className="panel"><h2>النسخ الاحتياطي</h2><p>آخر نسخة: {s.lastBackupAt?new Date(s.lastBackupAt).toLocaleString('ar-SA'):'لا توجد'}</p><p>اسم الملف: {s.lastBackupFileName||'—'}</p><p>الحجم: {bytes(s.lastBackupSize)}</p><button className="primary" disabled={busy} onClick={async()=>{try{setBusy(true);const result=await createBackup();setS({...s,lastBackupAt:result.createdAt,lastBackupFileName:result.fileName,lastBackupSize:result.size})}finally{setBusy(false)}}}>تصدير نسخة ZIP كاملة</button><button disabled={busy} onClick={()=>fileRef.current?.click()}>اختيار نسخة للاستعادة</button><input ref={fileRef} type="file" accept=".zip" hidden onChange={e=>chooseBackup(e.target.files?.[0])}/>
      {preview&&<div className="backup-preview"><h3>معاينة النسخة</h3><p>الملف: {preview.fileName}</p><p>تاريخ الإنشاء: {preview.createdAt?new Date(preview.createdAt).toLocaleString('ar-SA'):'غير معروف'}</p><p>إصدار التطبيق: {preview.appVersion}</p><p>إصدار قاعدة البيانات: {preview.schemaVersion}</p><p>المرفقات: {preview.attachmentCount}</p><label>طريقة الاستعادة<select value={restoreMode} onChange={e=>setRestoreMode(e.target.value as RestoreMode)}><option value="replace">استبدال جميع البيانات</option><option value="merge">دمج ومنع التكرار</option></select></label><button className="primary" disabled={busy} onClick={runRestore}>تنفيذ الاستعادة</button></div>}</div>
      <div className="panel danger-zone"><h2>منطقة خطرة</h2><p>يحذف هذا الإجراء جميع جداول IndexedDB والمرفقات والإيصالات والإعدادات والكاش المحلي.</p><p><strong>أنشئ نسخة احتياطية قبل المتابعة.</strong></p><button className="danger" disabled={busy} onClick={clearAll}>حذف جميع البيانات</button></div>
    </div>
  </div></>
}
