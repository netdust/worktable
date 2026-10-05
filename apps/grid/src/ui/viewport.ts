import { type RefObject, useEffect } from 'react'

/**
 * The app takes the viewport under whatever wp-admin prints above it (the admin bar, update
 * nags, plugin notices), so the page never scrolls and the sheet scrolls inside.
 */
export function useFillViewport(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = ref.current?.parentElement
    if (!root) return
    const fit = () => {
      const top = root.getBoundingClientRect().top + window.scrollY
      root.style.height = `${Math.max(320, window.innerHeight - top)}px`
    }
    fit()
    const watched = document.getElementById('wpbody-content') ?? document.body
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    observer?.observe(watched)
    window.addEventListener('resize', fit)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [ref])
}
