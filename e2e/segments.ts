import type { Locator } from '@playwright/test'

/** The digits each segment takes from a stored YYYY-MM-DD, YYYY-MM-DDTHH:mm or HH:MM. */
function digitsOf(value: string): Record<string, string> {
  const [date, time] = value.includes('-') ? value.split('T') : ['', value]
  const [year, month, day] = date ? date.split('-') : []
  const [hour, minute] = time ? time.split(':') : []
  return { year, month, day, hour, minute }
}

async function clearAll(segments: Locator) {
  const empty = () => segments.evaluateAll((all) => all.every((segment) => segment.hasAttribute('data-placeholder')))
  await segments.last().click()
  for (let press = 0; press < 30 && !(await empty()); press++) await segments.page().keyboard.press('Backspace')
}

/**
 * Types a stored value into a React Aria date or time field, segment by segment, as a hand would; '' clears every segment.
 * Each segment is clicked, not focus()ed: Playwright blurs a contenteditable's predecessor first, which reads as leaving.
 */
export async function fillDate(field: Locator, value: string) {
  const segments = field.getByRole('spinbutton')
  if (value === '') return clearAll(segments)
  const digits = digitsOf(value)
  for (const segment of await segments.all()) {
    const type = (await segment.getAttribute('data-type')) ?? ''
    await segment.click()
    await segment.pressSequentially(digits[type] ?? '')
  }
}
