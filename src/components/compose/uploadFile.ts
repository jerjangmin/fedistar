const ATTACHMENT_MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  mkv: 'video/x-matroska'
}

const fileExtension = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

export const inferAttachmentMimeType = (file: Pick<File, 'name' | 'type'>) => {
  if (typeof file.type === 'string' && file.type.trim().length > 0) {
    return file.type
  }

  return ATTACHMENT_MIME_TYPES[fileExtension(file.name)] ?? ''
}

export const isSupportedAttachmentFile = (file: Pick<File, 'name' | 'type'>) => {
  const type = inferAttachmentMimeType(file)
  return type.startsWith('image/') || type.startsWith('video/')
}

export const normalizeUploadFile = (file: File) => {
  const inferredType = inferAttachmentMimeType(file)
  if (inferredType.length === 0 || file.type === inferredType) {
    return file
  }

  return new File([file], file.name, {
    type: inferredType,
    lastModified: file.lastModified
  })
}
