import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bell, CheckCircle2, Clock3, FileWarning, RefreshCw, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { db } from '../db/database'
import { Money } from '../components/Common'
import { markAlertRead, refreshAlerts, requestLocalNotifications, type AlertSnapshot } from '../services/alerts'
import type { Alert, AppSettings, Expense, Maintenance, MaintenanceContract, Payment, Purchase } from '../types/models'
import BuildingAsset from '../components/BuildingAsset'
import { getExpenseOutstandingAmount, getExpensePaidAmount } from '../services/finance'

type DashboardData = {
  settings?: AppSettings
  opening: number
  currentBalance: number
  monthlyIncome: number
  monthlyExpenses: number
  outstandingExpenses: number
  subscriptionsCollected: number
  totalDue: number
  apartmentCount: number
  paidCount: number
  partialCount: number
  unpaidCount: number
  overdueApartmentNumbers: string[]
  collectionRate: number
  recentPayments: Payment[]
  recentExpenses: Expense[]
  recentPurchases: Purchase[]
  upcomingMaintenance: Maintenance[]
  expiringContracts: MaintenanceContract[]
  alerts: AlertSnapshot
  monthlyTrend: { label: string; income: number; expense: number }[]
}

const emptyAlerts: AlertSnapshot = { alerts: [], unreadCount: 0, overdueCount: 0, maintenanceCount: 0, contractCount: 0, backupWarning: false }
const initialData: DashboardData = { opening: 0, currentBalance: 0, monthlyIncome: 0, monthlyExpenses: 0, outstandingExpenses: 0, subscriptionsCollected: 0, totalDue: 0, apartmentCount: 0, paidCount: 0, partialCount: 0, unpaidCount: 0, overdueApartmentNumbers: [], collectionRate: 0, recentPayments: [], recentExpenses: [], recentPurchases: [], upcomingMaintenance: [], expiringContracts: [], alerts: emptyAlerts, monthlyTrend: [] }
const active = <T extends { active: boolean; cancelled?: boolean }>(items: T[]) => items.filter(item => item.active !== false && !item.cancelled)
const sameMonth = (date: string, year: number, month: number) => { const value = new Date(date); return value.getFullYear() === year && value.getMonth() + 1 === month }

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>(initialData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [settings, apartments, charges, paymentsRaw, incomesRaw, expensesRaw, purchasesRaw, maintenance, contracts, alerts] = await Promise.all([
        db.settings.get('main'), db.apartments.toArray(), db.charges.toArray(), db.payments.toArray(), db.incomes.toArray(), db.expenses.toArray(), db.purchases.toArray(), db.maintenance.toArray(), db.maintenanceContracts.toArray(), refreshAlerts()
      ])
      const payments = active(paymentsRaw)
      const incomes = active(incomesRaw)
      const expenses = active(expensesRaw)
      const purchases = active(purchasesRaw)
      const current = new Date(); const year = current.getFullYear(); const month = current.getMonth() + 1
      const chargeStats = charges.filter(charge => charge.active !== false && charge.status !== 'ملغى').map(charge => {
        const required = Number(charge.baseAmount || 0) + Number(charge.extras || 0)
        const paid = payments.filter(payment => payment.chargeId === charge.id).reduce((sum, payment) => sum + payment.amount, 0)
        return { charge, required, paid, remaining: Math.max(0, required - paid) }
      })
      const currentCharges = chargeStats.filter(item => item.charge.year === year && item.charge.month === month)
      const subscriptionsCollected = payments.reduce((sum, item) => sum + item.amount, 0)
      const otherIncome = incomes.reduce((sum, item) => sum + item.amount, 0)
      const allExpenses = expenses.reduce((sum, item) => sum + getExpensePaidAmount(item), 0) + purchases.reduce((sum, item) => sum + item.total, 0)
      const outstandingExpenses = expenses.reduce((sum, item) => sum + getExpenseOutstandingAmount(item), 0)
      const monthlyIncome = payments.filter(item => sameMonth(item.date, year, month)).reduce((sum, item) => sum + item.amount, 0) + incomes.filter(item => sameMonth(item.date, year, month)).reduce((sum, item) => sum + item.amount, 0)
      const monthlyExpenses = expenses.filter(item => sameMonth(item.date, year, month)).reduce((sum, item) => sum + getExpensePaidAmount(item), 0) + purchases.filter(item => sameMonth(item.date, year, month)).reduce((sum, item) => sum + item.total, 0)
      const apartmentMap = new Map(apartments.map(apartment => [apartment.id, apartment.number]))
      const monthLabels = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
      const monthlyTrend = Array.from({ length: 6 }, (_, index) => {
        const d = new Date(year, month - 1 - (5 - index), 1); const y = d.getFullYear(); const m = d.getMonth() + 1
        return { label: monthLabels[m - 1], income: payments.filter(item => sameMonth(item.date, y, m)).reduce((s, item) => s + item.amount, 0) + incomes.filter(item => sameMonth(item.date, y, m)).reduce((s, item) => s + item.amount, 0), expense: expenses.filter(item => sameMonth(item.date, y, m)).reduce((s, item) => s + getExpensePaidAmount(item), 0) + purchases.filter(item => sameMonth(item.date, y, m)).reduce((s, item) => s + item.total, 0) }
      })
      const totalRequired = currentCharges.reduce((sum, item) => sum + item.required, 0)
      const totalPaid = currentCharges.reduce((sum, item) => sum + item.paid, 0)
      setData({
        settings, opening: settings?.openingBalance || 0, currentBalance: (settings?.openingBalance || 0) + subscriptionsCollected + otherIncome - allExpenses,
        monthlyIncome, monthlyExpenses, outstandingExpenses, subscriptionsCollected, totalDue: chargeStats.reduce((sum, item) => sum + item.remaining, 0), apartmentCount: apartments.filter(item => item.active !== false).length,
        paidCount: currentCharges.filter(item => item.required > 0 && item.paid >= item.required).length, partialCount: currentCharges.filter(item => item.paid > 0 && item.paid < item.required).length, unpaidCount: currentCharges.filter(item => item.paid === 0 && item.required > 0).length,
        overdueApartmentNumbers: alerts.alerts.filter(item => item.type === 'overdue-charge').map(item => apartmentMap.get(charges.find(charge => charge.id === item.entityId)?.apartmentId || '') || '').filter(Boolean),
        collectionRate: totalRequired ? Math.min(100, totalPaid / totalRequired * 100) : 0,
        recentPayments: [...payments].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5), recentExpenses: [...expenses].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5), recentPurchases: [...purchases].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5),
        upcomingMaintenance: maintenance.filter(item => item.active !== false && !['مكتملة','ملغاة'].includes(item.status)).sort((a,b) => (a.nextDate || a.dueDate).localeCompare(b.nextDate || b.dueDate)).slice(0,5),
        expiringContracts: contracts.filter(item => item.active !== false && item.endDate >= new Date().toISOString().slice(0,10)).sort((a,b) => a.endDate.localeCompare(b.endDate)).slice(0,5), alerts, monthlyTrend
      })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر تحميل لوحة التحكم.') } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  const maxTrend = useMemo(() => Math.max(1, ...data.monthlyTrend.flatMap(item => [item.income, item.expense])), [data.monthlyTrend])
  const markRead = async (alert: Alert) => { await markAlertRead(alert.id); await load() }

  if (loading) return <div className="panel loading-state">جاري تحميل مؤشرات العمارة...</div>
  return <>
    <div className="hero dashboard-hero"><div className="building-identity"><BuildingAsset attachmentId={data.settings?.logoAttachmentId} alt="شعار العمارة" className="building-logo"/><div><h1>{data.settings?.buildingName || 'لوحة التحكم'}</h1><p>{data.settings?.address || 'ملخص مالي وإداري مباشر من قاعدة البيانات المحلية'}</p><small>{new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn',{dateStyle:'full'})}</small></div></div><button onClick={() => void load()}><RefreshCw size={17}/>تحديث</button></div>
    {error && <div className="error-message">{error}</div>}
    <div className="cards kpi-cards">
      <Kpi title="رصيد الصندوق الحالي" value={<Money value={data.currentBalance}/>} icon={<Wallet/>}/>
      <Kpi title="الرصيد الافتتاحي" value={<Money value={data.opening}/>} icon={<Wallet/>}/>
      <Kpi title="إيرادات الشهر" value={<Money value={data.monthlyIncome}/>} icon={<TrendingUp/>}/>
      <Kpi title="مصروفات الشهر" value={<Money value={data.monthlyExpenses}/>} icon={<TrendingDown/>}/>
      <Kpi title="مصروفات مستحقة" value={<Money value={data.outstandingExpenses}/>} icon={<FileWarning/>}/>
      <Kpi title="إجمالي المتأخرات" value={<Money value={data.totalDue}/>} icon={<FileWarning/>}/>
      <Kpi title="مسدد بالكامل" value={data.paidCount} icon={<CheckCircle2/>}/>
      <Kpi title="مدفوع جزئياً" value={data.partialCount} icon={<Clock3/>}/>
      <Kpi title="غير مسدد" value={data.unpaidCount} icon={<FileWarning/>}/>
      <Kpi title="التنبيهات النشطة" value={data.alerts.unreadCount} icon={<Bell/>}/>
    </div>

    <div className="dashboard-grid">
      <section className="panel"><div className="section-title"><h2>نسبة تحصيل الشهر</h2><strong>{data.collectionRate.toFixed(1)}%</strong></div><div className="progress"><span style={{width:`${data.collectionRate}%`}}/></div><p className="hint">الشقق النشطة: {data.apartmentCount} — المتأخرة: {data.overdueApartmentNumbers.join('، ') || 'لا توجد'}</p></section>
      <section className="panel"><div className="section-title"><h2>التنبيهات</h2><button onClick={() => void requestLocalNotifications(data.alerts.alerts)}>تفعيل إشعارات الجهاز</button></div>{data.alerts.alerts.length ? <div className="alert-list">{data.alerts.alerts.slice(0,6).map(alert => <button className={`alert-row ${alert.read?'read':''}`} key={alert.id} onClick={() => void markRead(alert)}><Bell size={17}/><span><strong>{alert.title}</strong><small>{alert.message}</small></span></button>)}</div> : <p className="empty-compact">لا توجد تنبيهات حالياً.</p>}</section>
    </div>

    <section className="panel"><h2>الحركة المالية لآخر 6 أشهر</h2><div className="trend-chart">{data.monthlyTrend.map(item => <div className="trend-column" key={item.label}><div className="trend-bars"><span className="income-bar" title={`إيرادات ${item.income}`} style={{height:`${Math.max(3,item.income/maxTrend*140)}px`}}/><span className="expense-bar" title={`مصروفات ${item.expense}`} style={{height:`${Math.max(3,item.expense/maxTrend*140)}px`}}/></div><small>{item.label}</small></div>)}</div><div className="legend"><span><i className="income-dot"/>إيرادات</span><span><i className="expense-dot"/>مصروفات</span></div></section>

    <div className="dashboard-grid three">
      <Recent title="آخر الدفعات" rows={data.recentPayments.map(item => [item.date, item.receiptNo, item.amount])}/>
      <Recent title="آخر المصروفات المدفوعة" rows={data.recentExpenses.map(item => [item.date, item.description, getExpensePaidAmount(item)])}/>
      <Recent title="آخر المشتريات" rows={data.recentPurchases.map(item => [item.date, item.item, item.total])}/>
    </div>
    <div className="dashboard-grid">
      <Schedule title="الصيانة القادمة" rows={data.upcomingMaintenance.map(item => [item.nextDate || item.dueDate, item.title, item.status])}/>
      <Schedule title="العقود القريبة" rows={data.expiringContracts.map(item => [item.endDate, item.name, item.contractorName])}/>
    </div>
  </>
}

function Kpi({title,value,icon}:{title:string;value:ReactNode;icon:ReactNode}) { return <div className="card kpi"><div className="kpi-icon">{icon}</div><span>{title}</span><strong>{value}</strong></div> }
function Recent({title,rows}:{title:string;rows:(string|number)[][]}) { return <section className="panel"><h2>{title}</h2>{rows.length ? <div className="compact-list">{rows.map((row,index)=><div key={`${title}-${index}`}><span>{row[0]}<small>{row[1]}</small></span><strong><Money value={Number(row[2])}/></strong></div>)}</div> : <p className="empty-compact">لا توجد بيانات.</p>}</section> }
function Schedule({title,rows}:{title:string;rows:string[][]}) { return <section className="panel"><h2>{title}</h2>{rows.length ? <div className="compact-list">{rows.map((row,index)=><div key={`${title}-${index}`}><span>{row[1]}<small>{row[2]}</small></span><strong>{row[0]}</strong></div>)}</div> : <p className="empty-compact">لا توجد مواعيد.</p>}</section> }
