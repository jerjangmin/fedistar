import { inferAttachmentMimeType, isSupportedAttachmentFile, normalizeUploadFile } from './uploadFile'

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
