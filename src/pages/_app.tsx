import type { AppProps } from 'next/app'

import '../style.css'
import '../App.scss'

import { invoke } from '@tauri-apps/api/core'
import { LogicalPosition } from '@tauri-apps/api/dpi'
import { Menu } from '@tauri-apps/api/menu/menu'
import { useEffect, useState } from 'react'
import AppErrorBoundary from 'src/components/AppErrorBoundary'
import { useTauriListen } from 'src/hooks/useTauriListen'
import { IntlProviderWrapper } from 'src/i18n'
import { RsuiteProviderWrapper } from 'src/theme'
import { refreshEmojiCatalogEntries } from 'src/utils/emojiCatalog'

// This default export is required in a new `pages/_app.js` file.
export default function MyApp({ Component, pageProps }: AppProps) {
  const [emojiCatalogVersion, setEmojiCatalogVersion] = useState(0)

  const loadEmojiCatalogs = () => {
    void refreshEmojiCatalogEntries()
      .then(() => {
        setEmojiCatalogVersion(current => current + 1)
      })
      .catch(err => {
        console.error(err)
      })
  }

  useTauriListen('updated-servers', () => {
    loadEmojiCatalogs()
  })

  useEffect(() => {
    const normalizeUnhandledReason = (reason: unknown) => {
      if (reason instanceof Error) {
        return reason.stack ?? reason.message
      }

      if (reason === null) {
        return 'Unhandled promise rejection: null'
      }

      if (reason === undefined) {
        return 'Unhandled promise rejection: undefined'
      }

      if (typeof reason === 'string') {
        return reason
      }

      try {
        return JSON.stringify(reason)
      } catch {
        return String(reason)
      }
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      void invoke('frontend_log', { level: 'error', message: normalizeUnhandledReason(event.reason) })
    }

    const handleWindowError = (event: ErrorEvent) => {
      void invoke('frontend_log', { level: 'error', message: event.message.toString() })
    }

    const openAppContextMenu = async (event: MouseEvent) => {
      if (event.defaultPrevented) {
        return
      }

      event.preventDefault()

      const menu = await Menu.new({
        items: [
          {
            id: 'reload',
            text: 'Reload',
            action: () => {
              window.location.reload()
            }
          },
          {
            id: 'open-devtools',
            text: 'Open DevTools',
            action: () => {
              void invoke('switch_devtools').catch(err => {
                console.error(err)
              })
            }
          }
        ]
      })

      try {
        await menu.popup(new LogicalPosition(event.clientX, event.clientY))
      } finally {
        await menu.close()
      }
    }

    document.addEventListener('contextmenu', openAppContextMenu)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('error', handleWindowError)

    loadEmojiCatalogs()

    return () => {
      document.removeEventListener('contextmenu', openAppContextMenu)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('error', handleWindowError)
    }
  }, [])

  return (
    <AppErrorBoundary>
      <RsuiteProviderWrapper>
        <IntlProviderWrapper>
          <Component key={emojiCatalogVersion} {...pageProps} />
        </IntlProviderWrapper>
      </RsuiteProviderWrapper>
    </AppErrorBoundary>
  )
}
