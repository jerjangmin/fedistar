import { createContext, useState, useEffect } from 'react'
import { CustomProvider, CustomProviderProps } from 'rsuite'
import { Locale, enGB, koKR, jaJP, deDE, frFR, zhCN, ptBR, plPL, itIT, esES } from 'rsuite/esm/locales'
import { invoke } from '@tauri-apps/api/core'
import { Settings } from 'src/entities/settings'
import { useTauriListen } from 'src/hooks/useTauriListen'
import { applyHighlightColor } from 'src/utils/highlightColor'

type Props = {
  children: React.ReactNode
}

const initValue: CustomProviderProps = {
  theme: 'dark'
}

const resolveRsuiteLocale = (language?: string | null): Locale => {
  switch (language) {
    case 'ko':
      return koKR
    case 'ja':
      return jaJP
    case 'de':
      return deDE
    case 'fr':
      return frFR
    case 'zh-CN':
      return zhCN
    case 'pt-BR':
      return ptBR
    case 'pl':
      return plPL
    case 'it':
      return itIT
    case 'es-ES':
      return esES
    default:
      return enGB
  }
}

export const Context = createContext(initValue)

export const RsuiteProviderWrapper: React.FC<Props> = props => {
  const [theme, setTheme] = useState<'dark' | 'light' | 'high-contrast'>('dark')
  const [locale, setLocale] = useState<Locale>(enGB)

  const loadTheme = () => {
    void invoke<Settings>('read_settings')
      .then(res => {
        setTheme(res.appearance.color_theme)
        setLocale(resolveRsuiteLocale(res.appearance.language))
        applyHighlightColor(res.appearance.highlight_color)
      })
      .catch(error => {
        console.error(error)
      })
  }

  useTauriListen('updated-settings', () => {
    loadTheme()
  })

  useEffect(() => {
    loadTheme()
  }, [])

  return (
    <Context.Provider value={{ theme }}>
      <CustomProvider theme={theme} locale={locale}>
        {props.children}
      </CustomProvider>
    </Context.Provider>
  )
}
