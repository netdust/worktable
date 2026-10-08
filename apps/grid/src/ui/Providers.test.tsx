import { cleanup, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { Popover } from 'react-aria-components'
import { afterEach, describe, expect, it } from 'vitest'
import { Providers } from './Providers'

function Open() {
  const anchor = useRef<HTMLSpanElement>(null)
  return (
    <>
      <span ref={anchor}>anker</span>
      <Popover isOpen isNonModal triggerRef={anchor}>
        <p>inhoud</p>
      </Popover>
    </>
  )
}

afterEach(cleanup)

describe('the providers', () => {
  // The dark theme is set on #root, not on body: a popover outside it would stay light.
  it('popovers render inside #root', () => {
    render(
      <div id="root">
        <Providers locale="nl">
          <Open />
        </Providers>
      </div>,
    )

    expect(screen.getByText('inhoud').closest('#root')).not.toBeNull()
  })
})
