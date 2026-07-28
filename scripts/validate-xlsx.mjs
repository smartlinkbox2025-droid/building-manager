import { createServer } from 'vite'
import JSZip from 'jszip'

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true }
})
try {
  const { createWorkbookBlob } = await server.ssrLoadModule('/src/services/export.ts')
  const blob = await createWorkbookBlob([
    { name: 'المصروفات', rows: Array.from({ length: 40 }, (_, index) => ({ التاريخ: `2026-07-${String(index % 28 + 1).padStart(2, '0')}`, البيان: `مصروف عربي ${index + 1}`, المبلغ: (index + 1) * 10 })) },
    { name: 'الملخص', rows: [{ البند: 'الرصيد الختامي', المبلغ: 8200.5 }] }
  ], 'اختبار_Excel', { buildingName: 'عمارة اختبار القبول', reportTitle: 'التقرير المالي', filters: 'يوليو 2026' })
  if (blob.type !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    throw new Error(`نوع MIME لملف XLSX غير صحيح: ${blob.type}`)
  }
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const required = ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']
  const missing = required.filter(file => !zip.file(file))
  if (missing.length) throw new Error(`ملفات XLSX ناقصة: ${missing.join(', ')}`)
  const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string')
  const workbook = await zip.file('xl/workbook.xml').async('string')
  const checks = {
    rtl: sheet.includes('rightToLeft="1"'),
    freeze: sheet.includes('state="frozen"'),
    filter: sheet.includes('<autoFilter'),
    arabic: sheet.includes('مصروف عربي 40') && workbook.includes('المصروفات'),
    numeric: sheet.includes('<v>400</v>')
  }
  if (Object.values(checks).some(value => !value)) throw new Error(`فشل تحقق XLSX: ${JSON.stringify(checks)}`)
  console.log(JSON.stringify({ sheets: 2, rows: 41, mime: blob.type, ...checks }))
} finally {
  await server.close()
}
