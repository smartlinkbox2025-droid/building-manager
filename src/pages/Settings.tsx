import { useEffect, useRef, useState } from 'react'
import { audit, db, ensureSettings } from '../db/database'
import type { AppSettings, Attachment } from '../types/models'
import { PageHeader } from '../components/Common'
import { createBackup, deleteAllApplicationData, inspectBackup, restoreBackup, type BackupPreview, type RestoreMode } from '../services/backup'
import { deleteAttachment, saveAttachment } from '../services/attachments'
import { SETTINGS_UPDATED_EVENT } from '../contexts/CurrencyContext'

function bytes(value?: number) {
  if (!value) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(2)} MB`
}

function list(value?: string[]) {
  return (value || []).join('، ')
}

function parseList(value: string) {
  return [...new Set(value.split(/[،,]/).map(item => item.trim()).filter(Boolean))]
}

function AssetField({ label, attachmentId, category, onChange, disabled }: {
  label: string
  attachmentId?: string
  category: 'building-logo' | 'building-image'
  onChange: (id?: string) => void
  disabled: boolean
}) {
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let url = ''
    if (!attachmentId) {
      setAttachment(null)
      setPreview('')
      return
    }
    void db.attachments.get(attachmentId).then(item => {
      if (!item || item.active === false) return
      setAttachment(item)
      url = URL.createObjectURL(item.blob)
      setPreview(url)
    })
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [attachmentId])

  async function upload(file?: File) {
    if (!file) return
    setBusy(true)
    try {
      const saved = await saveAttachment({ entityType: 'building-settings', entityId: 'main', file, category })
      if (attachmentId) await deleteAttachment(attachmentId, 'استبدال أصل هوية العمارة')
      onChange(saved.id)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر رفع الملف')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!attachmentId || !confirm(`إزالة ${label}؟`)) return
    setBusy(true)
    try {
      await deleteAttachment(attachmentId, `إزالة ${label} من الإعدادات`)
      onChange(undefined)
    } finally {
      setBusy(false)
    }
  }

  return <div className="asset-field">
    <strong>{label}</strong>
    {preview ? <img src={preview} alt={label} /> : <div className="asset-placeholder">لا يوجد ملف</div>}
    {attachment && <small>{attachment.fileName} — {bytes(attachment.sizeAfter)}</small>}
    <div className="actions">
      <label className="file-button">{attachmentId ? 'استبدال' : 'اختيار ملف'}<input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy} onChange={event => void upload(event.target.files?.[0])} /></label>
      {attachmentId && <button type="button" className="danger" disabled={disabled || busy} onClick={() => void remove()}>إزالة</button>}
    </div>
  </div>
}

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('replace')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void ensureSettings().then(() => db.settings.get('main').then(item => setSettings(item || null)))
  }, [])

  if (!settings) return <div className="panel loading-state">جاري تحميل الإعدادات...</div>

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setSettings(current => current ? { ...current, [key]: value } : current)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const nextSettings = settings
    if (!nextSettings?.buildingName.trim()) return alert('اسم العمارة مطلوب')
    if (!Number.isInteger(nextSettings.decimalPlaces) || (nextSettings.decimalPlaces ?? 0) < 0 || (nextSettings.decimalPlaces ?? 0) > 4) return alert('المنازل العشرية يجب أن تكون بين 0 و4')
    setBusy(true)
    try {
      const old = await db.settings.get('main')
      await db.transaction('rw', db.settings, db.audit, async () => {
        await db.settings.put(nextSettings)
        await audit('settings', 'main', 'update', 'تحديث إعدادات وهوية العمارة', old, nextSettings)
      })
      window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT))
      alert('تم حفظ الإعدادات')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر حفظ الإعدادات')
    } finally {
      setBusy(false)
    }
  }

  async function chooseBackup(file?: File) {
    if (!file) return
    try {
      setBusy(true)
      const info = await inspectBackup(file)
      setRestoreFile(file)
      setPreview(info)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'ملف النسخة غير صالح')
      setRestoreFile(null)
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  async function runRestore() {
    if (!restoreFile || !preview) return
    const warning = restoreMode === 'replace' ? 'سيتم استبدال جميع البيانات الحالية بعد التحقق من النسخة.' : 'سيتم دمج السجلات ومنع التكرار حسب المعرفات.'
    if (!confirm(`${warning}\nهل تريد المتابعة؟`)) return
    try {
      setBusy(true)
      await restoreBackup(restoreFile, restoreMode)
      alert('تمت الاستعادة بنجاح')
      location.reload()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذرت الاستعادة')
    } finally {
      setBusy(false)
    }
  }

  async function clearAll() {
    if (!confirm('سيتم حذف جميع السجلات والمرفقات والإعدادات والكاش. يُنصح بإنشاء نسخة احتياطية أولاً.')) return
    const text = prompt('اكتب العبارة التالية تماماً:\nحذف جميع البيانات')
    if (text !== 'حذف جميع البيانات') return alert('لم تتطابق عبارة التأكيد، ولم يتم الحذف.')
    if (!confirm('تأكيد نهائي: لا يمكن التراجع عن الحذف دون نسخة احتياطية.')) return
    try {
      setBusy(true)
      await deleteAllApplicationData()
      alert('تم حذف جميع البيانات وإعادة تهيئة التطبيق')
      location.reload()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر حذف البيانات')
    } finally {
      setBusy(false)
    }
  }

  return <><PageHeader title="الإعدادات" />
    <form className="settings-sections" onSubmit={save}>
      <section className="panel">
        <h2>هوية العمارة</h2>
        <div className="form-grid">
          <label>اسم العمارة<input required value={settings.buildingName} onChange={event => update('buildingName', event.target.value)} /></label>
          <label>رقم التواصل<input value={settings.phone} onChange={event => update('phone', event.target.value)} /></label>
          <label className="full">العنوان<input value={settings.address} onChange={event => update('address', event.target.value)} /></label>
          <label>البريد الإلكتروني<input type="email" value={settings.email || ''} onChange={event => update('email', event.target.value)} /></label>
          <label className="full">ملاحظات<textarea value={settings.buildingNotes || ''} onChange={event => update('buildingNotes', event.target.value)} /></label>
        </div>
        <div className="asset-grid">
          <AssetField label="شعار العمارة" category="building-logo" attachmentId={settings.logoAttachmentId} disabled={busy} onChange={id => update('logoAttachmentId', id)} />
          <AssetField label="صورة العمارة" category="building-image" attachmentId={settings.buildingImageAttachmentId} disabled={busy} onChange={id => update('buildingImageAttachmentId', id)} />
        </div>
      </section>

      <section className="panel">
        <h2>الإعدادات المالية</h2>
        <div className="form-grid">
          <label>رمز ISO للعملة<input value={settings.currency} onChange={event => update('currency', event.target.value.toUpperCase())} /></label>
          <label>رمز العرض<input value={settings.currencySymbol} onChange={event => update('currencySymbol', event.target.value)} /></label>
          <label>المنازل العشرية<input type="number" min="0" max="4" value={settings.decimalPlaces ?? 2} onChange={event => update('decimalPlaces', Number(event.target.value))} /></label>
          <label>الرصيد الافتتاحي<input type="number" step="0.01" value={settings.openingBalance} onChange={event => update('openingBalance', Number(event.target.value))} /></label>
          <label>تاريخ الرصيد الافتتاحي<input type="date" value={settings.openingBalanceDate || ''} onChange={event => update('openingBalanceDate', event.target.value)} /></label>
          <label>الاشتراك الشهري الافتراضي<input type="number" min="0" step="0.01" value={settings.defaultMonthlyFee} onChange={event => update('defaultMonthlyFee', Number(event.target.value))} /></label>
          <label>بادئة الإيصال<input value={settings.receiptPrefix} onChange={event => update('receiptPrefix', event.target.value.toUpperCase())} /></label>
          <label className="full">طرق الدفع<input value={list(settings.paymentMethods)} onChange={event => update('paymentMethods', parseList(event.target.value))} /><small>افصل القيم بفاصلة عربية أو إنجليزية</small></label>
          <label className="full">تصنيفات الإيرادات<input value={list(settings.incomeCategories)} onChange={event => update('incomeCategories', parseList(event.target.value))} /></label>
          <label className="full">تصنيفات المصروفات<input value={list(settings.expenseCategories)} onChange={event => update('expenseCategories', parseList(event.target.value))} /></label>
          <label className="full">تصنيفات الصيانة<input value={list(settings.maintenanceCategories)} onChange={event => update('maintenanceCategories', parseList(event.target.value))} /></label>
        </div>
      </section>

      <section className="panel">
        <h2>WhatsApp</h2>
        <div className="form-grid">
          <label>رمز الدولة الافتراضي<input value={settings.countryCode} onChange={event => update('countryCode', event.target.value)} /></label>
          <label>اسم الجهة المرسلة<input value={settings.senderName || ''} onChange={event => update('senderName', event.target.value)} /></label>
          <label className="full">قالب التذكير<textarea value={settings.whatsappTemplate} onChange={event => update('whatsappTemplate', event.target.value)} /></label>
          <label className="full">قالب ملخص التقرير<textarea value={settings.whatsappReportTemplate || ''} onChange={event => update('whatsappReportTemplate', event.target.value)} /></label>
        </div>
      </section>

      <section className="panel">
        <h2>الصور والمرفقات والتنبيهات</h2>
        <div className="form-grid">
          <label>أقصى حجم ملف (MB)<input type="number" min="1" max="100" value={settings.maxAttachmentSizeMb ?? 10} onChange={event => update('maxAttachmentSizeMb', Number(event.target.value))} /></label>
          <label>جودة ضغط الصور<input type="number" min="0.5" max="1" step="0.05" value={settings.imageQuality ?? 0.8} onChange={event => update('imageQuality', Number(event.target.value))} /></label>
          <label>أقصى بُعد للصورة<input type="number" min="600" max="4000" value={settings.imageMaxDimension ?? 1600} onChange={event => update('imageMaxDimension', Number(event.target.value))} /></label>
          <label className="full">أنواع الملفات المسموحة<input value={list(settings.allowedFileTypes)} onChange={event => update('allowedFileTypes', parseList(event.target.value))} /></label>
          <label>تنبيه الصيانة قبل (يوم)<input type="number" min="0" value={settings.maintenanceAlertDays ?? 7} onChange={event => update('maintenanceAlertDays', Number(event.target.value))} /></label>
          <label>تنبيه العقد قبل (يوم)<input type="number" min="0" value={settings.contractAlertDays ?? 30} onChange={event => update('contractAlertDays', Number(event.target.value))} /></label>
          <label>يوم استحقاق الاشتراك<input type="number" min="1" max="28" value={settings.monthlyDueDay ?? 1} onChange={event => update('monthlyDueDay', Number(event.target.value))} /></label>
          <label>التأخير قبل التنبيه (يوم)<input type="number" min="0" value={settings.overdueAlertDays ?? 5} onChange={event => update('overdueAlertDays', Number(event.target.value))} /></label>
        </div>
      </section>

      <button className="primary sticky-save" disabled={busy}>{busy ? 'جارٍ الحفظ...' : 'حفظ جميع الإعدادات'}</button>
    </form>

    <div className="settings-grid settings-tools">
      <section className="panel">
        <h2>النسخ الاحتياطي</h2>
        <p>آخر نسخة: {settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString('ar-SA-u-ca-gregory-nu-latn') : 'لا توجد'}</p>
        <p>اسم الملف: {settings.lastBackupFileName || '—'}</p>
        <p>الحجم: {bytes(settings.lastBackupSize)}</p>
        <div className="actions">
          <button className="primary" disabled={busy} onClick={async () => {
            try {
              setBusy(true)
              const result = await createBackup()
              setSettings({ ...settings, lastBackupAt: result.createdAt, lastBackupFileName: result.fileName, lastBackupSize: result.size })
            } finally { setBusy(false) }
          }}>تصدير نسخة ZIP كاملة</button>
          <button disabled={busy} onClick={() => fileRef.current?.click()}>اختيار نسخة للاستعادة</button>
        </div>
        <input ref={fileRef} type="file" accept=".zip" hidden onChange={event => void chooseBackup(event.target.files?.[0])} />
        {preview && <div className="backup-preview">
          <h3>معاينة النسخة</h3>
          <p>الملف: {preview.fileName}</p>
          <p>تاريخ الإنشاء: {preview.createdAt ? new Date(preview.createdAt).toLocaleString('ar-SA-u-ca-gregory-nu-latn') : 'غير معروف'}</p>
          <p>إصدار التطبيق: {preview.appVersion} — قاعدة البيانات: {preview.schemaVersion}</p>
          <p>المرفقات: {preview.attachmentCount}</p>
          <label>طريقة الاستعادة<select value={restoreMode} onChange={event => setRestoreMode(event.target.value as RestoreMode)}><option value="replace">استبدال جميع البيانات</option><option value="merge">دمج ومنع التكرار</option></select></label>
          <button className="primary" disabled={busy} onClick={() => void runRestore()}>تنفيذ الاستعادة</button>
        </div>}
      </section>

      <section className="panel danger-zone">
        <h2>منطقة خطرة</h2>
        <p>يحذف هذا الإجراء جميع جداول IndexedDB والمرفقات والإيصالات والإعدادات والكاش المحلي.</p>
        <p><strong>أنشئ نسخة احتياطية قبل المتابعة.</strong></p>
        <button className="danger" disabled={busy} onClick={() => void clearAll()}>حذف جميع البيانات</button>
      </section>
    </div>
  </>
}
