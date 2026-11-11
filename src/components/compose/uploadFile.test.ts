import {
  computeResizeDimensions,
  detectImageMimeType,
  inferAttachmentMimeType,
  isAnimatedImageBytes,
  isSupportedAttachmentFile,
  normalizeUploadFile
} from './uploadFile'

describe('compose upload file helpers', () => {
  it('infers PNG mime type from file extension when drag payload omits type', () => {
    const file = new File(['png'], '스크린샷 2026-04-04 오후 3.53.29.png', { type: '' })

    expect(inferAttachmentMimeType(file)).toBe('image/png')
    expect(isSupportedAttachmentFile(file)).toBe(true)
  })

  it('preserves provided mime types', () => {
    const file = new File(['png'], 'image.png', { type: 'image/png' })

    expect(inferAttachmentMimeType(file)).toBe('image/png')
    expect(normalizeUploadFile(file)).toBe(file)
  })

  it('rebuilds files with inferred mime types before upload', async () => {
    const file = new File(['png'], 'image.png', { type: '' })

    const normalized = normalizeUploadFile(file)

    expect(normalized).not.toBe(file)
    expect(normalized.name).toBe('image.png')
    expect(normalized.type).toBe('image/png')
    await expect(normalized.text()).resolves.toBe('png')
  })

  it('rejects unsupported extensions without a mime type', () => {
    const file = new File(['doc'], 'notes.txt', { type: '' })

    expect(isSupportedAttachmentFile(file)).toBe(false)
  })
})

describe('upload image resize helpers', () => {
  it('scales wide images down to 1060px keeping the aspect ratio', () => {
    expect(computeResizeDimensions(3024, 4032)).toEqual({ width: 1060, height: 1413 })
    expect(computeResizeDimensions(2880, 1800)).toEqual({ width: 1060, height: 663 })
  })

  it('leaves images that already fit untouched', () => {
    expect(computeResizeDimensions(1060, 3000)).toBeNull()
    expect(computeResizeDimensions(800, 600)).toBeNull()
  })

  const gce = [0x21, 0xf9, 0x04, 0, 0, 0, 0, 0]
  const gif = (frames: number) => new Uint8Array([...Array.from('GIF89a').map(c => c.charCodeAt(0)), ...Array(frames).fill(gce).flat()])

  it('detects animated GIFs but not single-frame GIFs', () => {
    expect(isAnimatedImageBytes(gif(3))).toBe(true)
    expect(isAnimatedImageBytes(gif(1))).toBe(false)
  })

  const chunk = (name: string, length = 0) => [0, 0, 0, length, ...Array.from(name).map(c => c.charCodeAt(0)), ...Array(length + 4).fill(0)]
  const png = (...chunks: number[][]) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunks.flat()])

  it('detects APNG via acTL before IDAT', () => {
    expect(isAnimatedImageBytes(png(chunk('IHDR', 13), chunk('acTL', 8), chunk('IDAT')))).toBe(true)
    expect(isAnimatedImageBytes(png(chunk('IHDR', 13), chunk('IDAT')))).toBe(false)
  })

  it('detects PNG and JPEG signatures from native clipboard output', () => {
    expect(detectImageMimeType(png())).toBe('image/png')
    expect(detectImageMimeType(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('image/jpeg')
    expect(detectImageMimeType(new Uint8Array([1, 2, 3]))).toBe('')
  })
})
