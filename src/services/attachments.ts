import imageCompression from 'browser-image-compression'
import { audit, db, now, uid } from '../db/database'
import type { Attachment } from '../types/models'

export interface SaveAttachmentInput {
  entityType: string
  entityId: string
  file: File
  category?: string
}

function storageError(error: unknown): Error {
  if (error instanceof DOMException && ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(error.name)) {
    return new Error('مساحة التخزين المحلية غير كافية. أنشئ نسخة احتياطية واحذف الملفات غير الضرورية.')
  }
  return error instanceof Error ? error : new Error('تعذر حفظ المرفق')
}

export async function saveAttachment(input: SaveAttachmentInput): Promise<Attachment> {
  const settings = await db.settings.get('main')
  const maxSizeMb = settings?.maxAttachmentSizeMb ?? 10
  const allowedTypes = settings?.allowedFileTypes ?? ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

  if (!allowedTypes.includes(input.file.type)) throw new Error('نوع الملف غير مسموح به')
  if (input.file.size > maxSizeMb * 1024 * 1024) throw new Error(`حجم الملف يتجاوز الحد المسموح (${maxSizeMb} MB)`)

  let storedBlob: Blob = input.file
  if (input.file.type.startsWith('image/')) {
    storedBlob = await imageCompression(input.file, {
      maxSizeMB: Math.min(maxSizeMb, 2),
      maxWidthOrHeight: settings?.imageMaxDimension ?? 1600,
      useWebWorker: true,
      initialQuality: settings?.imageQuality ?? 0.8
    })
  }

  const timestamp = now()
  const attachment: Attachment = {
    id: uid(),
    entityType: input.entityType,
    entityId: input.entityId,
    fileName: input.file.name,
    mimeType: input.file.type,
    sizeBefore: input.file.size,
    sizeAfter: storedBlob.size,
    blob: storedBlob,
    category: input.category,
    createdAt: timestamp,
    updatedAt: timestamp,
    active: true,
    status: 'active'
  }

  try {
    await db.transaction('rw', db.attachments, db.audit, async () => {
      await db.attachments.add(attachment)
      await audit('attachments', attachment.id, 'create', `رفع المرفق ${attachment.fileName}`, undefined, {
        ...attachment,
        blob: `[Blob ${attachment.sizeAfter} bytes]`
      })
    })
  } catch (error) {
    throw storageError(error)
  }
  return attachment
}

export async function deleteAttachment(attachmentId: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new Error('سبب حذف المرفق مطلوب')
  const attachment = await db.attachments.get(attachmentId)
  if (!attachment) throw new Error('المرفق غير موجود')
  const timestamp = now()
  await db.attachments.update(attachment.id, {
    active: false,
    status: 'cancelled',
    deletedAt: timestamp,
    deletedReason: reason.trim(),
    updatedAt: timestamp
  })
  await audit('attachments', attachment.id, 'delete', `حذف منطقي للمرفق ${attachment.fileName}`, attachment, undefined, reason.trim())
}

export function downloadAttachment(attachment: Attachment): void {
  const url = URL.createObjectURL(attachment.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = attachment.fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
