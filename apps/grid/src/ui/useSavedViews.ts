import { type MutableRefObject, useEffect, useMemo, useRef, useState } from 'react'
import { createView, deleteView, restoreView, savePrefs, savedViews, updateView } from '../api'
import { errorText, t } from '../i18n'
import { timelineStart } from '../timeline/layout'
import type { ApiError, Prefs, SavedView, TableDef, View, ViewType } from '../types'
import { byFirstView, dashboardsOf, type Table, groupTables, tableOf } from './tables'
import type { Notice } from './Toast'
import { arrangementOf, blank, changed, clearIfSent, copyKept, currentOf, forget, isSaved, keepLocal, lastIn, listFor, localOf, toStored } from './views'

const NAME_MAX = 80

/** A switch or a drag is written once things settle: a run of them is one request. */
const PREFS_DELAY = 500

/** A run of changes to one's own view is one save. */
export const AUTOSAVE_DELAY = 400

/** A view one may write saves itself, one's own or a team view; a view one may not write keeps the change here, and so does a public one: a dropped filter would publish rows. */
export const autosaves = (view: View): view is SavedView => isSaved(view) && view.editable && !view.public

interface Options {
  declared: TableDef[]
  starting: View[]
  /** The open view's key, read when an action ends. */
  active: MutableRefObject<string | undefined>
  open: (key: string) => void
  /** Why the last write to a view was refused; null clears it. */
  note: (text: string | null) => void
  notify: (notice: Notice) => void
}

/** A view's saved filters no chip shows travel with a copy of it. */
const fixedOf = (view: View) => (view.fixed ? { fixed: view.fixed } : {})

/** "{name} (copy)", the name cut so the whole stays within what a name may be. */
function copyName(label: string): string {
  const extra = t('copyOf', { name: '' }).length
  return t('copyOf', { name: label.slice(0, Math.max(1, NAME_MAX - extra)).trimEnd() })
}

/** The saved views of this user, the tables they sit in, and everything done to them. */
export function useSavedViews({ declared, starting, active, open, note, notify }: Options) {
  const [saved, setSaved] = useState<SavedView[]>([])
  const [prefs, setPrefs] = useState<Prefs>({ order: {}, last: {} })
  // Written only once the stored prefs were read, and only after this user changed them: never over what is stored unread.
  const read = useRef(false)
  const changedPrefs = useRef(false)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  // A change made while a save is on its way: sent once that save answered.
  const again = useRef<SavedView | null>(null)
  const autosave = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const removals = useRef(0)

  useEffect(() => {
    if (!read.current || !changedPrefs.current) return
    const timer = setTimeout(() => void savePrefs(prefs).catch(() => undefined), PREFS_DELAY)
    return () => clearTimeout(timer)
  }, [prefs])

  const dashboards = useMemo(() => dashboardsOf(saved), [saved])
  const tables: Table[] = useMemo(
    () => byFirstView(groupTables(declared, [...starting, ...saved]), [...starting, ...saved]).map((table) => ({ ...table, views: listFor(table, saved, prefs.order) })),
    [declared, starting, saved, prefs.order],
  )

  /** The stored prefs; what this user changed before they arrived wins, table by table. */
  const loadPrefs = (stored: Prefs) => {
    read.current = true
    setPrefs((mine) => ({ order: { ...stored.order, ...mine.order }, last: { ...stored.last, ...mine.last } }))
  }
  const changePrefs = (change: (current: Prefs) => Prefs) => {
    changedPrefs.current = true
    setPrefs(change)
  }
  const order = (table: string, keys: string[]) => changePrefs((current) => ({ ...current, order: { ...current.order, [table]: keys } }))
  /** Kept by the rail node the view sits under: a query's view under the table it reads. */
  const remember = (view: View) => {
    const node = view.of ?? view.table
    changePrefs((current) => (current.last[node] === view.key ? current : { ...current, last: { ...current.last, [node]: view.key } }))
  }
  /** A click on a table: the view last used there, else the first in this user's order. */
  const openTable = (table: Table) => {
    const view = lastIn(table, prefs.last)
    if (view) open(view.key)
  }

  const replace = (fresh: SavedView) => setSaved((list) => list.map((v) => (v.id === fresh.id ? fresh : v)))
  const drop = (id: number) => setSaved((list) => list.filter((v) => v.id !== id))
  // The list is kept by id, as the server and creation order it: a view comes back to its own place whatever moved meanwhile.
  const putBack = (view: SavedView) =>
    setSaved((list) => (list.some((v) => v.id === view.id) ? list : [...list.filter((v) => v.id < view.id), view, ...list.filter((v) => v.id > view.id)]))
  const added = (created: SavedView) => {
    setSaved((list) => [...list, created])
    open(created.key)
  }
  const startingOf = (table: string, type: ViewType) =>
    tables.flatMap((t) => t.views).find((v) => !isSaved(v) && v.table === table && (v.type ?? 'grid') === type)
  /** When the open view goes: the next under its rail node, else the first of any. */
  const leave = (gone: View, to?: View) => {
    if (active.current !== gone.key) return
    const siblings = gone.type === 'dashboard' ? dashboards : tableOf(tables, gone.key)?.views
    const next = to ?? siblings?.find((v) => v.key !== gone.key) ?? tables[0]?.views[0]
    if (next) open(next.key)
  }
  const refresh = () => savedViews().then(setSaved, () => undefined)

  /** Deleted in another tab: the change moves to the starting view, unless that holds one of its own; then it stays here. */
  const vanished = (from: SavedView, reason: string) => {
    const home = startingOf(from.table, from.type ?? 'grid')
    const change = localOf(from)
    if (change && !(home && localOf(home) === null)) {
      setSaved((list) => list.map((v) => (v.id === from.id ? { ...v, editable: false } : v)))
      return note(`${reason} · ${t('keepAsNew', { action: t('duplicate') })}`)
    }
    if (change && home) keepLocal(home, change)
    forget(from)
    drop(from.id)
    leave(from, home)
    note(reason)
  }

  const refused = (from: SavedView, error: ApiError) => {
    const reason = errorText(error.code, error.message)
    if (error.code === 'unknown_view') return vanished(from, reason)
    if (error.code === 'not_owner') void refresh()
    note(reason)
  }

  const write = (from: SavedView, data: Parameters<typeof updateView>[1]) =>
    updateView(from, data).then((fresh) => {
      replace(fresh)
      note(null)
      return fresh
    }, (error: ApiError) => {
      refused(from, error)
      return null
    })

  /** A new view on a table, from its starting view of that type when it has one: no other view is needed. */
  const create = (table: string, name: string, type: ViewType, shared: boolean) => {
    const model = startingOf(table, type)
    const start = model ? toStored(arrangementOf(model)) : blank()
    const arrangement = type === 'timeline' ? timelineStart(start, declared.find((d) => d.key === table)?.calendar) : start
    return createView({ name, table, type, field: null, shared, arrangement }).then(added)
  }

  const saveAs = (from: View, name: string, type: ViewType) => {
    const sent = currentOf(from)
    return createView({ name, table: from.table, type, field: null, shared: false, arrangement: toStored(sent), ...fixedOf(from) }).then((created) => {
      copyKept(from, created)
      clearIfSent(from, sent)
      added(created)
    })
  }

  const save = (from: SavedView) => {
    if (sending.current) {
      again.current = from
      return
    }
    sending.current = true
    setBusy(true)
    const sent = currentOf(from)
    void write(from, { arrangement: toStored(sent) }).then((fresh) => fresh && clearIfSent(from, sent)).finally(() => {
      sending.current = false
      setBusy(false)
      const next = again.current
      again.current = null
      if (next && changed(next)) save(next)
    })
  }

  /** The person changed the open view's arrangement: one's own view saves itself once the run of changes settles. */
  const changedLayout = (view: View) => {
    if (!autosaves(view)) return
    clearTimeout(autosave.current)
    autosave.current = setTimeout(() => save(view), AUTOSAVE_DELAY)
  }

  /** A copy takes the view as this browser shows it: a change kept here goes along. */
  const duplicate = (from: View) => {
    const sent = currentOf(from)
    return createView({ name: copyName(from.label), table: from.table, type: from.type ?? 'grid', field: null, shared: false, arrangement: toStored(sent), ...fixedOf(from) })
      .then((created) => {
        copyKept(from, created)
        clearIfSent(from, sent)
        added(created)
      }, (error: ApiError) => note(errorText(error.code, error.message)))
  }

  const restore = (view: SavedView, wasOpen: boolean) => {
    restoreView(view.id).then((fresh) => {
      putBack(fresh)
      if (wasOpen) open(fresh.key)
    }, (error: ApiError) => note(errorText(error.code, error.message)))
  }

  /**
   * Gone for good once the undo is: its unsaved change in this browser goes with it.
   * The undo is the last delete clicked: an earlier one answering later is gone for good at once.
   */
  const remove = (view: SavedView) => {
    const wasOpen = active.current === view.key
    const turn = ++removals.current
    drop(view.id)
    leave(view)
    deleteView(view.id).then(
      () => turn === removals.current
        ? notify({ message: t('viewRemoved'), action: { label: t('undo'), run: () => restore(view, wasOpen) }, expired: () => forget(view) })
        : forget(view),
      (error: ApiError) => {
        if (error.code !== 'unknown_view') putBack(view)
        if (error.code === 'not_owner') void refresh()
        note(errorText(error.code, error.message))
      },
    )
  }

  return {
    dashboards, load: setSaved, loadPrefs, tables, busy, create, saveAs, save, changedLayout, remember, openTable,
    actions: {
      rename: (view: SavedView, name: string) => void write(view, { name }),
      share: (view: SavedView, shared: boolean) => void write(view, { shared }),
      duplicate, remove, order,
    },
  }
}
