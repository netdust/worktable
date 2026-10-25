import { useEffect, useRef } from 'react'
import { errorText, t } from '../i18n'
import { takeHandoff } from '../api'
import type { ApiError, Model, ModelAction, Opened, Row } from '../types'
import { iconNamed } from '../ui/icons'
import type { RunAction } from './Drawer'
import { addressOf, webAddress } from './OpenLink'

const POLL = 1000
const GIVE_UP = 30000

function createdOf(reply: unknown): Opened | null {
  const { dataset, id } = (reply ?? {}) as Partial<Opened>
  return typeof dataset === 'string' && Number.isSafeInteger(id) ? { dataset, id: id as number } : null
}

/** The same site: host without a leading `www.` and port alike; the scheme may differ, as a site often redirects to its https twin. */
function sameSite(a: URL, b: URL): boolean {
  const bare = (url: URL) => url.hostname.replace(/^www\./, '')
  return bare(a) === bare(b) && a.port === b.port
}

function closeTab(tab: Window): void {
  try {
    if (!tab.closed) tab.close()
  } catch {
    // A tab that cannot be closed is already gone from our reach.
  }
}

interface Props {
  row: Row
  model?: Model
  actions: ModelAction[]
  onAction?: RunAction
  onSaid?: (message: string) => void
}

/** A record's declared head actions as icon buttons in the drawer's head; one that hands a link back opens it in the tab the click opened. */
export function HeadActions({ row, model, actions, onAction, onSaid }: Props) {
  const cancel = useRef<(() => void) | null>(null)
  useEffect(() => () => cancel.current?.(), [])
  const site = addressOf(row, model)
  const shown = onAction && row.id > 0 ? actions.filter((action) => action.head && row.available?.actions.includes(action.name) && (!action.handoff || site)) : []
  if (shown.length === 0) return null

  const say = (message: string) => onSaid?.(message)
  const run = (action: ModelAction) => void onAction?.(action, {}).catch((error: ApiError) => say(errorText(error.code, error.message)))

  const login = (action: ModelAction) => {
    if (cancel.current || !site) return
    const tab = window.open('', '_blank')
    if (!tab) return say(t('loginBlocked'))
    let over = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let deadline: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      over = true
      clearTimeout(timer)
      clearTimeout(deadline)
      cancel.current = null
    }
    const abandon = (message: string) => {
      if (over) return
      stop()
      closeTab(tab)
      say(message)
    }
    cancel.current = () => {
      if (over) return
      stop()
      closeTab(tab)
    }
    const arrive = (value: string) => {
      const target = webAddress(value)
      if (!target) return abandon(t('loginFailed'))
      if (!sameSite(target, site)) return abandon(t('loginOtherSite'))
      stop()
      try {
        tab.opener = null
        tab.location.href = target.href
      } catch {
        closeTab(tab)
        say(t('loginFailed'))
      }
    }
    const poll = ({ dataset, id }: Opened) => {
      deadline = setTimeout(() => abandon(t('loginNoLink')), GIVE_UP)
      const next = () => {
        timer = setTimeout(async () => {
          if (tab.closed) return stop()
          try {
            const value = await takeHandoff(dataset, id)
            if (over) return
            if (value === null) return next()
            arrive(value)
          } catch {
            abandon(t('loginFailed'))
          }
        }, POLL)
      }
      next()
    }
    onAction?.(action, {}).then(
      (reply) => {
        const created = createdOf(reply)
        if (over) return
        if (created) poll(created)
        else abandon(t('loginFailed'))
      },
      (error: ApiError) => abandon(errorText(error.code, error.message)),
    )
  }

  return (
    <>
      {shown.map((action) => {
        const Icon = iconNamed(action.head?.icon)
        return (
          <button key={action.name} type="button" className="nv-more" aria-label={action.label} title={action.label} onClick={() => (action.handoff ? login(action) : run(action))}>
            {Icon && <Icon size={16} aria-hidden="true" />}
          </button>
        )
      })}
    </>
  )
}
