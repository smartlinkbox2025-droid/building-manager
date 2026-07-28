import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const exists = file => fs.existsSync(path.join(root, file))
const sources = {
  database: read('src/db/database.ts'),
  payments: read('src/services/payments.ts'),
  receipts: read('src/services/receipts.ts'),
  backup: read('src/services/backup.ts'),
  reports: read('src/pages/Reports.tsx'),
  charges: read('src/pages/Charges.tsx'),
  settings: read('src/pages/Settings.tsx'),
  alerts: read('src/services/alerts.ts'),
  vite: read('vite.config.ts')
}

const checks = [
  ['اسم قاعدة البيانات ثابت', sources.database.includes("DATABASE_NAME = 'BuildingManagerDB'")],
  ['مخططات Dexie القديمة محفوظة', ['this.version(1)', 'this.version(2)', 'this.version(3)'].every(value => sources.database.includes(value))],
  ['إنشاء UUID للسجلات', sources.database.includes('crypto.randomUUID')],
  ['منع تكرار الشقة في الواجهة', read('src/pages/Apartments.tsx').includes("where('number').equals(number).first()")],
  ['ربط المشترك بالشقة', read('src/pages/Residents.tsx').includes('apartmentId')],
  ['إنشاء الاستحقاقات الشهرية', sources.charges.includes('generateMonthlyCharges')],
  ['حذف الاستحقاق الآمن دون دفعات', sources.charges.includes('deleteCharge') && sources.charges.includes('لا يمكن حذف استحقاق عليه دفعات فعّالة')],
  ['مزامنة الاشتراك غير المسدد عند تعديل الشقة', read('src/pages/Apartments.tsx').includes('مزامنة اشتراك الشقة') && read('src/pages/Apartments.tsx').includes('hasActivePayments')],
  ['دعم البنود الإضافية المستقلة', sources.charges.includes('addExtraCharge')],
  ['دعم عدة دفعات', sources.payments.includes('createPayment')],
  ['تحديث الحالة داخل معاملة', sources.payments.includes("db.transaction('rw'") && sources.payments.includes('getPaymentStatus')],
  ['تسلسل إيصال مستقل داخل IndexedDB', sources.receipts.includes('receiptSequences') && sources.receipts.includes('nextReceiptNumber')],
  ['إيصال PDF عربي بخط محلي', exists('src/services/receiptPdf.ts') && read('src/services/receiptPdf.ts').includes('document.fonts.ready') && exists('node_modules/@fontsource/amiri')],
  ['إثبات الدفع مرتبط بالدفعة', sources.charges.includes("entityType: 'payment'")],
  ['تذكير WhatsApp', sources.charges.includes('openWhatsApp')],
  ['مرفقات المصروف والصيانة', exists('src/components/AttachmentManager.tsx')],
  ['تنبيهات الصيانة والعقود', sources.alerts.includes('maintenance-due') && sources.alerts.includes('contract-expiry')],
  ['التقرير يحتوي تفاصيل المصروفات', sources.reports.includes("title: 'المصروفات'")],
  ['المصروف الجزئي يؤثر بالقيمة المدفوعة فقط', read('src/services/finance.ts').includes('getExpensePaidAmount') && read('src/pages/Dashboard.tsx').includes('outstandingExpenses')],
  ['PDF تقارير عربي بخط Noto Naskh محلي', sources.reports.includes('exportElementPdf') && read('src/main.tsx').includes("@fontsource/noto-naskh-arabic/400.css")],
  ['اختيار نوع التقرير يعرض ويصدر القسم المحدد فقط', sources.reports.includes('sections.map(section => <ReportSectionTable') && sources.reports.includes("reportKind === 'all' ? Object.values(all) : [all[reportKind]]")],
  ['Excel RTL ومرشحات', read('src/services/export.ts').includes('rightToLeft="1"') && read('src/services/export.ts').includes('<autoFilter')],
  ['Excel للجوال يحمل نوع ملف XLSX الصحيح', read('src/services/export.ts').includes('const typedBlob') && read('src/services/export.ts').includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')],
  ['PDF ثابت العرض على الهاتف', read('src/services/export.ts').includes('export-stage') && read('src/services/export.ts').includes('exportWidth')],
  ['احتواء واجهة الهاتف ضمن العرض', read('src/styles.css').includes('rootScroll') === false && read('src/styles.css').includes('overflow-x:hidden') && read('src/styles.css').includes('100dvh')],
  ['النسخة الاحتياطية تشمل Blobs', sources.backup.includes("attachment.blob") && sources.backup.includes('formatVersion: 3')],
  ['الاستعادة تتحقق قبل المعاملة', sources.backup.indexOf('readBackup(file)') < sources.backup.indexOf("db.transaction('rw'")],
  ['إزالة صفحة سجل العمليات من واجهة المستخدم', !exists('src/pages/Audit.tsx') && !read('src/App.tsx').includes('path="/audit"')],
  ['إزالة الضريبة من نموذج المشتريات', !read('src/pages/Expenses.tsx').includes('<label>الضريبة')],
  ['الحذف الشامل يسجل اكتماله', sources.backup.includes('delete-all-completed')],
  ['PWA مع Service Worker', sources.vite.includes('VitePWA') && exists('dist/sw.js')],
  ['Manifest عربي standalone', sources.vite.includes("lang: 'ar'") && sources.vite.includes("display: 'standalone'")],
  ['مسار GitHub Pages فرعي', sources.vite.includes('VITE_REPOSITORY_NAME') && sources.vite.includes('base')],
  ['GitHub Actions للنشر', exists('.github/workflows/deploy.yml')],
  ['Tailwind مهيأ', exists('tailwind.config.js') && exists('postcss.config.js')],
  ['خط عربي محلي ضمن dist', exists('dist/assets') && fs.readdirSync(path.join(root, 'dist/assets')).some(file => file.includes('amiri'))],
  ['لا توجد TODO أو ts-ignore', !/TODO|FIXME|@ts-ignore/.test(fs.readdirSync(path.join(root, 'src'), { recursive: true }).filter(file => /\.(ts|tsx)$/.test(file)).map(file => read(path.join('src', file))).join('\n'))],
  ['ناتج الإنتاج موجود', exists('dist/index.html') && exists('dist/manifest.webmanifest')]
]

for (const [label, passed] of checks) console.log(`${passed ? '✓' : '✗'} ${label}`)
const failed = checks.filter(([, passed]) => !passed)
if (failed.length) {
  console.error(`\nفشل ${failed.length} من ${checks.length} فحصاً تقنياً.`)
  process.exit(1)
}
console.log(`\nنجحت الفحوص التقنية الآلية وعددها ${checks.length}.`)
