import { lazy, Suspense } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Apartments = lazy(() => import('./pages/Apartments'))
const Residents = lazy(() => import('./pages/Residents'))
const Charges = lazy(() => import('./pages/Charges'))
const Expenses = lazy(() => import('./pages/Expenses'))
const Maintenance = lazy(() => import('./pages/Maintenance'))
const Reports = lazy(() => import('./pages/Reports'))
const Audit = lazy(() => import('./pages/Audit'))
const Settings = lazy(() => import('./pages/Settings'))

function PageLoader(){return <div className="loading-state" role="status">جاري تحميل الصفحة...</div>}

export default function App(){return <HashRouter><Suspense fallback={<PageLoader/>}><Routes><Route element={<Layout/>}><Route path="/" element={<Dashboard/>}/><Route path="/apartments" element={<Apartments/>}/><Route path="/residents" element={<Residents/>}/><Route path="/charges" element={<Charges/>}/><Route path="/expenses" element={<Expenses/>}/><Route path="/maintenance" element={<Maintenance/>}/><Route path="/reports" element={<Reports/>}/><Route path="/audit" element={<Audit/>}/><Route path="/settings" element={<Settings/>}/><Route path="*" element={<Dashboard/>}/></Route></Routes></Suspense></HashRouter>}
