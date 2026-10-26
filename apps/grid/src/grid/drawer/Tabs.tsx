import { Ellipsis } from 'lucide-react'
import { type RefObject, useLayoutEffect, useRef, useState } from 'react'
import type { Key } from 'react-aria-components'
import { Button, Menu, MenuItem, MenuTrigger, Popover, ToggleButton, ToggleButtonGroup, Toolbar, Tooltip, TooltipTrigger } from 'react-aria-components'
import { t } from '../../i18n'
import type { Pane } from './panes'
import './tabs.css'

const MOST = 3
/** The head's title keeps at least this much room; below it, an icon moves into `…`. */
const TITLE_ROOM = 96
const ICON = 30

const only = (keys: Set<Key> | 'all', onChange: (key: string) => void) => {
  const [key] = keys === 'all' ? [] : [...keys]
  if (key !== undefined) onChange(String(key))
}

/** How many icons the head line has room for: one fewer while the title beside it is squeezed, one more once it has room to spare. */
function useRoom(bar: RefObject<HTMLDivElement | null>): number {
  const [room, setRoom] = useState(MOST)
  useLayoutEffect(() => {
    const title = bar.current?.closest('header')?.querySelector<HTMLElement>('.nv-dw-title')
    if (!title) return
    // Only the observer measures: a page without layout (a test) keeps every icon.
    const watch = new ResizeObserver(() => {
      const width = title.getBoundingClientRect().width
      setRoom((was) => (width < TITLE_ROOM ? Math.max(0, was - 1) : width >= TITLE_ROOM + ICON ? Math.min(MOST, was + 1) : was))
    })
    watch.observe(title)
    return () => watch.disconnect()
  }, [bar])
  return room
}

/**
 * The drawer's panes as icons in its head line: three at most, fewer where the line is narrow, the rest behind `…`.
 * A radio group, not a tab list: a pane chosen from `…` is a selection no icon holds, which a tab list cannot carry.
 */
export function DrawerTabs({ panes, current, onChange }: { panes: Pane[]; current: string; onChange: (key: string) => void }) {
  const bar = useRef<HTMLDivElement>(null)
  const room = useRoom(bar)
  const shown = panes.slice(0, room)
  const rest = panes.slice(room)
  return (
    <Toolbar ref={bar} className="nv-dw-tabs" aria-label={t('tabBar')}>
      {shown.length > 0 && (
        <ToggleButtonGroup className="nv-dw-tabs__group" selectionMode="single" disallowEmptySelection selectedKeys={[current]} onSelectionChange={(keys) => only(keys, onChange)}>
          {shown.map(({ key, label, icon: Icon }) => (
            <TooltipTrigger key={key} delay={400}>
              <ToggleButton id={key} className="nv-dw-tab" aria-label={label}><Icon size={15} aria-hidden="true" /></ToggleButton>
              <Tooltip className="nv-dw-tip" placement="bottom" offset={6}>{label}</Tooltip>
            </TooltipTrigger>
          ))}
        </ToggleButtonGroup>
      )}
      {rest.length > 0 && (
        <MenuTrigger>
          <Button className="nv-drawer__tool nv-dw-tabs__more" aria-label={t('tabMore')} data-current={rest.some((pane) => pane.key === current) || undefined}>
            <Ellipsis size={15} aria-hidden="true" />
          </Button>
          <Popover className="nv-menu__layer" placement="bottom end" offset={4}>
            <Menu className="nv-menu__list" aria-label={t('tabMore')} selectionMode="single" disallowEmptySelection selectedKeys={[current]} onSelectionChange={(keys) => only(keys, onChange)}>
              {rest.map(({ key, label, icon: Icon }) => (
                <MenuItem key={key} id={key} className="nv-menu__item nv-dw-tabs__item" textValue={label}>
                  <Icon size={14} aria-hidden="true" />{label}
                </MenuItem>
              ))}
            </Menu>
          </Popover>
        </MenuTrigger>
      )}
    </Toolbar>
  )
}
