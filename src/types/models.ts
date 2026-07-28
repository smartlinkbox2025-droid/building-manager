export type ID = string
export type EntityStatus = 'active' | 'inactive' | 'cancelled' | 'archived'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'cancelled'

export interface BaseEntity {
  id: ID
  createdAt: string
  updatedAt: string
  active: boolean
  status?: string
  deletedAt?: string
  deletedReason?: string
}

export interface Apartment extends BaseEntity {
  number: string
  floor: string
  type: string
  occupancyStatus?: string
  ownerName: string
  residentName: string
  phone: string
  monthlyFee: number
  dueStartDate?: string
  notes: string
}

export interface Resident extends BaseEntity {
  name: string
  relation: string
  apartmentId: ID
  phone: string
  countryCode?: string
  email: string
  startDate: string
  endDate: string
  notes: string
}

export interface Charge extends BaseEntity {
  apartmentId: ID
  residentId?: ID
  year: number
  month: number
  baseAmount: number
  extras: number
  extraReason: string
  status: string
  cancelledReason?: string
}

export interface ChargeItem extends BaseEntity {
  chargeId: ID
  title: string
  description: string
  amount: number
  required: boolean
  cancelled: boolean
  cancellationReason?: string
}

export interface ExtraCharge extends BaseEntity {
  chargeId?: ID
  apartmentId: ID
  year: number
  month: number
  title: string
  description: string
  amount: number
  required: boolean
  notes: string
  cancelled: boolean
  cancellationReason?: string
}

export interface Payment extends BaseEntity {
  chargeId: ID
  apartmentId: ID
  amount: number
  date: string
  method: string
  receiptNo: string
  reference: string
  notes: string
  cancelled: boolean
  cancellationReason?: string
  attachmentId?: ID
}

export interface Receipt extends BaseEntity {
  paymentId: ID
  chargeId: ID
  apartmentId: ID
  receiptNo: string
  issuedAt: string
  snapshot: Record<string, unknown>
}

export interface Income extends BaseEntity {
  category: string
  description: string
  amount: number
  date: string
  method: string
  payer: string
  reference?: string
  notes: string
  cancelled: boolean
  cancellationReason?: string
  attachmentId?: ID
}

export interface Expense extends BaseEntity {
  category: string
  description: string
  amount: number
  date: string
  beneficiary: string
  supplierId?: ID
  method: string
  invoiceNo: string
  paymentStatus?: string
  costCenter?: string
  notes: string
  cancelled: boolean
  cancellationReason?: string
  attachmentIds?: ID[]
}

export interface Maintenance extends BaseEntity {
  title: string
  item?: string
  category: string
  description: string
  priority: string
  reportDate: string
  dueDate: string
  completedDate: string
  contractor: string
  expectedCost: number
  actualCost: number
  status: string
  recurring: boolean
  recurrence?: string
  nextDate: string
  notes: string
}

export interface Purchase extends BaseEntity {
  item: string
  category: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
  supplierId?: ID
  date: string
  invoiceNo: string
  paymentMethod: string
  taxAmount: number
  notes: string
  cancelled: boolean
}

export interface Supplier extends BaseEntity {
  name: string
  type: string
  phone: string
  email: string
  taxNumber?: string
  address?: string
  notes: string
}

export interface MaintenanceContract extends BaseEntity {
  name: string
  serviceType: string
  supplierId?: ID
  contractorName: string
  contractNo: string
  startDate: string
  endDate: string
  amount: number
  paymentTerms: string
  paymentFrequency: string
  responsiblePerson: string
  phone: string
  alertDays: number
  notes: string
}

export interface Attachment extends BaseEntity {
  entityType: string
  entityId: ID
  fileName: string
  mimeType: string
  sizeBefore?: number
  sizeAfter: number
  blob: Blob
  category?: string
}

export interface Alert extends BaseEntity {
  type: string
  title: string
  message: string
  dueDate?: string
  entityType?: string
  entityId?: ID
  read: boolean
}

export interface ReceiptSequence {
  id: string
  year: number
  apartmentNumber: string
  prefix: string
  lastSequence: number
  updatedAt: string
}

export interface DatabaseInfo {
  id: 'main'
  schemaVersion: number
  appVersion: string
  updatedAt: string
}

export interface AppSettings {
  id: 'main'
  buildingName: string
  address: string
  phone: string
  email?: string
  currency: string
  currencySymbol: string
  decimalPlaces?: number
  openingBalance: number
  openingBalanceDate?: string
  defaultMonthlyFee: number
  receiptPrefix: string
  whatsappTemplate: string
  whatsappReportTemplate?: string
  senderName?: string
  countryCode: string
  paymentMethods?: string[]
  incomeCategories?: string[]
  expenseCategories?: string[]
  maintenanceCategories?: string[]
  maxAttachmentSizeMb?: number
  imageQuality?: number
  imageMaxDimension?: number
  allowedFileTypes?: string[]
  maintenanceAlertDays?: number
  contractAlertDays?: number
  monthlyDueDay?: number
  overdueAlertDays?: number
  lastBackupAt: string
  lastBackupFileName?: string
  lastBackupSize?: number
}

export interface AuditLog {
  id: ID
  entity: string
  entityId: ID
  action: string
  description: string
  oldValue?: unknown
  newValue?: unknown
  reason?: string
  userName?: string
  sessionId?: string
  appVersion?: string
  createdAt: string
}
