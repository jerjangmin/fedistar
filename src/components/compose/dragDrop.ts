export const hasDraggedFiles = (dataTransfer: Pick<DataTransfer, 'files' | 'items' | 'types'>) => {
  if (dataTransfer.files.length > 0) {
    return true
  }

  if (Array.from(dataTransfer.items ?? []).some(item => item.kind === 'file')) {
    return true
  }

  return Array.from(dataTransfer.types ?? []).some(type => type === 'Files' || type === 'public.file-url')
}

export const collectDroppedFiles = (dataTransfer: Pick<DataTransfer, 'files' | 'items'>) => {
  if (dataTransfer.files.length > 0) {
    return Array.from(dataTransfer.files)
  }

  return Array.from(dataTransfer.items ?? [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null)
}
