import type { Locator, Page } from '@playwright/test'

/** A model's node in the rail's tree, by its label alone. */
export function modelNode(page: Page, model: string): Locator {
  return page.getByRole('navigation', { name: 'Views' }).getByRole('treeitem', { name: model, exact: true })
}

/** Opens a model by its name: it unfolds and shows its last-used view. Its row comes before its views. */
export async function openModel(page: Page, model: string): Promise<void> {
  await modelNode(page, model).getByRole('button', { name: model, exact: true }).first().click()
}

/** Opens a view by its name inside its model's node; a view under another model passes that model. */
export async function openView(page: Page, view: string, model = view): Promise<void> {
  const node = modelNode(page, model)
  if ((await node.getAttribute('aria-expanded')) !== 'true') await openModel(page, model)
  await node.getByRole('group', { name: 'View type' }).getByRole('button', { name: view, exact: true }).click()
}
