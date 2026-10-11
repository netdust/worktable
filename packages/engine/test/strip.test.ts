import { describe, expect, test } from 'bun:test'
import { StripError, strip } from '../src/strip'

const ascii = (text: string) => [...new TextEncoder().encode(text)]
const bytes = (...parts: number[][]) => new Uint8Array(parts.flat())
const contains = (haystack: Uint8Array, needle: number[]) =>
  haystack.some((_, i) => needle.every((b, j) => haystack[i + j] === b))
const u16be = (n: number) => [n >> 8, n & 0xff]
const u16le = (n: number) => [n & 0xff, n >> 8]
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
const u32le = (n: number) => [...u32be(n)].reverse()

describe('jpeg', () => {
  const segment = (marker: number, data: number[]) => [0xff, marker, ...u16be(data.length + 2), ...data]
  const SOI = [0xff, 0xd8]
  const EOI = [0xff, 0xd9]
  const APP0 = segment(0xe0, [...ascii('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0])
  const DQT = segment(0xdb, [0, ...Array.from({ length: 64 }, (_, i) => i + 1)])
  const SOF0 = segment(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0])
  const DHT = segment(0xc4, [0, 1, ...Array(15).fill(0), 0])
  const SOS = segment(0xda, [1, 1, 0, 0, 0x3f, 0])
  // Entropy-coded data with a stuffed 0xFF and a restart marker, which are not segment boundaries.
  const SCAN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]

  // Big-endian TIFF: Orientation, Make "Phone" and a GPS IFD holding latitude "N".
  function exifTiff(orientation: number | null): number[] {
    const entries: number[][] = []
    if (orientation !== null) entries.push([...u16be(0x0112), ...u16be(3), ...u32be(1), ...u16be(orientation), 0, 0])
    const count = entries.length + 2
    const makeAt = 8 + 2 + count * 12 + 4
    const gpsAt = makeAt + 6
    entries.push([...u16be(0x010f), ...u16be(2), ...u32be(6), ...u32be(makeAt)])
    entries.push([...u16be(0x8825), ...u16be(4), ...u32be(1), ...u32be(gpsAt)])
    const gps = [...u16be(1), ...u16be(0x0001), ...u16be(2), ...u32be(2), ...ascii('N\0'), 0, 0, ...u32be(0)]
    return [
      ...ascii('MM\0*'),
      ...u32be(8),
      ...u16be(count),
      ...entries.flat(),
      ...u32be(0),
      ...ascii('Phone\0'),
      ...gps,
    ]
  }

  const exif = (orientation: number | null) => segment(0xe1, [...ascii('Exif\0\0'), ...exifTiff(orientation)])
  const XMP = segment(0xe1, ascii('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>GPSLatitude</x:xmpmeta>'))
  const APP13 = segment(0xed, ascii('Photoshop 3.0\0IPTC caption'))
  const COM = segment(0xfe, ascii('taken at home'))
  const MP4 = [...u32be(16), ...ascii('ftypmp42'), ...u32be(0)]

  const photo = (orientation: number | null) =>
    bytes(SOI, APP0, exif(orientation), XMP, APP13, COM, DQT, SOF0, DHT, SOS, SCAN, EOI, MP4)

  test('Exif, XMP, APP13, COM and the motion-photo trailer go; Orientation 6 stays in a minimal Exif block', () => {
    const minimalExif = segment(0xe1, [
      ...ascii('Exif\0\0'),
      ...ascii('II*\0'),
      ...u32le(8),
      ...u16le(1),
      ...[...u16le(0x0112), ...u16le(3), ...u32le(1), ...u16le(6), 0, 0],
      ...u32le(0),
    ])
    const out = strip(photo(6), 'image/jpeg')
    expect(out).toEqual(bytes(SOI, APP0, minimalExif, DQT, SOF0, DHT, SOS, SCAN, EOI))
    for (const leak of ['Phone', 'GPSLatitude', 'IPTC', 'taken at home', 'ftyp']) {
      expect(contains(out, ascii(leak))).toBe(false)
    }
  })

  test('a jpeg without Orientation gets no APP1 back', () => {
    expect(strip(photo(null), 'image/jpeg')).toEqual(bytes(SOI, APP0, DQT, SOF0, DHT, SOS, SCAN, EOI))
  })

  test('a jpeg of only SOI and EOI passes', () => {
    expect(strip(bytes(SOI, EOI), 'image/jpeg')).toEqual(bytes(SOI, EOI))
  })

  test.each([
    ['cut inside a segment', bytes(SOI, APP0.slice(0, 8))],
    ['cut inside the scan', bytes(SOI, DQT, SOS, SCAN)],
    ['with no EOI', bytes(SOI, APP0)],
    ['a segment length under 2', bytes(SOI, [0xff, 0xe0, 0, 1], EOI)],
    ['junk where a marker belongs', bytes(SOI, [0x00, 0x01], EOI)],
  ])('a jpeg %s is refused', (_, input) => {
    expect(() => strip(input, 'image/jpeg')).toThrow(StripError)
  })
})

describe('png', () => {
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  function chunk(type: string, data: number[]): number[] {
    const body = new Uint8Array([...ascii(type), ...data])
    return [...u32be(data.length), ...body, ...u32be(Bun.hash.crc32(body))]
  }
  const IHDR = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])
  const PLTE_LIKE = chunk('sRGB', [0])
  const IDAT = chunk('IDAT', [0x78, 0x9c, 0x63, 0xf8, 0x0f, 0x00, 0x01, 0x01, 0x01, 0x00])
  const IEND = chunk('IEND', [])

  test('eXIf, tEXt, iTXt, zTXt and bytes after IEND go; the other chunks and their CRCs are untouched', () => {
    const input = bytes(
      SIGNATURE,
      IHDR,
      chunk('eXIf', ascii('MM\0*GPS')),
      chunk('tEXt', ascii('Location\0home')),
      PLTE_LIKE,
      chunk('iTXt', ascii('XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta/>')),
      chunk('zTXt', ascii('Comment\0\0x')),
      IDAT,
      IEND,
      ascii('trailing GPS'),
    )
    const out = strip(input, 'image/png')
    expect(out).toEqual(bytes(SIGNATURE, IHDR, PLTE_LIKE, IDAT, IEND))
    const view = new DataView(out.buffer, out.byteOffset)
    for (let at = 8; at < out.length; ) {
      const length = view.getUint32(at)
      expect(view.getUint32(at + 8 + length)).toBe(Bun.hash.crc32(out.subarray(at + 4, at + 8 + length)))
      at += 12 + length
    }
  })

  test.each([
    ['with no IEND', bytes(SIGNATURE, IHDR, IDAT)],
    ['with a chunk running past the end', bytes(SIGNATURE, IHDR, IDAT.slice(0, 12), IEND.slice(0, 4))],
    ['cut inside a chunk header', bytes(SIGNATURE, IHDR, [0, 0])],
  ])('a png %s is refused', (_, input) => {
    expect(() => strip(input, 'image/png')).toThrow(StripError)
  })
})

describe('webp', () => {
  const chunk = (type: string, data: number[]) => [
    ...ascii(type),
    ...u32le(data.length),
    ...data,
    ...(data.length % 2 ? [0] : []),
  ]
  const riff = (...chunks: number[][]) => {
    const body = [...ascii('WEBP'), ...chunks.flat()]
    return bytes(ascii('RIFF'), u32le(body.length), body)
  }
  const ALPHA = 0x10
  const EXIF_FLAG = 0x08
  const XMP_FLAG = 0x04
  const vp8x = (flags: number) => chunk('VP8X', [flags, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  const VP8L = chunk('VP8L', [0x2f, 0, 0, 0, 0x10])

  test('EXIF and XMP chunks go, the VP8X flags are cleared and the RIFF size is right', () => {
    const input = riff(
      vp8x(ALPHA | EXIF_FLAG | XMP_FLAG),
      VP8L,
      chunk('EXIF', ascii('MM\0*GPS')),
      chunk('XMP ', ascii('<x:xmpmeta>GPS</x:xmpmeta>')),
    )
    const out = strip(input, 'image/webp')
    expect(out).toEqual(riff(vp8x(ALPHA), VP8L))
    expect(new DataView(out.buffer, out.byteOffset).getUint32(4, true)).toBe(out.length - 8)
  })

  test.each([
    ['whose RIFF size runs past the end', bytes(ascii('RIFF'), u32le(100), ascii('WEBP'), VP8L)],
    ['with a chunk running past the RIFF', riff(VP8L.slice(0, 9))],
    ['cut inside a chunk header', riff(ascii('VP8'))],
  ])('a webp %s is refused', (_, input) => {
    expect(() => strip(input, 'image/webp')).toThrow(StripError)
  })
})
