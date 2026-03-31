import { invoke } from '@tauri-apps/api/core'
import { LogicalPosition } from '@tauri-apps/api/dpi'
import { Submenu } from '@tauri-apps/api/menu/submenu'
import { useToaster } from 'rsuite'
import { MouseEvent, ReactElement, useCallback } from 'react'
import { useIntl } from 'react-intl'
import alert from 'src/components/utils/alert'

type Props = {
  imageUrl: string
  children: ReactElement
}

const ImageContextMenu: React.FC<Props> = ({ imageUrl, children }) => {
  const { formatMessage } = useIntl()
  const toaster = useToaster()

  const downloadImage = useCallback(async () => {
    try {
      await invoke('download_media', { mediaUrl: imageUrl })
    } catch (err) {
      console.error(err)
      toaster.push(alert('error', formatMessage({ id: 'alert.failed_download_image' })), { placement: 'topStart' })
    }
  }, [formatMessage, imageUrl, toaster])

  const copyImage = useCallback(async () => {
    try {
      await invoke('copy_image_to_clipboard', { imageUrl })
    } catch (err) {
      console.error(err)
      toaster.push(alert('error', formatMessage({ id: 'alert.failed_copy_image' })), { placement: 'topStart' })
    }
  }, [formatMessage, imageUrl, toaster])

  const openNativeMenu = useCallback(
    async (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()

      const menu = await Submenu.new({
        text: 'Image',
        items: [
          {
            id: 'download-image',
            text: formatMessage({ id: 'media.menu.download_image' }),
            action: () => {
              void downloadImage()
            },
          },
          {
            id: 'copy-image',
            text: formatMessage({ id: 'media.menu.copy_image' }),
            action: () => {
              void copyImage()
            },
          },
        ],
      })

      try {
        await menu.popup(new LogicalPosition(event.clientX, event.clientY))
      } finally {
        await menu.close()
      }
    },
    [copyImage, downloadImage, formatMessage]
  )

  return (
    <div
      onContextMenu={openNativeMenu}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' }}
    >
      {children}
    </div>
  )
}

export default ImageContextMenu
