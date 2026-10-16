import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { filesOf, fileUrl } from '../api'
import { Display } from '../grid/cells'
import { type Column, columnsFor, firstId } from '../grid/columns'
import { useOpenRow } from '../grid/useOpenRow'
import type { Layout } from '../grid/layout'
import { dayLabel } from '../grid/group'
import { t } from '../i18n'
import type { Field, Model, Row, Tone, View } from '../types'
import { factsOf } from '../ui/facts'
import { type Size, SIZE_PX } from './size'
import type { Shown } from '../ui/Toolbar'
import { toneColor } from '../ui/tone'
import { useTones } from '../ui/useTones'
import { whenOf } from '../ui/when'
import './gallery.css'

type Files = Record<number, { id: number; mime: string; name: string }>

/** The engine's cap on one batched read. */
const BATCH = 200

const batchesOf = (ids: number[]): number[][] => Array.from({ length: Math.ceil(ids.length / BATCH) }, (_, at) => ids.slice(at * BATCH, (at + 1) * BATCH))

const noToggle = () => undefined

/** What a card without a picture shows: "OG" for "opbouw Gent", "Pr" for a one-word title. */
function mark(title: string): string {
  const words = title.trim().split(/\s+/)
  return words.length > 1 ? (words[0][0] + words[1][0]).toLocaleUpperCase() : words[0].slice(0, 2)
}

/** The card line naming a record of a toned dataset, and each such record's tone. */
type Toned = { column: string; tones: Map<number, Tone> }

function Card({ row, file, columns, toned, selected, onOpen }: { row: Row; file?: Files[number]; columns: Column[]; toned?: Toned; selected: boolean; onOpen: () => void }) {
  const kind = columns.find((c) => c.kind === 'select' && c.tones)
  const when = whenOf(row, columns.filter((c) => c.kind === 'date' || c.kind === 'datetime'))
  const of = columns.find((c) => c.kind === 'relation' && c.text(row) !== '')
  const ofTone = of && of.id === toned?.column ? toned.tones.get(Number(firstId(of.value(row)))) : undefined
  const tone = { '--s': toneColor(kind?.tones?.[String(kind.value(row) ?? '')]) } as CSSProperties
  return (
    <button type="button" className={selected ? 'nv-gallery__card nv-gallery__card--open' : 'nv-gallery__card'} aria-current={selected || undefined} onClick={onOpen}>
      <span className="nv-gallery__pic">
        {file?.mime.startsWith('image/') ? <img src={fileUrl(file.id)} alt={row.title} loading="lazy" />
          : <span className="nv-gallery__blank" style={tone} aria-hidden="true"><span className="nv-gallery__mark">{mark(row.title)}</span></span>}
      </span>
      <span className="nv-gallery__meta">
        <b className="nv-gallery__title">{row.title}</b>
        {(when.day || when.from) && (
          <span className="nv-gallery__line nv-gallery__when">
            {when.day}
            {when.from && <span className="nv-time">{when.from}{when.to && <span className="nv-time__end">–{when.to}</span>}</span>}
          </span>
        )}
        {(kind?.text(row) || of) && (
          <span className="nv-gallery__line">
            {kind?.text(row) && <Display column={kind} row={row} onToggle={noToggle} />}
            {of && <span className="nv-gallery__of">{ofTone && <i className="nv-gallery__tone" style={{ '--c': toneColor(ofTone) } as CSSProperties} aria-hidden="true" />}{of.text(row)}</span>}
          </span>
        )}
      </span>
    </button>
  )
}

interface Section {
  key: string
  /** The head's word: a day's name or an option; null for the one section of an ungrouped gallery. */
  label: string | null
  sub?: string
  rows: Row[]
}

/** The gallery's sections by Groep: days in order ("Dinsdag", "13 okt"), options as declared, "Geen" last; one unnamed section without a group. */
export function sectionsOf(rows: Row[], field: Field | undefined, key: string | null): Section[] {
  if (!key || !field) return [{ key: '', label: null, rows }]
  const valueOf = (row: Row) => {
    const value = row.fields[key]
    return typeof value === 'string' ? (field.type === 'date' || field.type === 'datetime' ? value.slice(0, 10) : value) : ''
  }
  const keys = [...new Set(rows.map(valueOf))]
  const order = field.options ? Object.keys(field.options) : [...keys].sort()
  const sorted = [...order.filter((k) => keys.includes(k)), ...keys.filter((k) => !order.includes(k) && k !== '').sort(), ...(keys.includes('') ? [''] : [])]
  return sorted.map((k) => {
    const day = k !== '' && (field.type === 'date' || field.type === 'datetime') ? dayLabel(k).split(' ') : null
    return {
      key: k,
      label: k === '' ? t('noLane') : day ? day[0] : (field.options?.[k] ?? k),
      ...(day ? { sub: day.slice(1).join(' ') } : {}),
      rows: rows.filter((row) => valueOf(row) === k),
    }
  })
}

/** A card per row with its newest image of the gallery's kind, read 200 rows a request; a click opens the row. */
export function Gallery({ view, model, models, rows, kind, layout, size = 'M', onShown }: {
  view: View; model: Model; models: Record<string, Model>; rows: Row[]; kind: string
  /** Which facts a card shows, and in what order (Kolommen). */
  layout: Layout
  /** S M L: a card's least width. */
  size?: Size
  /** What the title line says it shows: the cards and how many have a picture. */
  onShown?: (shown: Shown) => void
}) {
  const [openRow, drawer, open] = useOpenRow(model, view, models, rows, layout)
  const [files, setFiles] = useState<Files>({})
  const all = useMemo(() => columnsFor(model, view, false, models), [model, view, models])
  const columns = useMemo(() => factsOf(all, layout), [all, layout])
  // The first line naming a record of a toned dataset carries that record's tone, as the board card's does.
  const line = columns.find((c) => c.kind === 'relation' && models[c.relation?.model ?? '']?.tone)
  const tones = useTones(models, line?.relation?.model)
  const toned = useMemo(() => (line && tones ? { column: line.id, tones } : undefined), [line, tones])
  const ids = rows.map((row) => row.id)
  useEffect(() => {
    let live = true
    setFiles({})
    for (const batch of batchesOf(ids))
      filesOf(view.model, batch, kind).then((found) => live && setFiles((was) => ({ ...was, ...found })), () => undefined)
    return () => {
      live = false
    }
  }, [view.model, kind, ids.join(',')])
  const pictures = rows.filter((row) => files[row.id]?.mime.startsWith('image/')).length
  useEffect(() => onShown?.({ rows: rows.length, groups: null, cut: false, pictures, menu: all }), [rows.length, pictures, all])
  return (
    <div className="nv-frame">
      <div className="nv-body">
        <div className="nv-gallery" style={{ '--min': `${SIZE_PX[size]}px` } as CSSProperties}>
          {sectionsOf(rows, layout.group ? model.fields[layout.group] : undefined, layout.group).map((section) => (
            <section key={section.key} className="nv-gallery__group" aria-label={section.label ?? view.label}>
              {section.label !== null && (
                <div className="nv-gallery__head">
                  <b>{section.label}</b>{section.sub && <span>{section.sub}</span>}<span className="nv-gallery__n">{section.rows.length}</span>
                </div>
              )}
              <div className="nv-gallery__grid">
                {section.rows.map((row) => <Card key={row.id} row={row} file={files[row.id]} columns={columns} toned={toned} selected={open?.id === row.id} onOpen={() => openRow(row)} />)}
              </div>
            </section>
          ))}
        </div>
        {drawer}
      </div>
    </div>
  )
}
