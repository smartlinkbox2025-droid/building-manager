import Dexie, { type Table } from 'dexie'
import type {
  Alert,
  Apartment,
  AppSettings,
  Attachment,
  AuditLog,
  Charge,
  ChargeItem,
  DatabaseInfo,
  Expense,
  ExtraCharge,
  Income,
  Maintenance,
  MaintenanceContract,
  Payment,
  Purchase,
  Receipt,
  ReceiptSequence,
  Resident,
  Supplier
} from '../types/models'

export const DATABASE_NAME = 'BuildingManagerDB'
export const DATABASE_SCHEMA_VERSION = 3
export const APP_VERSION = '2.8.0'

export class BuildingDB extends Dexie {
  apartments!: Table<Apartment, string>
  residents!: Table<Resident, string>
  charges!: Table<Charge, string>
  chargeItems!: Table<ChargeItem, string>
  extraCharges!: Table<ExtraCharge, string>
  payments!: Table<Payment, string>
  receipts!: Table<Receipt, string>
  incomes!: Table<Income, string>
  expenses!: Table<Expense, string>
  maintenance!: Table<Maintenance, string>
  purchases!: Table<Purchase, string>
  suppliers!: Table<Supplier, string>
  maintenanceContracts!: Table<MaintenanceContract, string>
  attachments!: Table<Attachment, string>
  alerts!: Table<Alert, string>
  receiptSequences!: Table<ReceiptSequence, string>
  databaseInfo!: Table<DatabaseInfo, string>
  settings!: Table<AppSettings, string>
  audit!: Table<AuditLog, string>

  constructor() {
    super(DATABASE_NAME)

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

    this.version(2).stores({
      apartments: 'id, &number, floor, active, status',
      residents: 'id, apartmentId, name, phone, active, status',
      charges: 'id, apartmentId, [apartmentId+year+month], [year+month], status, active',
      chargeItems: 'id, chargeId, active, cancelled',
      extraCharges: 'id, chargeId, apartmentId, [apartmentId+year+month], active, cancelled',
      payments: 'id, chargeId, apartmentId, date, &receiptNo, cancelled, active',
      receipts: 'id, paymentId, chargeId, apartmentId, &receiptNo, issuedAt',
      incomes: 'id, date, category, cancelled, active',
      expenses: 'id, date, category, supplierId, cancelled, active',
      maintenance: 'id, status, dueDate, nextDate, active',
      purchases: 'id, date, category, supplierId, cancelled, active',
      suppliers: 'id, name, type, active',
      maintenanceContracts: 'id, contractNo, supplierId, endDate, active',
      attachments: 'id, entityType, entityId, [entityType+entityId], createdAt, active',
      alerts: 'id, type, dueDate, read, entityType, entityId, active',
      receiptSequences: 'id, year, apartmentNumber, prefix',
      databaseInfo: 'id',
      settings: 'id',
      audit: 'id, entity, entityId, action, createdAt'
    }).upgrade(async transaction => {
      const timestamp = now()
      await transaction.table('apartments').toCollection().modify(item => {
        item.status ??= item.active === false ? 'inactive' : 'active'
        item.updatedAt ||= timestamp
      })
      await transaction.table('residents').toCollection().modify(item => {
        item.status ??= item.active === false ? 'inactive' : 'active'
        item.countryCode ??= '+966'
        item.updatedAt ||= timestamp
      })
      await transaction.table('settings').toCollection().modify(item => {
        item.decimalPlaces ??= 2
        item.paymentMethods ??= ['نقداً', 'تحويل بنكي', 'إيداع', 'شبكة', 'أخرى']
        item.incomeCategories ??= ['تبرعات', 'تأجير مرافق', 'تعويض', 'إيرادات متنوعة']
        item.expenseCategories ??= ['راتب الحارس', 'كهرباء', 'ماء', 'نظافة', 'صيانة عامة', 'رسوم حكومية', 'أخرى']
        item.maintenanceCategories ??= ['مصاعد', 'مضخات', 'كهرباء', 'سباكة', 'نظافة', 'صيانة عامة']
        item.maxAttachmentSizeMb ??= 10
        item.imageQuality ??= 0.8
        item.imageMaxDimension ??= 1600
        item.maintenanceAlertDays ??= 7
        item.contractAlertDays ??= 30
        item.monthlyDueDay ??= 1
        item.overdueAlertDays ??= 5
      })
    })

    this.version(3).stores({
      apartments: 'id, &number, floor, active, status',
      residents: 'id, apartmentId, name, phone, active, status',
      charges: 'id, apartmentId, [apartmentId+year+month], [year+month], status, active',
      chargeItems: 'id, chargeId, active, cancelled',
      extraCharges: 'id, chargeId, apartmentId, [apartmentId+year+month], active, cancelled',
      payments: 'id, chargeId, apartmentId, date, &receiptNo, cancelled, active',
      receipts: 'id, paymentId, chargeId, apartmentId, &receiptNo, issuedAt',
      incomes: 'id, date, category, cancelled, active',
      expenses: 'id, date, category, supplierId, cancelled, active',
      maintenance: 'id, status, dueDate, nextDate, active',
      purchases: 'id, date, category, supplierId, cancelled, active',
      suppliers: 'id, name, type, active',
      maintenanceContracts: 'id, contractNo, supplierId, endDate, active',
      attachments: 'id, entityType, entityId, [entityType+entityId], createdAt, active',
      alerts: 'id, type, dueDate, read, entityType, entityId, active',
      receiptSequences: 'id, year, apartmentNumber, prefix',
      databaseInfo: 'id',
      settings: 'id',
      audit: 'id, entity, entityId, action, createdAt'
    }).upgrade(async transaction => {
      await transaction.table('settings').toCollection().modify(item => {
        item.buildingNotes ??= ''
        item.openingBalanceDate ??= new Date().toISOString().slice(0, 10)
        item.decimalPlaces ??= 2
        item.allowedFileTypes ??= ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
      })
    })
  }
}

export const db = new BuildingDB()
export const uid = () => crypto.randomUUID()
export const now = () => new Date().toISOString()

export async function ensureSettings() {
  const existing = await db.settings.get('main')
  if (!existing) {
    await db.settings.put({
      id: 'main',
      buildingName: 'عمارة سكنية',
      address: '',
      phone: '',
      email: '',
      buildingNotes: '',
      currency: 'SAR',
      currencySymbol: 'ر.س',
      decimalPlaces: 2,
      openingBalance: 0,
      openingBalanceDate: new Date().toISOString().slice(0, 10),
      defaultMonthlyFee: 100,
      receiptPrefix: 'INV',
      countryCode: '+966',
      lastBackupAt: '',
      paymentMethods: ['نقداً', 'تحويل بنكي', 'إيداع', 'شبكة', 'أخرى'],
      incomeCategories: ['تبرعات', 'تأجير مرافق', 'تعويض', 'إيرادات متنوعة'],
      expenseCategories: ['راتب الحارس', 'كهرباء', 'ماء', 'نظافة', 'صيانة عامة', 'رسوم حكومية', 'أخرى'],
      maintenanceCategories: ['مصاعد', 'مضخات', 'كهرباء', 'سباكة', 'نظافة', 'صيانة عامة'],
      maxAttachmentSizeMb: 10,
      imageQuality: 0.8,
      imageMaxDimension: 1600,
      allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      maintenanceAlertDays: 7,
      contractAlertDays: 30,
      monthlyDueDay: 1,
      overdueAlertDays: 5,
      whatsappTemplate: 'السلام عليكم ورحمة الله وبركاته، الأستاذ/ [الاسم] المحترم، نود تذكيركم بأن المبلغ المتبقي لاشتراك الشقة رقم [الشقة] عن شهر [الشهر] [السنة] هو [المتبقي] ر.س. شاكرين لكم حسن تعاونكم. إدارة [العمارة]',
      whatsappReportTemplate: '[العمارة]\nالفترة: [الفترة]\nالإيرادات: [الإيرادات]\nالمصروفات: [المصروفات]\nالمتأخرات: [المتأخرات]\nالرصيد: [الرصيد]\nتاريخ التقرير: [التاريخ]',
      senderName: 'إدارة العمارة'
    })
  }

  await db.databaseInfo.put({
    id: 'main',
    schemaVersion: DATABASE_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    updatedAt: now()
  })
}

export async function audit(
  entity: string,
  entityId: string,
  action: string,
  description: string,
  oldValue?: unknown,
  newValue?: unknown,
  reason?: string
) {
  await db.audit.add({
    id: uid(),
    entity,
    entityId,
    action,
    description,
    oldValue,
    newValue,
    reason,
    appVersion: APP_VERSION,
    createdAt: now()
  })
}
