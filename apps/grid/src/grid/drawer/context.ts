import { createContext } from 'react'
import type { Schema } from '../../types'

/** The served schema, for what a drawer reads beyond its record: the space, the tables that point at it, their views. */
export const SchemaContext = createContext<Schema | null>(null)
