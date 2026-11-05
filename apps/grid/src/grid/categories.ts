import type { Category, Field, Model, ViewType } from '../types'

const HIDING: ViewType[] = ['calendar', 'timeline', 'gallery', 'matrix']

/** The category of an option; undefined for a value that is no option, or a field without categories. */
export function categoryOf(field: Field, value: unknown): Category | undefined {
  return typeof value === 'string' ? field.categories?.[value] : undefined
}

/** The field carrying the served categories, if the model has one. */
export function categoriesFieldOf(model: Model): string | undefined {
  return Object.entries(model.fields).find(([, field]) => field.categories)?.[0]
}

/** Whether a skin offers to hide finished rows on this model. */
export const hidesFinished = (model: Model, skin: ViewType): boolean => HIDING.includes(skin) && categoriesFieldOf(model) !== undefined

/** The rows a skin draws: done and cancelled ones left out unless shown. The grid and the board keep every row. */
export function hideFinished<T extends { fields: Record<string, unknown> }>(model: Model, rows: T[], show: boolean, skin: ViewType): T[] {
  const key = categoriesFieldOf(model)
  if (show || key === undefined || !HIDING.includes(skin)) return rows
  const field = model.fields[key]
  return rows.filter((row) => {
    const category = categoryOf(field, row.fields[key])
    return category !== 'done' && category !== 'cancelled'
  })
}
