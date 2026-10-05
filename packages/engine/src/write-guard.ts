import type { Context, MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createMiddleware } from 'hono/factory'

const MAX_BODY = 64 * 1024
const FOREIGN_SITES = new Set(['same-site', 'cross-site'])

const deny = (c: Context, status: 403 | 413 | 415, code: string, message: string) => c.json({ code, message }, status)

const isJson = (type: string | undefined): boolean => type?.split(';')[0]?.trim().toLowerCase() === 'application/json'

const sizeCap = bodyLimit({
  maxSize: MAX_BODY,
  onError: (c) => deny(c, 413, 'body_too_large', `Body is larger than ${MAX_BODY} bytes`),
})

// Decides before the body is read: a CORS-simple text/plain POST from another page never reaches a writer.
export function writeGuard(): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const site = c.req.header('sec-fetch-site')?.toLowerCase()
    // A browser without fetch metadata still sends Origin on a write: refuse it rather than trust it.
    if (FOREIGN_SITES.has(site ?? '') || (site === undefined && c.req.header('origin') !== undefined)) {
      return deny(c, 403, 'forbidden_site', 'Writes from another site are not allowed')
    }
    if (c.req.method !== 'DELETE' && !isJson(c.req.header('content-type'))) {
      return deny(c, 415, 'bad_content_type', 'Content-Type must be application/json')
    }
    return sizeCap(c, next)
  })
}
