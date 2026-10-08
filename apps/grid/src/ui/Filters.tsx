import { Popover } from '@sakaniui/react'
import { ListFilter, X } from 'lucide-react'
import { t } from '../i18n'
import type { FilterField } from '../grid/filter'
import type { Filter } from '../grid/layout'

interface Props {
  fields: FilterField[]
  active: Filter[]
  onChange: (field: string, value: string | null) => void
}

/** The layout's filters as chips: a chip per filter with its × and `+ Filter` for the next one. */
export function Filters({ fields, active, onChange }: Props) {
  const label = (field: string) => fields.find((f) => f.field === field)
  const free = fields.filter((f) => f.options.length > 0 && !active.some((a) => a.field === f.field))

  return (
    <div className="nv-filters">
      {active.map((filter) => {
        const field = label(filter.field)
        const name = field?.label ?? filter.field
        return (
          <span key={filter.field} className="nv-chip nv-chip--set nv-chip--filter">
            {name} <b>{field?.options.find(([value]) => value === filter.value)?.[1] ?? filter.value}</b>
            <button type="button" className="nv-chip__remove" aria-label={t('removeFilter', { field: name })} title={t('removeFilter', { field: name })} onClick={() => onChange(filter.field, null)}>
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        )
      })}
      {free.length > 0 && (
        <Popover trigger={<button type="button" className="nv-chip nv-chip--add"><ListFilter size={13} aria-hidden="true" />{t('addFilter')}</button>} placement="bottom-start">
          <div className="nv-filters__menu">
            {free.map((field) => (
              <div key={field.field} className="nv-filters__field" role="group" aria-label={field.label}>
                <span className="nv-filters__label">{field.label}</span>
                {field.options.map(([value, text]) => (
                  <button key={value} type="button" className="nv-filters__option" aria-label={`${field.label}: ${text}`}
                    onClick={() => onChange(field.field, value)}>
                    {text}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Popover>
      )}
    </div>
  )
}
