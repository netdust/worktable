import { authTables } from './auth-tables'
import { revision } from './revision'
import { savedView } from './saved-view'

export const MIGRATIONS = '_migrations'

export const engineTables = [savedView, revision, ...authTables]

export const reservedNames = new Set([MIGRATIONS, ...engineTables.map((t) => t.name)])
