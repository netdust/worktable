import { X } from 'lucide-react'
import { Button } from 'react-aria-components'
import { type ChangeEvent, type ReactNode, useEffect, useId, useState } from 'react'
import { type Attachment, attachmentsOf, fileUrl, recordLink as readLink, removeAttachment, rotateRecordLink, uploadAttachment } from '../api'
import { errorText, fileSize, type StringKey, t } from '../i18n'
import type { Account, ApiError, Model, ModelAction, Row } from '../types'
import { Pick } from '../ui/Pick'
import { SidePanel } from '../ui/SidePanel'
import type { Column } from './columns'
import { RelationPicker } from './cells/RelationPicker'

/** Runs a declared action on the open record, with the records its inputs picked. */
export type RunAction = (action: ModelAction, input: Record<string, number>) => Promise<void>

interface Props {
  row: Row
  /** Every column the model has, not only the view's: the drawer is where the long ones are read. */
  columns: Column[]
  onClose: () => void
  /** What edits the record, under its fields. */
  editor?: ReactNode
  /** The model's declared actions, each a button with a picker per input. */
  actions?: ModelAction[]
  onAction?: RunAction
  /** False leaves focus where it was: the matrix keeps typing in its cell. */
  focusOnOpen?: boolean
  /** The dataset whose record link the drawer copies and renews; an administrator's. */
  recordLink?: string
  /** The record's dataset and the files it takes; none on a model without attachments, or a draft. */
  attachments?: Attachable
  /** An upload or delete into the undo history. */
  onBatch?: (batch: string) => void
}

/** `version` moves when the files changed elsewhere, such as by an undo: the list reads again. */
export type Attachable = NonNullable<Model['attachments']> & { dataset: string; version?: string }

/** The dataset an administrator copies a record's link of, on one that declares record_link. */
export function linkedDataset(role: Account['role'], model: Model): string | undefined {
  return role === 'administrator' && model.record_link ? model.key : undefined
}

/** One record read whole, beside the sheet — not a modal: the grid stays live. */
export function Drawer({ row, columns, onClose, editor, actions = [], onAction, focusOnOpen = true, recordLink, attachments, onBatch = () => undefined }: Props) {
  return (
    <SidePanel label={row.title} focusKey={row.id} onClose={onClose} focusOnOpen={focusOnOpen}>
      {columns.length > 0 && <dl className="nv-drawer__fields">
        {columns.filter((column) => column.id !== 'title').map((column) => (
          <div key={column.id} className="nv-drawer__field">
            <dt>{column.label}</dt>
            <dd>{column.text(row) || t('empty')}</dd>
          </div>
        ))}
      </dl>}
      {recordLink && <RecordLink key={`${recordLink}:${row.id}`} dataset={recordLink} id={row.id} />}
      {attachments && <Attachments key={`${attachments.dataset}:${row.id}`} files={attachments} id={row.id} onBatch={onBatch} />}
      {onAction && actions.map((action) => <Action key={`${row.id}:${action.name}`} action={action} onRun={(input) => onAction(action, input)} />)}
      {editor && <div className="nv-drawer__editor">{editor}</div>}
    </SidePanel>
  )
}

/** Copies the record's link for its person, or a new one that stops the old. */
function RecordLink({ dataset, id }: { dataset: string; id: number }) {
  const [said, setSaid] = useState('')
  const copy = (read: Promise<string>, done: string) => {
    read.then((link) => navigator.clipboard.writeText(link)).then(
      () => setSaid(done),
      () => setSaid(t('recordLinkFailed')),
    )
  }
  return (
    <div className="nv-action" role="group" aria-label={t('copyLink')}>
      <Button className="nv-button nv-button--secondary nv-button--sm" onPress={() => copy(readLink(dataset, id), t('linkCopied'))}>{t('copyLink')}</Button>
      <Button className="nv-button nv-button--secondary nv-button--sm" onPress={() => copy(rotateRecordLink(dataset, id), t('recordLinkRotated'))}>{t('recordLinkNew')}</Button>
      <p className="nv-action__said" role="status">{said}</p>
    </div>
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

type Sending = { status: 'idle' } | { status: 'sent' } | { status: 'refused'; message: string }

/** Keyed by its record, so another row starts with nothing picked. */
function Action({ action, onRun }: { action: ModelAction; onRun: (input: Record<string, number>) => Promise<void> }) {
  const inputs = Object.entries(action.input)
  const [picked, setPicked] = useState<Record<string, Row>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [sending, setSending] = useState<Sending>({ status: 'idle' })
  const ready = inputs.every(([key]) => picked[key])

  const run = () => {
    setSending({ status: 'sent' })
    onRun(Object.fromEntries(inputs.map(([key]) => [key, picked[key].id]))).then(
      () => setSending({ status: 'idle' }),
      (error: ApiError) => setSending({ status: 'refused', message: errorText(error.code, error.message) }),
    )
  }

  return (
    <div className="nv-action" role="group" aria-label={action.label}>
      {inputs.map(([key, input]) => (
        <div key={key} className="nv-action__input">
          <Button className="nv-button nv-button--secondary nv-button--sm" onPress={() => setOpen(key)}>{`${input.label}: ${picked[key]?.title ?? t('empty')}`}</Button>
          {open === key && (
            <RelationPicker model={input.relation} label={input.label} onCancel={() => setOpen(null)}
              onPick={(record) => {
                setPicked((was) => ({ ...was, [key]: record }))
                setOpen(null)
              }} />
          )}
        </div>
      ))}
      <Button className="nv-button nv-button--primary nv-button--sm" isDisabled={!ready || sending.status === 'sent'} onPress={run}>{action.label}</Button>
      {sending.status === 'refused' && <p className="nv-action__refused" role="alert">{sending.message}</p>}
    </div>
  )
}
