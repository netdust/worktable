import { Ellipsis } from 'lucide-react'
import { type RefObject, useLayoutEffect, useRef, useState } from 'react'
import type { Key } from 'react-aria-components'
import { Button, Menu, MenuItem, MenuTrigger, Popover, ToggleButton, ToggleButtonGroup, Toolbar, Tooltip, TooltipTrigger } from 'react-aria-components'
import { t } from '../../i18n'
import type { Pane } from './panes'
import './tabs.css'

const MOST = 3
/** The head's title keeps at least this much room; the icons get what is left, then `…`. */
const TITLE_ROOM = 96
/** The bar's own widths, as tabs.css draws them: an icon, the lines between and around them, `…` after its gap, the bar's margins. */
const TAB = 28
const MORE = 2 + 24
const MARGINS = 8

const only = (keys: Set<Key> | 'all', onChange: (key: string) => void) => {
  const [key] = keys === 'all' ? [] : [...keys]
  if (key !== undefined) onChange(String(key))
}

/** The most icons, up to three, that fit in `slack` px beside `…` whenever a pane is left over for it. */
export function iconsFor(slack: number, panes: number): number {
  for (let n = Math.min(MOST, panes); n > 0; n--) {
    const group = n * TAB + (n - 1) + 2
    if (group + (n < panes ? MORE : 0) <= slack) return n
  }
  return 0
}

/** What the head line leaves the bar: its width less its padding, the title's room and every other button with its gap. */
function slackOf(head: HTMLElement, bar: HTMLElement, title: HTMLElement): number {
  const style = getComputedStyle(head)
  const gap = Number.parseFloat(style.columnGap) || 0
  const others = [...head.children].filter((el) => el !== bar && el !== title)
  const taken = others.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) + gap * (head.children.length - 1)
  const padding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
  return head.clientWidth - padding - taken - TITLE_ROOM - MARGINS
}

/** How many icons the head line has room for, measured before paint and again whenever the line or its title changes size. */
function useRoom(bar: RefObject<HTMLDivElement | null>, panes: number): number {
  const [room, setRoom] = useState(MOST)
  useLayoutEffect(() => {
    const head = bar.current?.closest('header')
    const title = head?.querySelector<HTMLElement>('.nv-dw-title')
    if (!head || !title || !bar.current) return
    const own = bar.current
    // A page without layout (a test) measures nothing and keeps every icon.
    const measure = () => head.clientWidth > 0 && setRoom(iconsFor(slackOf(head, own, title), panes))
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(head)
    watch.observe(title)
    return () => watch.disconnect()
  }, [bar, panes])
  return room
}

/**
 * The drawer's panes as icons in its head line: three at most, fewer where the line is narrow, the rest behind `…`.
 * A radio group, not a tab list: a pane chosen from `…` is a selection no icon holds, which a tab list cannot carry.
 */
export function DrawerTabs({ panes, current, onChange }: { panes: Pane[]; current: string; onChange: (key: string) => void }) {
  const bar = useRef<HTMLDivElement>(null)
  const room = useRoom(bar, panes.length)
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
