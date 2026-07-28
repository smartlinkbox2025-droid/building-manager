import { useEffect, useMemo, useRef, useState } from 'react'
import { audit, db, now, uid } from '../db/database'
import type { Apartment } from '../types/models'
import { Empty, Modal, Money, PageHeader } from '../components/Common'
import { exportElementPdf, exportExcel } from '../services/export'
import { normalizeInternationalPhone } from '../utils/phone'

const pageSize = 15
const emptyForm = {
  number: '', floor: '', type: 'شقة', occupancyStatus: 'مشغولة', ownerName: '', residentName: '',
  phone: '', monthlyFee: 100, dueStartDate: new Date().toISOString().slice(0, 10), notes: ''
}

type ApartmentForm = typeof emptyForm

export default function Apartments() {
  const [rows, setRows] = useState<Apartment[]>([])
  const [editing, setEditing] = useState<Apartment | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ApartmentForm>(emptyForm)
  const [query, setQuery] = useState(() => sessionStorage.getItem('apartments:query') || '')
  const [status, setStatus] = useState(() => sessionStorage.getItem('apartments:status') || 'active')
  const [sort, setSort] = useState(() => sessionStorage.getItem('apartments:sort') || 'number')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const reportRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    const [items, settings] = await Promise.all([db.apartments.toArray(), db.settings.get('main')])
    setRows(items)
    if (!editing && !open && settings) setForm(current => ({ ...current, monthlyFee: settings.defaultMonthlyFee }))
  }
  useEffect(() => { void load() }, [])
  useEffect(() => {
    sessionStorage.setItem('apartments:query', query)
    sessionStorage.setItem('apartments:status', status)
    sessionStorage.setItem('apartments:sort', sort)
    setPage(1)
  }, [query, status, sort])

  const filtered = useMemo(() => rows
    .filter(item => status === 'all' || (status === 'active' ? item.active !== false : item.active === false))
    .filter(item => !query || `${item.number} ${item.floor} ${item.ownerName} ${item.residentName} ${item.phone}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'floor') return a.floor.localeCompare(b.floor, 'ar', { numeric: true })
      if (sort === 'owner') return a.ownerName.localeCompare(b.ownerName, 'ar')
      return a.number.localeCompare(b.number, 'ar', { numeric: true })
    }), [rows, query, status, sort])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const exportRows = filtered.map(item => ({
    رقم_الشقة: item.number, الطابق: item.floor, النوع: item.type, الإشغال: item.occupancyStatus || '',
    المالك: item.ownerName, الساكن: item.residentName, الجوال: item.phone, الاشتراك: item.monthlyFee,
    بداية_الاستحقاق: item.dueStartDate || '', الحالة: item.active === false ? 'غير نشطة' : 'نشطة', ملاحظات: item.notes
  }))

  function startCreate() {
    setEditing(null)
    setForm({ ...emptyForm, monthlyFee: form.monthlyFee })
    setError('')
    setOpen(true)
  }

  function startEdit(item: Apartment) {
    setEditing(item)
    setForm({
      number: item.number, floor: item.floor, type: item.type, occupancyStatus: item.occupancyStatus || 'مشغولة',
      ownerName: item.ownerName, residentName: item.residentName, phone: item.phone, monthlyFee: item.monthlyFee,
      dueStartDate: item.dueStartDate || '', notes: item.notes
    })
    setError('')
    setOpen(true)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    const number = form.number.trim()
    if (!number) return setError('رقم الشقة مطلوب')
    const duplicate = await db.apartments.where('number').equals(number).first()
    if (duplicate && duplicate.id !== editing?.id) return setError('رقم الشقة مستخدم')
    const timestamp = now()
    if (editing) {
      const updated: Apartment = { ...editing, ...form, number, phone: normalizeInternationalPhone(form.phone), updatedAt: timestamp }
      let syncedCharges = 0
      let protectedCharges = 0
      await db.transaction('rw', db.apartments, db.charges, db.payments, db.audit, async () => {
        await db.apartments.put(updated)
        await audit('apartments', updated.id, 'update', `تعديل الشقة ${updated.number}`, editing, updated)
        if (updated.monthlyFee !== editing.monthlyFee) {
          const linkedCharges = await db.charges.where('apartmentId').equals(updated.id).toArray()
          for (const charge of linkedCharges.filter(item => item.active !== false && item.status !== 'ملغى')) {
            const chargePayments = await db.payments.where('chargeId').equals(charge.id).toArray()
            const hasActivePayments = chargePayments.some(payment => payment.active !== false && !payment.cancelled)
            if (hasActivePayments) {
              protectedCharges += 1
              continue
            }
            const changed = { ...charge, baseAmount: updated.monthlyFee, updatedAt: timestamp }
            await db.charges.put(changed)
            await audit('charges', charge.id, 'update', `مزامنة اشتراك الشقة ${updated.number} مع القيمة الشهرية الجديدة`, charge, changed)
            syncedCharges += 1
          }
        }
      })
      if (syncedCharges || protectedCharges) {
        window.alert(`تم تحديث ${syncedCharges} استحقاق غير مسدد.${protectedCharges ? ` وتم الحفاظ على ${protectedCharges} استحقاق مرتبط بدفعات سابقة.` : ''}`)
      }
    } else {
      const item: Apartment = {
        ...form, number, phone: normalizeInternationalPhone(form.phone), id: uid(), createdAt: timestamp,
        updatedAt: timestamp, active: true, status: 'active'
      }
      await db.transaction('rw', db.apartments, db.audit, async () => {
        await db.apartments.add(item)
        await audit('apartments', item.id, 'create', `إضافة الشقة ${item.number}`, undefined, item)
      })
    }
    setOpen(false)
    setEditing(null)
    await load()
  }

  async function toggle(item: Apartment) {
    const linkedResidents = await db.residents.where('apartmentId').equals(item.id).toArray()
    const linkedCharges = await db.charges.where('apartmentId').equals(item.id).toArray()
    const nextActive = item.active === false
    const message = nextActive
      ? `إعادة تفعيل الشقة ${item.number}؟`
      : `تعطيل الشقة ${item.number}؟ ستبقى ${linkedResidents.length} سجلات سكان و${linkedCharges.length} استحقاقات محفوظة ومرتبطة بها.`
    if (!confirm(message)) return
    const updated = { ...item, active: nextActive, status: nextActive ? 'active' : 'inactive', updatedAt: now() }
    await db.transaction('rw', db.apartments, db.audit, async () => {
      await db.apartments.put(updated)
      await audit('apartments', item.id, nextActive ? 'reactivate' : 'deactivate', `${nextActive ? 'إعادة تفعيل' : 'تعطيل'} الشقة ${item.number}`, item, updated)
    })
    await load()
  }

  return <>
    <PageHeader title="إدارة الشقق" onAdd={startCreate} onExcel={() => exportExcel(exportRows, 'الشقق_المفلترة')} onPdf={() => reportRef.current && exportElementPdf(reportRef.current, 'الشقق_المفلترة')} />
    <div className="panel filters-bar">
      <label>بحث<input value={query} onChange={event => setQuery(event.target.value)} placeholder="رقم، مالك، ساكن أو جوال" /></label>
      <label>الحالة<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">الكل</option><option value="active">النشطة</option><option value="inactive">غير النشطة</option></select></label>
      <label>الفرز<select value={sort} onChange={event => setSort(event.target.value)}><option value="number">رقم الشقة</option><option value="floor">الطابق</option><option value="owner">المالك</option></select></label>
      <button onClick={() => { setQuery(''); setStatus('active'); setSort('number') }}>مسح الفلاتر</button>
      <strong>النتائج: {filtered.length}</strong>
    </div>
    <div className="panel" ref={reportRef}>
      {visible.length ? <table><thead><tr><th>رقم الشقة</th><th>الطابق</th><th>النوع</th><th>الإشغال</th><th>المالك</th><th>الساكن</th><th>الجوال</th><th>الاشتراك</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
        <tbody>{visible.map(item => <tr className={item.active === false ? 'muted' : ''} key={item.id}>
          <td>{item.number}</td><td>{item.floor}</td><td>{item.type}</td><td>{item.occupancyStatus || '—'}</td><td>{item.ownerName}</td><td>{item.residentName}</td><td>{item.phone}</td><td><Money value={item.monthlyFee} /></td><td>{item.active === false ? 'غير نشطة' : 'نشطة'}</td>
          <td className="actions"><button onClick={() => startEdit(item)}>تعديل</button><button className={item.active === false ? '' : 'danger'} onClick={() => void toggle(item)}>{item.active === false ? 'تفعيل' : 'تعطيل'}</button></td>
        </tr>)}</tbody></table> : <Empty text={rows.length ? 'لا توجد نتائج مطابقة' : 'لا توجد شقق بعد'} />}
    </div>
    {pages > 1 && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>السابق</button><span>صفحة {page} من {pages}</span><button disabled={page >= pages} onClick={() => setPage(value => value + 1)}>التالي</button></div>}
    <Modal open={open} title={editing ? 'تعديل الشقة' : 'إضافة شقة'} onClose={() => setOpen(false)}>
      <form onSubmit={save} className="form-grid">
        {error && <div className="full error-message">{error}</div>}
        <label>رقم الشقة<input required value={form.number} onChange={event => setForm({ ...form, number: event.target.value })} /></label>
        <label>الطابق<input value={form.floor} onChange={event => setForm({ ...form, floor: event.target.value })} /></label>
        <label>نوع الوحدة<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}><option>شقة</option><option>محل</option><option>مكتب</option><option>مستودع</option><option>أخرى</option></select></label>
        <label>حالة الإشغال<select value={form.occupancyStatus} onChange={event => setForm({ ...form, occupancyStatus: event.target.value })}><option>مشغولة</option><option>شاغرة</option><option>تحت الصيانة</option></select></label>
        <label>اسم المالك<input value={form.ownerName} onChange={event => setForm({ ...form, ownerName: event.target.value })} /></label>
        <label>اسم الساكن<input value={form.residentName} onChange={event => setForm({ ...form, residentName: event.target.value })} /></label>
        <label>الجوال الدولي<input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="+9665XXXXXXXX" /></label>
        <label>الاشتراك الشهري<input type="number" min="0" step="0.01" value={form.monthlyFee} onChange={event => setForm({ ...form, monthlyFee: Number(event.target.value) })} /></label>
        <label>بداية الاستحقاق<input type="date" value={form.dueStartDate} onChange={event => setForm({ ...form, dueStartDate: event.target.value })} /></label>
        <label className="full">ملاحظات<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label>
        <button className="primary full">حفظ</button>
      </form>
    </Modal>
  </>
}
