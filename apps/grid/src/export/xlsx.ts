import ExcelJS from 'exceljs'
import type { Column } from '../grid/columns'
import { type Group, sums, total } from '../grid/group'
import { rowCount, t } from '../i18n'
import type { DateWindow, Row, View } from '../types'

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const FORMULA = /^[=+\-@\t\r]/
const NOT_IN_A_SHEET_NAME = /[[\]:*?/\\]/g

/** Threat 8: a value Excel would read as a formula is written as the text it is. */
export function guard(text: string): string {
  return FORMULA.test(text) ? `'${text}` : text
}

function text(value: string): string | null {
  return value === '' ? null : guard(value)
}

/** Excel's 31 characters: the title gives way, the window stays whole. */
function sheetName(view: View, window: DateWindow | null, title: string): string {
  const suffix = window ? ` ${window.from}–${window.to}` : ''
  const clean = (text: string) => text.replace(NOT_IN_A_SHEET_NAME, ' ').replace(/\s+/g, ' ').replace(/^'+|'+$/g, '').trim()
  const label = clean(title).slice(0, 31 - suffix.length).trim() || clean(view.key).slice(0, 31 - suffix.length)
  return label + suffix
}

export function fileName(view: View, window: DateWindow | null): string {
  return window ? `${view.key}-${window.from}-${window.to}.xlsx` : `${view.key}.xlsx`
}

/** Excel stores a day as a serial without a zone; exceljs counts it from UTC midnight. */
function day(iso: string): Date | null {
  const match = DAY.exec(iso)
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null
}

function cellValue(column: Column, row: Row): ExcelJS.CellValue {
  if (column.kind === 'date') return day(column.edit(row)) ?? text(column.text(row))
  if (column.kind === 'number' || column.kind === 'rollup') {
    const raw = column.value(row)
    const number = raw === '' || raw === null || raw === undefined ? NaN : Number(raw)
    return Number.isFinite(number) ? number : text(column.text(row))
  }
  return text(column.text(row))
}

function spanning(sheet: ExcelJS.Worksheet, value: string, width: number): ExcelJS.Row {
  const row = sheet.addRow([guard(value)])
  if (width > 1) sheet.mergeCells(row.number, 1, row.number, width)
  return row
}

/** One sheet, as the grid shows it: the visible columns in order, each group a section with its count, the total last. */
export function buildWorkbook(view: View, columns: Column[], groups: Group[], window: DateWindow | null, title = view.label): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName(view, window, title), { views: [{ state: 'frozen', ySplit: 1 }] })

  sheet.addRow(columns.map((column) => guard(column.label))).font = { bold: true }
  columns.forEach((column, i) => {
    sheet.getColumn(i + 1).width = Math.round(column.width / 7)
    if (column.kind === 'date') sheet.getColumn(i + 1).numFmt = 'dd/mm/yyyy'
  })

  for (const group of groups) {
    const sectioned = group.label !== ''
    if (sectioned) spanning(sheet, group.label, columns.length).font = { bold: true }
    for (const row of group.rows) sheet.addRow(columns.map((column) => cellValue(column, row)))
    if (sectioned) spanning(sheet, rowCount(group.count), columns.length)
  }

  const totals = sums(groups.flatMap((group) => group.rows), columns)
  sheet.addRow(columns.map((column, i) => (i === 0 ? guard(`${t('total')} · ${rowCount(total(groups))}`) : totals[column.id] ?? null))).font = { bold: true }

  return workbook
}
