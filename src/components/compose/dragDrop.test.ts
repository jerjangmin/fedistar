import { collectDroppedFiles, hasDraggedFiles } from './dragDrop'

const createFileList = (files: Array<File>) =>
  Object.assign(files, {
    item: (index: number) => files[index] ?? null
  }) as unknown as FileList

const createItem = (kind: string, file: File | null) =>
  ({
    kind,
    getAsFile: () => file
  }) as DataTransferItem

describe('compose drag drop helpers', () => {
  it('detects dragged files from file list', () => {
    const file = new File(['hello'], 'image.png', { type: 'image/png' })

    expect(
      hasDraggedFiles({
        files: createFileList([file]),
        items: [] as unknown as DataTransferItemList,
        types: []
      })
    ).toBe(true)
  })

  it('detects dragged files from file items and public file url type', () => {
    expect(
      hasDraggedFiles({
        files: createFileList([]),
        items: [createItem('file', null)] as unknown as DataTransferItemList,
        types: ['public.file-url']
      })
    ).toBe(true)
  })

  it('returns false when no file payload is present', () => {
    expect(
      hasDraggedFiles({
        files: createFileList([]),
        items: [createItem('string', null)] as unknown as DataTransferItemList,
        types: ['text/plain']
      })
    ).toBe(false)
  })

  it('collects files from file list before items', () => {
    const primary = new File(['primary'], 'primary.png', { type: 'image/png' })
    const secondary = new File(['secondary'], 'secondary.png', { type: 'image/png' })

    expect(
      collectDroppedFiles({
        files: createFileList([primary]),
        items: [createItem('file', secondary)] as unknown as DataTransferItemList
      })
    ).toEqual([primary])
  })

  it('collects non-null file items when file list is empty', () => {
    const first = new File(['first'], 'first.png', { type: 'image/png' })
    const second = new File(['second'], 'second.png', { type: 'image/png' })

    expect(
      collectDroppedFiles({
        files: createFileList([]),
        items: [createItem('file', first), createItem('string', null), createItem('file', second)] as unknown as DataTransferItemList
      })
    ).toEqual([first, second])
  })

  it('returns no files when only a public file url marker is present', () => {
    expect(
      collectDroppedFiles({
        files: createFileList([]),
        items: [createItem('file', null)] as unknown as DataTransferItemList
      })
    ).toEqual([])
  })
})
