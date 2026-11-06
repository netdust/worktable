import type { View } from '../types'
import { useViewChoice } from './choice'

const bool = (raw: unknown) => (typeof raw === 'boolean' ? raw : null)

/** The view's two choices, kept in this browser: finished rows shown, archived rows shown (the latter is the archive's). */
export function useFinished(view: View | undefined) {
  const [finished, setFinished] = useViewChoice<boolean>(view, 'ntdst-views/finished/v1/', bool, false)
  const [archived, setArchived] = useViewChoice<boolean>(view, 'ntdst-views/archive/v1/', bool, false)
  return { finished, setFinished, archived, setArchived }
}
