/** The URL hash holds what a reload must keep, the view, and once a link's conditions (`f`). */
export function readHash(key: string): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get(key)
}

export function writeHash(key: string, value: string): void {
  const params = new URLSearchParams(window.location.hash.slice(1))
  params.set(key, value)
  window.history.replaceState(null, '', `#${params.toString()}`)
}

export function dropHash(key: string): void {
  const params = new URLSearchParams(window.location.hash.slice(1))
  if (!params.has(key)) return
  params.delete(key)
  window.history.replaceState(null, '', `#${params.toString()}`)
}
