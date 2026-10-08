import { configure, fireEvent, render } from '@testing-library/react'
import { createElement, type ReactElement, type ReactNode } from 'react'
import { Providers } from './ui/Providers'

// React Aria's first mount costs about 2x in jsdom, so waits get 5 s; real browsers are not slower.
configure({ asyncUtilTimeout: 5000 })

// jsdom has no ResizeObserver; React Aria's Popover and ComboBox measure their trigger with one.
class NoResize {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= NoResize

// jsdom has no CSS.escape; React Aria looks up its meta tags with it.
globalThis.CSS ??= { escape: (value: string) => value.replace(/[^\w-]/g, '\\$&') } as typeof CSS

/** Renders into a `#root`, where the app's popovers portal, in Dutch: jsdom's empty `lang` would make locale() answer 'en'. */
export function renderNl(ui: ReactElement) {
  const root = document.body.appendChild(document.createElement('div'))
  root.id = 'root'
  return render(ui, { container: root, wrapper: ({ children }: { children: ReactNode }) => createElement(Providers, { locale: 'nl', children }) })
}

/** Types the way a keyboard does into React Aria's segments: a key, then the input the segment reads. */
export function typeKeys(text: string): void {
  for (const key of text) {
    const target = document.activeElement ?? document.body
    fireEvent.keyDown(target, { key })
    fireEvent(target, new InputEvent('beforeinput', { data: key, inputType: 'insertText', bubbles: true, cancelable: true }))
  }
}
