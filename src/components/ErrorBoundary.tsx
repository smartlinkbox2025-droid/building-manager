import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'حدث خطأ غير متوقع' }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application error boundary:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return <main className="fatal-error" role="alert">
      <h1>تعذر عرض الصفحة</h1>
      <p>حدث خطأ أثناء تشغيل هذا الجزء من التطبيق. لم يتم حذف بياناتك.</p>
      <details><summary>تفاصيل تقنية</summary><code>{this.state.message}</code></details>
      <button className="primary" onClick={() => window.location.reload()}>إعادة تحميل التطبيق</button>
    </main>
  }
}
