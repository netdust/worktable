import { Ellipsis, type LucideIcon } from 'lucide-react'
import { Button, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components'
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
 * `icon` and `menu` (the menu's name) make it another trigger, such as a `+`.
 * The menu opens in a popover over the page, so no scrolling box it sits in clips it.
 */
export function MoreMenu({ actions, label = t('moreActions'), hint = label === t('moreActions') ? t('moreActionsShown') : label, placement = 'bottom-end', icon: Icon = Ellipsis, menu = t('moreActions') }: {
  actions: Action[]
  label?: string
  /** What hovering it says; the label stays the accessible name. */
  hint?: string
  placement?: Placement
  icon?: LucideIcon
  menu?: string
}) {
  return (
    <span className="nv-menu">
      <MenuTrigger>
        <Button ref={titled(hint)} className="nv-more" aria-label={label} aria-haspopup="menu">
          <Icon size={16} aria-hidden="true" />
        </Button>
        {/* The menu is named by `menu`, not by its trigger: an empty aria-labelledby stops MenuTrigger pointing it at the button. */}
        <Popover className="nv-menu__layer" placement={placement === 'bottom-start' ? 'bottom start' : 'bottom end'} offset={4}>
          <Menu className="nv-menu__list" aria-label={menu} aria-labelledby="">
            {actions.map((action) => (
              <MenuItem key={action.label} id={action.label} className="nv-menu__item" textValue={action.label}
                isDisabled={Boolean(action.blocked)} onAction={action.run}>
                {action.label}
                {action.blocked && <span className="nv-menu__reason">{action.blocked}</span>}
              </MenuItem>
            ))}
          </Menu>
        </Popover>
      </MenuTrigger>
    </span>
  )
}
