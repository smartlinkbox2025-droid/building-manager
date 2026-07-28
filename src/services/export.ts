import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { saveAs } from 'file-saver'

export interface ExcelExportOptions {
  sheetName?: string
  buildingName?: string
  reportTitle?: string
  filters?: string
  exportedAt?: string
}

export interface WorkbookSheet {
  name: string
  rows: Record<string, unknown>[]
}

function createWorksheet(rows: Record<string, unknown>[], fileName: string, config: ExcelExportOptions) {
  const headers = Object.keys(rows[0] || {})
  const metadata = [
    [config.buildingName || ''],
    [config.reportTitle || fileName.replaceAll('_', ' ')],
    [`الفلاتر: ${config.filters || 'جميع البيانات'}`],
    [`تاريخ التصدير: ${config.exportedAt || new Date().toLocaleString('ar-SA')}`],
    []
  ]
  const values = rows.map(row => headers.map(header => row[header]))
  const ws = XLSX.utils.aoa_to_sheet([...metadata, headers, ...values])
  ws['!rtl'] = true
  ws['!merges'] = headers.length ? metadata.slice(0, 4).map((_, row) => ({ s: { r: row, c: 0 }, e: { r: row, c: Math.max(0, headers.length - 1) } })) : []
  ws['!cols'] = headers.map((header, index) => {
    const maxValue = Math.max(header.length, ...values.map(row => String(row[index] ?? '').length))
    return { wch: Math.min(45, Math.max(14, maxValue + 3)) }
  })
  const headerRow = metadata.length
  if (headers.length) {
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ r: headerRow, c: 0 }, { r: headerRow + values.length, c: headers.length - 1 }) }
    ;(ws as unknown as Record<string, unknown>)['!freeze'] = { xSplit: 0, ySplit: headerRow + 1, topLeftCell: `A${headerRow + 2}`, activePane: 'bottomLeft', state: 'frozen' }
  }
  return ws
}

export function exportExcel(rows: Record<string, unknown>[], fileName: string, options: string | ExcelExportOptions = 'البيانات') {
  const config: ExcelExportOptions = typeof options === 'string' ? { sheetName: options } : options
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, createWorksheet(rows, fileName, config), (config.sheetName || 'البيانات').slice(0, 31))
  XLSX.writeFile(wb, `${fileName}.xlsx`)
}

export function exportWorkbook(sheets: WorkbookSheet[], fileName: string, options: ExcelExportOptions = {}) {
  const wb = XLSX.utils.book_new()
  sheets.forEach(sheet => XLSX.utils.book_append_sheet(wb, createWorksheet(sheet.rows, fileName, { ...options, sheetName: sheet.name }), sheet.name.slice(0, 31)))
  XLSX.writeFile(wb, `${fileName}.xlsx`)
}

async function buildPdf(element: HTMLElement) {
  const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false })
  const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait'
  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 7
  const footerHeight = 6
  const printableWidth = pageWidth - margin * 2
  const printableHeight = pageHeight - margin * 2 - footerHeight
  const pxPerMm = canvas.width / printableWidth
  const pageHeightPx = Math.floor(printableHeight * pxPerMm)
  let offset = 0
  let page = 0

  while (offset < canvas.height) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - offset)
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceHeight
    const context = pageCanvas.getContext('2d')
    if (!context) throw new Error('تعذر إنشاء صفحة PDF')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    context.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
    if (page > 0) pdf.addPage()
    const renderedHeight = sliceHeight / pxPerMm
    pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, printableWidth, renderedHeight)
    offset += sliceHeight
    page += 1
  }

  const totalPages = pdf.getNumberOfPages()
  for (let index = 1; index <= totalPages; index += 1) {
    pdf.setPage(index)
    pdf.setFontSize(8)
    pdf.text(`${index} / ${totalPages}`, pageWidth / 2, pageHeight - 3, { align: 'center' })
  }
  return pdf
}

export async function exportElementPdf(element: HTMLElement, fileName: string) {
  const pdf = await buildPdf(element)
  pdf.save(`${fileName}.pdf`)
}

export async function createElementPdfFile(element: HTMLElement, fileName: string) {
  const pdf = await buildPdf(element)
  return new File([pdf.output('blob')], `${fileName}.pdf`, { type: 'application/pdf' })
}

export function downloadJson(data: unknown, fileName: string){
  saveAs(new Blob([JSON.stringify(data, null, 2)], {type:'application/json;charset=utf-8'}), fileName)
}
