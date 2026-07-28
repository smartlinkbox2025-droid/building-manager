import { useEffect, useState } from 'react'
import { db } from '../db/database'

export default function BuildingAsset({ attachmentId, alt, className }: { attachmentId?: string; alt: string; className?: string }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    let objectUrl = ''
    if (!attachmentId) {
      setUrl('')
      return
    }
    void db.attachments.get(attachmentId).then(attachment => {
      if (!attachment || attachment.active === false) return
      objectUrl = URL.createObjectURL(attachment.blob)
      setUrl(objectUrl)
    })
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [attachmentId])

  return url ? <img src={url} alt={alt} className={className} /> : null
}
