import { useEffect, useMemo, useRef, useState } from 'react'
import { audit, db, now, uid } from '../db/database'
import type { Apartment, AppSettings, Attachment, Charge, ExtraCharge, Payment, Receipt, Resident } from '../types/models'
import { Empty, Modal, Money, PageHeader } from '../components/Common'
import { exportElementPdf, exportExcel } from '../services/export'
import { getChargeBalance, getChargeRequiredAmount, sumActivePayments } from '../services/finance'
import { cancelPayment, createPayment } from '../services/payments'
import { deleteAttachment, downloadAttachment, saveAttachment } from '../services/attachments'
import { addExtraCharge, cancelExtraCharge } from '../services/operations'
import AttachmentPreview from '../components/AttachmentPreview'
import { openWhatsApp, shareFileOrText } from '../services/share'

const today = () => new Date().toISOString().slice(0, 10)

export default function Charges() {
  const [rows, setRows] = useState<Charge[]>([])
  const [apartments, setApartments] = useState<Apartment[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [extras, setExtras] = useState<ExtraCharge[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [residents, setResidents] = useState<Resident[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const [open, setOpen] = useState(false)
  const [payOpen, setPayOpen] = useState<Charge | null>(null)
  const [detailsOpen, setDetailsOpen] = useState<Charge | null>(null)
  const [extraOpen, setExtraOpen] = useState<Charge | null>(null)
  const [extraForm, setExtraForm] = useState({ title: '', description: '', amount: 0, required: true, notes: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [filterYear, setFilterYear] = useState<number | ''>(() => Number(sessionStorage.getItem('charges:year')) || new Date().getFullYear())
  const [filterMonth, setFilterMonth] = useState<number | ''>(() => Number(sessionStorage.getItem('charges:month')) || new Date().getMonth() + 1)
  const [filterApartment, setFilterApartment] = useState(() => sessionStorage.getItem('charges:apartment') || '')
  const [filterStatus, setFilterStatus] = useState(() => sessionStorage.getItem('charges:status') || '')
  const nowDate = new Date()
  const [form, setForm] = useState({
    apartmentId: '', year: nowDate.getFullYear(), month: nowDate.getMonth() + 1,
    baseAmount: 100, extras: 0, extraReason: ''
  })
  const [pay, setPay] = useState({ amount: 0, date: today(), method: 'تحويل بنكي', reference: '', notes: '', allowOverpayment: false })
  const reportRef = useRef<HTMLDivElement>(null)

  async function load() {
    const [chargeRows, apartmentRows, paymentRows, extraRows, attachmentRows, receiptRows, residentRows, appSettings] = await Promise.all([
      db.charges.toArray(), db.apartments.toArray(), db.payments.toArray(), db.extraCharges.toArray(),
      db.attachments.where('entityType').equals('payment').toArray(), db.receipts.toArray(), db.residents.toArray(), db.settings.get('main')
    ])
    setRows(chargeRows)
    setApartments(apartmentRows)
    setPayments(paymentRows)
    setExtras(extraRows)
    setAttachments(attachmentRows)
    setReceipts(receiptRows)
    setResidents(residentRows)
    setSettings(appSettings || null)
  }

  useEffect(() => { void load() }, [])
  useEffect(() => {
    sessionStorage.setItem('charges:year', String(filterYear))
    sessionStorage.setItem('charges:month', String(filterMonth))
    sessionStorage.setItem('charges:apartment', filterApartment)
    sessionStorage.setItem('charges:status', filterStatus)
  }, [filterYear, filterMonth, filterApartment, filterStatus])

  const apartmentNumber = (id: string) => apartments.find(item => item.id === id)?.number || ''
  const chargeExtras = (charge: Charge) => extras.filter(item => item.apartmentId === charge.apartmentId && item.year === charge.year && item.month === charge.month)
  const chargePayments = (chargeId: string) => payments.filter(item => item.chargeId === chargeId)
  const activePaid = (chargeId: string) => sumActivePayments(chargePayments(chargeId))
  const required = (charge: Charge) => getChargeRequiredAmount(charge, chargeExtras(charge))
  const remaining = (charge: Charge) => getChargeBalance(required(charge), activePaid(charge.id))
  const activeResident = (charge: Charge) => residents.find(item => item.id === charge.residentId)
    || residents.find(item => item.apartmentId === charge.apartmentId && item.active !== false)
  const filteredRows = useMemo(() => rows.filter(charge => charge.active !== false &&
    (!filterYear || charge.year === filterYear) &&
    (!filterMonth || charge.month === filterMonth) &&
    (!filterApartment || charge.apartmentId === filterApartment) &&
    (!filterStatus || charge.status === filterStatus)
  ).sort((a, b) => apartmentNumber(a.apartmentId).localeCompare(apartmentNumber(b.apartmentId), 'ar', { numeric: true })),
  [rows, apartments, filterYear, filterMonth, filterApartment, filterStatus])

  const exportData = useMemo(() => filteredRows.map(charge => {
    const effectivePayments = chargePayments(charge.id).filter(item => !item.cancelled)
    const lastPayment = [...effectivePayments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    return ({
    الشقة: apartmentNumber(charge.apartmentId),
    المشترك: activeResident(charge)?.name || '',
    الشهر: `${charge.month}/${charge.year}`,
    الأساسي: charge.baseAmount,
    الإضافي: required(charge) - charge.baseAmount,
    المطلوب: required(charge),
    المدفوع: activePaid(charge.id),
    المتبقي: remaining(charge),
    الحالة: charge.status,
    الدفعات: effectivePayments.length,
    آخر_دفعة: lastPayment?.date || '',
    آخر_إيصال: lastPayment?.receiptNo || '',
    المرفقات: effectivePayments.filter(item => item.attachmentId).length
  })}), [filteredRows, apartments, payments, extras, residents])

  async function saveCharge(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!form.apartmentId) return setError('اختر الشقة')
    const duplicate = (await db.charges.where('[apartmentId+year+month]').equals([form.apartmentId, form.year, form.month]).toArray())
      .find(item => item.active !== false)
    if (duplicate) return setError('يوجد استحقاق لهذه الشقة في الشهر المحدد')

    const timestamp = now()
    const resident = residents.find(item => item.apartmentId === form.apartmentId && item.active !== false)
    const item: Charge = {
      ...form, residentId: resident?.id, id: uid(), status: 'غير مدفوع', createdAt: timestamp, updatedAt: timestamp, active: true
    }
    await db.transaction('rw', db.charges, db.extraCharges, db.audit, async () => {
      await db.charges.add(item)
      if (form.extras > 0) {
        const extra: ExtraCharge = {
          id: uid(), chargeId: item.id, apartmentId: item.apartmentId, year: item.year, month: item.month,
          title: form.extraReason || 'مبلغ إضافي', description: form.extraReason, amount: form.extras,
          required: true, notes: '', cancelled: false, createdAt: timestamp, updatedAt: timestamp, active: true, status: 'active'
        }
        await db.extraCharges.add(extra)
        await audit('extraCharges', extra.id, 'create', 'إضافة مبلغ إضافي شهري', undefined, extra)
      }
      await audit('charges', item.id, 'create', 'إنشاء استحقاق شهري', undefined, item)
    })
    setOpen(false)
    await load()
  }

  async function generateMonthlyCharges() {
    const year = Number(filterYear || new Date().getFullYear())
    const month = Number(filterMonth || new Date().getMonth() + 1)
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-31`
    const activeApartments = apartments.filter(item => item.active !== false && (!item.dueStartDate || item.dueStartDate <= monthEnd))
    const existing = (await db.charges.where('[year+month]').equals([year, month]).toArray()).filter(item => item.active !== false)
    const existingApartmentIds = new Set(existing.filter(item => item.active !== false).map(item => item.apartmentId))
    const targets = activeApartments.filter(item => !existingApartmentIds.has(item.id))
    if (!targets.length) return alert('لا توجد شقق جديدة لإنشاء استحقاقها في هذه الفترة')
    if (!confirm(`سيتم إنشاء ${targets.length} استحقاقاً لشهر ${month}/${year}. هل تريد المتابعة؟`)) return
    const timestamp = now()
    await db.transaction('rw', db.charges, db.audit, async () => {
      for (const apartment of targets) {
        const resident = residents.find(item => item.apartmentId === apartment.id && item.active !== false)
        const charge: Charge = {
          id: uid(), apartmentId: apartment.id, residentId: resident?.id, year, month,
          baseAmount: apartment.monthlyFee ?? settings?.defaultMonthlyFee ?? 0, extras: 0, extraReason: '',
          status: 'غير مدفوع', active: true, createdAt: timestamp, updatedAt: timestamp
        }
        await db.charges.add(charge)
        await audit('charges', charge.id, 'create', `توليد استحقاق الشقة ${apartment.number} لشهر ${month}/${year}`, undefined, charge)
      }
    })
    alert(`تم إنشاء ${targets.length} استحقاقاً`)
    await load()
  }

  async function savePay(event: React.FormEvent) {
    event.preventDefault()
    if (!payOpen) return
    setBusy(true)
    setError('')
    try {
      const payment = await createPayment({ chargeId: payOpen.id, ...pay })
      if (proofFile) {
        const attachment = await saveAttachment({ entityType: 'payment', entityId: payment.id, file: proofFile, category: 'payment-proof' })
        await db.payments.update(payment.id, { attachmentId: attachment.id, updatedAt: now() })
      }
      setPayOpen(null)
      setProofFile(null)
      setPay({ amount: 0, date: today(), method: 'تحويل بنكي', reference: '', notes: '', allowOverpayment: false })
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تسجيل الدفعة')
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel(payment: Payment) {
    const reason = window.prompt(`اكتب سبب إلغاء الدفعة ${payment.receiptNo}`)
    if (!reason) return
    try {
      await cancelPayment(payment.id, reason)
      await load()
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : 'تعذر إلغاء الدفعة')
    }
  }

  async function deleteCharge(charge: Charge) {
    const activePayments = chargePayments(charge.id).filter(payment => payment.active !== false && !payment.cancelled)
    if (activePayments.length) {
      window.alert('لا يمكن حذف استحقاق عليه دفعات فعّالة. ألغِ الدفعات أولاً حفاظاً على السجل المالي.')
      return
    }
    if (!window.confirm(`حذف استحقاق الشقة ${apartmentNumber(charge.apartmentId)} لشهر ${charge.month}/${charge.year}؟`)) return
    const reason = window.prompt('سبب الحذف (مطلوب لتوثيق الحذف)')
    if (!reason?.trim()) return
    const timestamp = now()
    const removed = { ...charge, active: false, status: 'ملغى', cancelledReason: reason.trim(), deletedAt: timestamp, deletedReason: reason.trim(), updatedAt: timestamp }
    await db.transaction('rw', db.charges, db.extraCharges, db.audit, async () => {
      await db.charges.put(removed)
      const linkedExtras = await db.extraCharges.where('chargeId').equals(charge.id).toArray()
      for (const extra of linkedExtras.filter(item => item.active !== false && !item.cancelled)) {
        await db.extraCharges.put({ ...extra, active: false, cancelled: true, cancellationReason: reason.trim(), updatedAt: timestamp })
      }
      await audit('charges', charge.id, 'delete', `حذف استحقاق الشقة ${apartmentNumber(charge.apartmentId)} لشهر ${charge.month}/${charge.year}`, charge, removed, reason.trim())
    })
    await load()
  }

  async function saveExtra(event: React.FormEvent) {
    event.preventDefault()
    if (!extraOpen) return
    setError('')
    try {
      await addExtraCharge({ chargeId: extraOpen.id, apartmentId: extraOpen.apartmentId, year: extraOpen.year, month: extraOpen.month, ...extraForm })
      setExtraOpen(null)
      setExtraForm({ title: '', description: '', amount: 0, required: true, notes: '' })
      await load()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر إضافة المبلغ') }
  }

  async function handleCancelExtra(extra: ExtraCharge) {
    const reason = window.prompt('اكتب سبب إلغاء المبلغ الإضافي')
    if (!reason) return
    try { await cancelExtraCharge(extra.id, reason); await load() } catch (caught) { window.alert(caught instanceof Error ? caught.message : 'تعذر الإلغاء') }
  }

  async function editExtra(extra: ExtraCharge) {
    const title = prompt('عنوان البند', extra.title)
    if (title === null || !title.trim()) return
    const amountText = prompt('المبلغ الجديد', String(extra.amount))
    if (amountText === null) return
    const amount = Number(amountText)
    if (!Number.isFinite(amount) || amount <= 0) return alert('المبلغ غير صالح')
    const reason = prompt('سبب التعديل المالي')
    if (!reason?.trim()) return alert('سبب التعديل مطلوب')
    const charge = extra.chargeId ? await db.charges.get(extra.chargeId) : undefined
    if (!charge) return alert('الاستحقاق غير موجود')
    const updated = { ...extra, title: title.trim(), amount, updatedAt: now() }
    await db.transaction('rw', db.extraCharges, db.charges, db.audit, async () => {
      await db.extraCharges.put(updated)
      const allExtras = await db.extraCharges.where('chargeId').equals(charge.id).toArray()
      const total = allExtras.filter(item => item.active !== false && !item.cancelled).reduce((sum, item) => sum + item.amount, 0)
      await db.charges.update(charge.id, { extras: total, updatedAt: now() })
      await audit('extraCharges', extra.id, 'update', 'تعديل مبلغ إضافي شهري', extra, updated, reason.trim())
    })
    await load()
  }

  async function replaceProof(payment: Payment, file?: File) {
    if (!file) return
    try {
      const attachment = await saveAttachment({ entityType: 'payment', entityId: payment.id, file, category: 'payment-proof' })
      const oldAttachment = payment.attachmentId ? await db.attachments.get(payment.attachmentId) : undefined
      await db.transaction('rw', db.payments, db.audit, async () => {
        await db.payments.update(payment.id, { attachmentId: attachment.id, updatedAt: now() })
        await audit('payments', payment.id, 'update-attachment', `استبدال إثبات الدفعة ${payment.receiptNo}`, oldAttachment ? { attachmentId: oldAttachment.id } : undefined, { attachmentId: attachment.id })
      })
      if (oldAttachment) await deleteAttachment(oldAttachment.id, 'استبدال إثبات الدفع')
      await load()
    } catch (caught) {
      alert(caught instanceof Error ? caught.message : 'تعذر استبدال الإثبات')
    }
  }

  async function removeProof(payment: Payment) {
    if (!payment.attachmentId || !confirm(`حذف إثبات الدفعة ${payment.receiptNo}؟`)) return
    const reason = prompt('سبب حذف الإثبات')
    if (!reason?.trim()) return
    await deleteAttachment(payment.attachmentId, reason)
    await db.transaction('rw', db.payments, db.audit, async () => {
      await db.payments.update(payment.id, { attachmentId: undefined, updatedAt: now() })
      await audit('payments', payment.id, 'update-attachment', `إزالة إثبات الدفعة ${payment.receiptNo}`, { attachmentId: payment.attachmentId }, { attachmentId: undefined }, reason)
    })
    await load()
  }

  async function receiptPdf(payment: Payment, share = false) {
    const receipt = receipts.find(item => item.paymentId === payment.id)
    if (!receipt) return alert('بيانات الإيصال غير موجودة')
    try {
      const { createReceiptPdfFile, downloadReceiptPdf } = await import('../services/receiptPdf')
      if (share) {
        const file = await createReceiptPdfFile(receipt)
        const shared = await shareFileOrText({ title: `إيصال ${payment.receiptNo}`, text: `إيصال الدفعة ${payment.receiptNo}`, file })
        if (!shared) alert('تم نسخ وصف الإيصال. نزّل الملف وأرفقه يدوياً إذا لم يدعم جهازك المشاركة.')
      } else {
        await downloadReceiptPdf(receipt)
      }
    } catch (caught) {
      alert(caught instanceof Error ? caught.message : 'تعذر إنشاء الإيصال')
    }
  }

  function remind(charge: Charge) {
    const resident = activeResident(charge)
    if (!resident?.phone) return alert('لا يوجد رقم جوال للمشترك المرتبط بالشقة')
    if (remaining(charge) <= 0) return alert('لا يوجد مبلغ متبقٍ لهذا الاستحقاق')
    const template = settings?.whatsappTemplate || ''
    const replacements: Record<string, string> = {
      '[الاسم]': resident.name, '[الشقة]': apartmentNumber(charge.apartmentId), '[الشهر]': String(charge.month),
      '[السنة]': String(charge.year), '[المطلوب]': required(charge).toFixed(settings?.decimalPlaces ?? 2),
      '[المدفوع]': activePaid(charge.id).toFixed(settings?.decimalPlaces ?? 2), '[المتبقي]': remaining(charge).toFixed(settings?.decimalPlaces ?? 2),
      '[العمارة]': settings?.buildingName || 'إدارة العمارة'
    }
    const message = Object.entries(replacements).reduce((text, [key, value]) => text.replaceAll(key, value), template)
    openWhatsApp(message, resident.phone)
  }

  function openPayment(charge: Charge) {
    setError('')
    setPayOpen(charge)
    setPay(current => ({ ...current, amount: Math.max(0, remaining(charge)), date: today() }))
  }

  return <>
    <PageHeader title="الاشتراكات والدفعات" onAdd={() => setOpen(true)} onExcel={() => exportExcel(exportData, 'الاشتراكات')} onPdf={() => reportRef.current && exportElementPdf(reportRef.current, 'الاشتراكات')} />
    <div className="panel filters-bar">
      <label>السنة<input type="number" value={filterYear} onChange={event => setFilterYear(event.target.value ? Number(event.target.value) : '')} /></label>
      <label>الشهر<select value={filterMonth} onChange={event => setFilterMonth(event.target.value ? Number(event.target.value) : '')}><option value="">الكل</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>
      <label>الشقة<select value={filterApartment} onChange={event => setFilterApartment(event.target.value)}><option value="">كل الشقق</option>{apartments.map(item => <option key={item.id} value={item.id}>{item.number}</option>)}</select></label>
      <label>الحالة<select value={filterStatus} onChange={event => setFilterStatus(event.target.value)}><option value="">كل الحالات</option><option>غير مدفوع</option><option>مدفوع جزئياً</option><option>مدفوع بالكامل</option><option>دفعة زائدة</option><option>ملغى</option></select></label>
      <button onClick={() => { setFilterYear(''); setFilterMonth(''); setFilterApartment(''); setFilterStatus('') }}>مسح الفلاتر</button>
      <button className="primary" onClick={() => void generateMonthlyCharges()}>توليد استحقاقات الشهر</button>
      <strong>النتائج: {filteredRows.length}</strong>
    </div>
    <div className="panel" ref={reportRef}>
      {filteredRows.length ? <table><thead><tr><th>الشقة</th><th>المشترك</th><th>الشهر</th><th>الأساسي</th><th>الإضافي</th><th>المطلوب</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>الدفعات</th><th>آخر دفعة</th><th>آخر إيصال</th><th>المرفقات</th><th>الإجراءات</th></tr></thead>
        <tbody>{filteredRows.map((charge, index) => <tr key={charge.id}>
          <td>{exportData[index].الشقة}</td><td>{exportData[index].المشترك || '—'}</td><td>{exportData[index].الشهر}</td><td><Money value={charge.baseAmount} /></td>
          <td><Money value={exportData[index].الإضافي} /></td><td><Money value={required(charge)} /></td>
          <td><Money value={activePaid(charge.id)} /></td><td><Money value={remaining(charge)} /></td>
          <td>{charge.status}</td><td>{exportData[index].الدفعات}</td><td>{exportData[index].آخر_دفعة || '—'}</td><td>{exportData[index].آخر_إيصال || '—'}</td><td>{exportData[index].المرفقات}</td><td className="actions">
            <button onClick={() => openPayment(charge)}>دفعة</button>
            <button onClick={() => { setError(''); setExtraOpen(charge) }}>مبلغ إضافي</button>
            <button onClick={() => setDetailsOpen(charge)}>التفاصيل</button>
            {remaining(charge) > 0 && <button onClick={() => remind(charge)}>WhatsApp</button>}
            <button className="danger" onClick={() => void deleteCharge(charge)}>حذف</button>
          </td>
        </tr>)}</tbody></table> : <Empty text={rows.length ? 'لا توجد نتائج مطابقة' : 'لا توجد استحقاقات بعد'} />}
    </div>

    <Modal open={open} title="إنشاء استحقاق" onClose={() => { setOpen(false); setError('') }}>
      <form onSubmit={saveCharge} className="form-grid">
        {error && <div className="full error-message">{error}</div>}
        <label>الشقة<select required value={form.apartmentId} onChange={event => { const apartment = apartments.find(item => item.id === event.target.value); setForm({ ...form, apartmentId: event.target.value, baseAmount: apartment?.monthlyFee || 100 }) }}><option value="">اختر</option>{apartments.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.number}</option>)}</select></label>
        <label>السنة<input type="number" value={form.year} onChange={event => setForm({ ...form, year: Number(event.target.value) })} /></label>
        <label>الشهر<input type="number" min="1" max="12" value={form.month} onChange={event => setForm({ ...form, month: Number(event.target.value) })} /></label>
        <label>الاشتراك<input type="number" min="0" step="0.01" value={form.baseAmount} onChange={event => setForm({ ...form, baseAmount: Number(event.target.value) })} /></label>
        <label>مبلغ إضافي<input type="number" min="0" step="0.01" value={form.extras} onChange={event => setForm({ ...form, extras: Number(event.target.value) })} /></label>
        <label>سبب الإضافي<input value={form.extraReason} onChange={event => setForm({ ...form, extraReason: event.target.value })} /></label>
        <button className="primary full">حفظ</button>
      </form>
    </Modal>

    <Modal open={!!payOpen} title="تسجيل دفعة" onClose={() => { setPayOpen(null); setProofFile(null); setError('') }}>
      <form onSubmit={savePay} className="form-grid">
        {error && <div className="full error-message">{error}</div>}
        <label>المبلغ<input type="number" min="0.01" step="0.01" value={pay.amount} onChange={event => setPay({ ...pay, amount: Number(event.target.value) })} /></label>
        <label>التاريخ<input type="date" value={pay.date} onChange={event => setPay({ ...pay, date: event.target.value })} /></label>
        <label>الطريقة<select value={pay.method} onChange={event => setPay({ ...pay, method: event.target.value })}>{(settings?.paymentMethods || ['تحويل بنكي', 'نقداً', 'إيداع', 'شبكة', 'أخرى']).map(method => <option key={method}>{method}</option>)}</select></label>
        <label>المرجع<input value={pay.reference} onChange={event => setPay({ ...pay, reference: event.target.value })} /></label>
        <label className="full">إثبات الدفع<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event => setProofFile(event.target.files?.[0] || null)} /></label>
        <label className="full">ملاحظات<textarea value={pay.notes} onChange={event => setPay({ ...pay, notes: event.target.value })} /></label>
        {payOpen && pay.amount > remaining(payOpen) && <label className="full"><input type="checkbox" checked={pay.allowOverpayment} onChange={event => setPay({ ...pay, allowOverpayment: event.target.checked })} /> أوافق على تسجيل دفعة زائدة عن المتبقي</label>}
        <button className="primary full" disabled={busy}>{busy ? 'جارٍ الحفظ...' : 'حفظ الدفعة وإصدار الإيصال'}</button>
      </form>
    </Modal>


    <Modal open={!!extraOpen} title="إضافة مبلغ إضافي مستقل" onClose={() => { setExtraOpen(null); setError('') }}>
      <form onSubmit={saveExtra} className="form-grid">
        {error && <div className="full error-message">{error}</div>}
        <label>عنوان البند<input required value={extraForm.title} onChange={event => setExtraForm({ ...extraForm, title: event.target.value })} /></label>
        <label>المبلغ<input required type="number" min="0.01" step="0.01" value={extraForm.amount} onChange={event => setExtraForm({ ...extraForm, amount: Number(event.target.value) })} /></label>
        <label className="full">الوصف<textarea value={extraForm.description} onChange={event => setExtraForm({ ...extraForm, description: event.target.value })} /></label>
        <label><input type="checkbox" checked={extraForm.required} onChange={event => setExtraForm({ ...extraForm, required: event.target.checked })} /> بند إلزامي</label>
        <label className="full">ملاحظات<textarea value={extraForm.notes} onChange={event => setExtraForm({ ...extraForm, notes: event.target.value })} /></label>
        <button className="primary full">حفظ البند للشهر المحدد فقط</button>
      </form>
    </Modal>

    <Modal open={!!detailsOpen} title="سجل الدفعات والمبالغ الإضافية" onClose={() => setDetailsOpen(null)}>
      {detailsOpen && <div>
        <p>الشقة: <strong>{apartmentNumber(detailsOpen.apartmentId)}</strong> — المطلوب: <Money value={required(detailsOpen)} /> — المتبقي: <Money value={remaining(detailsOpen)} /></p>
        {chargeExtras(detailsOpen).filter(x => x.active && !x.cancelled).length > 0 && <><h4>المبالغ الإضافية</h4><table><thead><tr><th>البند</th><th>الوصف</th><th>المبلغ</th><th>الإجراء</th></tr></thead><tbody>{chargeExtras(detailsOpen).filter(x => x.active && !x.cancelled).map(extra => <tr key={extra.id}><td>{extra.title}</td><td>{extra.description}</td><td><Money value={extra.amount} /></td><td className="actions"><button onClick={() => void editExtra(extra)}>تعديل</button><button onClick={() => void handleCancelExtra(extra)}>إلغاء</button></td></tr>)}</tbody></table></>}
        <h4>الدفعات</h4>
        {chargePayments(detailsOpen.id).length ? <table><thead><tr><th>الإيصال</th><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>
          {chargePayments(detailsOpen.id).map(payment => {
            const attachment = attachments.find(item => item.id === payment.attachmentId && item.active !== false)
            return <tr key={payment.id}><td>{payment.receiptNo}</td><td>{payment.date}</td><td><Money value={payment.amount} /></td><td>{payment.method}</td><td>{payment.cancelled ? 'ملغاة' : 'فعالة'}</td><td className="actions">
              <button onClick={() => void receiptPdf(payment)}>إيصال PDF</button>
              <button onClick={() => void receiptPdf(payment, true)}>مشاركة الإيصال</button>
              {attachment && <><button onClick={() => setPreviewAttachment(attachment)}>عرض الإثبات</button><button onClick={() => downloadAttachment(attachment)}>تنزيل الإثبات</button></>}
              {!payment.cancelled && <label className="file-button">{attachment ? 'استبدال الإثبات' : 'رفع إثبات'}<input hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event => void replaceProof(payment, event.target.files?.[0])} /></label>}
              {attachment && !payment.cancelled && <button className="danger" onClick={() => void removeProof(payment)}>حذف الإثبات</button>}
              {!payment.cancelled && <button onClick={() => void handleCancel(payment)}>إلغاء</button>}
            </td></tr>
          })}
        </tbody></table> : <Empty text="لا توجد دفعات لهذا الاستحقاق" />}
      </div>}
    </Modal>
    <AttachmentPreview attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
  </>
}
