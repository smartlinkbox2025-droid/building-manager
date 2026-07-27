import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { db } from '../db/database'

export async function createBackup(){
  const zip = new JSZip()
  const data = {
    version: 1,
    createdAt: new Date().toISOString(),
    apartments: await db.apartments.toArray(), residents: await db.residents.toArray(), charges: await db.charges.toArray(),
    payments: await db.payments.toArray(), incomes: await db.incomes.toArray(), expenses: await db.expenses.toArray(),
    maintenance: await db.maintenance.toArray(), settings: await db.settings.toArray(), audit: await db.audit.toArray()
  }
  zip.file('data.json', JSON.stringify(data, null, 2))
  zip.file('metadata.json', JSON.stringify({ app:'Building Manager PWA', version:'1.0.0', createdAt:data.createdAt }, null, 2))
  const blob = await zip.generateAsync({type:'blob'})
  saveAs(blob, `building-backup-${new Date().toISOString().slice(0,10)}.zip`)
  await db.settings.update('main', { lastBackupAt: new Date().toISOString() })
}

export async function restoreBackup(file: File){
  const zip = await JSZip.loadAsync(file)
  const f = zip.file('data.json'); if(!f) throw new Error('ملف النسخة الاحتياطية غير صالح')
  const data = JSON.parse(await f.async('string'))
  await db.transaction('rw', [db.apartments,db.residents,db.charges,db.payments,db.incomes,db.expenses,db.maintenance,db.settings,db.audit], async()=>{
    await Promise.all([db.apartments.clear(),db.residents.clear(),db.charges.clear(),db.payments.clear(),db.incomes.clear(),db.expenses.clear(),db.maintenance.clear(),db.settings.clear(),db.audit.clear()])
    await db.apartments.bulkPut(data.apartments||[]); await db.residents.bulkPut(data.residents||[]); await db.charges.bulkPut(data.charges||[])
    await db.payments.bulkPut(data.payments||[]); await db.incomes.bulkPut(data.incomes||[]); await db.expenses.bulkPut(data.expenses||[])
    await db.maintenance.bulkPut(data.maintenance||[]); await db.settings.bulkPut(data.settings||[]); await db.audit.bulkPut(data.audit||[])
  })
}
