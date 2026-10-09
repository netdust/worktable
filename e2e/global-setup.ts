import { chromium } from '@playwright/test'
import {
  ACCOUNTS,
  addFixtureViews,
  createAccount,
  createService,
  FICHE,
  type Instance,
  signIn,
  state,
  THEATRE,
} from './auth'

export default async function globalSetup(): Promise<void> {
  const browser = await chromium.launch()
  const signedIn = async (name: string, at: Instance, account: { email: string }, from?: string) => {
    const context = await browser.newContext(from ? { storageState: state(from) } : {})
    await signIn(context, at, account.email)
    await context.storageState({ path: state(name) })
    await context.close()
  }
  try {
    addFixtureViews(THEATRE)
    for (const name of ['admin', 'editor', 'owner'] as const) {
      const { email, role, ...rest } = ACCOUNTS[name]
      createAccount(THEATRE, email, role, 'subject' in rest ? rest.subject : undefined)
      await signedIn(name, THEATRE, ACCOUNTS[name])
    }
    createService(THEATRE)
    createAccount(FICHE, ACCOUNTS.fiche.email, ACCOUNTS.fiche.role)
    // step-0c drives both grids: the fiche editor's state carries the theatre editor's cookie too.
    await signedIn('fiche-editor', FICHE, ACCOUNTS.fiche, 'editor')
  } finally {
    await browser.close()
  }
}
