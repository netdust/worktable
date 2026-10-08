import { useRef } from 'react'
import { TimeField } from 'react-aria-components'
import { drafts, opening, SegmentShell, Segments } from './Date'
import { fromTime, toTime } from './dates'
import type { CellProps, EditorProps } from './props'

export function TimeCell({ column, row }: CellProps) {
  return <span className="nv-cell__tabular">{column.text(row)}</span>
}

export function TimeEditor(props: EditorProps) {
  const root = useRef<HTMLDivElement>(null)
  const shown = opening(props, toTime)
  const change = drafts(props, fromTime)

  return (
    <SegmentShell props={props} shown={shown} root={root}>
      <TimeField aria-label={props.column.label} value={toTime(shown)} onChange={change} hourCycle={24} shouldForceLeadingZeros>
        <Segments />
      </TimeField>
    </SegmentShell>
  )
}
