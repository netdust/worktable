import type { Workbook } from 'exceljs'
import type { Column } from '../grid/columns'
import type { Group } from '../grid/group'
import type { DateWindow, View } from '../types'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function download(workbook: Workbook, name: string): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: XLSX }))
  const link = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(link)
  link.click()
  link.remove()
  // Revoked on the next task: some browsers start the download only after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** exceljs arrives with the first click: the grid does not carry it for a button nobody pressed. */
export async function exportSheet(view: View, columns: Column[], groups: Group[], window: DateWindow | null, title = view.label): Promise<void> {
  const { buildWorkbook, fileName } = await import('./xlsx')
  await download(buildWorkbook(view, columns, groups, window, title), fileName(view, window))
}
