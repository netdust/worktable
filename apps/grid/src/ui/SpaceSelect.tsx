import { ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'
import { RelationPicker } from '../grid/cells/RelationPicker'
import { t } from '../i18n'
import type { Row } from '../types'

interface Props {
  /** The space model's word. */
  label: string
  model: string
  selected: Row | null
  onSelect: (id: number) => void
}

/** The rail's top: the record being worked in, as its heading, and the picker that changes it. */
export function SpaceSelect({ label, model, selected, onSelect }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="nv-space">
      <p className="nv-rail__label">{label}</p>
      <h2 className="nv-space__name">
        <button type="button" className="nv-space__button" aria-haspopup="listbox" aria-expanded={open}
          onMouseDown={(event) => open && event.preventDefault()} onClick={() => setOpen(!open)}>
          <span className="nv-space__dot" aria-hidden="true" />
          {selected?.title ?? t('chooseSpace')}
          <ChevronsUpDown size={14} aria-hidden="true" />
        </button>
      </h2>
      {open && (
        <RelationPicker
          model={model}
          label={label}
          onPick={(row) => {
            onSelect(row.id)
            setOpen(false)
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  )
}
