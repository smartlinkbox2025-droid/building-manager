import { useEffect, useMemo, useRef, useState } from 'react'
import { audit, db, now, uid } from '../db/database'
import type { AppSettings, Expense, Income, Purchase, Supplier } from '../types/models'
import { Empty, Modal, Money, PageHeader } from '../components/Common'
import { exportElementPdf, exportExcel } from '../services/export'
import { saveIncome, savePurchase, saveSupplier } from '../services/operations'
import { getExpenseOutstandingAmount, getExpensePaidAmount, validateFinancialAmount } from '../services/finance'
import { saveAttachment } from '../services/attachments'
import AttachmentManager from '../components/AttachmentManager'

type Tab = 'expense' | 'income' | 'purchase' | 'supplier'
type AnyRow = Expense | Income | Purchase | Supplier
const today = () => new Date().toISOString().slice(0, 10)
const blank = {
  category: '', description: '', amount: 0, date: today(), method: 'تحويل بنكي', party: '', supplierId: '',
  invoiceNo: '', paymentStatus: 'مدفوع', paidAmount: 0, reference: '', notes: '', item: '', quantity: 1,
  unit: 'قطعة', unitPrice: 0, taxAmount: 0, name: '', type: 'مورد', phone: '', email: '', taxNumber: '', address: ''
}

export default function Expenses() {
  const [tab, setTab] = useState<Tab>('expense')
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [incomes, setIncomes] = useState<Income[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AnyRow | null>(null)
  const [attachmentsFor, setAttachmentsFor] = useState<AnyRow | null>(null)
  const [form, setForm] = useState(blank)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const reportRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    const [e, i, p, s, config] = await Promise.all([db.expenses.toArray(), db.incomes.toArray(), db.purchases.toArray(), db.suppliers.toArray(), db.settings.get('main')])
    setExpenses(e); setIncomes(i); setPurchases(p); setSuppliers(s); setSettings(config || null)
  }
  useEffect(() => { void load() }, [])

  const rows: AnyRow[] = tab === 'expense' ? expenses : tab === 'income' ? incomes : tab === 'purchase' ? purchases : suppliers
  const filtered = useMemo(() => rows.filter(item => !query || Object.values(item).filter(value => typeof value === 'string').join(' ').toLowerCase().includes(query.toLowerCase())), [rows, query])
  const supplierName = (id?: string) => suppliers.find(item => item.id === id)?.name || '—'
  const title = { expense: 'المصروفات', income: 'الإيرادات الأخرى', purchase: 'المشتريات', supplier: 'الموردون' }[tab]

  const exportRows = filtered.map(item => {
    if (tab === 'expense') {
      const row = item as Expense
      return { التاريخ: row.date, التصنيف: row.category, البيان: row.description, المستفيد: row.beneficiary, المورد: supplierName(row.supplierId), طريقة_الدفع: row.method, رقم_الفاتورة: row.invoiceNo, حالة_الدفع: row.paymentStatus || 'مدفوع', المبلغ_الإجمالي: row.amount, المدفوع_فعلياً: getExpensePaidAmount(row), المتبقي: getExpenseOutstandingAmount(row), الحالة: row.cancelled ? 'ملغى' : 'فعال' }
    }
    if (tab === 'income') {
      const row = item as Income
      return { التاريخ: row.date, التصنيف: row.category, البيان: row.description, الجهة_الدافعة: row.payer, طريقة_التحصيل: row.method, المرجع: row.reference || '', المبلغ: row.amount, الحالة: row.cancelled ? 'ملغى' : 'فعال' }
    }
    if (tab === 'purchase') {
      const row = item as Purchase
      return { التاريخ: row.date, الصنف: row.item, التصنيف: row.category, الكمية: row.quantity, الوحدة: row.unit, سعر_الوحدة: row.unitPrice, الإجمالي: row.total, المورد: supplierName(row.supplierId), الحالة: row.cancelled ? 'ملغى' : 'فعال' }
    }
    const row = item as Supplier
    return { الاسم: row.name, النوع: row.type, الجوال: row.phone, البريد: row.email, الرقم_الضريبي: row.taxNumber || '', العنوان: row.address || '', الحالة: row.active === false ? 'غير نشط' : 'نشط' }
  })

  function startCreate() {
    setEditing(null); setForm(blank); setPendingFile(null); setError(''); setOpen(true)
  }

  function startEdit(item: AnyRow) {
    setEditing(item); setPendingFile(null); setError('')
    if (tab === 'expense') {
      const row = item as Expense
      setForm({ ...blank, category: row.category, description: row.description, amount: row.amount, date: row.date, method: row.method, party: row.beneficiary, supplierId: row.supplierId || '', invoiceNo: row.invoiceNo, paymentStatus: row.paymentStatus || 'مدفوع', paidAmount: getExpensePaidAmount(row), notes: row.notes })
    } else if (tab === 'income') {
      const row = item as Income
      setForm({ ...blank, category: row.category, description: row.description, amount: row.amount, date: row.date, method: row.method, party: row.payer, reference: row.reference || '', notes: row.notes })
    } else if (tab === 'purchase') {
      const row = item as Purchase
      setForm({ ...blank, item: row.item, category: row.category, quantity: row.quantity, unit: row.unit, unitPrice: row.unitPrice, taxAmount: 0, supplierId: row.supplierId || '', date: row.date, invoiceNo: row.invoiceNo, method: row.paymentMethod, notes: row.notes })
    } else {
      const row = item as Supplier
      setForm({ ...blank, name: row.name, type: row.type, phone: row.phone, email: row.email, taxNumber: row.taxNumber || '', address: row.address || '', notes: row.notes })
    }
    setOpen(true)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    try {
      let saved: AnyRow
      const expensePaidAmount = form.paymentStatus === 'مدفوع' ? form.amount : form.paymentStatus === 'مستحق' ? 0 : form.paidAmount
      if (tab === 'expense' && form.paymentStatus === 'مدفوع جزئياً' && (expensePaidAmount <= 0 || expensePaidAmount >= form.amount)) {
        throw new Error('في الدفع الجزئي يجب أن يكون المدفوع أكبر من صفر وأقل من المبلغ الإجمالي')
      }
      if (editing) {
        const timestamp = now()
        if (tab === 'expense') {
          validateFinancialAmount(form.amount)
          saved = { ...(editing as Expense), category: form.category, description: form.description, amount: form.amount, paidAmount: expensePaidAmount, date: form.date, beneficiary: form.party, supplierId: form.supplierId || undefined, method: form.method, invoiceNo: form.invoiceNo, paymentStatus: form.paymentStatus, notes: form.notes, updatedAt: timestamp }
          await db.expenses.put(saved as Expense)
        } else if (tab === 'income') {
          validateFinancialAmount(form.amount)
          saved = { ...(editing as Income), category: form.category, description: form.description, amount: form.amount, date: form.date, method: form.method, payer: form.party, reference: form.reference, notes: form.notes, updatedAt: timestamp }
          await db.incomes.put(saved as Income)
        } else if (tab === 'purchase') {
          validateFinancialAmount(form.quantity); validateFinancialAmount(form.unitPrice)
          saved = { ...(editing as Purchase), item: form.item, category: form.category, quantity: form.quantity, unit: form.unit, unitPrice: form.unitPrice, total: form.quantity * form.unitPrice, supplierId: form.supplierId || undefined, date: form.date, invoiceNo: form.invoiceNo, paymentMethod: form.method, taxAmount: 0, notes: form.notes, updatedAt: timestamp }
          await db.purchases.put(saved as Purchase)
        } else {
          saved = { ...(editing as Supplier), name: form.name, type: form.type, phone: form.phone, email: form.email, taxNumber: form.taxNumber, address: form.address, notes: form.notes, updatedAt: timestamp }
          await db.suppliers.put(saved as Supplier)
        }
        await audit(`${tab}s`, saved.id, 'update', `تعديل ${title}`, editing, saved)
      } else if (tab === 'expense') {
        validateFinancialAmount(form.amount)
        const timestamp = now()
        saved = { id: uid(), category: form.category, description: form.description, amount: form.amount, paidAmount: expensePaidAmount, date: form.date, beneficiary: form.party, supplierId: form.supplierId || undefined, method: form.method, invoiceNo: form.invoiceNo, paymentStatus: form.paymentStatus, notes: form.notes, cancelled: false, createdAt: timestamp, updatedAt: timestamp, active: true, status: 'active' } as Expense
        await db.expenses.add(saved as Expense); await audit('expenses', saved.id, 'create', 'إضافة مصروف', undefined, saved)
      } else if (tab === 'income') {
        saved = await saveIncome({ category: form.category, description: form.description, amount: form.amount, date: form.date, method: form.method, payer: form.party, reference: form.reference, notes: form.notes, status: 'active' })
      } else if (tab === 'purchase') {
        saved = await savePurchase({ item: form.item, category: form.category, quantity: form.quantity, unit: form.unit, unitPrice: form.unitPrice, supplierId: form.supplierId || undefined, date: form.date, invoiceNo: form.invoiceNo, paymentMethod: form.method, taxAmount: 0, notes: form.notes, status: 'active' })
      } else {
        saved = await saveSupplier({ name: form.name, type: form.type, phone: form.phone, email: form.email, taxNumber: form.taxNumber, address: form.address, notes: form.notes, status: 'active' })
      }
      if (pendingFile && tab !== 'supplier') await saveAttachment({ entityType: tab, entityId: saved.id, file: pendingFile, category: tab === 'expense' ? 'invoice' : tab })
      setOpen(false); setEditing(null); setPendingFile(null); await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر الحفظ')
    }
  }

  async function cancel(item: AnyRow) {
    if (tab === 'supplier') {
      if (!confirm(`تعطيل المورد ${(item as Supplier).name}؟`)) return
      const updated = { ...(item as Supplier), active: false, status: 'inactive', updatedAt: now() }
      await db.suppliers.put(updated); await audit('suppliers', item.id, 'deactivate', 'تعطيل مورد', item, updated); await load(); return
    }
    const reason = prompt(`سبب إلغاء السجل من ${title}`)
    if (!reason?.trim()) return
    const updated = { ...item, cancelled: true, active: false, status: 'cancelled', cancellationReason: reason.trim(), updatedAt: now() } as AnyRow
    if (tab === 'expense') await db.expenses.put(updated as Expense)
    else if (tab === 'income') await db.incomes.put(updated as Income)
    else await db.purchases.put(updated as Purchase)
    await audit(`${tab}s`, item.id, 'cancel', `إلغاء سجل من ${title}`, item, updated, reason.trim())
    await load()
  }

  const categories = tab === 'expense' ? settings?.expenseCategories : tab === 'income' ? settings?.incomeCategories : []

  return <>
    <PageHeader title="الإيرادات والمصروفات والمشتريات" onAdd={startCreate} onExcel={() => exportExcel(exportRows, title)} onPdf={() => reportRef.current && exportElementPdf(reportRef.current, title)} />
    <div className="tabs">{([['expense', 'المصروفات'], ['income', 'الإيرادات الأخرى'], ['purchase', 'المشتريات'], ['supplier', 'الموردون']] as [Tab, string][]).map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => { setTab(key); setQuery('') }}>{label}</button>)}</div>
    <div className="panel filters-bar"><label>بحث<input value={query} onChange={event => setQuery(event.target.value)} placeholder={`بحث في ${title}`} /></label><button onClick={() => setQuery('')}>مسح البحث</button><strong>النتائج: {filtered.length}</strong></div>
    <div className="panel" ref={reportRef}>
      {exportRows.length ? <table><thead><tr>{Object.keys(exportRows[0]).map(key => <th key={key}>{key.replaceAll('_', ' ')}</th>)}<th>الإجراءات</th></tr></thead><tbody>{exportRows.map((row, index) => <tr className={'cancelled' in filtered[index] && filtered[index].cancelled ? 'muted' : ''} key={filtered[index].id}>{Object.entries(row).map(([key, value]) => <td key={key}>{['المبلغ', 'المبلغ_الإجمالي', 'المدفوع_فعلياً', 'المتبقي', 'الإجمالي', 'سعر_الوحدة'].includes(key) ? <Money value={Number(value)} /> : String(value ?? '')}</td>)}<td className="actions"><button onClick={() => startEdit(filtered[index])}>تعديل</button>{tab !== 'supplier' && <button onClick={() => setAttachmentsFor(filtered[index])}>المرفقات</button>}<button className="danger" onClick={() => void cancel(filtered[index])}>{tab === 'supplier' ? 'تعطيل' : 'إلغاء'}</button></td></tr>)}</tbody></table> : <Empty text={`لا توجد بيانات في ${title}`} />}
    </div>

    <Modal open={open} title={`${editing ? 'تعديل' : 'إضافة'} ${title}`} onClose={() => setOpen(false)}>
      <form onSubmit={save} className="form-grid">
        {error && <div className="full error-message">{error}</div>}
        {tab === 'supplier' ? <>
          <label>الاسم<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
          <label>النوع<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}><option>مورد</option><option>مقاول</option><option>فني</option><option>جهة مستفيدة</option></select></label>
          <label>الجوال<input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></label><label>البريد<input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
          <label>الرقم الضريبي<input value={form.taxNumber} onChange={event => setForm({ ...form, taxNumber: event.target.value })} /></label><label>العنوان<input value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} /></label>
        </> : tab === 'purchase' ? <>
          <label>الصنف<input required value={form.item} onChange={event => setForm({ ...form, item: event.target.value })} /></label><label>التصنيف<input required value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} /></label>
          <label>الكمية<input required type="number" min="0.01" step="0.01" value={form.quantity} onChange={event => setForm({ ...form, quantity: Number(event.target.value) })} /></label><label>الوحدة<input value={form.unit} onChange={event => setForm({ ...form, unit: event.target.value })} /></label>
          <label>سعر الوحدة<input required type="number" min="0.01" step="0.01" value={form.unitPrice} onChange={event => setForm({ ...form, unitPrice: Number(event.target.value) })} /></label>
        </> : <>
          <label>التصنيف<input required list={`${tab}-categories`} value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} /><datalist id={`${tab}-categories`}>{(categories || []).map(item => <option key={item} value={item} />)}</datalist></label>
          <label>البيان<input required value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
          <label>المبلغ<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: Number(event.target.value) })} /></label>
          <label>{tab === 'expense' ? 'الجهة المستفيدة' : 'الجهة الدافعة'}<input value={form.party} onChange={event => setForm({ ...form, party: event.target.value })} /></label>
          {tab === 'expense' && <><label>حالة الدفع<select value={form.paymentStatus} onChange={event => setForm({ ...form, paymentStatus: event.target.value, paidAmount: event.target.value === 'مدفوع' ? form.amount : 0 })}><option>مدفوع</option><option>مستحق</option><option>مدفوع جزئياً</option></select></label>{form.paymentStatus === 'مدفوع جزئياً' && <label>المبلغ المدفوع فعلياً<input required type="number" min="0.01" max={Math.max(0, form.amount - 0.01)} step="0.01" value={form.paidAmount} onChange={event => setForm({ ...form, paidAmount: Number(event.target.value) })} /></label>}</>}
          {tab === 'income' && <label>رقم المرجع<input value={form.reference} onChange={event => setForm({ ...form, reference: event.target.value })} /></label>}
        </>}
        {tab !== 'supplier' && <><label>التاريخ<input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label><label>طريقة الدفع<select value={form.method} onChange={event => setForm({ ...form, method: event.target.value })}>{(settings?.paymentMethods || ['نقداً', 'تحويل بنكي', 'أخرى']).map(item => <option key={item}>{item}</option>)}</select></label>
          {tab !== 'income' && <><label>المورد<select value={form.supplierId} onChange={event => setForm({ ...form, supplierId: event.target.value })}><option value="">بدون</option>{suppliers.filter(item => item.active !== false).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>رقم الفاتورة<input value={form.invoiceNo} onChange={event => setForm({ ...form, invoiceNo: event.target.value })} /></label></>}
          <label className="full">فاتورة/مرفق جديد<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event => setPendingFile(event.target.files?.[0] || null)} /></label></>}
        <label className="full">ملاحظات<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label>
        <button className="primary full">حفظ</button>
      </form>
    </Modal>

    <Modal open={!!attachmentsFor} title={`مرفقات ${title}`} onClose={() => setAttachmentsFor(null)}>
      {attachmentsFor && <AttachmentManager entityType={tab} entityId={attachmentsFor.id} title={`مرفقات السجل`} />}
    </Modal>
  </>
}
