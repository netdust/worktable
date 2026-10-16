import { AlertTriangle } from 'lucide-react'
import type { Flag } from './useFlags'
import './flags.css'

/** A flagged record's mark, as the prototypes' alert badge: the icon and its worst flag's word, the flags' texts as its title; `bare`, the icon alone. */
export function FlagMark({ flags, bare = false }: { flags: Flag[]; bare?: boolean }) {
  const worst = flags.find((flag) => flag.tone === 'bad') ?? flags[0]
  if (!worst) return null
  const text = flags.map((flag) => flag.text).join('\n')
  return (
    <span className={['nv-flag', worst.tone === 'bad' ? '' : 'nv-flag--warn', bare ? 'nv-flag--icon' : ''].filter(Boolean).join(' ')} title={text}
      {...(bare ? { role: 'img', 'aria-label': `${worst.label}: ${text}` } : {})}>
      <AlertTriangle size={13} strokeWidth={1.9} aria-hidden="true" />{!bare && worst.label}
    </span>
  )
}
