import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import '@fontsource/amiri/400.css'
import '@fontsource/noto-naskh-arabic/400.css'
import '@fontsource/noto-naskh-arabic/700.css'
import './tailwind.css'
import './styles.css'
import { ensureSettings } from './db/database'

void ensureSettings().catch(error => console.error('تعذر تهيئة الإعدادات:', error))

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh(){
    const accepted = window.confirm('يتوفر إصدار جديد من التطبيق. هل تريد تحديثه الآن؟ لن تتأثر بياناتك المحلية.')
    if (accepted) void updateSW(true)
  },
  onOfflineReady(){
    console.info('أصبح التطبيق جاهزاً للعمل دون اتصال.')
  },
  onRegisterError(error){
    console.error('تعذر تسجيل Service Worker:', error)
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>
)
