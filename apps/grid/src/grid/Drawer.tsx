import { ChevronDown, ChevronUp, Link2, LoaderCircle, type LucideIcon, X } from 'lucide-react'
import { Button } from 'react-aria-components'
import { type ChangeEvent, type CSSProperties, Fragment, type KeyboardEvent, type ReactNode, useContext, useEffect, useId, useRef, useState } from 'react'
import { type Attachment, attachmentsOf, fileUrl, removeAttachment, uploadAttachment } from '../api'
import { errorText, fileSize, locale, type StringKey, t } from '../i18n'
import type { Account, ApiError, Model, ModelAction, Row, View } from '../types'
import { iconNamed } from '../ui/icons'
import { toneColor } from '../ui/tone'
import { useTones } from '../ui/useTones'
import { whenOf } from '../ui/when'
import type { Flag, Flags } from '../ui/useFlags'
import { Alert, type AlertAction } from './drawer/Alert'
import { SchemaContext } from './drawer/context'
import { choosableOf, dayLabel, inboundOf, kindOf, linkedOf, type Prop, propsOf } from './drawer/derive'
import { type Chooser, HistorySection, InboundSection, LinkSection, LongSection, type WriteField, type WriteLink } from './drawer/Sections'
import type { Layout } from './layout'
import { Pick } from '../ui/Pick'
import { SidePanel } from '../ui/SidePanel'
import { type Column, firstId, linksOf } from './columns'
import { Display } from './cells'
import { ToneMark } from './cells/Select'
import { toneOf } from './cells/tones'
import { ICON } from './GridHeader'
import { ActionRow } from './ActionRow'
import { DrawerTools } from './DrawerTools'
import { HeadActions } from './HeadActions'
import { OpenLink } from './OpenLink'
import { useLive } from './useLive'

/** Runs a declared action on the open record, with the records its inputs picked. */
export type RunAction = (action: ModelAction, input: Record<string, unknown>) => Promise<unknown>

interface Props {
  row: Row
  /** Every column the model has, not only the view's: the drawer is where the long ones are read. */
  columns: Column[]
  onClose: () => void
  /** What edits the record, under its fields. */
  editor?: ReactNode
  /** Deletes the record: Verwijderen in the head's menu, asked twice. */
  onDelete?: () => Promise<void>
  /** Says something short, as a toast: the record link was copied. */
  onSaid?: (message: string) => void
  /** Writes a long text edited in its block; without it, the drawer reads only. */
  onWrite?: WriteField
  /** Writes who holds a place of one of the record's links, in the link's own dataset; without it no place is chosen again. */
  onLink?: WriteLink
  /** The model's declared actions, each a button with a picker per input. */
  actions?: ModelAction[]
  onAction?: RunAction
  /** Re-reads the record: a drawer given it shows the buttons the server marked, on the record and on its link items. */
  onDone?: () => Promise<Row | null>
  /** False leaves focus where it was: the matrix keeps typing in its cell. */
  focusOnOpen?: boolean
  /** The dataset whose record link the drawer copies and renews; an administrator's. */
  recordLink?: string
  /** The record's dataset and the files it takes; none on a model without attachments, or a draft. */
  attachments?: Attachable
  /** An upload or delete into the undo history. */
  onBatch?: (batch: string) => void
  /** The row's model: its kind, its relations, the rows that point at it. */
  model?: Model
  /** The view it opened from, and that view's layout: which fields it lists. */
  view?: View
  layout?: Layout | null
  /** The view's rows in their order: "3 van 12", and ↑ ↓ to the row before or after. */
  nav?: { ids: number[]; onStep: (id: number) => void }
  /** The flags the view's skin read: the record's own show as bands, its people's on their names. */
  flags?: Flags | null
  /** A record drawn from elsewhere (a matrix cell): its own subline, alert, field lines and sections, in the drawer's places. */
  sub?: ReactNode
  alert?: ReactNode
  lines?: ReactNode
  sections?: ReactNode
}

/** `version` moves when the files changed elsewhere, such as by an undo: the list reads again. */
export type Attachable = NonNullable<Model['attachments']> & { dataset: string; version?: string }

/** The dataset an administrator copies a record's link of, on one that declares record_link. */
export function linkedDataset(role: Account['role'], model: Model): string | undefined {
  return role === 'administrator' && model.record_link ? model.key : undefined
}

/** Each band's key: its flag's text and marks, so Negeren keeps hiding that flag when a re-read lists the flags in another order. */
function bandKeys(flags: Flag[]): string[] {
  const seen = new Map<string, number>()
  return flags.map((flag) => {
    const key = `${flag.text}|${Object.entries(flag.marks).sort().join()}`
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    return `${key}|${n}`
  })
}

/** The drawer reads; a checkbox's toggle is the sheet's. */
const noToggle = () => undefined

/** The row before or after in the view, where there is one. */
function stepIn(nav: Props['nav'], row: Row, by: 1 | -1): void {
  const at = nav ? nav.ids.indexOf(row.id) : -1
  const next = nav?.ids[at + by]
  if (nav && at >= 0 && next !== undefined) nav.onStep(next)
}

/** ↑ ↓ and j k anywhere in the head line step through the view's rows. */
const headKey = (nav: Props['nav'], row: Row) => (event: KeyboardEvent<HTMLElement>) => {
  const by = event.key === 'ArrowUp' || event.key === 'k' ? -1 : event.key === 'ArrowDown' || event.key === 'j' ? 1 : 0
  if (!by || !nav) return
  event.preventDefault()
  stepIn(nav, row, by)
}

/** The head line: what kind of record this is · its dataset; where it is in the view; the steps to its neighbours. */
function Head({ row, model, nav, busy, icon: Icon }: { row: Row; model?: Model; nav?: Props['nav']; busy?: boolean; icon?: LucideIcon }) {
  const kind = model ? kindOf(model) : null
  const value = kind ? String(row.fields[kind] ?? '') : ''
  const option = kind && model?.fields[kind]?.options?.[value]
  const at = nav ? nav.ids.indexOf(row.id) : -1
  const step = (by: 1 | -1) => stepIn(nav, row, by)
  return (
    <div className="nv-dw-head">
      <span className="nv-dw-head__kind">
        {!option && Icon && <Icon size={13} aria-hidden="true" />}
        {option && <ToneMark tone={toneOf(value, model?.fields[kind as string]?.tones)} text={option} />}
        {option && model && ' · '}
        {model?.label}
      </span>
      {busy && <span className="nv-dw-head__busy" role="status"><LoaderCircle className="nv-run__spin" size={13} aria-hidden="true" />{t('liveBusy')}</span>}
      {nav && <span className="nv-dw-head__pos">{at >= 0 ? t('position', { n: at + 1, m: nav.ids.length }) : '–'}</span>}
      {nav && (
        <>
          <Button className="nv-drawer__tool" aria-label={t('previous')} isDisabled={at <= 0} onPress={() => step(-1)}><ChevronUp size={15} aria-hidden="true" /></Button>
          <Button className="nv-drawer__tool" aria-label={t('next')} isDisabled={at < 0 || at >= nav.ids.length - 1} onPress={() => step(1)}><ChevronDown size={15} aria-hidden="true" /></Button>
        </>
      )}
    </div>
  )
}

/** A field's value as the drawer writes it: a day in mono, a start and end as one span, an inherited value with its source. */
function Value({ prop, row }: { prop: Prop; row: Row }) {
  if (prop.span) {
    const { from, to } = whenOf(row, [prop.span.start, ...(prop.span.end ? [prop.span.end] : [])])
    return from ? <span className="nv-time">{from}{to && <span className="nv-time__end">–{to}</span>}</span> : <span className="nv-muted">{t('noTime')}</span>
  }
  const value = String(prop.column.value(row) ?? '')
  if (prop.column.kind === 'date' && !prop.column.via?.(row)) return <span className="nv-mono">{dayLabel(value, locale())}</span>
  return <Display column={prop.column} row={row} onToggle={noToggle} />
}

/** One field line: its icon and label, its value; the drawer's and a matrix cell's alike. */
export function Line({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="nv-drawer__field">
      <dt><Icon className="nv-drawer__icon" size={14} aria-hidden="true" />{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Props({ props, row }: { props: Prop[]; row: Row }) {
  return (
    <dl className="nv-drawer__fields">
      {props.map((prop) => {
        const Icon = ICON[prop.span ? 'time' : prop.column.kind]
        return (
          <div key={prop.column.id} className="nv-drawer__field">
            <dt><Icon className="nv-drawer__icon" size={14} aria-hidden="true" />{prop.span ? t('time') : prop.column.label}</dt>
            <dd>{prop.empty ? t('empty') : <Value prop={prop} row={row} />}</dd>
          </div>
        )
      })}
    </dl>
  )
}

/** One record read whole, beside the sheet — not a modal: the grid stays live. As the prototypes draw it: head, title, its relations, fields, sections. */
export function Drawer({ row, columns, onClose, editor, onDelete, onSaid, onWrite, onLink, actions = [], onAction, onDone, focusOnOpen = true, recordLink, attachments, onBatch = () => undefined, model, view, layout, nav, flags = null, sub: ownSub, alert, lines, sections }: Props) {
  const schema = useContext(SchemaContext)
  const [more, setMore] = useState(false)
  const { busy } = useLive(onDone ? model : undefined, row, onDone ?? (() => Promise.resolve(null)))
  // The start and end pair the table declares for a calendar, whichever view the drawer opened from.
  const cal = view?.calendar ?? (model ? schema?.tables.find((table) => table.model === model.key && table.calendar)?.calendar : undefined)
  const dateField = view?.date_field ?? schema?.tables.find((table) => table.model === model?.key)?.date_field ?? null
  const { shown, folded } = propsOf(columns, row, cal, layout, dateField)
  const space = schema?.space && model && schema.space.model !== model.key ? columns.find((c) => c.id === schema.space?.field) : undefined
  const sub = [space, columns.find((c) => c.kind === 'relation' && c !== space && c.text(row) !== '')].filter((c): c is Column => Boolean(c) && (c as Column).text(row) !== '')
  const tones = useTones(schema?.models ?? {}, space && !ownSub ? schema?.space?.model : undefined)
  const spaceTone = space && tones?.get(Number(firstId(space.value(row))))
  const links = linkedOf(columns, model)
  const longs = columns.filter((c) => c.kind === 'longtext')
  const inbound = model && schema && row.id > 0 ? inboundOf(schema, model.key) : []
  const raised = model && flags && row.id > 0 ? flags.marksOf(model.key, row.id) : []
  const bands = bandKeys(raised)
  // The band asks the link section to choose for the place its flag marks: the choosing is the section's.
  const choosers = useRef<Record<string, Chooser | null>>({})
  const chooseOther = (flag: Flag): AlertAction[] => {
    const at = onLink ? choosableOf(flag, row, links, schema) : null
    return at ? [{ label: t('chooseOther'), run: () => choosers.current[at.key]?.choose(at.place) }] : []
  }
  const actionRow = <ActionRow key={`actions:${row.id}`} model={model?.key} row={row} onDone={onDone} actions={actions} onAction={onAction} onSaid={onSaid} />
  return (
    <SidePanel label={row.title} focusKey={row.id} onClose={onClose} focusOnOpen={focusOnOpen} expandable onHeadKey={headKey(nav, row)}
      tools={<><OpenLink row={row} model={model} /><HeadActions key={`head-${row.id}`} row={row} model={model} actions={actions} onAction={onAction} onSaid={onSaid} /><DrawerTools key={`tools-${row.id}`} row={row} recordLink={recordLink} onDelete={onDelete} onSaid={onSaid} /></>}
      head={<Head row={row} model={model} nav={nav} busy={busy} icon={iconNamed(schema?.tables.find((table) => table.model === model?.key)?.icon)} />}>
      <div className="nv-dw-body">
      <h2 className="nv-dw-title">{row.title || t('untitled')}</h2>
      {ownSub ? <p className="nv-dw-sub">{ownSub}</p> : sub.length > 0 && (
        <p className="nv-dw-sub">
          {sub.map((c) => <span key={c.id} className={c === space ? 'nv-dw-sub__space' : 'nv-dw-sub__of'}>{c === space ? <i aria-hidden="true" style={spaceTone ? ({ '--c': toneColor(spaceTone) } as CSSProperties) : undefined} /> : <Link2 size={13} aria-hidden="true" />}{c.text(row)}</span>)}
        </p>
      )}
      {alert ?? raised.map((flag, at) => <Alert key={`${row.id}:${bands[at]}`} title={flag.label} text={flag.text} warn={flag.tone !== 'bad'} actions={chooseOther(flag)} dismiss={t('dismiss')} />)}
      {lines && <dl className="nv-drawer__fields">{lines}</dl>}
      {shown.length > 0 && <Props props={shown} row={row} />}
      {folded.length > 0 && (more
        ? <><Props props={folded} row={row} /><button type="button" className="nv-dw-more" onClick={() => setMore(false)}>{t('fewerFields')}</button></>
        : <button type="button" className="nv-dw-more" onClick={() => setMore(true)}>{t('moreFields', { n: folded.length })}</button>)}
      {links.length === 0 && actionRow}
      {links.map(({ key, link, column }, at) => (
        <Fragment key={`${row.id}:${column.id}`}>
          <LinkSection ref={(chooser) => { choosers.current[key] = chooser }} label={column.label} link={link} items={linksOf(row, key)}
            schema={schema} id={row.id} flagsOf={flags ? (id) => flags.marksOf(link.dataset, id) : undefined} onLink={onLink} onDone={row.id > 0 ? onDone : undefined} />
          {at === 0 && actionRow}
        </Fragment>
      ))}
      {longs.map((c) => <LongSection key={`${row.id}:${c.id}`} column={c} row={row} onWrite={model?.fields[c.field ?? c.id]?.readonly ? undefined : onWrite} />)}
      {inbound.map((i) => <InboundSection key={`${i.model}:${i.field}`} inbound={i} id={row.id} schema={schema} />)}
      {sections}
      {model && !model.query && row.id > 0 && <HistorySection key={row.id} model={model} id={row.id} row={row} />}
      {attachments && <Attachments key={`${attachments.dataset}:${row.id}`} files={attachments} id={row.id} onBatch={onBatch} />}
      {editor && <div className="nv-drawer__editor">{editor}</div>}
      </div>
    </SidePanel>
  )
}

const ACCEPTED = 'application/pdf,image/jpeg,image/png,image/webp'

const FILE_REFUSALS: Record<string, StringKey> = {
  bad_file_type: 'attachmentType',
  bad_name: 'attachmentName',
  rate_limited: 'attachmentRateLimited',
  read_only: 'attachmentReadOnly',
  forbidden: 'attachmentForbidden',
  length_required: 'attachmentLength',
  unknown_attachment: 'attachmentGone',
  storage_full: 'attachmentStorageFull',
}

function fileRefusal(error: ApiError, maxMb: number): string {
  if (error.code === 'body_too_large') return errorText(error.code, t('attachmentTooLarge', { n: maxMb }))
  const own = FILE_REFUSALS[error.code]
  return errorText(error.code, own ? t(own) : error.message)
}

/** Keyed by its record: another row starts from its own list. */
function Attachments({ files: { dataset, kinds, max_mb, writable, version }, id, onBatch }: { files: Attachable; id: number; onBatch: NonNullable<Props['onBatch']> }) {
  const heading = useId()
  const [files, setFiles] = useState<Attachment[] | null>(null)
  const [kind, setKind] = useState(Object.keys(kinds)[0] ?? '')
  const [sending, setSending] = useState(false)
  const [refused, setRefused] = useState('')
  const said = (error: ApiError) => setRefused(fileRefusal(error, max_mb))
  // version is never read: its change is the signal to read again.
  useEffect(() => {
    attachmentsOf(dataset, id).then(setFiles, said)
  }, [dataset, id, version])

  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setRefused('')
    setSending(true)
    uploadAttachment(dataset, id, kind, file).then(
      ({ attachment, batch }) => {
        setFiles((was) => [...(was ?? []), attachment])
        onBatch(batch)
      },
      said,
    ).finally(() => setSending(false))
  }
  const remove = (file: Attachment) => {
    setRefused('')
    removeAttachment(file.id).then((batch) => {
      setFiles((was) => was?.filter((f) => f.id !== file.id) ?? null)
      onBatch(batch)
    }, said)
  }

  return (
    <section className="nv-files" aria-labelledby={heading}>
      <h3 id={heading} className="nv-files__title">{t('attachments')}</h3>
      {files?.length === 0 && <p className="nv-files__none">{t('attachmentsNone')}</p>}
      {files && files.length > 0 && (
        <ul className="nv-files__list">
          {files.map((file) => (
            <li key={file.id} className="nv-files__item">
              <span className="nv-files__kind">{kinds[file.kind] ?? file.kind}</span>
              <a className="nv-files__name" href={fileUrl(file.id)} target="_blank" rel="noreferrer">{file.name}</a>
              <span className="nv-files__size">{fileSize(file.size)}</span>
              {writable && <Button className="nv-files__remove" aria-label={t('removeItem', { name: file.name })} onPress={() => remove(file)}>
                <X size={14} aria-hidden="true" />
              </Button>}
            </li>
          ))}
        </ul>
      )}
      {writable && <div className="nv-files__add">
        <Pick label={t('attachmentKind')} value={kind} options={Object.entries(kinds).map(([value, label]) => ({ value, label }))} onChange={setKind} />
        <label className="nv-button nv-button--secondary nv-button--sm nv-files__choose" aria-disabled={sending || undefined}>
          <input type="file" className="nv-sr-only" accept={ACCEPTED} disabled={sending} onChange={upload} />
          {t('attachmentAdd')}
        </label>
      </div>}
      {refused && <p className="nv-action__refused" role="alert">{refused}</p>}
    </section>
  )
}
