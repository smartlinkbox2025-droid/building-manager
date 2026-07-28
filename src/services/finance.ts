import type { Charge, Expense, ExtraCharge, Payment, PaymentStatus } from '../types/models'

export function sumActivePayments(payments: Payment[]): number {
  return payments
    .filter(payment => payment.active !== false && !payment.cancelled)
    .reduce((total, payment) => total + payment.amount, 0)
}

export function sumActiveExtras(extras: ExtraCharge[]): number {
  return extras
    .filter(extra => extra.active !== false && !extra.cancelled)
    .reduce((total, extra) => total + extra.amount, 0)
}

export function getChargeRequiredAmount(charge: Charge, extras?: ExtraCharge[]): number {
  const extraAmount = extras && extras.length > 0 ? sumActiveExtras(extras) : charge.extras || 0
  return Math.max(0, charge.baseAmount) + Math.max(0, extraAmount)
}

export function getPaymentStatus(required: number, paid: number, cancelled = false): PaymentStatus {
  if (cancelled) return 'cancelled'
  if (paid <= 0) return 'unpaid'
  if (paid < required) return 'partial'
  if (paid === required) return 'paid'
  return 'overpaid'
}

export function getChargeBalance(required: number, paid: number): number {
  return required - paid
}

export function validateFinancialAmount(amount: number, allowZero = false): void {
  if (!Number.isFinite(amount)) throw new Error('القيمة المالية غير صالحة')
  if (amount < 0 || (!allowZero && amount === 0)) {
    throw new Error(allowZero ? 'لا يمكن إدخال قيمة سالبة' : 'يجب أن تكون القيمة أكبر من صفر')
  }
}

export function getExpensePaidAmount(expense: Expense): number {
  if (expense.cancelled || expense.active === false) return 0
  if (Number.isFinite(expense.paidAmount)) return Math.min(Math.max(0, Number(expense.paidAmount)), Math.max(0, expense.amount))
  if (expense.paymentStatus === 'مستحق') return 0
  if (expense.paymentStatus === 'مدفوع جزئياً') return 0
  return Math.max(0, expense.amount)
}

export function getExpenseOutstandingAmount(expense: Expense): number {
  return Math.max(0, Math.max(0, expense.amount) - getExpensePaidAmount(expense))
}
