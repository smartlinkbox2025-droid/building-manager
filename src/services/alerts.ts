import { db, now } from '../db/database'
import type { Alert, AppSettings, Payment } from '../types/models'

const dayMs = 86_400_000
const dateOnly = (value?: string) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).getTime() : Number.NaN
const daysUntil = (value?: string) => Math.ceil((dateOnly(value) - dateOnly(new Date().toISOString())) / dayMs)
const activePaymentsTotal = (payments: Payment[], chargeId: string) => payments
  .filter(payment => payment.chargeId === chargeId && !payment.cancelled && payment.active !== false)
  .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)

export interface AlertSnapshot {
  alerts: Alert[]
  unreadCount: number
  overdueCount: number
  maintenanceCount: number
  contractCount: number
  backupWarning: boolean
}

function makeAlert(type: string, title: string, message: string, entityType?: string, entityId?: string, dueDate?: string): Alert {
  const stamp = now()
  return {
    id: `${type}:${entityId || 'general'}`,
    type,
    title,
    message,
    entityType,
    entityId,
    dueDate,
    read: false,
    active: true,
    status: 'active',
    createdAt: stamp,
    updatedAt: stamp
  }
}

export async function refreshAlerts(): Promise<AlertSnapshot> {
  const [settings, charges, payments, apartments, maintenance, contracts, existing] = await Promise.all([
    db.settings.get('main'),
    db.charges.toArray(),
    db.payments.toArray(),
    db.apartments.toArray(),
    db.maintenance.toArray(),
    db.maintenanceContracts.toArray(),
    db.alerts.toArray()
  ])

  const config = settings as AppSettings | undefined
  const previousRead = new Map(existing.map(alert => [alert.id, alert.read]))
  const apartmentMap = new Map(apartments.map(apartment => [apartment.id, apartment.number]))
  const generated: Alert[] = []
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1
  const dueDay = config?.monthlyDueDay || 1
  const overdueDays = config?.overdueAlertDays || 5

  for (const charge of charges.filter(item => item.active !== false && item.status !== 'ملغى')) {
    const required = Number(charge.baseAmount || 0) + Number(charge.extras || 0)
    const paid = activePaymentsTotal(payments, charge.id)
    const remaining = Math.max(0, required - paid)
    const chargeDue = new Date(charge.year, charge.month - 1, dueDay)
    const delayedBy = Math.floor((today.getTime() - chargeDue.getTime()) / dayMs)
    if (remaining > 0 && delayedBy >= overdueDays && (charge.year < currentYear || charge.year === currentYear && charge.month <= currentMonth)) {
      const apartmentNo = apartmentMap.get(charge.apartmentId) || 'غير محددة'
      generated.push(makeAlert(
        'overdue-charge',
        `اشتراك متأخر — شقة ${apartmentNo}`,
        `المتبقي ${remaining.toFixed(2)} ر.س عن ${charge.month}/${charge.year}.`,
        'charge',
        charge.id,
        chargeDue.toISOString().slice(0, 10)
      ))
    }
  }

  const maintenanceDays = config?.maintenanceAlertDays ?? 7
  for (const item of maintenance.filter(record => record.active !== false && !['مكتملة', 'ملغاة'].includes(record.status))) {
    const target = item.nextDate || item.dueDate
    const left = daysUntil(target)
    if (Number.isFinite(left) && left >= 0 && left <= maintenanceDays) {
      generated.push(makeAlert(
        'maintenance-due',
        `صيانة قادمة — ${item.title}`,
        left === 0 ? 'موعد الصيانة اليوم.' : `متبقي ${left} يوم على الموعد.`,
        'maintenance',
        item.id,
        target
      ))
    }
  }

  const contractDays = config?.contractAlertDays ?? 30
  for (const contract of contracts.filter(record => record.active !== false)) {
    const left = daysUntil(contract.endDate)
    const threshold = contract.alertDays || contractDays
    if (Number.isFinite(left) && left >= 0 && left <= threshold) {
      generated.push(makeAlert(
        'contract-expiry',
        `عقد يقترب من الانتهاء — ${contract.name}`,
        left === 0 ? 'ينتهي العقد اليوم.' : `متبقي ${left} يوم على انتهاء العقد.`,
        'maintenanceContract',
        contract.id,
        contract.endDate
      ))
    }
  }

  const lastBackup = config?.lastBackupAt ? new Date(config.lastBackupAt).getTime() : 0
  const backupAge = lastBackup ? Math.floor((Date.now() - lastBackup) / dayMs) : Number.POSITIVE_INFINITY
  if (!lastBackup || backupAge >= 14) {
    generated.push(makeAlert(
      'backup-warning',
      'النسخة الاحتياطية مطلوبة',
      lastBackup ? `مرّ ${backupAge} يوماً منذ آخر نسخة احتياطية.` : 'لم يتم تسجيل أي نسخة احتياطية حتى الآن.',
      'settings',
      'main'
    ))
  }

  for (const alert of generated) alert.read = previousRead.get(alert.id) ?? false

  await db.transaction('rw', db.alerts, async () => {
    await db.alerts.clear()
    if (generated.length) await db.alerts.bulkPut(generated)
  })

  return {
    alerts: generated.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')),
    unreadCount: generated.filter(alert => !alert.read).length,
    overdueCount: generated.filter(alert => alert.type === 'overdue-charge').length,
    maintenanceCount: generated.filter(alert => alert.type === 'maintenance-due').length,
    contractCount: generated.filter(alert => alert.type === 'contract-expiry').length,
    backupWarning: generated.some(alert => alert.type === 'backup-warning')
  }
}

export async function markAlertRead(id: string, read = true) {
  await db.alerts.update(id, { read, updatedAt: now() })
}

export async function requestLocalNotifications(alerts: Alert[]) {
  if (!('Notification' in window)) return false
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  if (permission !== 'granted') return false
  alerts.filter(alert => !alert.read).slice(0, 3).forEach(alert => {
    new Notification(alert.title, { body: alert.message, tag: alert.id })
  })
  return true
}
