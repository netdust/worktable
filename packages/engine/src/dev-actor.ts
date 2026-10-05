// TEMPORARY until auth (step 0): every write runs as this admin.
import type { Actor } from './declare'

export const DEV_ACTOR: Actor = { id: 0, role: 'admin' }
