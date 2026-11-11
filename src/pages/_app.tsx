import type { AppProps } from 'next/app'

import '../style.css'
import '../App.scss'

import { invoke } from '@tauri-apps/api/core'
import { LogicalPosition } from '@tauri-apps/api/dpi'
import { Menu } from '@tauri-apps/api/menu/menu'
import { useEffect } from 'react'
import AppErrorBoundary from 'src/components/AppErrorBoundary'
import { useTauriListen } from 'src/hooks/useTauriListen'
import { IntlProviderWrapper } from 'src/i18n'
import { RsuiteProviderWrapper } from 'src/theme'
import { loadEmojiCatalogEntries, refreshEmojiCatalogEntries } from 'src/utils/emojiCatalog'

// This default export is required in a new `pages/_app.js` file.
export default function MyApp({ Component, pageProps }: AppProps) {
  // Never remount the page for emoji catalog updates: that discarded every timeline and
  // reloaded them right after launch. Cached entries are used first, the network refresh runs in the background.
  const refreshEmojiCatalogs = (force: boolean) => {
    void refreshEmojiCatalogEntries({ force }).catch(err => {
      console.error(err)
    })
  }

  useTauriListen('updated-servers', () => {
    refreshEmojiCatalogs(true)
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

    void loadEmojiCatalogEntries()
      .catch(err => {
        console.error(err)
      })
      .finally(() => {
        refreshEmojiCatalogs(false)
      })

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
          <Component {...pageProps} />
        </IntlProviderWrapper>
      </RsuiteProviderWrapper>
    </AppErrorBoundary>
  )
}
