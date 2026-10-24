import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Keyboard } from 'react-aria-components'
import { t } from '../i18n'
import type { StoreState } from '../grid/store'
import { ToastSlot } from './runs'

const SHOWN_FOR = 6000

/** Something that happened to a view, with at most one way back. */
export interface Notice {
  message: string
  action?: { label: string; run: () => void }
  /** Runs once the notice is gone without its action: its time ran out, or another took its place. */
  expired?: () => void
}

interface Props {
  state?: Pick<StoreState, 'save' | 'canUndo' | 'canRedo'>
  onUndo?: () => void
  onRedo?: () => void
  /** Shown instead of the save state's word while it lasts. */
  notice?: Notice | null
}

/** A notice for six seconds; its action ends it at once. */
export function useNotice(): [Notice | null, (notice: Notice) => void] {
  const [notice, setNotice] = useState<Notice | null>(null)
  const pending = useRef<(() => void) | undefined>(undefined)
  const expire = useCallback(() => {
    const run = pending.current
    pending.current = undefined
    run?.()
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => {
      setNotice(null)
      expire()
    }, SHOWN_FOR)
    return () => clearTimeout(timer)
  }, [notice])

  const show = useCallback((given: Notice) => {
    expire()
    pending.current = given.expired
    const action = given.action
    setNotice(action ? { ...given, action: { ...action, run: () => {
      pending.current = undefined
      setNotice(null)
      action.run()
    } } } : given)
  }, [])

  return [notice, show]
}

/** After each saved change, for a few seconds: what happened and the way back. */
export function Toast(props: Props) {
  const slot = useContext(ToastSlot)
  const body = <ToastBody {...props} />
  return slot ? createPortal(body, slot) : body
}

function ToastBody({ state, onUndo, onRedo, notice }: Props) {
  const [shown, setShown] = useState(false)
  const was = useRef(state?.save)

  useEffect(() => {
    const settled = was.current === 'saving' && state?.save === 'saved'
    was.current = state?.save
    if (!settled || !(state.canUndo || state.canRedo)) return
    setShown(true)
    const timer = setTimeout(() => setShown(false), SHOWN_FOR)
    return () => clearTimeout(timer)
  }, [state?.save])

  if (notice) {
    return (
      <div className="nv-toast" role="status" aria-label={notice.message}>
        <span>{notice.message}</span>
        {notice.action && <button type="button" onClick={notice.action.run}>{notice.action.label}</button>}
      </div>
    )
  }
  if (!shown || !state) return null
  return (
    <div className="nv-toast" role="status" aria-label={t('changed')}>
      <span>{t('changed')}</span>
      {state.canUndo && <button type="button" onClick={onUndo}>{t('undo')}</button>}
      {state.canUndo && <Keyboard className="nv-kbd">⌘Z</Keyboard>}
      {state.canRedo && <button type="button" onClick={onRedo}>{t('redo')}</button>}
    </div>
  )
}
