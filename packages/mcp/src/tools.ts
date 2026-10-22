import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { assertId, assertIdentifier, ClientError, type EngineClient, type Reply } from './client'

const NAME = 'lowercase letters, digits and _, starting with a letter, as /schema names it'
const object = z.record(z.string(), z.unknown())
const id = z.number().int().describe('the record id, an integer from 1')

const textOf = (value: unknown, isError: boolean): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
  ...(isError ? { isError } : {}),
})

// A refusal keeps the engine's code and message beside its status, so Claude can act on it.
// A small default keeps an answer inside Claude Code's MCP output cap; total tells Claude to page.
const DEFAULT_LIMIT = 100
const REFUSED_TOKEN = 'the instance refused the service token (rotated or disabled?)'

function answer({ status, body }: Reply): CallToolResult {
  if (status >= 200 && status < 300) return textOf(body, false)
  const fields = typeof body === 'object' && body !== null && !Array.isArray(body) ? body : { body }
  return textOf({ status, ...fields, ...(status === 401 ? { message: REFUSED_TOKEN } : {}) }, true)
}

function name(value: string): string {
  assertIdentifier(value)
  return value
}

function record(value: number): number {
  assertId(value)
  return value
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// The engine's $like and $nlike match a substring with % and _ as themselves, so an SQL pattern finds nothing.
function refuseWildcards(filter: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(filter)) {
    if (key === '$or' && Array.isArray(value)) value.filter(isObject).forEach(refuseWildcards)
    if (!isObject(value)) continue
    for (const op of ['$like', '$nlike']) {
      if (typeof value[op] === 'string' && value[op].includes('%'))
        throw new ClientError(`${op} matches a substring, case-insensitive, and % matches itself: drop the % wildcards`)
    }
  }
}

function rowsQuery(args: {
  filter?: Record<string, unknown>
  sort?: string[]
  limit?: number
  offset?: number
}): Record<string, string> {
  if (args.filter) refuseWildcards(args.filter)
  return {
    ...(args.filter ? { filter: JSON.stringify(args.filter) } : {}),
    ...(args.sort?.length ? { sort: args.sort.join(',') } : {}),
    limit: String(args.limit ?? DEFAULT_LIMIT),
    ...(args.offset !== undefined ? { offset: String(args.offset) } : {}),
  }
}

export function registerTools(server: McpServer, client: EngineClient): void {
  server.registerTool(
    'schema',
    {
      description:
        'Describe this worktable instance: every source (dataset or query) you may read, with its columns, ' +
        'lifecycle, links and declared actions. Call it first to learn the names the other tools take.',
    },
    async () => answer(await client.get('/api/schema')),
  )

  server.registerTool(
    'rows',
    {
      description:
        'Read the rows of a source (a dataset or a query). Answers { rows, total }, total counting every match. ' +
        `It answers ${DEFAULT_LIMIT} rows unless limit says otherwise: page with offset while offset + rows < total.`,
      inputSchema: {
        source: z.string().describe(`the source name: ${NAME}`),
        filter: object
          .optional()
          .describe(
            'the engine filter: { column: value } or { column: { $eq|$ne|$in|$nin|$gt|$gte|$lt|$lte|$exists|' +
              '$contains|$like|$nlike|$period: value } }; every key must hold, and $or takes a list of such filters. ' +
              '$like and $nlike match a substring, case-insensitive: % and _ are not wildcards',
          ),
        sort: z.array(z.string()).optional().describe('columns to sort on, in order; a leading - sorts descending'),
        limit: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(`at most this many rows, 1 to 5000; ${DEFAULT_LIMIT} when left out`),
        offset: z.number().int().min(0).optional().describe('skip this many rows first'),
      },
    },
    async (args) => answer(await client.get(`/api/rows/${name(args.source)}`, rowsQuery(args))),
  )

  server.registerTool(
    'create',
    {
      description: 'Create a row in a dataset. The dataset writer may refuse it; the refusal says why.',
      inputSchema: {
        dataset: z.string().describe(`the dataset name: ${NAME}`),
        values: object.describe('the new row: { column: value }'),
      },
    },
    async (args) => answer(await client.post(`/api/rows/${name(args.dataset)}`, args.values)),
  )

  server.registerTool(
    'update',
    {
      description:
        'Change columns of one row. A lifecycle transition is an update of the lifecycle column, and it needs ' +
        'expect: { column: the value you read }. A stale expect answers 409 transition_lost: read the row again.',
      inputSchema: {
        dataset: z.string().describe(`the dataset name: ${NAME}`),
        id,
        values: object.describe('the columns to change: { column: value }'),
        expect: object.optional().describe("the lifecycle column's current value: { column: value }"),
      },
    },
    async (args) => {
      const path = `/api/rows/${name(args.dataset)}/${record(args.id)}`
      return answer(await client.patch(path, { ...args.values, ...(args.expect ? { expect: args.expect } : {}) }))
    },
  )

  server.registerTool(
    'action',
    {
      description: 'Run an action a dataset declares (see its actions in schema) on one record.',
      inputSchema: {
        name: z.string().describe(`the action name: ${NAME}`),
        id,
        input: object.optional().describe("the action's inputs: { input: value }"),
      },
    },
    async (args) =>
      answer(await client.post(`/api/actions/${name(args.name)}`, { id: record(args.id), input: args.input ?? {} })),
  )

  server.registerTool(
    'history',
    {
      description: 'List the revisions of one row: each changed field, its old and new value, who and when.',
      inputSchema: {
        dataset: z.string().describe(`the dataset name: ${NAME}`),
        id,
      },
    },
    async (args) => answer(await client.get(`/api/revisions/${name(args.dataset)}/${record(args.id)}`)),
  )
}
