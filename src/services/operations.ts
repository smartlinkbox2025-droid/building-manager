import { audit, db, now, uid } from '../db/database'
import type { ExtraCharge, Income, MaintenanceContract, Purchase, Supplier } from '../types/models'
import { validateFinancialAmount } from './finance'

export async function addExtraCharge(input: Omit<ExtraCharge, 'id'|'createdAt'|'updatedAt'|'active'|'cancelled'>) {
  validateFinancialAmount(input.amount)
  const charge = input.chargeId
    ? await db.charges.get(input.chargeId)
    : await db.charges.where('[apartmentId+year+month]').equals([input.apartmentId, input.year, input.month]).first()
  if (!charge) throw new Error('يجب إنشاء استحقاق الشهر للشقة قبل إضافة مبلغ إضافي')
  const item: ExtraCharge = { ...input, chargeId: charge.id, id: uid(), createdAt: now(), updatedAt: now(), active: true, cancelled: false }
  await db.transaction('rw', db.extraCharges, db.charges, db.audit, async () => {
    await db.extraCharges.add(item)
    const extras = await db.extraCharges.where('chargeId').equals(charge.id).toArray()
    const total = extras.filter(x => x.active && !x.cancelled).reduce((s, x) => s + x.amount, 0)
    await db.charges.update(charge.id, { extras: total, updatedAt: now() })
    await audit('extraCharges', item.id, 'create', 'إضافة مبلغ إضافي شهري', undefined, item)
  })
  return item
}

export async function cancelExtraCharge(id: string, reason: string) {
  if (!reason.trim()) throw new Error('سبب الإلغاء مطلوب')
  const item = await db.extraCharges.get(id)
  if (!item || !item.chargeId) throw new Error('المبلغ الإضافي غير موجود')
  await db.transaction('rw', db.extraCharges, db.charges, db.audit, async () => {
    await db.extraCharges.update(id, { cancelled: true, active: false, status: 'cancelled', cancellationReason: reason, updatedAt: now() })
    const extras = await db.extraCharges.where('chargeId').equals(item.chargeId!).toArray()
    const total = extras.filter(x => x.id !== id && x.active && !x.cancelled).reduce((s, x) => s + x.amount, 0)
    await db.charges.update(item.chargeId!, { extras: total, updatedAt: now() })
    await audit('extraCharges', id, 'cancel', 'إلغاء مبلغ إضافي شهري', item, { ...item, cancelled: true }, reason)
  })
}

export async function saveIncome(input: Omit<Income, 'id'|'createdAt'|'updatedAt'|'active'|'cancelled'>) {
  validateFinancialAmount(input.amount)
  const item: Income = { ...input, id: uid(), createdAt: now(), updatedAt: now(), active: true, cancelled: false }
  await db.incomes.add(item); await audit('incomes', item.id, 'create', 'إضافة إيراد آخر', undefined, item); return item
}

export async function saveSupplier(input: Omit<Supplier, 'id'|'createdAt'|'updatedAt'|'active'>) {
  if (!input.name.trim()) throw new Error('اسم المورد مطلوب')
  const item: Supplier = { ...input, id: uid(), createdAt: now(), updatedAt: now(), active: true, status: 'active' }
  await db.suppliers.add(item); await audit('suppliers', item.id, 'create', 'إضافة مورد', undefined, item); return item
}

export async function savePurchase(input: Omit<Purchase, 'id'|'createdAt'|'updatedAt'|'active'|'cancelled'|'total'>) {
  validateFinancialAmount(input.quantity); validateFinancialAmount(input.unitPrice)
  if (input.taxAmount < 0) throw new Error('قيمة الضريبة غير صالحة')
  const total = input.quantity * input.unitPrice + input.taxAmount
  const item: Purchase = { ...input, total, id: uid(), createdAt: now(), updatedAt: now(), active: true, cancelled: false }
  await db.purchases.add(item); await audit('purchases', item.id, 'create', 'إضافة عملية شراء', undefined, item); return item
}

export async function saveMaintenanceContract(input: Omit<MaintenanceContract, 'id'|'createdAt'|'updatedAt'|'active'>) {
  validateFinancialAmount(input.amount, true)
  if (input.endDate && input.startDate && input.endDate < input.startDate) throw new Error('تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية')
  const item: MaintenanceContract = { ...input, id: uid(), createdAt: now(), updatedAt: now(), active: true, status: 'active' }
  await db.maintenanceContracts.add(item); await audit('maintenanceContracts', item.id, 'create', 'إضافة عقد صيانة', undefined, item); return item
}
