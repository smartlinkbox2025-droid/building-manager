import { NavLink, Outlet } from 'react-router-dom'
import { Building2, LayoutDashboard, Home, Users, WalletCards, Receipt, Wrench, BarChart3, Settings } from 'lucide-react'
import PwaStatus from './PwaStatus'
import { CurrencyProvider } from '../contexts/CurrencyContext'
const links=[['/','لوحة التحكم',LayoutDashboard],['/apartments','الشقق',Home],['/residents','السكان',Users],['/charges','الاشتراكات',WalletCards],['/expenses','الإيرادات والمصروفات',Receipt],['/maintenance','الصيانة',Wrench],['/reports','التقارير',BarChart3],['/settings','الإعدادات',Settings]] as const
export default function Layout(){return <CurrencyProvider><div className="app-shell"><aside><div className="brand"><Building2/><span>إدارة العمارة</span></div><nav>{links.map(([to,label,Icon])=><NavLink key={to} to={to} className={({isActive})=>isActive?'active':''}><Icon size={19}/><span>{label}</span></NavLink>)}</nav></aside><main><PwaStatus/><Outlet/></main></div></CurrencyProvider>}
