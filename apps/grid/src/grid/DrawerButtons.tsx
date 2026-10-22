import { useContext } from 'react'
import { Button } from 'react-aria-components'
import type { Available, Row } from '../types'
import { DrawerWriteContext } from './drawerWrite'
import './drawer-buttons.css'

/** The buttons the server marked for one record or link item; a press is the ordinary transition write. */
export function DrawerButtons({ model, id, available, onDone }: { model: string; id: number; available?: Available; onDone: () => Promise<Row | null> }) {
  const write = useContext(DrawerWriteContext)
  if (!write || !available || available.buttons.length === 0) return null
  return (
    <div className="nv-dw-buttons">
      {available.buttons.map((button) => (
        <Button key={button.to} className="nv-button nv-button--secondary nv-button--sm" onPress={() => write.press(model, id, available, button.to, onDone)}>{button.label}</Button>
      ))}
    </div>
  )
}
