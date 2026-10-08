import { locale, t } from '../../i18n'
import { BoolCell } from './Bool'
import { DateCell, DateEditor, DateTimeEditor } from './Date'
import { LinksCell, LinksEditor } from './Links'
import { NumberCell, NumberEditor } from './Number'
import type { CellProps, EditorProps } from './props'
import { RelationCell, RelationEditor } from './Relation'
import { SelectCell, SelectEditor } from './Select'
import { InputEditor, LongTextEditor, TextCell } from './Text'
import { TimeCell, TimeEditor } from './Time'

export function Display(props: CellProps & { onToggle: () => void }) {
  const via = props.column.via?.(props.row)
  if (!via) return <Value {...props} />
  return (
    <span className="nv-inherited">
      <Value {...props} />
      <span className="nv-via">{t('via')} {via.toLocaleLowerCase(locale())}</span>
    </span>
  )
}

function Value({ column, row, onToggle }: CellProps & { onToggle: () => void }) {
  switch (column.kind) {
    case 'select':
      return <SelectCell column={column} row={row} />
    case 'date':
    case 'datetime':
      return <DateCell column={column} row={row} />
    case 'time':
      return <TimeCell column={column} row={row} />
    case 'relation':
      return <RelationCell column={column} row={row} />
    case 'links':
      return <LinksCell column={column} row={row} />
    case 'bool':
      return <BoolCell column={column} row={row} onToggle={onToggle} />
    case 'number':
    case 'rollup':
      return <NumberCell column={column} row={row} />
    default:
      return <TextCell column={column} row={row} />
  }
}

export function Editor(props: EditorProps) {
  switch (props.column.kind) {
    case 'select':
      return <SelectEditor {...props} />
    case 'date':
      return <DateEditor {...props} />
    case 'datetime':
      return <DateTimeEditor {...props} />
    case 'time':
      return <TimeEditor {...props} />
    case 'number':
      return <NumberEditor {...props} />
    case 'longtext':
      return <LongTextEditor {...props} />
    case 'relation':
      return <RelationEditor {...props} />
    case 'links':
      return <LinksEditor {...props} />
    default:
      return <InputEditor {...props} />
  }
}
