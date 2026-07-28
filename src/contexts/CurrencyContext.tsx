import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db } from '../db/database'

type CurrencyConfig = {
  currency: string
  symbol: string
  decimalPlaces: number
}

const defaults: CurrencyConfig = { currency: 'SAR', symbol: 'ر.س', decimalPlaces: 2 }
const CurrencyContext = createContext<CurrencyConfig>(defaults)

export const SETTINGS_UPDATED_EVENT = 'building-manager:settings-updated'

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<CurrencyConfig>(defaults)

  useEffect(() => {
    const load = async () => {
      const settings = await db.settings.get('main')
      if (!settings) return
      setConfig({
        currency: settings.currency || 'SAR',
        symbol: settings.currencySymbol || 'ر.س',
        decimalPlaces: settings.decimalPlaces ?? 2
      })
    }
    void load()
    window.addEventListener(SETTINGS_UPDATED_EVENT, load)
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, load)
  }, [])

  const value = useMemo(() => config, [config])
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useCurrency() {
  return useContext(CurrencyContext)
}
