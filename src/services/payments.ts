import { audit, db, now, uid } from '../db/database'
import type { Payment, PaymentStatus } from '../types/models'
import { getChargeBalance, getChargeRequiredAmount, getPaymentStatus, sumActivePayments, validateFinancialAmount } from './finance'
import { createReceiptSnapshot, nextReceiptNumber } from './receipts'

export interface CreatePaymentInput {
  chargeId: string
  amount: number
  date: string
  method: string
  reference?: string
  notes?: string
  attachmentId?: string
  allowOverpayment?: boolean
}

function statusLabel(status: PaymentStatus): string {
  const labels: Record<PaymentStatus, string> = {
    unpaid: 'غير مدفوع',
    partial: 'مدفوع جزئياً',
    paid: 'مدفوع بالكامل',
    overpaid: 'دفعة زائدة',
    cancelled: 'ملغى'
  }
  return labels[status]
}

export async function createPayment(input: CreatePaymentInput): Promise<Payment> {
  validateFinancialAmount(input.amount)
  if (!input.date) throw new Error('تاريخ الدفعة مطلوب')
  if (!input.method.trim()) throw new Error('طريقة الدفع مطلوبة')

  const charge = await db.charges.get(input.chargeId)
  if (!charge || charge.active === false) throw new Error('الاستحقاق غير موجود أو غير نشط')
  if (charge.status === 'ملغى' || charge.status === 'cancelled') throw new Error('لا يمكن تسجيل دفعة على استحقاق ملغى')

  const apartment = await db.apartments.get(charge.apartmentId)
  const settings = await db.settings.get('main')
  if (!apartment) throw new Error('الشقة المرتبطة بالاستحقاق غير موجودة')
  if (!settings) throw new Error('إعدادات التطبيق غير مهيأة')

  const [existingPayments, extras, resident] = await Promise.all([
    db.payments.where('chargeId').equals(charge.id).toArray(),
    db.extraCharges.where('[apartmentId+year+month]').equals([charge.apartmentId, charge.year, charge.month]).toArray(),
    charge.residentId ? db.residents.get(charge.residentId) : undefined
  ])

  const requiredAmount = getChargeRequiredAmount(charge, extras)
  const paidBefore = sumActivePayments(existingPayments)
  const remainingBefore = getChargeBalance(requiredAmount, paidBefore)

  if (input.amount > remainingBefore && !input.allowOverpayment) {
    throw new Error(`قيمة الدفعة أكبر من المتبقي بمبلغ ${(input.amount - remainingBefore).toFixed(2)}`)
  }

  const paymentYear = Number(input.date.slice(0, 4)) || new Date().getFullYear()
  const timestamp = now()
  const paidAfter = paidBefore + input.amount
  const balanceAfter = getChargeBalance(requiredAmount, paidAfter)
  const newStatus = getPaymentStatus(requiredAmount, paidAfter)
  let payment: Payment | undefined

  await db.transaction('rw', db.receiptSequences, db.payments, db.receipts, db.charges, db.audit, async () => {
    const receiptNo = await nextReceiptNumber(settings, apartment, paymentYear)
    payment = {
      id: uid(),
      chargeId: charge.id,
      apartmentId: charge.apartmentId,
      amount: input.amount,
      date: input.date,
      method: input.method.trim(),
      receiptNo,
      reference: input.reference?.trim() || '',
      notes: input.notes?.trim() || '',
      cancelled: false,
      attachmentId: input.attachmentId,
      createdAt: timestamp,
      updatedAt: timestamp,
      active: true,
      status: 'active'
    }
    const receipt = createReceiptSnapshot({
      settings,
      apartment,
      charge,
      payment,
      residentName: resident?.name,
      requiredAmount,
      totalPaid: paidAfter,
      remainingAmount: balanceAfter
    })
    await db.payments.add(payment)
    await db.receipts.add(receipt)
    await db.charges.update(charge.id, { status: statusLabel(newStatus), updatedAt: timestamp })
    await audit('payments', payment.id, 'create', `تسجيل دفعة وإصدار الإيصال ${receiptNo}`, undefined, payment)
  })

  if (!payment) throw new Error('تعذر إكمال عملية الدفع')
  return payment
}

export async function cancelPayment(paymentId: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new Error('سبب إلغاء الدفعة مطلوب')
  const payment = await db.payments.get(paymentId)
  if (!payment) throw new Error('الدفعة غير موجودة')
  if (payment.cancelled) throw new Error('الدفعة ملغاة مسبقاً')

  const charge = await db.charges.get(payment.chargeId)
  if (!charge) throw new Error('الاستحقاق المرتبط غير موجود')

  const [allPayments, extras] = await Promise.all([
    db.payments.where('chargeId').equals(charge.id).toArray(),
    db.extraCharges.where('[apartmentId+year+month]').equals([charge.apartmentId, charge.year, charge.month]).toArray()
  ])
  const requiredAmount = getChargeRequiredAmount(charge, extras)
  const remainingPayments = allPayments.filter(item => item.id !== payment.id)
  const paidAfter = sumActivePayments(remainingPayments)
  const newStatus = getPaymentStatus(requiredAmount, paidAfter)
  const timestamp = now()
  const updatedPayment: Partial<Payment> = {
    cancelled: true,
    cancellationReason: reason.trim(),
    status: 'cancelled',
    updatedAt: timestamp
  }

  await db.transaction('rw', db.payments, db.charges, db.audit, async () => {
    await db.payments.update(payment.id, updatedPayment)
    await db.charges.update(charge.id, { status: statusLabel(newStatus), updatedAt: timestamp })
    await audit('payments', payment.id, 'cancel', `إلغاء الدفعة ذات الإيصال ${payment.receiptNo}`, payment, { ...payment, ...updatedPayment }, reason.trim())
  })
}
