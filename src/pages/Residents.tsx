import { useEffect, useMemo, useRef, useState } from 'react'
import { audit, db, now, uid } from '../db/database'
import type { Apartment, Charge, Payment, Resident } from '../types/models'
import { Empty, Modal, Money, PageHeader } from '../components/Common'
import { exportElementPdf, exportExcel } from '../services/export'
import { normalizeInternationalPhone } from '../utils/phone'

const pageSize = 15
const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = { name: '', relation: 'مالك', apartmentId: '', phone: '', email: '', startDate: today(), endDate: '', notes: '' }

export default function Residents() {
  const [rows, setRows] = useState<Resident[]>([])
  const [apartments, setApartments] = useState<Apartment[]>([])
  const [charges, setCharges] = useState<Charge[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [countryCode, setCountryCode] = useState('+966')
  const [editing, setEditing] = useState<Resident | null>(null)
  const [details, setDetails] = useState<Resident | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [query, setQuery] = useState(() => sessionStorage.getItem('residents:query') || '')
  const [status, setStatus] = useState(() => sessionStorage.getItem('residents:status') || 'active')
  const [apartmentFilter, setApartmentFilter] = useState(() => sessionStorage.getItem('residents:apartment') || '')
  const [sort, setSort] = useState(() => sessionStorage.getItem('residents:sort') || 'name')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const reportRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    const [residentRows, apartmentRows, chargeRows, paymentRows, settings] = await Promise.all([
      db.residents.toArray(), db.apartments.toArray(), db.charges.toArray(), db.payments.toArray(), db.settings.get('main')
    ])
    setRows(residentRows); setApartments(apartmentRows); setCharges(chargeRows); setPayments(paymentRows)
    setCountryCode(settings?.countryCode || '+966')
  }
  useEffect(() => { void load() }, [])
  useEffect(() => {
    sessionStorage.setItem('residents:query', query)
    sessionStorage.setItem('residents:status', status)
    sessionStorage.setItem('residents:apartment', apartmentFilter)
    sessionStorage.setItem('residents:sort', sort)
    setPage(1)
  }, [query, status, apartmentFilter, sort])

  const apartmentNo = (id: string) => apartments.find(item => item.id === id)?.number || ''
  const filtered = useMemo(() => rows
    .filter(item => status === 'all' || (status === 'active' ? item.active !== false : item.active === false))
    .filter(item => !apartmentFilter || item.apartmentId === apartmentFilter)
    .filter(item => !query || `${item.name} ${item.phone} ${item.email} ${apartmentNo(item.apartmentId)}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === 'apartment' ? apartmentNo(a.apartmentId).localeCompare(apartmentNo(b.apartmentId), 'ar', { numeric: true }) : sort === 'startDate' ? b.startDate.localeCompare(a.startDate) : a.name.localeCompare(b.name, 'ar')),
  [rows, apartments, query, status, apartmentFilter, sort])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const exportRows = filtered.map(item => ({ الاسم: item.name, العلاقة: item.relation, الشقة: apartmentNo(item.apartmentId), الجوال: item.phone, البريد: item.email, البداية: item.startDate, النهاية: item.endDate, الحالة: item.active === false ? 'غير نشط' : 'نشط', ملاحظات: item.notes }))

  function startCreate() {
    setEditing(null); setForm({ ...emptyForm, phone: countryCode }); setError(''); setOpen(true)
  }
  function startEdit(item: Resident) {
    setEditing(item)
    setForm({ name: item.name, relation: item.relation, apartmentId: item.apartmentId, phone: item.phone, email: item.email, startDate: item.startDate, endDate: item.endDate, notes: item.notes })
    setError(''); setOpen(true)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!form.name.trim() || !form.apartmentId) return setError('الاسم والشقة مطلوبان')
    const timestamp = now()
    if (editing) {
      const updated: Resident = { ...editing, ...form, name: form.name.trim(), phone: normalizeInternationalPhone(form.phone, countryCode), countryCode, updatedAt: timestamp }
      await db.transaction('rw', db.residents, db.audit, async () => {
        await db.residents.put(updated)
        await audit('residents', updated.id, 'update', `تعديل المشترك ${updated.name}`, editing, updated)
      })
    } else {
      const item: Resident = { ...form, name: form.name.trim(), phone: normalizeInternationalPhone(form.phone, countryCode), countryCode, id: uid(), createdAt: timestamp, updatedAt: timestamp, active: true, status: 'active' }
      await db.transaction('rw', db.residents, db.audit, async () => {
        await db.residents.add(item)
        await audit('residents', item.id, 'create', `إضافة المشترك ${item.name}`, undefined, item)
      })
    }
    setOpen(false); setEditing(null); await load()
  }

  async function toggle(item: Resident) {
    const nextActive = item.active === false
    if (!confirm(`${nextActive ? 'إعادة تفعيل' : 'تعطيل'} المشترك ${item.name}؟ ستبقى سجلاته المالية محفوظة.`)) return
    const updated = { ...item, active: nextActive, status: nextActive ? 'active' : 'inactive', updatedAt: now() }
    await db.transaction('rw', db.residents, db.audit, async () => {
      await db.residents.put(updated)
      await audit('residents', item.id, nextActive ? 'reactivate' : 'deactivate', `${nextActive ? 'إعادة تفعيل' : 'تعطيل'} المشترك ${item.name}`, item, updated)
    })
    await load()
  }

  const relatedCharges = details ? charges.filter(item => item.apartmentId === details.apartmentId) : []
  const relatedIds = new Set(relatedCharges.map(item => item.id))
  const relatedPayments = details ? payments.filter(item => relatedIds.has(item.chargeId) && !item.cancelled) : []

  return <>
    <PageHeader title="السكان والمشتركون" onAdd={startCreate} onExcel={() => exportExcel(exportRows, 'السكان_المفلترون')} onPdf={() => reportRef.current && exportElementPdf(reportRef.current, 'السكان_المفلترون')} />
    <div className="panel filters-bar">
      <label>بحث<input value={query} onChange={event => setQuery(event.target.value)} placeholder="اسم، جوال، بريد أو شقة" /></label>
      <label>الشقة<select value={apartmentFilter} onChange={event => setApartmentFilter(event.target.value)}><option value="">كل الشقق</option>{apartments.map(item => <option key={item.id} value={item.id}>{item.number}</option>)}</select></label>
      <label>الحالة<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">الكل</option><option value="active">النشطون</option><option value="inactive">غير النشطين</option></select></label>
      <label>الفرز<select value={sort} onChange={event => setSort(event.target.value)}><option value="name">الاسم</option><option value="apartment">الشقة</option><option value="startDate">تاريخ البداية</option></select></label>
      <button onClick={() => { setQuery(''); setApartmentFilter(''); setStatus('active'); setSort('name') }}>مسح الفلاتر</button>
      <strong>النتائج: {filtered.length}</strong>
    </div>
    <div className="panel" ref={reportRef}>
      {visible.length ? <table><thead><tr><th>الاسم</th><th>العلاقة</th><th>الشقة</th><th>الجوال</th><th>البريد</th><th>البداية</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>
        {visible.map(item => <tr className={item.active === false ? 'muted' : ''} key={item.id}><td>{item.name}</td><td>{item.relation}</td><td>{apartmentNo(item.apartmentId)}</td><td>{item.phone}</td><td>{item.email}</td><td>{item.startDate}</td><td>{item.active === false ? 'غير نشط' : 'نشط'}</td><td className="actions"><button onClick={() => startEdit(item)}>تعديل</button><button onClick={() => setDetails(item)}>السجل</button><button className={item.active === false ? '' : 'danger'} onClick={() => void toggle(item)}>{item.active === false ? 'تفعيل' : 'تعطيل'}</button></td></tr>)}
      </tbody></table> : <Empty text={rows.length ? 'لا توجد نتائج مطابقة' : 'لا يوجد مشتركون بعد'} />}
    </div>
    {pages > 1 && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>السابق</button><span>صفحة {page} من {pages}</span><button disabled={page >= pages} onClick={() => setPage(value => value + 1)}>التالي</button></div>}

    <Modal open={open} title={editing ? 'تعديل المشترك' : 'إضافة مشترك'} onClose={() => setOpen(false)}>
      <form onSubmit={save} className="form-grid">
        {error && <div className="full error-message">{error}</div>}
        <label>الاسم الكامل<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
        <label>نوع العلاقة<select value={form.relation} onChange={event => setForm({ ...form, relation: event.target.value })}><option>مالك</option><option>مستأجر</option><option>ممثل مالك</option><option>أخرى</option></select></label>
        <label>الشقة<select required value={form.apartmentId} onChange={event => setForm({ ...form, apartmentId: event.target.value })}><option value="">اختر</option>{apartments.filter(item => item.active !== false || item.id === editing?.apartmentId).map(item => <option key={item.id} value={item.id}>{item.number}</option>)}</select></label>
        <label>الجوال الدولي<input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="+9665XXXXXXXX" /></label>
        <label>البريد<input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
        <label>تاريخ البداية<input type="date" value={form.startDate} onChange={event => setForm({ ...form, startDate: event.target.value })} /></label>
        <label>تاريخ النهاية<input type="date" value={form.endDate} onChange={event => setForm({ ...form, endDate: event.target.value })} /></label>
        <label className="full">ملاحظات<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label>
        <button className="primary full">حفظ</button>
      </form>
    </Modal>

    <Modal open={!!details} title="سجل الاشتراكات والدفعات" onClose={() => setDetails(null)}>
      {details && <div><p><strong>{details.name}</strong> — الشقة {apartmentNo(details.apartmentId)}</p><div className="report-kpis"><div><span>الاستحقاقات</span><strong>{relatedCharges.length}</strong></div><div><span>الدفعات</span><strong>{relatedPayments.length}</strong></div><div><span>إجمالي المدفوع</span><strong><Money value={relatedPayments.reduce((sum, item) => sum + item.amount, 0)} /></strong></div></div>
        {relatedPayments.length ? <table><thead><tr><th>التاريخ</th><th>الإيصال</th><th>المبلغ</th><th>الطريقة</th></tr></thead><tbody>{relatedPayments.map(item => <tr key={item.id}><td>{item.date}</td><td>{item.receiptNo}</td><td><Money value={item.amount} /></td><td>{item.method}</td></tr>)}</tbody></table> : <Empty text="لا توجد دفعات مرتبطة بالشقة" />}</div>}
    </Modal>
  </>
}
