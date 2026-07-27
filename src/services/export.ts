import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { saveAs } from 'file-saver'

export function exportExcel(rows: Record<string, unknown>[], fileName: string, sheetName = 'البيانات') {
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!rtl'] = true
  ws['!cols'] = Object.keys(rows[0] || {}).map(k => ({ wch: Math.max(14, k.length + 4) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, `${fileName}.xlsx`)
}

export async function exportElementPdf(element: HTMLElement, fileName: string) {
  const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
  const img = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth(); const pageH = pdf.internal.pageSize.getHeight()
  const ratio = Math.min((pageW - 10) / canvas.width, (pageH - 10) / canvas.height)
  pdf.addImage(img, 'PNG', 5, 5, canvas.width * ratio, canvas.height * ratio)
  pdf.save(`${fileName}.pdf`)
}

export function downloadJson(data: unknown, fileName: string){
  saveAs(new Blob([JSON.stringify(data, null, 2)], {type:'application/json;charset=utf-8'}), fileName)
}
