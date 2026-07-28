import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db/database'
import type { Apartment } from '../types/models'
import { Empty, PageHeader } from '../components/Common'
import { createElementPdfFile, exportElementPdf, exportWorkbook } from '../services/export'
import { copyText, openWhatsApp, shareFileOrText } from '../services/share'
import { buildFinancialReport, describeFilters, type FinancialReportData, type ReportFilters } from '../services/reports'
import { getExpenseOutstandingAmount, getExpensePaidAmount } from '../services/finance'
interface PdfSection { title: string; rows: Record<string, unknown>[] }

const currentYear = new Date().getFullYear()
const initialFilters: ReportFilters = { year: currentYear }
type ReportKind = 'all'|'summary'|'charges'|'arrears'|'payments'|'incomes'|'expenses'|'purchases'|'maintenance'|'contracts'|'apartments'|'residents'

const reportNames: Record<ReportKind, string> = {
  all: 'التقرير المالي الشامل', summary: 'الملخص المالي', charges: 'الاشتراكات', arrears: 'المتأخرات',
  payments: 'الدفعات', incomes: 'الإيرادات', expenses: 'المصروفات', purchases: 'المشتريات',
  maintenance: 'الصيانة', contracts: 'عقود الصيانة', apartments: 'تقرير الشقق',
  residents: 'تقرير المشتركين'
}

export default function Reports() {
  const [report, setReport] = useState<FinancialReportData | null>(null)
  const [apartments, setApartments] = useState<Apartment[]>([])
  const [settings, setSettings] = useState({ buildingName: 'عمارة سكنية', currencySymbol: 'ر.س' })
  const [filters, setFilters] = useState<ReportFilters>(initialFilters)
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(initialFilters)
  const [loading, setLoading] = useState(true)
  const [reportKind, setReportKind] = useState<ReportKind>('all')
  const reportRef = useRef<HTMLDivElement>(null)

  async function load(nextFilters: ReportFilters) {
    setLoading(true)
    try {
      const [data, apartmentRows, appSettings] = await Promise.all([
        buildFinancialReport(nextFilters), db.apartments.orderBy('number').toArray(), db.settings.get('main')
      ])
      setReport(data)
      setApartments(apartmentRows)
      if (appSettings) setSettings({ buildingName: appSettings.buildingName, currencySymbol: appSettings.currencySymbol })
      setAppliedFilters(nextFilters)
    } catch (error) {
      setReport(null)
      alert(error instanceof Error ? error.message : 'تعذر إعداد التقرير المالي')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load(initialFilters) }, [])

  const summaryRows = useMemo(() => report ? [
    { البند: 'الرصيد الافتتاحي', المبلغ: report.openingBalance },
    { البند: 'إجمالي الاشتراكات المستحقة', المبلغ: report.subscriptionsDue },
    { البند: 'الاشتراكات المحصلة', المبلغ: report.subscriptionsCollected },
    { البند: 'المبالغ الإضافية', المبلغ: report.extraCharges },
    { البند: 'الإيرادات الأخرى', المبلغ: report.otherIncome },
    { البند: 'المصروفات', المبلغ: report.expensesTotal },
    { البند: 'المشتريات', المبلغ: report.purchasesTotal },
    { البند: 'المتأخرات', المبلغ: report.arrears },
    { البند: 'الرصيد الختامي', المبلغ: report.closingBalance }
  ] : [], [report])

  const filterDescription = describeFilters(appliedFilters, apartments)
  const exportedAt = new Date().toLocaleString('ar-SA-u-ca-gregory-nu-latn')
  const apartmentNo = (id: string) => apartments.find(item => item.id === id)?.number || '—'
  const residentName = (id?: string) => report?.residents.find(item => item.id === id)?.name || '—'

  const sections = useMemo<PdfSection[]>(() => {
    if (!report) return []
    const all: Record<Exclude<ReportKind, 'all'>, PdfSection> = {
      summary: { title: 'الملخص المالي', rows: summaryRows },
      charges: { title: 'الاشتراكات', rows: report.charges.map(item => ({ الشقة: apartmentNo(item.apartmentId), المشترك: residentName(item.residentId), الشهر: `${item.month}/${item.year}`, الأساسي: item.baseAmount, الإضافي: item.extras, الحالة: item.status })) },
      arrears: { title: 'المتأخرات', rows: report.charges.filter(item => ['unpaid', 'partial', 'غير مدفوع', 'مدفوع جزئياً'].includes(item.status)).map(item => ({ الشقة: apartmentNo(item.apartmentId), المشترك: residentName(item.residentId), الشهر: `${item.month}/${item.year}`, المطلوب: item.baseAmount + item.extras, الحالة: item.status })) },
      payments: { title: 'الدفعات', rows: report.payments.map(item => ({ التاريخ: item.date, الشقة: apartmentNo(item.apartmentId), المبلغ: item.amount, الطريقة: item.method, الإيصال: item.receiptNo, المرجع: item.reference })) },
      incomes: { title: 'الإيرادات', rows: report.incomes.map(item => ({ التاريخ: item.date, التصنيف: item.category, البيان: item.description, الدافع: item.payer, الطريقة: item.method, المبلغ: item.amount })) },
      expenses: { title: 'المصروفات', rows: report.expenses.map(item => ({ التاريخ: item.date, التصنيف: item.category, البيان: item.description, المستفيد: item.beneficiary, الفاتورة: item.invoiceNo, الإجمالي: item.amount, المدفوع: getExpensePaidAmount(item), المتبقي: getExpenseOutstandingAmount(item) })) },
      purchases: { title: 'المشتريات', rows: report.purchases.map(item => ({ التاريخ: item.date, الصنف: item.item, التصنيف: item.category, الكمية: item.quantity, الوحدة: item.unit, سعر_الوحدة: item.unitPrice, الإجمالي: item.total })) },
      maintenance: { title: 'الصيانة', rows: report.maintenance.map(item => ({ البلاغ: item.reportDate, العنوان: item.title, التصنيف: item.category, الأولوية: item.priority, الحالة: item.status, المتوقع: item.expectedCost, الفعلي: item.actualCost })) },
      contracts: { title: 'عقود الصيانة', rows: report.contracts.map(item => ({ الاسم: item.name, الخدمة: item.serviceType, المقاول: item.contractorName, البداية: item.startDate, النهاية: item.endDate, القيمة: item.amount, التكرار: item.paymentFrequency })) },
      apartments: { title: 'الشقق', rows: report.apartments.map(item => ({ الشقة: item.number, الطابق: item.floor, النوع: item.type, الإشغال: item.occupancyStatus, المالك: item.ownerName, الاشتراك: item.monthlyFee, الحالة: item.active ? 'نشطة' : 'غير نشطة' })) },
      residents: { title: 'المشتركون', rows: report.residents.map(item => ({ الاسم: item.name, الشقة: apartmentNo(item.apartmentId), العلاقة: item.relation, الجوال: item.phone, البداية: item.startDate, النهاية: item.endDate, الحالة: item.active ? 'نشط' : 'غير نشط' })) }
    }
    return reportKind === 'all' ? Object.values(all) : [all[reportKind]]
  }, [report, reportKind, summaryRows, apartments])

  function exportReportWorkbook() {
    if (!report) return
    exportWorkbook(sections.map(section => ({ name: section.title, rows: section.rows })), `تقرير_${reportKind}`, { buildingName: settings.buildingName, reportTitle: reportNames[reportKind], filters: filterDescription, exportedAt })
  }

  async function createPdf() {
    if (!reportRef.current) return
    await document.fonts.ready
    await exportElementPdf(reportRef.current, `تقرير_${reportKind}`)
  }

  function reportSummaryText() {
    if (!report) return ''
    if (!['all', 'summary'].includes(reportKind)) {
      return `${settings.buildingName}
${reportNames[reportKind]}
الفترة: ${filterDescription}
عدد السجلات: ${sections[0]?.rows.length || 0}
تاريخ التقرير: ${exportedAt}`
    }
    return `${settings.buildingName}
التقرير المالي العام
الفترة: ${filterDescription}
الإيرادات: ${report.subscriptionsCollected + report.otherIncome} ${settings.currencySymbol}
المصروفات والمشتريات: ${report.expensesTotal + report.purchasesTotal} ${settings.currencySymbol}
المتأخرات: ${report.arrears} ${settings.currencySymbol}
الرصيد: ${report.closingBalance} ${settings.currencySymbol}
تاريخ التقرير: ${exportedAt}`
  }

  async function shareReport() {
    if (!report || !reportRef.current) return
    try {
      await document.fonts.ready
      const file = await createElementPdfFile(reportRef.current, `تقرير_${reportKind}`)
      const shared = await shareFileOrText({ title: reportNames[reportKind], text: reportSummaryText(), file })
      if (!shared) alert('تم نسخ ملخص التقرير. جهازك لا يدعم مشاركة الملفات مباشرة.')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذرت مشاركة التقرير')
    }
  }

  return <>
    <PageHeader title="التقارير المالية" onExcel={exportReportWorkbook} onPdf={() => void createPdf()} onShare={() => void shareReport()} />
    <div className="panel filters-bar">
      <label>نوع التقرير<select value={reportKind} onChange={event => setReportKind(event.target.value as ReportKind)}>{Object.entries(reportNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>من<input type="date" value={filters.from || ''} onChange={event => setFilters({ ...filters, from: event.target.value || undefined })} /></label>
      <label>إلى<input type="date" value={filters.to || ''} onChange={event => setFilters({ ...filters, to: event.target.value || undefined })} /></label>
      <label>السنة<input type="number" min="2000" max="2200" value={filters.year || ''} onChange={event => setFilters({ ...filters, year: event.target.value ? Number(event.target.value) : undefined })} /></label>
      <label>الشهر<select value={filters.month || ''} onChange={event => setFilters({ ...filters, month: event.target.value ? Number(event.target.value) : undefined })}><option value="">الكل</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>
      <label>الشقة<select value={filters.apartmentId || ''} onChange={event => setFilters({ ...filters, apartmentId: event.target.value || undefined })}><option value="">جميع الشقق</option>{apartments.map(item => <option key={item.id} value={item.id}>{item.number}</option>)}</select></label>
      <label>الحالة<input value={filters.status || ''} onChange={event => setFilters({ ...filters, status: event.target.value || undefined })} placeholder="paid / open..." /></label>
      <label>التصنيف<input value={filters.category || ''} onChange={event => setFilters({ ...filters, category: event.target.value || undefined })} /></label>
      <label>طريقة الدفع<input value={filters.method || ''} onChange={event => setFilters({ ...filters, method: event.target.value || undefined })} /></label>
      <button className="primary" onClick={() => void load(filters)}>تطبيق الفلاتر</button>
      <button onClick={() => { setFilters({}); void load({}) }}>مسح الفلاتر</button>
      <button onClick={() => void copyText(reportSummaryText()).then(() => alert('تم نسخ ملخص التقرير'))}>نسخ الملخص</button>
      <button onClick={() => openWhatsApp(reportSummaryText())}>فتح WhatsApp</button>
    </div>

    <div className="panel report" ref={reportRef}>
      <div className="report-header">
        <h2>{settings.buildingName}</h2>
        <h3>{reportNames[reportKind]}</h3>
        <p>الفترة: {filterDescription}</p>
        <p>تاريخ ووقت التصدير: {exportedAt} — العملة: {settings.currencySymbol}</p>
      </div>
      {loading ? <div className="empty">جارٍ إعداد التقرير...</div> : report
        ? sections.map(section => <ReportSectionTable key={section.title} section={section} />)
        : <Empty />}
    </div>
  </>
}

function ReportSectionTable({ section }: { section: PdfSection }) {
  if (!section.rows.length) return <section className="report-section"><h3>{section.title}</h3><Empty text={`لا توجد بيانات في ${section.title} ضمن الفترة المحددة`} /></section>
  const headers = Object.keys(section.rows[0])
  return <section className="report-section">
    <h3>{section.title}</h3>
    <table><thead><tr>{headers.map(header => <th key={header}>{header.replaceAll('_', ' ')}</th>)}</tr></thead>
      <tbody>{section.rows.map((row, index) => <tr key={`${section.title}-${index}`}>{headers.map(header => {
        const value = row[header]
        return <td key={header}>{typeof value === 'number' ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(value ?? '')}</td>
      })}</tr>)}</tbody>
    </table>
  </section>
}
