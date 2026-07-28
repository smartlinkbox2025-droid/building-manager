import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const exists = file => fs.existsSync(path.join(root, file))
const failures = []
const checks = []
const check = (condition, message) => {
  checks.push({ condition, message })
  if (!condition) failures.push(message)
}

const packageJson = JSON.parse(read('package.json'))
const database = read('src/db/database.ts')
const app = read('src/App.tsx')
const vite = read('vite.config.ts')

check(packageJson.version === '2.8.0', 'تطابق إصدار package.json مع إصدار التقارير والتصدير 2.8.0')
check(!Object.values({ ...packageJson.dependencies, ...packageJson.devDependencies }).includes('latest'), 'عدم استخدام latest في الحزم')
check(database.includes("DATABASE_NAME = 'BuildingManagerDB'"), 'الحفاظ على اسم قاعدة البيانات')
check(database.includes("APP_VERSION = '2.8.0'"), 'تطابق إصدار قاعدة البيانات مع إصدار التطبيق')
check(database.includes('this.version(1)') && database.includes('this.version(2)') && database.includes('this.version(3)'), 'الحفاظ على مخططات Dexie السابقة وإضافة مسار ترقية غير هدام')

const requiredTables = ['apartments','residents','charges','chargeItems','extraCharges','payments','receipts','incomes','expenses','maintenance','purchases','suppliers','maintenanceContracts','attachments','alerts','receiptSequences','databaseInfo','settings','audit']
for (const table of requiredTables) check(database.includes(`${table}:`), `وجود جدول IndexedDB: ${table}`)

const requiredRoutes = ['/apartments','/residents','/charges','/expenses','/maintenance','/reports','/settings']
for (const route of requiredRoutes) check(app.includes(`path="${route}"`), `وجود مسار الصفحة: ${route}`)

check(vite.includes('VitePWA'), 'تفعيل vite-plugin-pwa')
check(vite.includes("display: 'standalone'"), 'ضبط PWA بوضع standalone')
check(vite.includes("lang: 'ar'") && vite.includes("dir: 'rtl'"), 'ضبط اللغة العربية واتجاه RTL في Manifest')
check(exists('.github/workflows/deploy.yml'), 'وجود GitHub Actions للنشر')
check(exists('public/icons/icon-192.png') && exists('public/icons/icon-512.png'), 'وجود أيقونات PWA الأساسية')
check(exists('README.md') && exists('docs/04_ACCEPTANCE_TESTS.md'), 'وجود التوثيق واختبارات القبول')

const sourceFiles = fs.readdirSync(path.join(root, 'src'), { recursive: true })
  .filter(file => typeof file === 'string' && /\.(ts|tsx)$/.test(file))
  .map(file => path.join('src', file))
const sourceText = sourceFiles.map(read).join('\n')
check(!/TODO|FIXME|@ts-ignore/.test(sourceText), 'عدم وجود TODO أو FIXME أو @ts-ignore في المصدر')
check(exists('src/services/backup.ts') && exists('src/services/reports.ts') && exists('src/services/alerts.ts') && exists('src/services/share.ts'), 'وجود خدمات النسخ الاحتياطي والتقارير والتنبيهات والمشاركة')
check(exists('docs/15_PHASE_10_ENTERPRISE_FINAL_QA.md'), 'وجود توثيق مرحلة Enterprise Final QA')

for (const result of checks) console.log(`${result.condition ? '✓' : '✗'} ${result.message}`)
if (failures.length) {
  console.error(`\nفشل التحقق في ${failures.length} بند/بنود.`)
  process.exit(1)
}
console.log(`\nنجح التحقق البنيوي في ${checks.length} بنداً.`)
