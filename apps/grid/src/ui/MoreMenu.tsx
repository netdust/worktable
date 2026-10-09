import { Ellipsis, type LucideIcon } from 'lucide-react'
import { type RefObject, useContext, useRef } from 'react'
import { useInteractOutside } from 'react-aria'
import { Button, Menu, MenuItem, MenuTrigger, OverlayTriggerStateContext, Popover } from 'react-aria-components'
import { t } from '../i18n'
import { hint as titled } from './hint'

export interface Action {
  label: string
  run: () => void
  /** Why it is off: the item is disabled and says so under its label. */
  blocked?: string
}

type Placement = 'bottom-start' | 'bottom-end'

/**
 * The actions that do not fit beside the main one, behind ⋯: Escape closes and gives focus back to it.
 * `label` names the ⋯ where several sit side by side; `placement` turns the menu away from an edge;
 * `icon` and `menu` (the menu's name) make it another trigger, such as a `+`; `trigger` hands its button out.
 * The menu opens in a popover over the page, so no scrolling box it sits in clips it.
 */
export function MoreMenu({ actions, label = t('moreActions'), hint = label === t('moreActions') ? t('moreActionsShown') : label, placement = 'bottom-end', icon: Icon = Ellipsis, menu = t('moreActions'), trigger }: {
  actions: Action[]
  label?: string
  /** What hovering it says; the label stays the accessible name. */
  hint?: string
  placement?: Placement
  icon?: LucideIcon
  menu?: string
  trigger?: RefObject<HTMLButtonElement | null>
}) {
  return (
    <span className="nv-menu">
      <MenuTrigger>
        <Button ref={(element) => {
          titled(hint)(element)
          if (trigger) trigger.current = element
        }} className="nv-more" aria-label={label} aria-haspopup="menu">
          <Icon size={16} aria-hidden="true" />
        </Button>
        <Popover isNonModal className="nv-menu__layer" placement={placement === 'bottom-start' ? 'bottom start' : 'bottom end'} offset={4}>
          <Items actions={actions} label={menu} />
        </Popover>
      </MenuTrigger>
    </span>
  )
}

/** The popover is non-modal, so the page stays live: a press outside it, its own trigger too, closes it and still reaches its target. */
function Items({ actions, label }: { actions: Action[]; label: string }) {
  const state = useContext(OverlayTriggerStateContext)
  const list = useRef<HTMLDivElement>(null)
  useInteractOutside({
    ref: list,
    onInteractOutside: () => state?.close(),
  })
  // Named by `menu`, not by its trigger: an empty aria-labelledby stops MenuTrigger pointing it at the button.
  return (
    <Menu className="nv-menu__list" ref={list} aria-label={label} aria-labelledby="">
      {actions.map((action) => (
        <MenuItem key={action.label} id={action.label} className="nv-menu__item" textValue={action.label}
          isDisabled={Boolean(action.blocked)} onAction={action.run}>
          {action.label}
          {action.blocked && <span className="nv-menu__reason">{action.blocked}</span>}
        </MenuItem>
      ))}
    </Menu>
  )
}
