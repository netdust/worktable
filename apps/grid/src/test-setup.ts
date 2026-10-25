import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect } from 'vitest'
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

/** The drawer's action row: its visible buttons in order, then (once Meer is opened) what Meer holds. */
const rowButtons = () => [...document.querySelectorAll<HTMLElement>('.nv-dw-actions__row > .nv-button')]

/** Presses one of the drawer's record actions: its button in the row, or its item behind Meer. */
export async function pressAction(name: string | RegExp): Promise<void> {
  const same = (text: string) => (typeof name === 'string' ? text === name : name.test(text))
  const button = rowButtons().find((one) => same(one.textContent ?? ''))
  if (button) return void fireEvent.click(button)
  fireEvent.click(screen.getByRole('button', { name: 'Meer' }))
  fireEvent.click(await screen.findByRole('menuitem', { name }))
}

/** One of the record's own tools in the drawer's head: opens its Acties menu and presses an item (Link kopiëren, Nieuwe link, Verwijderen). */
export async function pressTool(name: string | RegExp): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Acties' }))
  fireEvent.click(await screen.findByRole('menuitem', { name }))
}

/** What the drawer's action row offers, in order: its buttons, then what Meer holds; empty when there is no row. */
export async function actionsOffered(): Promise<string[]> {
  const shown = rowButtons().map((one) => one.textContent ?? '')
  const more = screen.queryByRole('button', { name: 'Meer' })
  if (!more) return shown
  fireEvent.click(more)
  const folded = (await screen.findAllByRole('menuitem')).map((item) => item.textContent ?? '')
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  return [...shown, ...folded]
}
