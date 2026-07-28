export function normalizeInternationalPhone(value: string, defaultCountryCode = '+966') {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const countryDigits = defaultCountryCode.replace(/\D/g, '') || '966'
  let digits = trimmed.replace(/\D/g, '')
  if (trimmed.startsWith('+')) return `+${digits}`
  if (digits.startsWith('00')) return `+${digits.slice(2)}`
  if (digits.startsWith(countryDigits)) return `+${digits}`
  if (digits.startsWith('0')) digits = digits.slice(1)
  return `+${countryDigits}${digits}`
}
