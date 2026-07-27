import Dexie, { type Table } from 'dexie'
import type { Apartment, Resident, Charge, Payment, Expense, Income, Maintenance, AppSettings, AuditLog } from '../types/models'

export class BuildingDB extends Dexie {
  apartments!: Table<Apartment, string>
  residents!: Table<Resident, string>
  charges!: Table<Charge, string>
  payments!: Table<Payment, string>
  incomes!: Table<Income, string>
  expenses!: Table<Expense, string>
  maintenance!: Table<Maintenance, string>
  settings!: Table<AppSettings, string>
  audit!: Table<AuditLog, string>

  constructor() {
    super('BuildingManagerDB')
    this.version(1).stores({
      apartments: 'id, &number, floor, active',
      residents: 'id, apartmentId, name, active',
      charges: 'id, apartmentId, [year+month], status, active',
      payments: 'id, chargeId, apartmentId, date, receiptNo, cancelled, active',
      incomes: 'id, date, category, cancelled, active',
      expenses: 'id, date, category, cancelled, active',
      maintenance: 'id, status, dueDate, nextDate, active',
      settings: 'id',
      audit: 'id, entity, entityId, action, createdAt'
    })
  }
}
export const db = new BuildingDB()
export const uid = () => crypto.randomUUID()
export const now = () => new Date().toISOString()
export async function ensureSettings() {
  const s = await db.settings.get('main')
  if (!s) await db.settings.put({
    id: 'main', buildingName: 'عمارة سكنية', address: '', phone: '', currency: 'SAR', currencySymbol: 'ر.س',
    openingBalance: 0, defaultMonthlyFee: 100, receiptPrefix: 'INV', countryCode: '+966', lastBackupAt: '',
    whatsappTemplate: 'السلام عليكم، نود تذكيركم بأن المبلغ المتبقي لاشتراك الشقة رقم [الشقة] عن شهر [الشهر] هو [المتبقي] ر.س. شاكرين تعاونكم.'
  })
}
export async function audit(entity:string, entityId:string, action:string, description:string, oldValue?:unknown, newValue?:unknown){
  await db.audit.add({ id: uid(), entity, entityId, action, description, oldValue, newValue, createdAt: now() })
}
