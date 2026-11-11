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

export const UPLOAD_IMAGE_MAX_WIDTH = 1060
export const UPLOAD_JPEG_QUALITY = 0.85
export const IMAGE_UPLOAD_TIMEOUT_MS = 60_000
export const VIDEO_UPLOAD_TIMEOUT_MS = 300_000

export const uploadTimeoutFor = (file: Pick<File, 'name' | 'type'>) =>
  inferAttachmentMimeType(file).startsWith('video/') ? VIDEO_UPLOAD_TIMEOUT_MS : IMAGE_UPLOAD_TIMEOUT_MS

// Returns null when the image already fits within maxWidth.
export const computeResizeDimensions = (width: number, height: number, maxWidth = UPLOAD_IMAGE_MAX_WIDTH) => {
  if (!(width > 0) || !(height > 0) || width <= maxWidth) {
    return null
  }

  return {
    width: maxWidth,
    height: Math.max(1, Math.round((height * maxWidth) / width))
  }
}

const RESIZABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif', 'image/avif', 'image/heic', 'image/heif'])
const ALPHA_CAPABLE_TYPES = new Set(['image/png', 'image/webp', 'image/gif', 'image/avif'])

const asciiAt = (bytes: Uint8Array, offset: number, text: string) => {
  if (offset + text.length > bytes.length) {
    return false
  }
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) {
      return false
    }
  }
  return true
}

// Detects animated GIF / APNG / animated WebP from file bytes so they are uploaded untouched.
export const isAnimatedImageBytes = (bytes: Uint8Array) => {
  if (asciiAt(bytes, 0, 'GIF8')) {
    // Each frame normally carries a Graphic Control Extension (21 F9 04).
    let frames = 0
    for (let i = 0; i + 2 < bytes.length; i += 1) {
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) {
        frames += 1
        if (frames > 1) {
          return true
        }
      }
    }
    return false
  }

  if (bytes[0] === 0x89 && asciiAt(bytes, 1, 'PNG')) {
    // Walk chunks until IDAT; an acTL chunk before it marks an APNG.
    let offset = 8
    while (offset + 8 <= bytes.length) {
      const length = ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
      if (asciiAt(bytes, offset + 4, 'acTL')) {
        return true
      }
      if (asciiAt(bytes, offset + 4, 'IDAT')) {
        return false
      }
      offset += 12 + length
    }
    return false
  }

  if (asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP') && asciiAt(bytes, 12, 'VP8X')) {
    return (bytes[20] & 0x02) !== 0
  }

  return false
}

export const detectImageMimeType = (bytes: Uint8Array) => {
  if (bytes[0] === 0x89 && asciiAt(bytes, 1, 'PNG')) {
    return 'image/png'
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return 'image/jpeg'
  }
  return ''
}

const replaceExtension = (name: string, extension: string) => {
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name
  return `${base || 'image'}.${extension}`
}

const loadImageElement = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to decode image for resizing'))
    }
    image.src = url
  })

const hasTransparentPixel = (context: CanvasRenderingContext2D, width: number, height: number) => {
  const pixels = context.getImageData(0, 0, width, height).data
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 255) {
      return true
    }
  }
  return false
}

/**
 * Shrinks images wider than maxWidth before upload, keeping the aspect ratio.
 * Videos, animated images, small images, and undecodable files are returned unchanged.
 * Images with transparency stay PNG; everything else becomes JPEG.
 */
export const resizeImageForUpload = async (file: File, maxWidth = UPLOAD_IMAGE_MAX_WIDTH): Promise<File> => {
  const type = inferAttachmentMimeType(file)
  if (!RESIZABLE_IMAGE_TYPES.has(type)) {
    return file
  }

  try {
    if (type === 'image/gif' || type === 'image/png' || type === 'image/webp') {
      if (isAnimatedImageBytes(new Uint8Array(await file.arrayBuffer()))) {
        return file
      }
    }

    const image = await loadImageElement(file)
    const target = computeResizeDimensions(image.naturalWidth, image.naturalHeight, maxWidth)
    if (!target) {
      return file
    }

    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return file
    }
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, target.width, target.height)

    const keepAlpha = ALPHA_CAPABLE_TYPES.has(type) && hasTransparentPixel(context, target.width, target.height)
    const outputType = keepAlpha ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, outputType, outputType === 'image/jpeg' ? UPLOAD_JPEG_QUALITY : undefined)
    )
    canvas.width = 0
    canvas.height = 0
    if (!blob) {
      return file
    }

    return new File([blob], replaceExtension(file.name || 'image', keepAlpha ? 'png' : 'jpg'), {
      type: outputType,
      lastModified: file.lastModified
    })
  } catch (error) {
    console.warn('Image resize skipped, uploading original', error)
    return file
  }
}

export const withTimeout = <T>(promise: Promise<T>, ms: number, label: string) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
