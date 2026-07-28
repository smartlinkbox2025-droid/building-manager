import { saveAs } from 'file-saver'
import { db } from '../db/database'
import type { Receipt } from '../types/models'
import { createElementPdfFile } from './export'

const value = (snapshot: Record<string, unknown>, key: string) => String(snapshot[key] ?? '—')
function amount(snapshot: Record<string, unknown>, key: string) {
  const number = Number(snapshot[key] || 0)
  const currency = String(snapshot.currency || 'SAR')
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(number) }
  catch { return `${number.toFixed(2)} ${String(snapshot.currencySymbol || currency)}` }
}
function addText(parent: HTMLElement, tag: keyof HTMLElementTagNameMap, text: string, className?: string) {
  const element = document.createElement(tag)
  element.textContent = text
  if (className) element.className = className
  parent.appendChild(element)
}
function addRow(parent: HTMLElement, label: string, text: string) {
  const row = document.createElement('div')
  row.className = 'receipt-pdf-row'
  addText(row, 'strong', label)
  addText(row, 'span', text)
  parent.appendChild(row)
}
async function createReceiptElement(receipt: Receipt) {
  const snapshot = receipt.snapshot
  const settings = await db.settings.get('main')
  const logoAttachment = settings?.logoAttachmentId ? await db.attachments.get(settings.logoAttachmentId) : undefined
  const root = document.createElement('div')
  root.className = 'receipt-pdf-document'
  root.dir = 'rtl'
  root.style.cssText = 'position:fixed;right:-10000px;top:0;width:760px;background:#fff;padding:42px;font-family:"Noto Naskh Arabic",Tahoma,Arial,sans-serif;color:#0f172a;z-index:-1'
  const header = document.createElement('header')
  header.style.cssText = 'text-align:center;border-bottom:2px solid #0f766e;padding-bottom:18px;margin-bottom:22px'
  let logoUrl: string | undefined
  if (logoAttachment?.blob) {
    logoUrl = URL.createObjectURL(logoAttachment.blob)
    const image = document.createElement('img')
    image.src = logoUrl
    image.alt = 'شعار العمارة'
    image.style.cssText = 'display:block;width:80px;height:80px;object-fit:contain;margin:0 auto 10px'
    header.appendChild(image)
  }
  addText(header, 'h1', value(snapshot, 'buildingName'))
  addText(header, 'h2', 'إيصال استلام دفعة')
  addText(header, 'p', receipt.receiptNo)
  root.appendChild(header)
  const details = document.createElement('section')
  addRow(details, 'اسم المشترك', value(snapshot, 'residentName'))
  addRow(details, 'رقم الشقة', value(snapshot, 'apartmentNumber'))
  addRow(details, 'الشهر المستحق', `${value(snapshot, 'chargeMonth')} / ${value(snapshot, 'chargeYear')}`)
  addRow(details, 'مبلغ الدفعة', amount(snapshot, 'paymentAmount'))
  addRow(details, 'طريقة الدفع', value(snapshot, 'paymentMethod'))
  addRow(details, 'تاريخ الدفع', value(snapshot, 'paymentDate'))
  addRow(details, 'المرجع', value(snapshot, 'paymentReference'))
  addRow(details, 'الملاحظات', value(snapshot, 'paymentNotes'))
  root.appendChild(details)
  const totals = document.createElement('section')
  totals.style.cssText = 'margin-top:20px;padding:16px;background:#f0fdfa;border-radius:10px'
  addRow(totals, 'إجمالي المطلوب', amount(snapshot, 'requiredAmount'))
  addRow(totals, 'إجمالي المدفوع بعد الدفعة', amount(snapshot, 'totalPaid'))
  addRow(totals, 'المتبقي', amount(snapshot, 'remainingAmount'))
  root.appendChild(totals)
  addText(root, 'p', value(snapshot, 'confirmationText'), 'receipt-pdf-confirmation')
  addText(root, 'footer', `تاريخ إنشاء الإيصال: ${new Date(receipt.issuedAt).toLocaleString('ar-SA-u-ca-gregory-nu-latn')} — صفحة 1 / 1`)
  document.body.appendChild(root)
  await document.fonts.ready
  return { root, logoUrl }
}
export async function createReceiptPdfFile(receipt: Receipt) {
  const { root, logoUrl } = await createReceiptElement(receipt)
  try { return await createElementPdfFile(root, receipt.receiptNo) }
  finally {
    root.remove()
    if (logoUrl) URL.revokeObjectURL(logoUrl)
  }
}
export async function downloadReceiptPdf(receipt: Receipt) {
  const file = await createReceiptPdfFile(receipt)
  saveAs(file, file.name)
}
