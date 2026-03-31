import { invoke } from '@tauri-apps/api/core'
import { ChangeEvent, SyntheticEvent, useEffect, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { Input, InputNumber, Modal, Panel, ButtonToolbar, Button, Checkbox } from 'rsuite'
import FormSelectControl from 'src/components/ui/FormSelectControl'
import { Settings as SettingsType, ThemeType } from 'src/entities/settings'
import { localeType } from 'src/i18n'
import { normalizeHexColor } from 'src/utils/highlightColor'

type Props = {
  open: boolean
  onClose: () => void
  reloadAppearance: () => void
  reloadBehavior: () => void
}

type FormValue = {
  font_size: number
  font_family: string | null
  language: localeType
  color_theme: ThemeType
  highlight_color: string
  confirm_reblog: boolean
}

type FormError = {
  font_size?: string
  highlight_color?: string
  language?: string
}

const languages = [
  {
    label: 'Bahasa Indonesia',
    value: 'id'
  },
  {
    label: 'Deutsch',
    value: 'de'
  },
  {
    label: 'English',
    value: 'en'
  },
  {
    label: 'Español',
    value: 'es-ES'
  },
  {
    label: 'français',
    value: 'fr'
  },
  {
    label: 'Interlingua',
    value: 'ia'
  },
  {
    label: 'italiano',
    value: 'it'
  },
  {
    label: 'Polski',
    value: 'pl'
  },
  {
    label: 'português brasileiro',
    value: 'pt-BR'
  },

  {
    label: '日本語',
    value: 'ja'
  },
  {
    label: '简体字',
    value: 'zh-CN'
  },
  {
    label: '한국어',
    value: 'ko'
  }
]

const themes = [
  {
    key: 'settings.settings.appearance.theme.light',
    value: 'light'
  },
  {
    key: 'settings.settings.appearance.theme.dark',
    value: 'dark'
  },
  {
    key: 'settings.settings.appearance.theme.high_contrast',
    value: 'high-contrast'
  }
]

export default function Settings(props: Props) {
  const { formatMessage } = useIntl()
  const [formValue, setFormValue] = useState<FormValue>({
    font_size: 14,
    font_family: null,
    language: 'en',
    color_theme: 'dark',
    highlight_color: '',
    confirm_reblog: false
  })
  const [formError, setFormError] = useState<FormError>({})
  const [fontList, setFontList] = useState<Array<{ label: string; value: string }>>([])
  const [settings, setSettings] = useState<SettingsType>()

  useEffect(() => {
    if (!props.open) {
      return
    }

    let active = true

    void (async () => {
      const settings = await invoke<SettingsType>('read_settings')
      const fonts = await invoke<Array<string>>('list_fonts')

      if (!active) {
        return
      }

      setFormValue(current =>
        Object.assign({}, current, settings.appearance, settings.behavior, {
          highlight_color: settings.appearance.highlight_color ?? ''
        })
      )
      setFormError({})
      setSettings(settings)
      setFontList(fonts.map(font => ({ label: font, value: font })))
    })().catch(error => {
      console.error(error)
    })

    return () => {
      active = false
    }
  }, [props.open])

  const validateForm = (): FormError => {
    const nextError: FormError = {}

    if (!Number.isFinite(formValue.font_size)) {
      nextError.font_size = formatMessage({ id: 'settings.settings.validation.font_size.type' })
    } else if (formValue.font_size < 1 || formValue.font_size > 30) {
      nextError.font_size = formatMessage({ id: 'settings.settings.validation.font_size.range' }, { from: 1, to: 30 })
    }

    if (!formValue.language) {
      nextError.language = formatMessage({ id: 'settings.settings.validation.language.required' })
    }

    if (
      formValue.highlight_color !== undefined &&
      formValue.highlight_color !== null &&
      formValue.highlight_color.trim().length > 0 &&
      normalizeHexColor(formValue.highlight_color) === null
    ) {
      nextError.highlight_color = formatMessage({ id: 'settings.settings.validation.highlight_color.format' })
    }

    return nextError
  }

  const handleSubmit = () => {
    const nextError = validateForm()
    setFormError(nextError)
    if (Object.keys(nextError).length > 0) {
      return
    }

    const highlightColor = normalizeHexColor(formValue.highlight_color)
    const nextSettings: SettingsType = {
      appearance: {
        font_size: Number(formValue.font_size),
        font_family: formValue.font_family,
        language: formValue.language,
        color_theme: formValue.color_theme,
        highlight_color: highlightColor
      },
      behavior: {
        confirm_reblog: formValue.confirm_reblog
      },
      app_menu: settings?.app_menu
    }

    void invoke('save_settings', { obj: nextSettings })
      .then(() => {
        props.reloadAppearance()
        props.reloadBehavior()
      })
      .catch(error => {
        console.error(error)
      })
  }

  const colorTheme = themes.map(theme => ({
    label: formatMessage({ id: theme.key }),
    value: theme.value
  }))

  const updateConfirmBoost = (_value: any, checked: boolean | SyntheticEvent<Element, Event>, _event?: ChangeEvent<HTMLInputElement>) => {
    if (typeof checked === 'boolean') {
      setFormValue(current => Object.assign({}, current, { confirm_reblog: checked }))
    }
  }

  return (
    <Modal backdrop="static" keyboard={true} open={props.open} onClose={props.onClose}>
      <Modal.Header>
        <Modal.Title>
          <FormattedMessage id="settings.settings.title" />
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div>
          <Panel header={<FormattedMessage id="settings.settings.appearance.title" />}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px' }}>
                <FormattedMessage id="settings.settings.appearance.language" />
              </label>
              <FormSelectControl
                name="language"
                onChange={value => {
                  if (!value) {
                    return
                  }

                  setFormError(current => Object.assign({}, current, { language: undefined }))
                  setFormValue(current => Object.assign({}, current, { language: value as localeType }))
                }}
                options={languages}
                value={formValue.language}
              />
              {formError.language ? <FormHelpError>{formError.language}</FormHelpError> : null}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px' }}>
                <FormattedMessage id="settings.settings.appearance.font_size" />
              </label>
              <InputNumber
                postfix="px"
                value={formValue.font_size}
                onChange={value => {
                  setFormError(current => Object.assign({}, current, { font_size: undefined }))
                  setFormValue(current => Object.assign({}, current, { font_size: Number(value) }))
                }}
              />
              {formError.font_size ? <FormHelpError>{formError.font_size}</FormHelpError> : null}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px' }}>
                <FormattedMessage id="settings.settings.appearance.font_family" />
              </label>
              <FormSelectControl
                emptyLabel={formatMessage({ id: 'settings.settings.appearance.font_family' })}
                name="font_family"
                onChange={value => {
                  setFormValue(current => Object.assign({}, current, { font_family: value }))
                }}
                options={fontList}
                value={formValue.font_family}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px' }}>
                <FormattedMessage id="settings.settings.appearance.color_theme" />
              </label>
              <FormSelectControl
                name="color_theme"
                onChange={value => {
                  if (!value) {
                    return
                  }

                  setFormValue(current => Object.assign({}, current, { color_theme: value as ThemeType }))
                }}
                options={colorTheme}
                value={formValue.color_theme}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px' }}>
                <FormattedMessage id="settings.settings.appearance.highlight_color" />
              </label>
              <Input
                placeholder="#3498FF"
                value={formValue.highlight_color}
                onChange={value => {
                  setFormError(current => Object.assign({}, current, { highlight_color: undefined }))
                  setFormValue(current => Object.assign({}, current, { highlight_color: value }))
                }}
              />
              <div>
                <FormattedMessage id="settings.settings.appearance.highlight_color_help" />
              </div>
              {formError.highlight_color ? <FormHelpError>{formError.highlight_color}</FormHelpError> : null}
            </div>
          </Panel>
          <Panel header={<FormattedMessage id="settings.settings.behavior.title" />}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px' }}>
                <FormattedMessage id="settings.settings.behavior.confirm_reblog" />
              </label>
              <Checkbox
                checked={formValue.confirm_reblog}
                onChange={updateConfirmBoost}
              />
            </div>
          </Panel>
          <div>
            <ButtonToolbar style={{ justifyContent: 'flex-end' }}>
              <Button appearance="primary" type="button" onClick={handleSubmit}>
                <FormattedMessage id="settings.settings.save" />
              </Button>
              <Button onClick={props.onClose}>
                <FormattedMessage id="settings.settings.close" />
              </Button>
            </ButtonToolbar>
          </div>
        </div>
      </Modal.Body>
    </Modal>
  )
}

const FormHelpError = ({ children }) => <div style={{ color: 'red', marginTop: '6px' }}>{children}</div>
