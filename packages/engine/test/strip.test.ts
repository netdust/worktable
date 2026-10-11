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

  const minimalExif = (orientation: number) =>
    segment(0xe1, [
      ...ascii('Exif\0\0'),
      ...ascii('II*\0'),
      ...u32le(8),
      ...u16le(1),
      ...[...u16le(0x0112), ...u16le(3), ...u32le(1), ...u16le(orientation), 0, 0],
      ...u32le(0),
    ])

  test('Exif, XMP, APP13, COM and the motion-photo trailer go; Orientation 6 stays in a minimal Exif block', () => {
    const out = strip(photo(6), 'image/jpeg')
    expect(out).toEqual(bytes(SOI, APP0, minimalExif(6), DQT, SOF0, DHT, SOS, SCAN, EOI))
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

  test('a little-endian Exif Orientation is kept', () => {
    const tiff = [
      ...ascii('II*\0'),
      ...u32le(8),
      ...u16le(1),
      ...[...u16le(0x0112), ...u16le(3), ...u32le(1), ...u16le(3), 0, 0],
      ...u32le(0),
    ]
    const input = bytes(SOI, segment(0xe1, [...ascii('Exif\0\0'), ...tiff]), DQT, SOS, SCAN, EOI)
    expect(strip(input, 'image/jpeg')).toEqual(bytes(SOI, minimalExif(3), DQT, SOS, SCAN, EOI))
  })

  test("a second Exif APP1 is dropped; only the first one's Orientation is kept", () => {
    const input = bytes(SOI, exif(6), exif(8), DQT, SOS, SCAN, EOI)
    expect(strip(input, 'image/jpeg')).toEqual(bytes(SOI, minimalExif(6), DQT, SOS, SCAN, EOI))
  })

  test('0xFF fill bytes before a marker are skipped', () => {
    expect(strip(bytes(SOI, [0xff, 0xff], DQT, SOS, SCAN, EOI), 'image/jpeg')).toEqual(bytes(SOI, DQT, SOS, SCAN, EOI))
  })

  test('a progressive jpeg keeps every scan and drops an APP1 between them', () => {
    const SOF2 = segment(0xc2, [8, 0, 1, 0, 1, 1, 1, 0x11, 0])
    const SCAN2 = [0x78, 0xff, 0x00, 0x9a]
    const input = bytes(SOI, DQT, SOF2, DHT, SOS, SCAN, exif(6), DHT, SOS, SCAN2, EOI)
    expect(strip(input, 'image/jpeg')).toEqual(bytes(SOI, DQT, SOF2, DHT, SOS, SCAN, DHT, SOS, SCAN2, EOI))
  })

  test('only known segments are kept: C2PA in APP11, APP3, a non-ICC APP2 and a non-JFIF APP0 go; ICC, Adobe and DRI stay', () => {
    const ICC = segment(0xe2, [...ascii('ICC_PROFILE\0'), 1, 1, ...ascii('icc bytes')])
    const ADOBE = segment(0xee, [...ascii('Adobe'), 0, 100, 0, 0, 0, 0, 1])
    const DRI = segment(0xdd, [0, 4])
    const C2PA = segment(0xeb, [...ascii('JP'), 0, 1, ...ascii('jumbc2pa GPS')])
    const APP3 = segment(0xe3, ascii('META camera serial'))
    const FPXR = segment(0xe2, ascii('FPXR\0camera'))
    const APP0_OTHER = segment(0xe0, ascii('AVI1\0camera'))
    const input = bytes(SOI, APP0, APP0_OTHER, ICC, FPXR, C2PA, APP3, ADOBE, DQT, DRI, SOF0, DHT, SOS, SCAN, EOI)
    expect(strip(input, 'image/jpeg')).toEqual(bytes(SOI, APP0, ICC, ADOBE, DQT, DRI, SOF0, DHT, SOS, SCAN, EOI))
  })

  // FF D8 read as a segment would take the next marker, FF E1, as its length and copy the Exif APP1 whole.
  test('a second SOI is refused, never walked as a segment', () => {
    const tiff = exifTiff(6)
    const padded = [...ascii('Exif\0\0'), ...tiff, ...Array(0xffe1 - 4 - 6 - tiff.length).fill(0)]
    expect(() => strip(bytes(SOI, SOI, segment(0xe1, padded), EOI), 'image/jpeg')).toThrow(StripError)
  })

  test.each([
    ['cut inside a segment', bytes(SOI, APP0.slice(0, 8))],
    ['with a 0x00 marker', bytes(SOI, [0xff, 0x00, 0, 4, 0, 0], EOI)],
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
  const SRGB = chunk('sRGB', [0])
  const IDAT = chunk('IDAT', [0x78, 0x9c, 0x63, 0xf8, 0x0f, 0x00, 0x01, 0x01, 0x01, 0x00])
  const IEND = chunk('IEND', [])

  test('eXIf, tEXt, iTXt, zTXt and bytes after IEND go; the other chunks and their CRCs are untouched', () => {
    const input = bytes(
      SIGNATURE,
      IHDR,
      chunk('eXIf', ascii('MM\0*GPS')),
      chunk('tEXt', ascii('Location\0home')),
      SRGB,
      chunk('iTXt', ascii('XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta/>')),
      chunk('zTXt', ascii('Comment\0\0x')),
      IDAT,
      IEND,
      ascii('trailing GPS'),
    )
    const out = strip(input, 'image/png')
    expect(out).toEqual(bytes(SIGNATURE, IHDR, SRGB, IDAT, IEND))
    const view = new DataView(out.buffer, out.byteOffset)
    for (let at = 8; at < out.length; ) {
      const length = view.getUint32(at)
      expect(view.getUint32(at + 8 + length)).toBe(Bun.hash.crc32(out.subarray(at + 4, at + 8 + length)))
      at += 12 + length
    }
  })

  test('only known chunks are kept: caBX, tIME and zTXt go, iCCP stays', () => {
    const ICCP = chunk('iCCP', [...ascii('icc\0'), 0, 0x78, 0x9c])
    const input = bytes(
      SIGNATURE,
      IHDR,
      ICCP,
      chunk('zTXt', ascii('Comment\0\0x')),
      SRGB,
      chunk('tIME', [0x07, 0xea, 1, 1, 0, 0, 0]),
      chunk('caBX', ascii('jumbc2pa GPS')),
      IDAT,
      IEND,
    )
    expect(strip(input, 'image/png')).toEqual(bytes(SIGNATURE, IHDR, ICCP, SRGB, IDAT, IEND))
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

  test('only known chunks are kept: C2PA goes, ICCP stays', () => {
    const ICCP = chunk('ICCP', ascii('icc bytes'))
    const input = riff(vp8x(0x20), ICCP, VP8L, chunk('C2PA', ascii('jumbc2pa GPS')))
    expect(strip(input, 'image/webp')).toEqual(riff(vp8x(0x20), ICCP, VP8L))
  })

  test('bytes after the RIFF end are dropped', () => {
    expect(strip(bytes([...riff(VP8L)], ascii('trailing GPS')), 'image/webp')).toEqual(riff(VP8L))
  })

  test.each([
    ['whose RIFF size runs past the end', bytes(ascii('RIFF'), u32le(100), ascii('WEBP'), VP8L)],
    ['with a chunk running past the RIFF', riff(VP8L.slice(0, 9))],
    ['cut inside a chunk header', riff(ascii('VP8'))],
  ])('a webp %s is refused', (_, input) => {
    expect(() => strip(input, 'image/webp')).toThrow(StripError)
  })
})

test('a type strip does not know fails loudly, not as a file it cannot walk', () => {
  const unknown = 'image/gif' as Parameters<typeof strip>[1]
  let thrown: unknown
  try {
    strip(new Uint8Array(ascii('GIF89a')), unknown)
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(Error)
  expect(thrown).not.toBeInstanceOf(StripError)
})
