import { useEffect, useState } from 'react'
import { Download, WifiOff, X } from 'lucide-react'

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export default function PwaStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    const onInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('beforeinstallprompt', onInstall)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('beforeinstallprompt', onInstall)
    }
  }, [])

  if (hidden || (online && !installPrompt)) return null

  const install = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  return <div className={`pwa-status ${online ? 'install' : 'offline'}`} role="status">
    <span>{online ? <Download size={18}/> : <WifiOff size={18}/>}</span>
    <strong>{online ? 'يمكن تثبيت التطبيق على هذا الجهاز' : 'أنت تعمل دون اتصال. ستبقى البيانات المحلية متاحة.'}</strong>
    {online && installPrompt && <button onClick={install}>تثبيت</button>}
    <button className="icon-only" aria-label="إغلاق" onClick={() => setHidden(true)}><X size={17}/></button>
  </div>
}
