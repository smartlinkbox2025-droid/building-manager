export type ID = string
export interface BaseEntity { id: ID; createdAt: string; updatedAt: string; active: boolean }
export interface Apartment extends BaseEntity { number: string; floor: string; type: string; ownerName: string; residentName: string; phone: string; monthlyFee: number; notes: string }
export interface Resident extends BaseEntity { name: string; relation: string; apartmentId: ID; phone: string; email: string; startDate: string; endDate: string; notes: string }
export interface Charge extends BaseEntity { apartmentId: ID; year: number; month: number; baseAmount: number; extras: number; extraReason: string; status: string }
export interface Payment extends BaseEntity { chargeId: ID; apartmentId: ID; amount: number; date: string; method: string; receiptNo: string; reference: string; notes: string; cancelled: boolean }
export interface Income extends BaseEntity { category: string; description: string; amount: number; date: string; method: string; payer: string; notes: string; cancelled: boolean }
export interface Expense extends BaseEntity { category: string; description: string; amount: number; date: string; beneficiary: string; method: string; invoiceNo: string; notes: string; cancelled: boolean }
export interface Maintenance extends BaseEntity { title: string; category: string; description: string; priority: string; reportDate: string; dueDate: string; completedDate: string; contractor: string; expectedCost: number; actualCost: number; status: string; recurring: boolean; nextDate: string; notes: string }
export interface AppSettings { id: 'main'; buildingName: string; address: string; phone: string; currency: string; currencySymbol: string; openingBalance: number; defaultMonthlyFee: number; receiptPrefix: string; whatsappTemplate: string; countryCode: string; lastBackupAt: string }
export interface AuditLog { id: ID; entity: string; entityId: ID; action: string; description: string; oldValue?: unknown; newValue?: unknown; createdAt: string }
