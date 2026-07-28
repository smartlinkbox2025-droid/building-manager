import { useEffect, useState } from 'react'
import type { Attachment } from '../types/models'
import { Modal } from './Common'

export default function AttachmentPreview({ attachment, onClose }: { attachment: Attachment | null; onClose: () => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!attachment) { setUrl(''); return }
    const objectUrl = URL.createObjectURL(attachment.blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [attachment])

  return <Modal open={!!attachment} title={attachment?.fileName || 'معاينة المرفق'} onClose={onClose}>
    {attachment && url && (attachment.mimeType.startsWith('image/')
      ? <img className="attachment-preview-image" src={url} alt={attachment.fileName} />
      : <iframe className="attachment-preview-frame" src={url} title={attachment.fileName} />)}
  </Modal>
}
