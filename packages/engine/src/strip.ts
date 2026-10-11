export type StrippedMime = 'image/jpeg' | 'image/png' | 'image/webp'

/** A file whose structure cannot be walked; it is refused, never stored unstripped. */
export class StripError extends Error {}

const refuse = (why: string): never => {
  throw new StripError(why)
}

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0))
const startsWith = (bytes: Uint8Array, signature: number[], at = 0): boolean =>
  bytes.length >= at + signature.length && signature.every((b, i) => bytes[at + i] === b)
const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** The bytes without location and camera data; throws StripError on a file it cannot walk. */
export function strip(bytes: Uint8Array, mime: StrippedMime): Uint8Array {
  if (mime === 'image/jpeg') return stripJpeg(bytes)
  if (mime === 'image/png') return stripPng(bytes)
  return stripWebp(bytes)
}

const EXIF_ID = ascii('Exif\0\0')
const ORIENTATION = 0x0112
const SHORT = 3

// Orientation from IFD0 of an Exif APP1 payload; null when absent or unreadable, since the block is dropped anyway.
function orientationOf(payload: Uint8Array): number | null {
  if (!startsWith(payload, EXIF_ID)) return null
  const tiff = payload.subarray(EXIF_ID.length)
  if (tiff.length < 8) return null
  const little = startsWith(tiff, ascii('II*\0'))
  if (!little && !startsWith(tiff, ascii('MM\0*'))) return null
  const view = viewOf(tiff)
  const ifd = view.getUint32(4, little)
  if (ifd + 2 > tiff.length) return null
  const count = view.getUint16(ifd, little)
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > tiff.length) return null
    if (view.getUint16(entry, little) !== ORIENTATION) continue
    if (view.getUint16(entry + 2, little) !== SHORT || view.getUint32(entry + 4, little) !== 1) return null
    const value = view.getUint16(entry + 8, little)
    return value >= 1 && value <= 8 ? value : null
  }
  return null
}

// An APP1 holding only Orientation: little-endian TIFF, one IFD of one SHORT entry, no next IFD.
function minimalExif(orientation: number): Uint8Array {
  const out = new Uint8Array(2 + 2 + EXIF_ID.length + 26)
  const view = viewOf(out)
  out.set([0xff, 0xe1])
  view.setUint16(2, out.length - 2)
  out.set([...EXIF_ID, ...ascii('II*\0')], 4)
  const tiff = 4 + EXIF_ID.length
  view.setUint32(tiff + 4, 8, true)
  view.setUint16(tiff + 8, 1, true)
  view.setUint16(tiff + 10, ORIENTATION, true)
  view.setUint16(tiff + 12, SHORT, true)
  view.setUint32(tiff + 14, 1, true)
  view.setUint16(tiff + 18, orientation, true)
  return out
}

const APP1 = 0xe1
const APP13 = 0xed
const COM = 0xfe
const SOS = 0xda
const EOI = 0xd9
const isRestart = (marker: number) => marker >= 0xd0 && marker <= 0xd7

// The end of entropy-coded data: the next 0xFF that is neither stuffing (FF00) nor a restart marker.
function scanEnd(bytes: Uint8Array, from: number): number {
  for (let at = from; at + 1 < bytes.length; at++) {
    if (bytes[at] !== 0xff) continue
    const next = bytes[at + 1] as number
    if (next !== 0x00 && next !== 0xff && !isRestart(next)) return at
  }
  return refuse('jpeg scan has no end')
}

// Up to and including the first EOI: whatever follows it (a motion photo, a second image) is dropped.
function stripJpeg(bytes: Uint8Array): Uint8Array {
  if (!startsWith(bytes, [0xff, 0xd8])) refuse('jpeg has no SOI')
  const view = viewOf(bytes)
  const kept: Uint8Array[] = [bytes.subarray(0, 2)]
  let at = 2
  let oriented = false
  for (;;) {
    if (bytes[at] !== 0xff) refuse('jpeg marker expected')
    while (bytes[at + 1] === 0xff) at++
    if (at + 1 >= bytes.length) refuse('jpeg ends without EOI')
    const marker = bytes[at + 1] as number
    if (marker === EOI) {
      kept.push(bytes.subarray(at, at + 2))
      return concat(kept)
    }
    if (isRestart(marker) || marker === 0x01) {
      kept.push(bytes.subarray(at, at + 2))
      at += 2
      continue
    }
    if (at + 4 > bytes.length) refuse('jpeg segment header cut off')
    const length = view.getUint16(at + 2)
    const end = at + 2 + length
    if (length < 2 || end > bytes.length) refuse('jpeg segment runs past the end')
    if (marker === APP1) {
      const orientation: number | null = oriented ? null : orientationOf(bytes.subarray(at + 4, end))
      if (orientation !== null) kept.push(minimalExif(orientation))
      oriented ||= orientation !== null
    } else if (marker === SOS) {
      const scanned = scanEnd(bytes, end)
      kept.push(bytes.subarray(at, scanned))
      at = scanned
      continue
    } else if (marker !== APP13 && marker !== COM) {
      kept.push(bytes.subarray(at, end))
    }
    at = end
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PNG_DROPPED = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt'])

const typeAt = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))

// Chunks are copied whole, CRC included; bytes after IEND are dropped.
function stripPng(bytes: Uint8Array): Uint8Array {
  if (!startsWith(bytes, PNG_SIGNATURE)) refuse('png has no signature')
  const view = viewOf(bytes)
  const kept: Uint8Array[] = [bytes.subarray(0, 8)]
  for (let at = 8; ; ) {
    if (at + 12 > bytes.length) refuse('png ends without IEND')
    const end = at + 12 + view.getUint32(at)
    if (end > bytes.length) refuse('png chunk runs past the end')
    const type = typeAt(bytes, at + 4)
    if (!PNG_DROPPED.has(type)) kept.push(bytes.subarray(at, end))
    if (type === 'IEND') return concat(kept)
    at = end
  }
}

const WEBP_DROPPED = new Set(['EXIF', 'XMP '])
const VP8X_EXIF = 0x08
const VP8X_XMP = 0x04

// Chunks inside the RIFF size are walked; anything after it is dropped and the size rewritten.
function stripWebp(bytes: Uint8Array): Uint8Array {
  if (!startsWith(bytes, ascii('RIFF')) || !startsWith(bytes, ascii('WEBP'), 8)) refuse('webp has no RIFF header')
  const view = viewOf(bytes)
  const riffEnd = 8 + view.getUint32(4, true)
  if (riffEnd > bytes.length) refuse('webp RIFF size runs past the end')
  const kept: Uint8Array[] = []
  for (let at = 12; at < riffEnd; ) {
    if (at + 8 > riffEnd) refuse('webp chunk header cut off')
    const size = view.getUint32(at + 4, true)
    const end = at + 8 + size + (size % 2)
    if (end > riffEnd) refuse('webp chunk runs past the RIFF')
    const type = typeAt(bytes, at)
    if (type === 'VP8X' && size > 0) {
      const chunk = bytes.slice(at, end)
      chunk[8] = (chunk[8] as number) & ~(VP8X_EXIF | VP8X_XMP)
      kept.push(chunk)
    } else if (!WEBP_DROPPED.has(type)) {
      kept.push(bytes.subarray(at, end))
    }
    at = end
  }
  const out = concat([bytes.subarray(0, 12), ...kept])
  viewOf(out).setUint32(4, out.length - 8, true)
  return out
}
