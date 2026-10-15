import { useEffect, useMemo, useState } from 'react'
import { records } from '../api'
import type { Model, Tone } from '../types'

type Keys = Map<number, string>

// What each dataset's records held when last read: a view opened again shows it at once while it reads anew.
const known = new Map<string, Keys>()

/**
 * Each record's tone by id, from its dataset's tone column, read once in the caller's own scope.
 * Null when the dataset declares no tone, the caller cannot read it, or the read is refused;
 * undefined while the first read is pending, so a skin draws its lanes once, in their own colours.
 */
export function useTones(models: Record<string, Model>, dataset: string | undefined): Map<number, Tone> | null | undefined {
  const column = dataset ? models[dataset]?.tone : undefined
  const tones = dataset && column ? models[dataset]?.fields[column]?.tones : undefined
  const [read, setRead] = useState<{ dataset: string; keys: Keys | null } | null>(null)
  useEffect(() => {
    if (!dataset || !column) return
    let live = true
    const done = (keys: Keys | null) => {
      if (keys) known.set(dataset, keys)
      else known.delete(dataset)
      if (live) setRead({ dataset, keys })
    }
    records(dataset, '').then(
      (found) => done(new Map(found.rows.map((row) => [row.id, String(row.fields[column] ?? '')]))),
      () => done(null),
    )
    return () => {
      live = false
    }
  }, [dataset, column])
  const keys = !dataset ? undefined : read?.dataset === dataset ? read.keys : known.get(dataset)
  return useMemo(() => {
    if (keys === undefined && dataset && column && tones) return undefined
    if (!keys || !tones) return null
    return new Map([...keys].flatMap(([id, key]): [number, Tone][] => (tones[key] ? [[id, tones[key]]] : [])))
  }, [keys, tones, dataset, column])
}
