import { useEffect, useMemo, useRef, useState } from 'react'
import { audit, db, now, uid } from '../db/database'
import type { AppSettings, Maintenance, MaintenanceContract, Supplier } from '../types/models'
import { Empty, Modal, Money, PageHeader } from '../components/Common'
import { exportElementPdf, exportExcel } from '../services/export'
import { saveMaintenanceContract } from '../services/operations'
import { saveAttachment } from '../services/attachments'
import AttachmentManager from '../components/AttachmentManager'
import { validateFinancialAmount } from '../services/finance'

type Tab = 'work' | 'contract' | 'upcoming'
type Row = Maintenance | MaintenanceContract
const today = () => new Date().toISOString().slice(0, 10)
const blank = {
  title: '', item: '', category: '', description: '', priority: 'متوسطة', reportDate: today(), dueDate: '',
  completedDate: '', contractor: '', expectedCost: 0, actualCost: 0, status: 'جديدة', recurring: false,
  recurrence: 'سنوي', nextDate: '', notes: '', name: '', serviceType: '', supplierId: '', contractNo: '',
  startDate: today(), endDate: '', amount: 0, paymentTerms: '', paymentFrequency: 'سنوي',
  responsiblePerson: '', phone: '', alertDays: 30
}

export default function MaintenancePage() {
  const [tab, setTab] = useState<Tab>('work')
  const [works, setWorks] = useState<Maintenance[]>([])
  const [contracts, setContracts] = useState<MaintenanceContract[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Row | null>(null)
  const [attachmentsFor, setAttachmentsFor] = useState<Row | null>(null)
  const [form, setForm] = useState(blank)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const reportRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    const [workRows, contractRows, supplierRows, config] = await Promise.all([db.maintenance.toArray(), db.maintenanceContracts.toArray(), db.suppliers.toArray(), db.settings.get('main')])
    setWorks(workRows); setContracts(contractRows); setSuppliers(supplierRows); setSettings(config || null)
  }
  useEffect(() => { void load() }, [])

  const upcoming = useMemo(() => works.filter(item => item.active !== false && !['مكتملة', 'ملغاة'].includes(item.status) && (item.nextDate || item.dueDate) >= today()).sort((a, b) => (a.nextDate || a.dueDate).localeCompare(b.nextDate || b.dueDate)), [works])
  const rows: Row[] = tab === 'contract' ? contracts : tab === 'upcoming' ? upcoming : works
  const filtered = useMemo(() => rows.filter(item => !query || Object.values(item).filter(value => typeof value === 'string').join(' ').toLowerCase().includes(query.toLowerCase())), [rows, query])
  const title = tab === 'contract' ? 'عقود الصيانة' : tab === 'upcoming' ? 'مواعيد الصيانة القادمة' : 'أعمال الصيانة'
  const supplierName = (id?: string) => suppliers.find(item => item.id === id)?.name || '—'
  const exportRows = filtered.map(item => tab === 'contract' ? {
    العقد: (item as MaintenanceContract).name, الخدمة: (item as MaintenanceContract).serviceType,
    الشركة: (item as MaintenanceContract).contractorName, المورد: supplierName((item as MaintenanceContract).supplierId),
    رقم_العقد: (item as MaintenanceContract).contractNo, البداية: (item as MaintenanceContract).startDate,
    النهاية: (item as MaintenanceContract).endDate, القيمة: (item as MaintenanceContract).amount,
    دورية_الدفع: (item as MaintenanceContract).paymentFrequency, المسؤول: (item as MaintenanceContract).responsiblePerson,
    الحالة: item.active === false ? 'غير نشط' : 'نشط'
  } : {
    العنوان: (item as Maintenance).title, العنصر: (item as Maintenance).item || '', التصنيف: (item as Maintenance).category,
    الأولوية: (item as Maintenance).priority, الحالة: (item as Maintenance).status, البلاغ: (item as Maintenance).reportDate,
    التنفيذ_المتوقع: (item as Maintenance).dueDate, التنفيذ_الفعلي: (item as Maintenance).completedDate,
    الموعد_القادم: (item as Maintenance).nextDate, التكرار: (item as Maintenance).recurring ? (item as Maintenance).recurrence || 'دورية' : 'غير دورية',
    المقاول: (item as Maintenance).contractor, التكلفة_المتوقعة: (item as Maintenance).expectedCost, التكلفة_الفعلية: (item as Maintenance).actualCost
  })

  function startCreate() {
    setEditing(null); setPendingFile(null); setForm({ ...blank, category: settings?.maintenanceCategories?.[0] || '' }); setError(''); setOpen(true)
  }
  function startEdit(item: Row) {
    setEditing(item); setPendingFile(null); setError('')
    if (tab === 'contract') {
      const row = item as MaintenanceContract
      setForm({ ...blank, name: row.name, serviceType: row.serviceType, supplierId: row.supplierId || '', contractNo: row.contractNo, startDate: row.startDate, endDate: row.endDate, amount: row.amount, paymentTerms: row.paymentTerms, paymentFrequency: row.paymentFrequency, responsiblePerson: row.responsiblePerson, phone: row.phone, alertDays: row.alertDays, notes: row.notes, contractor: row.contractorName })
    } else {
      const row = item as Maintenance
      setForm({ ...blank, title: row.title, item: row.item || '', category: row.category, description: row.description, priority: row.priority, reportDate: row.reportDate, dueDate: row.dueDate, completedDate: row.completedDate, contractor: row.contractor, expectedCost: row.expectedCost, actualCost: row.actualCost, status: row.status, recurring: row.recurring, recurrence: row.recurrence || '', nextDate: row.nextDate, notes: row.notes })
    }
    setOpen(true)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    try {
      let saved: Row
      if (tab === 'contract') {
        validateFinancialAmount(form.amount, true)
        const data = {
          name: form.name, serviceType: form.serviceType, supplierId: form.supplierId || undefined,
          contractorName: suppliers.find(item => item.id === form.supplierId)?.name || form.contractor,
          contractNo: form.contractNo, startDate: form.startDate, endDate: form.endDate, amount: form.amount,
          paymentTerms: form.paymentTerms, paymentFrequency: form.paymentFrequency, responsiblePerson: form.responsiblePerson,
          phone: form.phone, alertDays: form.alertDays, notes: form.notes, status: 'active'
        }
        if (editing) {
          saved = { ...(editing as MaintenanceContract), ...data, updatedAt: now() }
          await db.maintenanceContracts.put(saved as MaintenanceContract)
          await audit('maintenanceContracts', saved.id, 'update', 'تعديل عقد صيانة', editing, saved)
        } else saved = await saveMaintenanceContract(data)
      } else {
        if (form.expectedCost < 0 || form.actualCost < 0) throw new Error('التكاليف لا يمكن أن تكون سالبة')
        const data = {
          title: form.title, item: form.item, category: form.category, description: form.description, priority: form.priority,
          reportDate: form.reportDate, dueDate: form.dueDate, completedDate: form.completedDate, contractor: form.contractor,
          expectedCost: form.expectedCost, actualCost: form.actualCost, status: form.status, recurring: form.recurring,
          recurrence: form.recurring ? form.recurrence : '', nextDate: form.recurring ? form.nextDate : '', notes: form.notes
        }
        if (editing) {
          saved = { ...(editing as Maintenance), ...data, updatedAt: now() }
          await db.maintenance.put(saved as Maintenance)
          await audit('maintenance', saved.id, 'update', 'تعديل عمل صيانة', editing, saved)
        } else {
          const timestamp = now()
          saved = { ...data, id: uid(), createdAt: timestamp, updatedAt: timestamp, active: true }
          await db.maintenance.add(saved as Maintenance)
          await audit('maintenance', saved.id, 'create', 'إضافة عمل صيانة', undefined, saved)
        }
      }
      if (pendingFile) await saveAttachment({ entityType: tab === 'contract' ? 'maintenance-contract' : 'maintenance', entityId: saved.id, file: pendingFile, category: tab === 'contract' ? 'contract' : 'maintenance' })
      setOpen(false); setEditing(null); setPendingFile(null); await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر الحفظ')
    }
  }

  async function cancel(item: Row) {
    const reason = prompt(`سبب إلغاء ${tab === 'contract' ? 'العقد' : 'عمل الصيانة'}`)
    if (!reason?.trim()) return
    if (tab === 'contract') {
      const updated = { ...(item as MaintenanceContract), active: false, status: 'cancelled', deletedReason: reason.trim(), updatedAt: now() }
      await db.maintenanceContracts.put(updated); await audit('maintenanceContracts', item.id, 'cancel', 'إلغاء عقد صيانة', item, updated, reason.trim())
    } else {
      const updated = { ...(item as Maintenance), active: false, status: 'ملغاة', deletedReason: reason.trim(), updatedAt: now() }
      await db.maintenance.put(updated); await audit('maintenance', item.id, 'cancel', 'إلغاء عمل صيانة', item, updated, reason.trim())
    }
    await load()
  }

  return <>
    <PageHeader title="الصيانة والعقود" onAdd={tab === 'upcoming' ? undefined : startCreate} onExcel={() => exportExcel(exportRows, title)} onPdf={() => reportRef.current && exportElementPdf(reportRef.current, title)} />
    <div className="tabs"><button className={tab === 'work' ? 'active' : ''} onClick={() => { setTab('work'); setQuery('') }}>أعمال الصيانة</button><button className={tab === 'contract' ? 'active' : ''} onClick={() => { setTab('contract'); setQuery('') }}>العقود</button><button className={tab === 'upcoming' ? 'active' : ''} onClick={() => { setTab('upcoming'); setQuery('') }}>المواعيد القادمة</button></div>
    <div className="panel filters-bar"><label>بحث<input value={query} onChange={event => setQuery(event.target.value)} placeholder={`بحث في ${title}`} /></label><button onClick={() => setQuery('')}>مسح البحث</button><strong>النتائج: {filtered.length}</strong></div>
    <div className="panel" ref={reportRef}>
      {exportRows.length ? <table><thead><tr>{Object.keys(exportRows[0]).map(key => <th key={key}>{key.replaceAll('_', ' ')}</th>)}{tab !== 'upcoming' && <th>الإجراءات</th>}</tr></thead><tbody>{exportRows.map((row, index) => <tr className={filtered[index].active === false ? 'muted' : ''} key={filtered[index].id}>{Object.entries(row).map(([key, value]) => <td key={key}>{['القيمة', 'التكلفة_المتوقعة', 'التكلفة_الفعلية'].includes(key) ? <Money value={Number(value)} /> : String(value ?? '')}</td>)}{tab !== 'upcoming' && <td className="actions"><button onClick={() => startEdit(filtered[index])}>تعديل</button><button onClick={() => setAttachmentsFor(filtered[index])}>المرفقات</button><button className="danger" onClick={() => void cancel(filtered[index])}>إلغاء</button></td>}</tr>)}</tbody></table> : <Empty text={`لا توجد بيانات في ${title}`} />}
    </div>

    <Modal open={open} title={`${editing ? 'تعديل' : 'إضافة'} ${title}`} onClose={() => setOpen(false)}>
      <form onSubmit={save} className="form-grid">
        {error && <div className="full error-message">{error}</div>}
        {tab === 'contract' ? <>
          <label>اسم العقد<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>نوع الخدمة<input required value={form.serviceType} onChange={event => setForm({ ...form, serviceType: event.target.value })} /></label>
          <label>الشركة/المقاول<select value={form.supplierId} onChange={event => setForm({ ...form, supplierId: event.target.value })}><option value="">إدخال يدوي</option>{suppliers.filter(item => item.active !== false).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>اسم مقاول يدوي<input value={form.contractor} onChange={event => setForm({ ...form, contractor: event.target.value })} /></label>
          <label>رقم العقد<input value={form.contractNo} onChange={event => setForm({ ...form, contractNo: event.target.value })} /></label><label>تاريخ البداية<input type="date" value={form.startDate} onChange={event => setForm({ ...form, startDate: event.target.value })} /></label>
          <label>تاريخ النهاية<input type="date" value={form.endDate} onChange={event => setForm({ ...form, endDate: event.target.value })} /></label><label>قيمة العقد<input type="number" min="0" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: Number(event.target.value) })} /></label>
          <label>آلية الدفع<input value={form.paymentTerms} onChange={event => setForm({ ...form, paymentTerms: event.target.value })} /></label><label>دورية الدفع<select value={form.paymentFrequency} onChange={event => setForm({ ...form, paymentFrequency: event.target.value })}><option>شهري</option><option>ربع سنوي</option><option>نصف سنوي</option><option>سنوي</option><option>حسب الإنجاز</option></select></label>
          <label>المسؤول<input value={form.responsiblePerson} onChange={event => setForm({ ...form, responsiblePerson: event.target.value })} /></label><label>رقم التواصل<input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></label>
          <label>التنبيه قبل النهاية (يوم)<input type="number" min="0" value={form.alertDays} onChange={event => setForm({ ...form, alertDays: Number(event.target.value) })} /></label>
        </> : <>
          <label>العنوان<input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label><label>العنصر<input value={form.item} onChange={event => setForm({ ...form, item: event.target.value })} /></label>
          <label>التصنيف<input list="maintenance-categories" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} /><datalist id="maintenance-categories">{(settings?.maintenanceCategories || []).map(item => <option key={item} value={item} />)}</datalist></label><label>الأولوية<select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })}><option>منخفضة</option><option>متوسطة</option><option>عالية</option><option>طارئة</option></select></label>
          <label className="full">الوصف<textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
          <label>تاريخ البلاغ<input type="date" value={form.reportDate} onChange={event => setForm({ ...form, reportDate: event.target.value })} /></label><label>التنفيذ المتوقع<input type="date" value={form.dueDate} onChange={event => setForm({ ...form, dueDate: event.target.value })} /></label>
          <label>التنفيذ الفعلي<input type="date" value={form.completedDate} onChange={event => setForm({ ...form, completedDate: event.target.value })} /></label><label>المقاول/الفني<input value={form.contractor} onChange={event => setForm({ ...form, contractor: event.target.value })} /></label>
          <label>التكلفة المتوقعة<input type="number" min="0" step="0.01" value={form.expectedCost} onChange={event => setForm({ ...form, expectedCost: Number(event.target.value) })} /></label><label>التكلفة الفعلية<input type="number" min="0" step="0.01" value={form.actualCost} onChange={event => setForm({ ...form, actualCost: Number(event.target.value) })} /></label>
          <label>الحالة<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option>جديدة</option><option>مجدولة</option><option>قيد التنفيذ</option><option>مكتملة</option><option>مؤجلة</option><option>ملغاة</option></select></label>
          <label><input type="checkbox" checked={form.recurring} onChange={event => setForm({ ...form, recurring: event.target.checked })} /> صيانة دورية</label>
          {form.recurring && <><label>التكرار<select value={form.recurrence} onChange={event => setForm({ ...form, recurrence: event.target.value })}><option>أسبوعي</option><option>شهري</option><option>ربع سنوي</option><option>نصف سنوي</option><option>سنوي</option></select></label><label>موعد الصيانة القادمة<input required type="date" value={form.nextDate} onChange={event => setForm({ ...form, nextDate: event.target.value })} /></label></>}
        </>}
        <label className="full">صور/فاتورة/مرفق جديد<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event => setPendingFile(event.target.files?.[0] || null)} /></label>
        <label className="full">ملاحظات<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label>
        <button className="primary full">حفظ</button>
      </form>
    </Modal>

    <Modal open={!!attachmentsFor} title={`مرفقات ${title}`} onClose={() => setAttachmentsFor(null)}>
      {attachmentsFor && <AttachmentManager entityType={tab === 'contract' ? 'maintenance-contract' : 'maintenance'} entityId={attachmentsFor.id} title="الصور والفواتير والمرفقات" />}
    </Modal>
  </>
}
