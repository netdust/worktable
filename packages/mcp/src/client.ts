export type FetchFn = (url: string, init: RequestInit) => Promise<Response>
export type Reply = { status: number; body: unknown }

/** A refusal or failure the client reports itself; its message never holds the token. */
export class ClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClientError'
  }
}

const IDENTIFIER = /^[a-z][a-z0-9_]*$/

export function assertIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) {
    throw new ClientError(
      `${JSON.stringify(name)} is not an identifier: lowercase letters, digits and _, starting with a letter`,
    )
  }
}

export function assertId(id: number): void {
  if (!(Number.isSafeInteger(id) && id > 0)) throw new ClientError(`${id} is not a record id: an integer from 1`)
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export class EngineClient {
  readonly #base: string
  readonly #token: string
  readonly #fetch: FetchFn
  readonly #timeoutMs: number

  constructor(base: string, token: string, options: { fetchFn?: FetchFn; timeoutMs?: number } = {}) {
    this.#base = base
    this.#token = token
    this.#fetch = options.fetchFn ?? fetch
    this.#timeoutMs = options.timeoutMs ?? 10_000
  }

  get(path: string, query: Record<string, string> = {}): Promise<Reply> {
    const search = new URLSearchParams(query).toString()
    return this.#send('GET', search ? `${path}?${search}` : path)
  }

  post(path: string, body: unknown): Promise<Reply> {
    return this.#send('POST', path, body)
  }

  patch(path: string, body: unknown): Promise<Reply> {
    return this.#send('PATCH', path, body)
  }

  // A fetch error may print the request, headers included, so none of it is passed on.
  // The timer races the fetch itself, because a fetch that ignores its signal would otherwise hang.
  // One timer settles the race and only then aborts the fetch, so a timed-out write never reads as unanswered.
  async #send(method: string, path: string, body?: unknown): Promise<Reply> {
    const abort = new AbortController()
    const headers: Record<string, string> = { authorization: `Bearer ${this.#token}` }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const init: RequestInit = {
      method,
      headers,
      redirect: 'error',
      signal: abort.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }
    const unanswered = new ClientError(`worktable at ${this.#base} does not answer`)
    const late =
      method === 'GET'
        ? unanswered
        : new ClientError(
            `worktable at ${this.#base} did not answer in time; the write may have landed: read before retrying`,
          )
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(late)
        abort.abort()
      }, this.#timeoutMs)
    })
    try {
      return await Promise.race([this.#exchange(this.#base + path, init), timeout])
    } catch (err) {
      throw err === late ? late : unanswered
    } finally {
      clearTimeout(timer)
    }
  }

  async #exchange(url: string, init: RequestInit): Promise<Reply> {
    const res = await this.#fetch(url, init)
    return { status: res.status, body: parsed(await res.text()) }
  }
}
