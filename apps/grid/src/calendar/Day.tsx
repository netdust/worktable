import type { ReactElement } from 'react'
import { useState } from 'react'
import { Button, Dialog, DialogTrigger, Popover } from 'react-aria-components'
import { t } from '../i18n'
import type { Row } from '../types'
import { parse } from '../ui/Window'

const dayLong = (day: string) =>
  new Intl.DateTimeFormat(document.documentElement.lang || 'nl', { weekday: 'long', day: 'numeric', month: 'long' }).format(parse(day) ?? new Date())

/** A day's rows: what fits, then "+N meer" opening the whole day, where a row opens as it does in the day. */
export function Day<T>({ day, events, fit, line, onOpen }: {
  day: string; events: T[]; fit: number; line: (event: T, open: (row: Row) => void) => ReactElement; onOpen: (row: Row) => void
}) {
  const [all, setAll] = useState(false)
  if (events.length <= fit) return <>{events.map((e) => line(e, onOpen))}</>
  const shown = events.slice(0, fit - 1)
  const pick = (row: Row) => {
    setAll(false)
    onOpen(row)
  }
  return (
    <>
      {shown.map((e) => line(e, onOpen))}
      <DialogTrigger isOpen={all} onOpenChange={setAll}>
        <Button className="nv-cal__more">{t('calMore', { n: events.length - shown.length })}</Button>
        <Popover className="nv-bar__panel nv-cal__day" placement="bottom start" offset={4}>
          <Dialog className="nv-bar__dialog" aria-label={dayLong(day)}>
            <span className="nv-cal__dayhead">{dayLong(day)}</span>
            {events.map((e) => line(e, pick))}
          </Dialog>
        </Popover>
      </DialogTrigger>
    </>
  )
}

