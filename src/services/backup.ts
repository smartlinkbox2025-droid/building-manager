import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { APP_VERSION, DATABASE_SCHEMA_VERSION, audit, db, ensureSettings, now } from '../db/database'
import type { Attachment } from '../types/models'

export const dataTableNames = [
  'apartments', 'residents', 'charges', 'chargeItems', 'extraCharges', 'payments', 'receipts',
  'incomes', 'expenses', 'maintenance', 'purchases', 'suppliers', 'maintenanceContracts',
  'alerts', 'receiptSequences', 'databaseInfo', 'settings', 'audit'
] as const

type TableName = (typeof dataTableNames)[number]
type BackupData = Record<TableName, unknown[]>
export type RestoreMode = 'replace' | 'merge'
export interface BackupPreview { fileName:string; appVersion:string; schemaVersion:number; createdAt:string; formatVersion:number; attachmentCount:number; counts:Record<string,number> }

async function readBackup(file: File) {
  const zip = await JSZip.loadAsync(file)
  const metadataFile = zip.file('metadata.json')
  const dataFile = zip.file('data.json')
  if (!metadataFile || !dataFile) throw new Error('ملف النسخة الاحتياطية غير صالح أو ناقص')
  const metadata = JSON.parse(await metadataFile.async('string')) as Record<string, unknown>
  const formatVersion = Number(metadata.formatVersion || 0)
  if (!formatVersion || formatVersion > 2) throw new Error('إصدار النسخة الاحتياطية غير مدعوم')
  const parsed = JSON.parse(await dataFile.async('string')) as Partial<BackupData> & { attachments?: Omit<Attachment, 'blob'>[] }
  if (!Array.isArray(parsed.settings) || !Array.isArray(parsed.apartments)) throw new Error('بنية بيانات النسخة الاحتياطية غير صحيحة')
  return { zip, metadata, parsed, formatVersion }
}

export async function inspectBackup(file: File): Promise<BackupPreview> {
  const { metadata, parsed, formatVersion } = await readBackup(file)
  const counts: Record<string, number> = {}
  for (const name of dataTableNames) counts[name] = Array.isArray(parsed[name]) ? parsed[name]!.length : 0
  counts.attachments = Array.isArray(parsed.attachments) ? parsed.attachments.length : 0
  return {
    fileName: file.name,
    appVersion: String(metadata.appVersion || 'غير معروف'),
    schemaVersion: Number(metadata.schemaVersion || 0),
    createdAt: String(metadata.createdAt || ''),
    formatVersion,
    attachmentCount: counts.attachments,
    counts
  }
}

export async function createBackup() {
  const zip = new JSZip()
  const createdAt = now()
  const data = {} as BackupData
  for (const tableName of dataTableNames) data[tableName] = await db.table(tableName).toArray()

  const attachments = await db.attachments.toArray()
  const attachmentMetadata = attachments.map(({ blob: _blob, ...metadata }) => metadata)
  for (const attachment of attachments) zip.file(`attachments/${attachment.id}`, attachment.blob)

  zip.file('data.json', JSON.stringify({ ...data, attachments: attachmentMetadata }, null, 2))
  zip.file('metadata.json', JSON.stringify({
    app: 'Building Manager PWA', appVersion: APP_VERSION, schemaVersion: DATABASE_SCHEMA_VERSION,
    createdAt, attachmentCount: attachments.length, formatVersion: 2
  }, null, 2))

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  const fileName = `building-backup-${createdAt.slice(0, 10)}.zip`
  saveAs(blob, fileName)
  await db.settings.update('main', { lastBackupAt: createdAt, lastBackupFileName: fileName, lastBackupSize: blob.size })
  await audit('backup', 'main', 'create', `إنشاء نسخة احتياطية كاملة: ${fileName}`, undefined, { createdAt, attachmentCount: attachments.length, size: blob.size })
  return { fileName, size: blob.size, createdAt }
}

export async function restoreBackup(file: File, mode: RestoreMode = 'replace') {
  const { zip, metadata, parsed } = await readBackup(file)
  const restoredAttachments: Attachment[] = []
  for (const item of parsed.attachments || []) {
    const attachmentFile = zip.file(`attachments/${item.id}`)
    if (!attachmentFile) throw new Error(`المرفق ${item.fileName} غير موجود داخل النسخة`)
    restoredAttachments.push({ ...item, blob: await attachmentFile.async('blob') })
  }

  const transactionTables = [...dataTableNames.map(name => db.table(name)), db.attachments]
  await db.transaction('rw', transactionTables, async () => {
    if (mode === 'replace') {
      for (const tableName of dataTableNames) await db.table(tableName).clear()
      await db.attachments.clear()
    }
    for (const tableName of dataTableNames) {
      const records = parsed[tableName]
      if (!Array.isArray(records) || !records.length) continue
      if (mode === 'merge') await db.table(tableName).bulkPut(records)
      else await db.table(tableName).bulkAdd(records)
    }
    if (restoredAttachments.length) await db.attachments.bulkPut(restoredAttachments)
  })

  await ensureSettings()
  await audit('backup', 'main', 'restore', mode === 'merge' ? 'دمج نسخة احتياطية' : 'استعادة نسخة احتياطية واستبدال البيانات', undefined, {
    fileName: file.name, restoredAt: now(), schemaVersion: metadata.schemaVersion, mode
  })
}

export async function deleteAllApplicationData() {
  const settings = await db.settings.get('main')
  await audit('system', 'all-data', 'delete-all-request', 'طلب حذف جميع بيانات التطبيق', undefined, { requestedAt: now() })
  const tables = [...dataTableNames.map(name => db.table(name)), db.attachments]
  await db.transaction('rw', tables, async () => {
    for (const name of dataTableNames) await db.table(name).clear()
    await db.attachments.clear()
  })
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map(key => caches.delete(key)))
  }
  localStorage.clear()
  sessionStorage.clear()
  await ensureSettings()
  if (settings) await db.settings.update('main', { buildingName: settings.buildingName })
}
