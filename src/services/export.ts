import JSZip from 'jszip'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import FileSaver from 'file-saver'

const { saveAs } = FileSaver

async function saveFile(blob: Blob, fileName: string, type: string) {
  const typedBlob = blob.type === type ? blob : new Blob([blob], { type })
  const file = new File([typedBlob], fileName, { type })
  const shareData = { files: [file], title: fileName }
  const mobile = matchMedia('(max-width: 900px)').matches || matchMedia('(display-mode: standalone)').matches
  if (mobile && navigator.share && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData)
      return
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
    }
  }
  saveAs(typedBlob, fileName)
}

export interface ExcelExportOptions {
  sheetName?: string
  buildingName?: string
  reportTitle?: string
  filters?: string
  exportedAt?: string
}
export interface WorkbookSheet { name: string; rows: Record<string, unknown>[] }

const xml = (value: unknown) => String(value ?? '').replace(/[<>&'"]/g, character => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
}[character]!))
function columnName(index: number) {
  let result = ''
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + (value - 1) % 26) + result
  return result
}
function cell(value: unknown, address: string, style = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${address}" s="${style}"><v>${value}</v></c>`
  return `<c r="${address}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
}
function worksheetXml(rows: Record<string, unknown>[], fileName: string, config: ExcelExportOptions) {
  const headers = Object.keys(rows[0] || {})
  const metadata = [
    config.buildingName || '',
    config.reportTitle || fileName.replaceAll('_', ' '),
    `الفلاتر: ${config.filters || 'جميع البيانات'}`,
    `تاريخ التصدير: ${config.exportedAt || new Date().toLocaleString('ar-SA-u-ca-gregory-nu-latn')}`
  ]
  const data: unknown[][] = [...metadata.map(value => [value]), [], headers, ...rows.map(row => headers.map(header => row[header]))]
  const sheetData = data.map((values, rowIndex) => {
    const cells = values.map((value, columnIndex) => cell(value, `${columnName(columnIndex)}${rowIndex + 1}`, rowIndex < 4 ? 2 : rowIndex === 5 ? 1 : 0)).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  const lastColumn = columnName(Math.max(0, headers.length - 1))
  const merges = headers.length > 1 ? metadata.map((_, index) => `<mergeCell ref="A${index + 1}:${lastColumn}${index + 1}"/>`).join('') : ''
  const widths = headers.map((header, index) => {
    const width = Math.min(45, Math.max(14, header.length + 3, ...rows.map(row => String(row[header] ?? '').length + 2)))
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
  }).join('')
  const filter = headers.length ? `<autoFilter ref="A6:${lastColumn}${Math.max(6, data.length)}"/>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths}</cols><sheetData>${sheetData}</sheetData>${filter}
${merges ? `<mergeCells count="${metadata.length}">${merges}</mergeCells>` : ''}
<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>
</worksheet>`
}
const xlsxMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function createWorkbookBlob(sheets: WorkbookSheet[], fileName: string, options: ExcelExportOptions = {}) {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`)
  zip.folder('_rels')!.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`)
  zip.folder('xl')!.file('workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`)
  zip.folder('xl')!.folder('_rels')!.file('workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)
  zip.folder('xl')!.file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FF0F766E"/><sz val="14"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right"/></xf></cellXfs></styleSheet>`)
  sheets.forEach((sheet, index) => zip.folder('xl')!.folder('worksheets')!.file(`sheet${index + 1}.xml`, worksheetXml(sheet.rows, fileName, { ...options, sheetName: sheet.name })))
  const archive = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  return new Blob([archive], { type: xlsxMimeType })
}
async function writeWorkbook(sheets: WorkbookSheet[], fileName: string, options: ExcelExportOptions) {
  await saveFile(await createWorkbookBlob(sheets, fileName, options), `${fileName}.xlsx`, xlsxMimeType)
}
export function exportExcel(rows: Record<string, unknown>[], fileName: string, options: string | ExcelExportOptions = 'البيانات') {
  const config = typeof options === 'string' ? { sheetName: options } : options
  void writeWorkbook([{ name: config.sheetName || 'البيانات', rows }], fileName, config)
}
export function exportWorkbook(sheets: WorkbookSheet[], fileName: string, options: ExcelExportOptions = {}) {
  void writeWorkbook(sheets, fileName, options)
}

async function buildPdf(element: HTMLElement) {
  const exportWidth = Math.min(1600, Math.max(1120, element.scrollWidth))
  const stage = document.createElement('div')
  stage.className = 'export-stage'
  stage.style.width = `${exportWidth}px`
  const clone = element.cloneNode(true) as HTMLElement
  clone.classList.add('export-clone')
  clone.style.fontFamily = '"Noto Naskh Arabic", Tahoma, Arial, sans-serif'
  clone.style.width = `${exportWidth}px`
  clone.style.maxWidth = 'none'
  clone.style.overflow = 'visible'
  clone.querySelectorAll('button,.file-button,input,select').forEach(node => node.remove())
  clone.querySelectorAll('table').forEach(table => {
    ;(table as HTMLElement).style.minWidth = '0'
    ;(table as HTMLElement).style.width = '100%'
    const headers = Array.from(table.querySelectorAll('thead th'))
    const actionIndex = headers.findIndex(header => header.textContent?.trim() === 'الإجراءات')
    if (actionIndex >= 0) table.querySelectorAll('tr').forEach(row => row.children.item(actionIndex)?.remove())
  })
  stage.appendChild(clone)
  document.body.appendChild(stage)
  await document.fonts?.ready
  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(clone, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, width: exportWidth, windowWidth: exportWidth })
  } finally {
    stage.remove()
  }
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
    pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, printableWidth, sliceHeight / pxPerMm)
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
  await saveFile(pdf.output('blob'), `${fileName}.pdf`, 'application/pdf')
}
export async function createElementPdfFile(element: HTMLElement, fileName: string) {
  const pdf = await buildPdf(element)
  return new File([pdf.output('blob')], `${fileName}.pdf`, { type: 'application/pdf' })
}
export function downloadJson(data: unknown, fileName: string) {
  saveAs(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }), fileName)
}
