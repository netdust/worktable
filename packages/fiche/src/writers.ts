import { refuse, type Writer } from '@worktable/engine'
import { fiche } from './datasets'

type Values = Record<string, unknown>

const POSTCODE = /^\d{4}$/

function checkTitel(values: Values, creating: boolean): void {
  const titel = values.titel
  if (titel === undefined ? creating : typeof titel !== 'string' || titel.trim() === '') refuse('Titel is verplicht.')
}

function checkType(values: Values): void {
  const type = values.type
  if (type !== undefined && !Object.hasOwn(fiche.columns.type?.options ?? {}, String(type))) refuse('Ongeldig type.')
}

function checkPostcode(values: Values): void {
  const postcode = values.postcode
  if (postcode !== undefined && !POSTCODE.test(String(postcode))) refuse('Postcode moet vier cijfers hebben.')
}

const accept =
  (creating: boolean): NonNullable<Writer['create']> =>
  (values) => {
    checkTitel(values, creating)
    checkType(values)
    checkPostcode(values)
    return values
  }

export const ficheWriter: Writer = {
  create: accept(true),
  update: accept(false),
  delete() {},
}
