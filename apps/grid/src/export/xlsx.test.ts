import type { CellValue, Worksheet } from 'exceljs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { activity, calais, planning } from '../grid/calais.test.data'
import { columnsFor } from '../grid/columns'
import { groupRows } from '../grid/group'
import { setStrings } from '../i18n'
import type { Row } from '../types'
import { buildWorkbook, fileName } from './xlsx'

const all = Object.fromEntries(columnsFor(activity, { ...planning, columns: undefined }).map((c) => [c.id, c]))
const week = { from: '2026-05-18', to: '2026-05-24' }
const values = (sheet: Worksheet, n: number): CellValue[] =>
  Array.from({ length: sheet.columnCount }, (_, i) => sheet.getRow(n).getCell(i + 1).value)
const rows = (sheet: Worksheet): CellValue[][] => Array.from({ length: sheet.rowCount }, (_, i) => values(sheet, i + 1))
const withFields = (row: Row, fields: Record<string, unknown>): Row => ({ ...row, fields: { ...row.fields, ...fields } })

beforeEach(() => {
  document.documentElement.lang = 'nl-BE'
  setStrings({ total: 'Totaal', rows: '{n} rijen', row: '1 rij', yes: 'Ja', no: 'Nee' })
})
afterEach(() => {
  document.documentElement.lang = ''
  setStrings(undefined)
})

describe('buildWorkbook', () => {
  it('workbook mirrors visible columns', () => {
    const shown = [all.title, all.kind, all.date]
    const sheet = buildWorkbook(planning, shown, groupRows(calais, undefined), week).worksheets[0]

    expect(sheet.name).toBe('Planning 2026-05-18–2026-05-24')
    expect(values(sheet, 1)).toEqual(['Titel', 'Soort', 'Datum'])
    expect(sheet.getRow(1).font?.bold).toBe(true)
    expect(values(sheet, 2).slice(0, 2)).toEqual(['Auto Pavel + Sien', 'Reis'])
    expect(rows(sheet).flat()).not.toContain('Grote zaal')
    expect(sheet.columnCount).toBe(3)
  })

  it('groups become section rows in order', () => {
    const groups = groupRows([calais[3], calais[0], calais[5], calais[1]], all.date)
    const sheet = buildWorkbook(planning, [all.title, all.start], groups, week).worksheets[0]

    expect(rows(sheet)).toEqual([
      ['Titel', 'Start'],
      ['Maandag 18 mei', 'Maandag 18 mei'],
      ['Auto Pavel + Sien', '07:30'],
      ['Montage', '10:00'],
      ['2 rijen', '2 rijen'],
      ['Dinsdag 19 mei', 'Dinsdag 19 mei'],
      ['Repetitie', '10:00'],
      ['1 rij', '1 rij'],
      ['Woensdag 20 mei', 'Woensdag 20 mei'],
      ['Diner door Rosalie', '18:00'],
      ['1 rij', '1 rij'],
      ['Totaal · 4 rijen', null],
    ])
    expect(sheet.getCell('A2').isMerged && sheet.getCell('B2').isMerged).toBe(true)
    expect(sheet.getRow(2).font?.bold).toBe(true)
    expect(sheet.getRow(3).font?.bold).not.toBe(true)
  })

  it('dates and numbers are typed', () => {
    const row = withFields(calais[0], { seats: 120, paid: true })
    const shown = [all.title, all.date, all.seats, all.paid, all.location, all['rollups.confirmed'], all.start]
    const sheet = buildWorkbook(planning, shown, groupRows([row, calais[1]], undefined), week).worksheets[0]
    const [, date, seats, paid, location, confirmed, start] = values(sheet, 2)

    expect(date).toEqual(new Date(Date.UTC(2026, 4, 18)))
    expect(sheet.getCell('B2').numFmt).toBe('dd/mm/yyyy')
    expect(seats).toBe(120)
    expect(paid).toBe('Ja')
    expect(location).toBe('Le Grenier, Calais')
    expect(confirmed).toBe(2)
    expect(start).toBe('07:30')
    expect(values(sheet, 4)).toEqual(['Totaal · 2 rijen', null, 120, null, null, 6, null])
  })

  it('formula-leading values are quoted', () => {
    const hostile = ['=HYPERLINK("http://x.test","klik")', '+1+1', '-2+3', '@SUM(A1)'].map((title, i) => ({ ...calais[i], title }))
    const label = { ...all.place, label: '=cmd' }
    const sheet = buildWorkbook(planning, [all.title, label], groupRows(hostile, undefined), week).worksheets[0]

    expect(values(sheet, 1)).toEqual(['Titel', "'=cmd"])
    expect(rows(sheet).slice(1, 5).map((r) => r[0])).toEqual([
      `'=HYPERLINK("http://x.test","klik")`, "'+1+1", "'-2+3", "'@SUM(A1)",
    ])
    expect(sheet.getCell('A2').formula).toBeUndefined()
  })

  it('formula-leading section, foot and control-leading values are quoted too', () => {
    setStrings({ total: '=Totaal', rows: '+{n} rijen', row: '@1 rij' })
    const rooms = ['=Zaal()', '=Zaal()', '\tTab', '\rReturn'].map((place, i) => withFields(calais[i], { place }))
    const sheet = buildWorkbook(planning, [all.title, all.place], groupRows(rooms, all.place), week).worksheets[0]
    const first = rows(sheet).map((r) => r[0])

    expect(first).toContain("'=Zaal()")
    expect(first).toContain("'+2 rijen")
    expect(first).toContain("'@1 rij")
    expect(first).toContain("'\tTab")
    expect(first).toContain("'\rReturn")
    expect(first.at(-1)).toBe("'=Totaal · +4 rijen")
    expect(rows(sheet).map((r) => r[1])).toContain("'=Zaal()")
  })

  it('names the sheet within Excel\'s rules and the file after the view and window', () => {
    const long = { ...planning, label: 'Planning: [wk]/tour*? \\ 2026 extra lang' }
    const sheet = buildWorkbook(long, [all.title], groupRows([], undefined), week).worksheets[0]

    expect(sheet.name).toMatch(/^[^[\]:*?/\\]{1,31}$/)
    expect(sheet.name).toMatch(/ 2026-05-18–2026-05-24$/)
    expect(buildWorkbook(planning, [all.title], [], null).worksheets[0].name).toBe('Planning')
    expect(buildWorkbook({ ...planning, label: 'Tabel' }, [all.title], [], null, 'Planning').worksheets[0].name).toBe('Planning')
    expect(buildWorkbook({ ...planning, label: 'Tabel' }, [all.title], [], week, 'Planning').worksheets[0].name).toBe('Planning 2026-05-18–2026-05-24')
    expect(fileName(planning, week)).toBe('planning-2026-05-18-2026-05-24.xlsx')
    expect(fileName(planning, null)).toBe('planning.xlsx')
  })
})
