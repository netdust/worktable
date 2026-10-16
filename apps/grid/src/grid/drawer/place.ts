import { rowOf, update } from '../../api'
import { errorText } from '../../i18n'
import type { ApiError } from '../../types'
import type { Store } from '../store'
import type { WriteLink } from './Sections'

/**
 * Puts another record on a place of one of the record's links. The place is a row of the link's own dataset, written
 * there as one step of the tab's history; the record is read again after the write and after its undo, so its links
 * and its flags follow. A refusal is told, and the record read again all the same.
 */
export function placeWriter(store: Pick<Store, 'push' | 'replace'>, model: string, id: number, onNotice?: (message: string) => void): WriteLink {
  const reread = () => void rowOf(model, id).then((found) => found && store.replace(found), () => undefined)
  return async (link, place, target) => {
    try {
      const { batch } = await update(link.dataset, place, { [link.target]: [target] })
      if (batch) store.push({ batch: Promise.resolve(batch), model: link.dataset, id: place, refresh: reread })
    } catch (error) {
      const { code, message } = error as ApiError
      onNotice?.(errorText(code, message))
    }
    reread()
  }
}
