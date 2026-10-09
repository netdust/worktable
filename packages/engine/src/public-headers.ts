/** What every public response carries, so neither a cache, a Referer nor a crawler keeps the token. */
export function noStoreHeaders(): Record<string, string> {
  return { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' }
}
