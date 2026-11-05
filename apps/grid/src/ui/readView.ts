import { rows, spanRows } from '../api'
import { categoriesFieldOf } from '../grid/categories'
import { readWithTree } from '../grid/tree'
import type { DateWindow, Model, RowsResponse, Scope, View } from '../types'
import type { Layout } from '../grid/layout'

/** The view's rows: by span where a calendar or timeline reads them so, archived ones asked for, a grid tree's dropped ancestors added. */
export async function readView(view: View, window: Partial<DateWindow>, scope: Scope | null, layout: Layout | null, archived: boolean, model?: Model): Promise<RowsResponse> {
  const spans = (view.type === 'calendar' || view.type === 'timeline') && view.calendar?.spans
  const read = spans ? await spanRows(view, window, scope, layout, archived) : await (archived ? rows(view, window, scope, layout, undefined, true) : rows(view, window, scope, layout))
  return (view.type ?? 'grid') === 'grid' ? readWithTree(model, read) : read
}

/** The fields whose write changes another row's progress: the parent and the status. Absent for a dataset with no parent. */
export function rereadsOf(model: Model | undefined): string[] | undefined {
  return model?.parent ? [model.parent, categoriesFieldOf(model) ?? model.parent] : undefined
}
