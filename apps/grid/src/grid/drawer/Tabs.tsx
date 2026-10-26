import { Ellipsis } from 'lucide-react'
import type { Key } from 'react-aria-components'
import { Button, Menu, MenuItem, MenuTrigger, Popover, ToggleButton, ToggleButtonGroup, Toolbar, Tooltip, TooltipTrigger } from 'react-aria-components'
import { t } from '../../i18n'
import type { Pane } from './panes'
import './tabs.css'

const SHOWN = 3

const only = (keys: Set<Key> | 'all', onChange: (key: string) => void) => {
  const [key] = keys === 'all' ? [] : [...keys]
  if (key !== undefined) onChange(String(key))
}

/**
 * The drawer's panes as icons under its head: three at most, the rest behind `…`. A radio group, not a tab list:
 * a pane chosen from `…` is a selection no icon holds, which a tab list cannot carry.
 */
export function DrawerTabs({ panes, current, onChange }: { panes: Pane[]; current: string; onChange: (key: string) => void }) {
  const shown = panes.slice(0, SHOWN)
  const rest = panes.slice(SHOWN)
  return (
    <Toolbar className="nv-dw-tabs" aria-label={t('tabBar')}>
      <ToggleButtonGroup className="nv-dw-tabs__group" selectionMode="single" disallowEmptySelection selectedKeys={[current]} onSelectionChange={(keys) => only(keys, onChange)}>
        {shown.map(({ key, label, icon: Icon }) => (
          <TooltipTrigger key={key} delay={400}>
            <ToggleButton id={key} className="nv-dw-tab" aria-label={label}><Icon size={15} aria-hidden="true" /></ToggleButton>
            <Tooltip className="nv-dw-tip" placement="bottom" offset={6}>{label}</Tooltip>
          </TooltipTrigger>
        ))}
      </ToggleButtonGroup>
      {rest.length > 0 && (
        <MenuTrigger>
          <Button className="nv-dw-tab" aria-label={t('tabMore')} data-current={rest.some((pane) => pane.key === current) || undefined}>
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
