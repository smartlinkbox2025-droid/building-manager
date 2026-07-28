import { useEffect, useState } from 'react'
import { db } from '../db/database'
import type { Attachment } from '../types/models'
import { deleteAttachment, downloadAttachment, saveAttachment } from '../services/attachments'
import AttachmentPreview from './AttachmentPreview'
import { Empty } from './Common'

export default function AttachmentManager({ entityType, entityId, title = 'المرفقات' }: { entityType: string; entityId: string; title?: string }) {
  const [rows, setRows] = useState<Attachment[]>([])
  const [preview, setPreview] = useState<Attachment | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => setRows((await db.attachments.where('[entityType+entityId]').equals([entityType, entityId]).toArray()).filter(item => item.active !== false))
  useEffect(() => { void load() }, [entityType, entityId])

  async function upload(file?: File) {
    if (!file) return
    setBusy(true)
    try {
      await saveAttachment({ entityType, entityId, file, category: entityType })
      await load()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر رفع المرفق')
    } finally {
      setBusy(false)
    }
  }

  async function remove(item: Attachment) {
    const reason = prompt(`سبب حذف المرفق ${item.fileName}`)
    if (!reason?.trim()) return
    await deleteAttachment(item.id, reason)
    await load()
  }

  return <div>
    <div className="section-title"><h4>{title}</h4><label className="file-button">رفع مرفق<input hidden type="file" disabled={busy} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event => void upload(event.target.files?.[0])} /></label></div>
    {rows.length ? <div className="attachment-list">{rows.map(item => <div key={item.id} className="attachment-row">
      <span><strong>{item.fileName}</strong><small>{item.mimeType} — {(item.sizeAfter / 1024).toFixed(1)} KB — {new Date(item.createdAt).toLocaleString('ar-SA-u-ca-gregory-nu-latn')}</small></span>
      <div className="actions"><button onClick={() => setPreview(item)}>معاينة</button><button onClick={() => downloadAttachment(item)}>تنزيل</button><button className="danger" onClick={() => void remove(item)}>حذف</button></div>
    </div>)}</div> : <Empty text="لا توجد مرفقات" />}
    <AttachmentPreview attachment={preview} onClose={() => setPreview(null)} />
  </div>
}
