import { useContext, useState } from 'react'
import { Button } from 'react-aria-components'
import type { Available, Row } from '../types'
import { DrawerWriteContext } from './drawerWrite'
import './drawer-buttons.css'

/** The buttons the server marked for one record or link item; a press is the ordinary transition write, and one at a time. */
export function DrawerButtons({ model, id, available, onDone }: { model: string; id: number; available?: Available; onDone: () => Promise<Row | null> }) {
  const write = useContext(DrawerWriteContext)
  const [pressing, setPressing] = useState(false)
  if (!write || !available || available.buttons.length === 0) return null
  const press = (to: string) => {
    setPressing(true)
    void write.press(model, id, available, to, onDone).finally(() => setPressing(false))
  }
  return (
    <div className="nv-dw-buttons">
      {available.buttons.map((button) => (
        <Button key={button.to} className="nv-button nv-button--secondary nv-button--sm" isDisabled={pressing} onPress={() => press(button.to)}>{button.label}</Button>
      ))}
    </div>
  )
}
