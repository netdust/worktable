/** A ref callback that sets the hover title: React Aria's Button passes no `title` through. */
export const hint = (text?: string | null) => (element: HTMLElement | null) => {
  if (!element) return
  if (text) element.setAttribute('title', text)
  else element.removeAttribute('title')
}
