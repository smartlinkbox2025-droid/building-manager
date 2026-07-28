export interface ShareFileOptions {
  title: string
  text: string
  file?: File
  fallbackFileName?: string
}

export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  area.remove()
}

export function openWhatsApp(text: string, phone?: string) {
  const normalizedPhone = phone?.replace(/[^0-9]/g, '')
  const target = normalizedPhone
    ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`
  window.open(target, '_blank', 'noopener,noreferrer')
}

export async function shareFileOrText(options: ShareFileOptions) {
  const payload: ShareData = { title: options.title, text: options.text }
  if (options.file && navigator.canShare?.({ files: [options.file] })) payload.files = [options.file]
  if (navigator.share) {
    await navigator.share(payload)
    return true
  }
  await copyText(options.text)
  return false
}
