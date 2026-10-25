import { ExternalLink } from 'lucide-react'
import { t } from '../i18n'
import type { Model, Row } from '../types'

const WEB_ADDRESS = /^https?:\/\/\S+$/i

/** The parsed address when it is an absolute http(s) one; the engine refuses the rest, and a fake schema must not get past this. */
function webAddress(value: unknown): URL | null {
  if (typeof value !== 'string' || !WEB_ADDRESS.test(value)) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** The record's web address in the drawer's head, opened in a new tab; nothing when no column holds a good one. */
export function OpenLink({ row, model }: { row: Row; model?: Model }) {
  const column = Object.entries(model?.fields ?? {}).find(([, field]) => field.href)?.[0]
  const url = row.id > 0 && column ? webAddress(row.fields[column]) : null
  if (!url) return null
  return (
    <a className="nv-more" href={url.href} title={String(row.fields[column as string])} target="_blank" rel="noopener noreferrer" aria-label={t('openLink')}>
      <ExternalLink size={16} aria-hidden="true" />
    </a>
  )
}
