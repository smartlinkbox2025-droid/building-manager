import { db } from '../db/database'
import type { Apartment, Charge, Expense, Income, Maintenance, MaintenanceContract, Payment, Purchase, Resident, Supplier } from '../types/models'
import { getChargeRequiredAmount, getExpensePaidAmount } from './finance'

export interface ReportFilters {
  from?: string
  to?: string
  year?: number
  month?: number
  apartmentId?: string
  residentId?: string
  status?: string
  category?: string
  method?: string
  supplierId?: string
}

export interface FinancialReportData {
  openingBalance: number
  subscriptionsDue: number
  subscriptionsCollected: number
  extraCharges: number
  otherIncome: number
  expensesTotal: number
  purchasesTotal: number
  arrears: number
  closingBalance: number
  payments: Payment[]
  incomes: Income[]
  expenses: Expense[]
  purchases: Purchase[]
  maintenance: Maintenance[]
  charges: Charge[]
  apartments: Apartment[]
  residents: Resident[]
  suppliers: Supplier[]
  contracts: MaintenanceContract[]
}

function inDateRange(date: string, filters: ReportFilters) {
  if (!date) return false
  if (filters.from && date < filters.from) return false
  if (filters.to && date > filters.to) return false
  return true
}

function chargeInRange(charge: Charge, filters: ReportFilters) {
  if (filters.year && charge.year !== filters.year) return false
  if (filters.month && charge.month !== filters.month) return false
  if (filters.apartmentId && charge.apartmentId !== filters.apartmentId) return false
  if (filters.from || filters.to) {
    const date = `${charge.year}-${String(charge.month).padStart(2, '0')}-01`
    if (!inDateRange(date, filters)) return false
  }
  return charge.active !== false && charge.status !== 'cancelled'
}

export async function buildFinancialReport(filters: ReportFilters): Promise<FinancialReportData> {
  const [settings, apartments, residents, suppliers, allCharges, allPayments, allIncomes, allExpenses, allPurchases, allMaintenance, contracts, extras] = await Promise.all([
    db.settings.get('main'), db.apartments.toArray(), db.residents.toArray(), db.suppliers.toArray(),
    db.charges.toArray(), db.payments.toArray(), db.incomes.toArray(), db.expenses.toArray(),
    db.purchases.toArray(), db.maintenance.toArray(), db.maintenanceContracts.toArray(),
    db.extraCharges.toArray()
  ])

  const charges = allCharges.filter(charge => chargeInRange(charge, filters)
    && (!filters.residentId || charge.residentId === filters.residentId)
    && (!filters.status || charge.status === filters.status))
  const chargeIds = new Set(charges.map(charge => charge.id))
  const payments = allPayments.filter(payment => !payment.cancelled && payment.active !== false && chargeIds.has(payment.chargeId)
    && inDateRange(payment.date, filters) && (!filters.method || payment.method === filters.method))
  const incomes = allIncomes.filter(item => !item.cancelled && item.active !== false && inDateRange(item.date, filters)
    && (!filters.category || item.category === filters.category) && (!filters.method || item.method === filters.method))
  const expenses = allExpenses.filter(item => !item.cancelled && item.active !== false && inDateRange(item.date, filters)
    && (!filters.category || item.category === filters.category) && (!filters.method || item.method === filters.method)
    && (!filters.supplierId || item.supplierId === filters.supplierId))
  const purchases = allPurchases.filter(item => !item.cancelled && item.active !== false && inDateRange(item.date, filters)
    && (!filters.category || item.category === filters.category) && (!filters.method || item.paymentMethod === filters.method)
    && (!filters.supplierId || item.supplierId === filters.supplierId))
  const maintenance = allMaintenance.filter(item => item.active !== false
    && (!filters.status || item.status === filters.status)
    && (!filters.category || item.category === filters.category)
    && (!filters.from || item.reportDate >= filters.from) && (!filters.to || item.reportDate <= filters.to))
  const activeExtras = extras.filter(item => item.active !== false && !item.cancelled && chargeIds.has(item.chargeId || ''))

  const subscriptionsDue = charges.reduce((sum, charge) => sum + getChargeRequiredAmount(charge, activeExtras), 0)
  const subscriptionsCollected = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const extraCharges = activeExtras.reduce((sum, item) => sum + item.amount, 0)
  const otherIncome = incomes.reduce((sum, item) => sum + item.amount, 0)
  const expensesTotal = expenses.reduce((sum, item) => sum + getExpensePaidAmount(item), 0)
  const purchasesTotal = purchases.reduce((sum, item) => sum + item.total, 0)
  const arrears = Math.max(0, subscriptionsDue - subscriptionsCollected)
  const openingBalance = settings?.openingBalance || 0
  const closingBalance = openingBalance + subscriptionsCollected + otherIncome - expensesTotal - purchasesTotal

  return {
    openingBalance, subscriptionsDue, subscriptionsCollected, extraCharges, otherIncome, expensesTotal,
    purchasesTotal, arrears, closingBalance, payments, incomes, expenses, purchases, maintenance, charges,
    apartments, residents, suppliers, contracts
  }
}

export function describeFilters(filters: ReportFilters, apartments: Apartment[]) {
  const parts: string[] = []
  if (filters.from) parts.push(`من ${filters.from}`)
  if (filters.to) parts.push(`إلى ${filters.to}`)
  if (filters.year) parts.push(`السنة ${filters.year}`)
  if (filters.month) parts.push(`الشهر ${filters.month}`)
  if (filters.apartmentId) parts.push(`الشقة ${apartments.find(item => item.id === filters.apartmentId)?.number || ''}`)
  if (filters.residentId) parts.push('مشترك محدد')
  if (filters.status) parts.push(`الحالة ${filters.status}`)
  if (filters.category) parts.push(`التصنيف ${filters.category}`)
  if (filters.method) parts.push(`طريقة الدفع ${filters.method}`)
  if (filters.supplierId) parts.push('مورد محدد')
  return parts.length ? parts.join(' — ') : 'جميع البيانات'
}
