import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db/database'
import type { Apartment } from '../types/models'
import { Empty, Money, PageHeader } from '../components/Common'
import { createElementPdfFile, exportElementPdf, exportWorkbook } from '../services/export'
import { copyText, openWhatsApp, shareFileOrText } from '../services/share'
import { buildFinancialReport, describeFilters, type FinancialReportData, type ReportFilters } from '../services/reports'

const currentYear = new Date().getFullYear()
const initialFilters: ReportFilters = { year: currentYear }

export default function Reports() {
  const [report, setReport] = useState<FinancialReportData | null>(null)
  const [apartments, setApartments] = useState<Apartment[]>([])
  const [settings, setSettings] = useState({ buildingName: 'عمارة سكنية', currencySymbol: 'ر.س' })
  const [filters, setFilters] = useState<ReportFilters>(initialFilters)
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(initialFilters)
  const [loading, setLoading] = useState(true)
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
  const exportedAt = new Date().toLocaleString('ar-SA')

  function exportReportWorkbook() {
    if (!report) return
    exportWorkbook([
      { name: 'الملخص', rows: summaryRows },
      { name: 'المصروفات', rows: report.expenses.map(item => ({ التاريخ: item.date, التصنيف: item.category, البيان: item.description, المستفيد: item.beneficiary, رقم_الفاتورة: item.invoiceNo, المبلغ: item.amount })) },
      { name: 'المشتريات', rows: report.purchases.map(item => ({ التاريخ: item.date, الصنف: item.item, التصنيف: item.category, الكمية: item.quantity, الوحدة: item.unit, سعر_الوحدة: item.unitPrice, الضريبة: item.taxAmount, الإجمالي: item.total })) },
      { name: 'الاستحقاقات', rows: report.charges.map(item => ({ الشقة: apartments.find(apartment => apartment.id === item.apartmentId)?.number || '-', الشهر: `${item.month}/${item.year}`, الاشتراك_الأساسي: item.baseAmount, الإضافي: item.extras, إجمالي_المطلوب: item.baseAmount + item.extras, الحالة: item.status })) }
    ], 'التقرير_المالي', { buildingName: settings.buildingName, reportTitle: 'التقرير المالي العام', filters: filterDescription, exportedAt })
  }

  function reportSummaryText() {
    if (!report) return ''
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
    if (!reportRef.current || !report) return
    try {
      const file = await createElementPdfFile(reportRef.current, 'التقرير_المالي')
      const shared = await shareFileOrText({ title: 'التقرير المالي', text: reportSummaryText(), file })
      if (!shared) alert('تم نسخ ملخص التقرير. جهازك لا يدعم مشاركة الملفات مباشرة.')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذرت مشاركة التقرير')
    }
  }

  return <>
    <PageHeader title="التقارير المالية" onExcel={exportReportWorkbook} onPdf={() => reportRef.current && exportElementPdf(reportRef.current, 'التقرير_المالي')} onShare={() => void shareReport()} />
    <div className="panel filters-bar">
      <label>من<input type="date" value={filters.from || ''} onChange={event => setFilters({ ...filters, from: event.target.value || undefined })} /></label>
      <label>إلى<input type="date" value={filters.to || ''} onChange={event => setFilters({ ...filters, to: event.target.value || undefined })} /></label>
      <label>السنة<input type="number" min="2000" max="2200" value={filters.year || ''} onChange={event => setFilters({ ...filters, year: event.target.value ? Number(event.target.value) : undefined })} /></label>
      <label>الشهر<select value={filters.month || ''} onChange={event => setFilters({ ...filters, month: event.target.value ? Number(event.target.value) : undefined })}><option value="">الكل</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>
      <label>الشقة<select value={filters.apartmentId || ''} onChange={event => setFilters({ ...filters, apartmentId: event.target.value || undefined })}><option value="">جميع الشقق</option>{apartments.map(item => <option key={item.id} value={item.id}>{item.number}</option>)}</select></label>
      <button className="primary" onClick={() => void load(filters)}>تطبيق الفلاتر</button>
      <button onClick={() => { setFilters({}); void load({}) }}>مسح الفلاتر</button>
      <button onClick={() => void copyText(reportSummaryText()).then(() => alert('تم نسخ ملخص التقرير'))}>نسخ الملخص</button>
      <button onClick={() => openWhatsApp(reportSummaryText())}>فتح WhatsApp</button>
    </div>

    <div className="panel report" ref={reportRef}>
      <div className="report-header">
        <h2>{settings.buildingName}</h2>
        <h3>التقرير المالي العام</h3>
        <p>الفترة: {filterDescription}</p>
        <p>تاريخ ووقت التصدير: {exportedAt} — العملة: {settings.currencySymbol}</p>
      </div>
      {loading ? <div className="empty">جارٍ إعداد التقرير...</div> : report ? <>
        <div className="report-kpis">
          <div><span>الرصيد الختامي</span><strong><Money value={report.closingBalance} /></strong></div>
          <div><span>الإيرادات المحصلة</span><strong><Money value={report.subscriptionsCollected + report.otherIncome} /></strong></div>
          <div><span>المصروفات والمشتريات</span><strong><Money value={report.expensesTotal + report.purchasesTotal} /></strong></div>
          <div><span>المتأخرات</span><strong><Money value={report.arrears} /></strong></div>
        </div>

        <h3>الملخص المالي</h3>
        <table><thead><tr><th>البند</th><th>المبلغ</th></tr></thead><tbody>{summaryRows.map(row => <tr key={row.البند}><td>{row.البند}</td><td><Money value={row.المبلغ} /></td></tr>)}</tbody></table>

        <h3>تفاصيل المصروفات</h3>
        {report.expenses.length ? <table><thead><tr><th>التاريخ</th><th>التصنيف</th><th>البيان</th><th>الجهة المستفيدة</th><th>رقم الفاتورة</th><th>المبلغ</th></tr></thead><tbody>{report.expenses.map(item => <tr key={item.id}><td>{item.date}</td><td>{item.category}</td><td>{item.description}</td><td>{item.beneficiary}</td><td>{item.invoiceNo}</td><td><Money value={item.amount} /></td></tr>)}</tbody></table> : <Empty text="لا توجد مصروفات ضمن الفترة المحددة" />}

        <h3>تفاصيل المشتريات</h3>
        {report.purchases.length ? <table><thead><tr><th>التاريخ</th><th>الصنف</th><th>التصنيف</th><th>الكمية</th><th>سعر الوحدة</th><th>الضريبة</th><th>الإجمالي</th></tr></thead><tbody>{report.purchases.map(item => <tr key={item.id}><td>{item.date}</td><td>{item.item}</td><td>{item.category}</td><td>{item.quantity} {item.unit}</td><td><Money value={item.unitPrice} /></td><td><Money value={item.taxAmount} /></td><td><Money value={item.total} /></td></tr>)}</tbody></table> : <Empty text="لا توجد مشتريات ضمن الفترة المحددة" />}

        <h3>الشقق والاستحقاقات</h3>
        {report.charges.length ? <table><thead><tr><th>الشقة</th><th>الشهر</th><th>الاشتراك الأساسي</th><th>إجمالي المطلوب</th><th>الحالة</th></tr></thead><tbody>{report.charges.map(item => <tr key={item.id}><td>{apartments.find(apartment => apartment.id === item.apartmentId)?.number || '-'}</td><td>{item.month}/{item.year}</td><td><Money value={item.baseAmount} /></td><td><Money value={item.baseAmount + item.extras} /></td><td>{item.status}</td></tr>)}</tbody></table> : <Empty text="لا توجد استحقاقات ضمن الفترة المحددة" />}
      </> : <Empty />}
    </div>
  </>
}
