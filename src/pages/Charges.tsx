import { useEffect, useMemo, useRef, useState } from 'react'
import { audit, db, now, uid } from '../db/database'
import type { Apartment, Attachment, Charge, ExtraCharge, Payment } from '../types/models'
import { Empty, Modal, Money, PageHeader } from '../components/Common'
import { exportElementPdf, exportExcel } from '../services/export'
import { getChargeBalance, getChargeRequiredAmount, sumActivePayments } from '../services/finance'
import { cancelPayment, createPayment } from '../services/payments'
import { downloadAttachment, saveAttachment } from '../services/attachments'
import { addExtraCharge, cancelExtraCharge } from '../services/operations'

const today = () => new Date().toISOString().slice(0, 10)

export default function Charges() {
  const [rows, setRows] = useState<Charge[]>([])
  const [apartments, setApartments] = useState<Apartment[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [extras, setExtras] = useState<ExtraCharge[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [open, setOpen] = useState(false)
  const [payOpen, setPayOpen] = useState<Charge | null>(null)
  const [detailsOpen, setDetailsOpen] = useState<Charge | null>(null)
  const [extraOpen, setExtraOpen] = useState<Charge | null>(null)
  const [extraForm, setExtraForm] = useState({ title: '', description: '', amount: 0, required: true, notes: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const nowDate = new Date()
  const [form, setForm] = useState({
    apartmentId: '', year: nowDate.getFullYear(), month: nowDate.getMonth() + 1,
    baseAmount: 100, extras: 0, extraReason: ''
  })
  const [pay, setPay] = useState({ amount: 0, date: today(), method: 'تحويل بنكي', reference: '', notes: '', allowOverpayment: false })
  const reportRef = useRef<HTMLDivElement>(null)

  async function load() {
    const [chargeRows, apartmentRows, paymentRows, extraRows, attachmentRows] = await Promise.all([
      db.charges.toArray(), db.apartments.toArray(), db.payments.toArray(), db.extraCharges.toArray(), db.attachments.toArray()
    ])
    setRows(chargeRows)
    setApartments(apartmentRows)
    setPayments(paymentRows)
    setExtras(extraRows)
    setAttachments(attachmentRows)
  }

  useEffect(() => { void load() }, [])

  const apartmentNumber = (id: string) => apartments.find(item => item.id === id)?.number || ''
  const chargeExtras = (charge: Charge) => extras.filter(item => item.apartmentId === charge.apartmentId && item.year === charge.year && item.month === charge.month)
  const chargePayments = (chargeId: string) => payments.filter(item => item.chargeId === chargeId)
  const activePaid = (chargeId: string) => sumActivePayments(chargePayments(chargeId))
  const required = (charge: Charge) => getChargeRequiredAmount(charge, chargeExtras(charge))
  const remaining = (charge: Charge) => getChargeBalance(required(charge), activePaid(charge.id))

  const exportData = useMemo(() => rows.map(charge => ({
    الشقة: apartmentNumber(charge.apartmentId),
    الشهر: `${charge.month}/${charge.year}`,
    الأساسي: charge.baseAmount,
    الإضافي: required(charge) - charge.baseAmount,
    المطلوب: required(charge),
    المدفوع: activePaid(charge.id),
    المتبقي: remaining(charge),
    الحالة: charge.status,
    الدفعات: chargePayments(charge.id).filter(item => !item.cancelled).length
  })), [rows, apartments, payments, extras])

  async function saveCharge(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!form.apartmentId) return setError('اختر الشقة')
    const duplicate = await db.charges.where('[apartmentId+year+month]').equals([form.apartmentId, form.year, form.month]).first()
    if (duplicate?.active !== false) return setError('يوجد استحقاق لهذه الشقة في الشهر المحدد')

    const timestamp = now()
    const item: Charge = {
      ...form, id: uid(), status: 'غير مدفوع', createdAt: timestamp, updatedAt: timestamp, active: true
    }
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
    setOpen(false)
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

  function openPayment(charge: Charge) {
    setError('')
    setPayOpen(charge)
    setPay(current => ({ ...current, amount: Math.max(0, remaining(charge)), date: today() }))
  }

  return <>
    <PageHeader title="الاشتراكات والدفعات" onAdd={() => setOpen(true)} onExcel={() => exportExcel(exportData, 'الاشتراكات')} onPdf={() => reportRef.current && exportElementPdf(reportRef.current, 'الاشتراكات')} />
    <div className="panel" ref={reportRef}>
      {rows.length ? <table><thead><tr>{Object.keys(exportData[0]).map(key => <th key={key}>{key}</th>)}<th>الإجراءات</th></tr></thead>
        <tbody>{rows.map((charge, index) => <tr key={charge.id}>
          <td>{exportData[index].الشقة}</td><td>{exportData[index].الشهر}</td><td><Money value={charge.baseAmount} /></td>
          <td><Money value={exportData[index].الإضافي} /></td><td><Money value={required(charge)} /></td>
          <td><Money value={activePaid(charge.id)} /></td><td><Money value={remaining(charge)} /></td>
          <td>{charge.status}</td><td>{exportData[index].الدفعات}</td><td className="actions">
            <button onClick={() => openPayment(charge)}>دفعة</button>
            <button onClick={() => { setError(''); setExtraOpen(charge) }}>مبلغ إضافي</button>
            <button onClick={() => setDetailsOpen(charge)}>التفاصيل</button>
          </td>
        </tr>)}</tbody></table> : <Empty />}
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
        <label>الطريقة<select value={pay.method} onChange={event => setPay({ ...pay, method: event.target.value })}><option>تحويل بنكي</option><option>نقداً</option><option>إيداع</option><option>شبكة</option><option>أخرى</option></select></label>
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
        {chargeExtras(detailsOpen).filter(x => x.active && !x.cancelled).length > 0 && <><h4>المبالغ الإضافية</h4><table><thead><tr><th>البند</th><th>الوصف</th><th>المبلغ</th><th>الإجراء</th></tr></thead><tbody>{chargeExtras(detailsOpen).filter(x => x.active && !x.cancelled).map(extra => <tr key={extra.id}><td>{extra.title}</td><td>{extra.description}</td><td><Money value={extra.amount} /></td><td><button onClick={() => void handleCancelExtra(extra)}>إلغاء</button></td></tr>)}</tbody></table></>}
        <h4>الدفعات</h4>
        {chargePayments(detailsOpen.id).length ? <table><thead><tr><th>الإيصال</th><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>
          {chargePayments(detailsOpen.id).map(payment => {
            const attachment = attachments.find(item => item.id === payment.attachmentId && item.active !== false)
            return <tr key={payment.id}><td>{payment.receiptNo}</td><td>{payment.date}</td><td><Money value={payment.amount} /></td><td>{payment.method}</td><td>{payment.cancelled ? 'ملغاة' : 'فعالة'}</td><td className="actions">
              {attachment && <button onClick={() => downloadAttachment(attachment)}>تنزيل الإثبات</button>}
              {!payment.cancelled && <button onClick={() => void handleCancel(payment)}>إلغاء</button>}
            </td></tr>
          })}
        </tbody></table> : <Empty text="لا توجد دفعات لهذا الاستحقاق" />}
      </div>}
    </Modal>
  </>
}
