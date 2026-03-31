import { Entity } from 'megalodon'
import emptyPreview from 'src/black.png'

export const attachmentAlt = (media: Entity.Attachment) => (media.description ? media.description : media.id)

export const isImageAttachment = (media: Entity.Attachment) => media.type === 'image'

export const attachmentPreviewSrc = (media: Entity.Attachment) => {
  const previewUrl = media.preview_url?.trim()
  if (previewUrl) {
    return previewUrl
  }

  if (isImageAttachment(media) && media.url) {
    return media.url
  }

  return emptyPreview
}

export const attachmentPreviewUrl = (media: Entity.Attachment) => {
  const previewSrc = attachmentPreviewSrc(media)
  return typeof previewSrc === 'string' ? previewSrc : previewSrc.src
}
