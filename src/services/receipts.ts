import { db, now, uid } from '../db/database'
import type { Apartment, AppSettings, Charge, Payment, Receipt } from '../types/models'

const padSequence = (value: number) => String(value).padStart(3, '0')

export function buildReceiptNumber(prefix: string, year: number, apartmentNumber: string, sequence: number): string {
  return `${prefix}-${year}-${apartmentNumber}-${padSequence(sequence)}`
}

export async function nextReceiptNumber(
  settings: AppSettings,
  apartment: Apartment,
  paymentYear: number
): Promise<string> {
  const prefix = (settings.receiptPrefix || 'INV').trim().toUpperCase()
  const apartmentNumber = apartment.number.trim()
  const sequenceId = `${prefix}:${paymentYear}:${apartmentNumber}`

  return db.transaction('rw', db.receiptSequences, db.payments, db.receipts, async () => {
    const current = await db.receiptSequences.get(sequenceId)
    let sequence = (current?.lastSequence || 0) + 1
    let receiptNo = buildReceiptNumber(prefix, paymentYear, apartmentNumber, sequence)

    while ((await db.payments.where('receiptNo').equals(receiptNo).count()) > 0 ||
      (await db.receipts.where('receiptNo').equals(receiptNo).count()) > 0) {
      sequence += 1
      receiptNo = buildReceiptNumber(prefix, paymentYear, apartmentNumber, sequence)
    }

    await db.receiptSequences.put({
      id: sequenceId,
      year: paymentYear,
      apartmentNumber,
      prefix,
      lastSequence: sequence,
      updatedAt: now()
    })

    return receiptNo
  })
}

export function createReceiptSnapshot(params: {
  settings: AppSettings
  apartment: Apartment
  charge: Charge
  payment: Payment
  residentName?: string
  requiredAmount: number
  totalPaid: number
  remainingAmount: number
}): Receipt {
  const { settings, apartment, charge, payment, residentName, requiredAmount, totalPaid, remainingAmount } = params
  const timestamp = now()

  return {
    id: uid(),
    paymentId: payment.id,
    chargeId: charge.id,
    apartmentId: apartment.id,
    receiptNo: payment.receiptNo,
    issuedAt: timestamp,
    snapshot: {
      buildingName: settings.buildingName,
      buildingAddress: settings.address,
      currency: settings.currency,
      currencySymbol: settings.currencySymbol,
      apartmentNumber: apartment.number,
      residentName: residentName || apartment.residentName || apartment.ownerName,
      chargeYear: charge.year,
      chargeMonth: charge.month,
      paymentAmount: payment.amount,
      paymentDate: payment.date,
      paymentMethod: payment.method,
      paymentReference: payment.reference,
      paymentNotes: payment.notes,
      requiredAmount,
      totalPaid,
      remainingAmount,
      confirmationText: 'تم استلام المبلغ الموضح أعلاه، مع الشكر والتقدير.',
      generatedAt: timestamp
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    active: true,
    status: 'active'
  }
}
