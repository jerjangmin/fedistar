import {
  Button,
  ButtonToolbar,
  Whisper,
  Input,
  Popover,
  Dropdown,
  useToaster,
  IconButton,
  Toggle,
  Checkbox,
  FlexboxGrid,
  Radio
} from 'rsuite'
import {
  useState,
  useEffect,
  useRef,
  forwardRef,
  ChangeEvent,
  useCallback,
  useContext,
  ClipboardEventHandler,
  DragEventHandler,
  DragEvent
} from 'react'
import { Icon } from '@rsuite/icons'
import {
  BsEmojiLaughing,
  BsPaperclip,
  BsMenuButtonWide,
  BsGlobe,
  BsUnlock,
  BsLock,
  BsEnvelope,
  BsXCircle,
  BsX,
  BsPencil,
  BsClock,
  BsPeople
} from 'react-icons/bs'
import { Entity, MegalodonInterface } from 'megalodon'
import Picker from '@emoji-mart/react'
import { invoke } from '@tauri-apps/api/core'
import { readImage } from '@tauri-apps/plugin-clipboard-manager'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

import { data, mapCustomEmojiCategory } from 'src/utils/emojiData'
import { Server } from 'src/entities/server'
import { CustomEmojiCategory } from 'src/entities/emoji'
import alert from 'src/components/utils/alert'
import { Account } from 'src/entities/account'
import AutoCompleteTextarea, { ArgProps as AutoCompleteTextareaProps } from './AutoCompleteTextarea'
import languages from 'src/utils/languages'
import EditMedia from './EditMedia'
import { FormattedMessage, useIntl } from 'react-intl'
import { Context } from 'src/theme'
import { attachmentPreviewUrl } from 'src/utils/mediaAttachment'
import FormSelectControl from 'src/components/ui/FormSelectControl'

type Props = {
  server: Server
  account: Account
  client: MegalodonInterface
  in_reply_to?: Entity.Status
  edit_target?: Entity.Status
  quote_target?: Entity.Status
  defaultVisibility?: 'public' | 'unlisted' | 'private' | 'direct' | 'local'
  defaultNSFW?: boolean
  defaultLanguage?: string | null
  onClose?: () => void
  locale: string
  draggingAttachment?: boolean
  setAttachmentDropHandler?: (handler: ((files: Array<File>) => void) | null) => void
  onAttachmentDragEnter?: DragEventHandler<HTMLDivElement>
  onAttachmentDragOver?: DragEventHandler<HTMLDivElement>
  onAttachmentDragLeave?: DragEventHandler<HTMLDivElement>
  onAttachmentDrop?: DragEventHandler<HTMLDivElement>
}

type FormValue = {
  spoiler: string
  status: string
  attachments?: Array<Entity.Attachment | Entity.AsyncAttachment>
  nsfw?: boolean
  poll?: Poll
  scheduled_at?: Date
}

type Poll = {
  options: Array<string>
  expires_in: number
  multiple: boolean
}

type PollError = {
  expires_in?: string
  general?: string
  options?: Array<string | null>
}

type FormError = {
  poll?: PollError
  scheduled_at?: string
  status?: string
}

const MAX_ATTACHMENTS = 5
const SUPPORTED_ATTACHMENT_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'avif',
  'heic',
  'heif',
  'mp4',
  'mov',
  'm4v',
  'webm',
  'mkv'
])

const isUsableUploadFile = (value: unknown): value is File => {
  if (!(value instanceof File)) {
    return false
  }

  return typeof value.name === 'string' && typeof value.type === 'string' && typeof value.arrayBuffer === 'function'
}

const describeUploadCandidate = (value: unknown) => {
  if (value === null) {
    return 'null'
  }

  if (value === undefined) {
    return 'undefined'
  }

  if (value instanceof File) {
    return `File(name="${value.name}", type="${value.type}", size=${value.size})`
  }

  if (typeof value === 'object') {
    return Object.prototype.toString.call(value)
  }

  return typeof value
}

const firefishAttachmentFromResponse = (file: any): Entity.Attachment => ({
  id: file.id,
  type: file.type === 'image/gif' ? 'gifv' : file.type?.startsWith('video') ? 'video' : file.type?.startsWith('image') ? 'image' : 'unknown',
  url: file.url ? file.url : '',
  remote_url: file.url,
  preview_url: file.thumbnailUrl,
  text_url: file.url,
  meta: {
    width: file.properties?.width,
    height: file.properties?.height
  },
  description: file.comment,
  blurhash: file.blurhash
})

const Status: React.FC<Props> = props => {
  const { formatMessage } = useIntl()
  const { theme } = useContext(Context)

  const [formValue, setFormValue] = useState<FormValue>({
    spoiler: '',
    status: ''
  })
  const [formError, setFormError] = useState<any>({})
  const [customEmojis, setCustomEmojis] = useState<Array<CustomEmojiCategory>>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private' | 'direct' | 'local'>('public')
  const [cw, setCW] = useState<boolean>(false)
  const [language, setLanguage] = useState<string>('en')
  const [editMediaModal, setEditMediaModal] = useState(false)
  const [editMedia, setEditMedia] = useState<Entity.Attachment | null>(null)
  const [maxCharacters, setMaxCharacters] = useState<number | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)

  const cwRef = useRef<HTMLInputElement>(null)
  const statusRef = useRef<HTMLTextAreaElement>(null)
  const emojiPickerRef = useRef(null)
  const uploaderRef = useRef<HTMLInputElement>(null)
  const toast = useToaster()

  // Update instance custom emoji
  useEffect(() => {
    if (!props.client || !props.server) {
      return
    }

    const f = async () => {
      const instance = await invoke<Entity.Instance>('get_instance', { serverId: props.server.id })
      if (instance.configuration.statuses.max_characters) {
        setMaxCharacters(instance.configuration.statuses.max_characters)
      }
      const emojis = await props.client.getInstanceCustomEmojis()
      setCustomEmojis(mapCustomEmojiCategory(props.server.domain, emojis.data))
    }
    f()
  }, [props.server, props.client])

  // Set replyTo or edit target
  useEffect(() => {
    if (props.in_reply_to) {
      const mentionAccounts = [props.in_reply_to.account.acct, ...props.in_reply_to.mentions.map(a => a.acct)]
        .filter((a, i, self) => self.indexOf(a) === i)
        .filter(a => !isOwnAccountMention(a, props.account.username, props.server.domain))
      setFormValue({
        spoiler: props.in_reply_to.spoiler_text,
        status: `${mentionAccounts.map(m => `@${m}`).join(' ')} `
      })
      setCW(props.in_reply_to.spoiler_text.length > 0)
      setVisibility(props.in_reply_to.visibility)
      if (props.in_reply_to.language) {
        setLanguage(props.in_reply_to.language)
      }
    } else if (props.edit_target) {
      const target = props.edit_target

      const f = async () => {
        // The content is wrapped with HTML, so we want plain content.
        const res = await props.client.getStatusSource(target.id)

        let value = {
          spoiler: res.data.spoiler_text,
          status: res.data.text
        }

        if (target.sensitive) {
          value = Object.assign(value, {
            nsfw: target.sensitive
          })
        }
        if (target.media_attachments.length > 0) {
          value = Object.assign(value, {
            attachments: target.media_attachments
          })
        }
        setFormValue(value)
        setCW(res.data.spoiler_text.length > 0)
        setVisibility(target.visibility)
        if (target.language) {
          setLanguage(target.language)
        }
      }
      f()
    } else if (props.quote_target) {
      // Nothing todo
    } else {
      clear()
    }
  }, [props.in_reply_to, props.edit_target, props.quote_target, props.account, props.client])

  // Set visibility
  useEffect(() => {
    if (props.defaultVisibility) {
      setVisibility(props.defaultVisibility)
    }
  }, [props.defaultVisibility])

  // Set NSFW
  useEffect(() => {
    if (props.defaultNSFW) {
      setFormValue(current =>
        Object.assign({}, current, {
          nsfw: props.defaultNSFW
        })
      )
    }
  }, [props.defaultNSFW])

  // Set Language
  useEffect(() => {
    if (props.defaultLanguage) {
      setLanguage(props.defaultLanguage)
    } else {
      const key = localStorage.getItem('language')
      if (key) {
        setLanguage(key)
      }
    }
  }, [props.defaultLanguage, props.client])

  // Set Remaining
  useEffect(() => {
    if (maxCharacters) {
      setRemaining(maxCharacters - formValue.status.length - formValue.spoiler.length)
    }
  }, [maxCharacters, formValue])

  const submitStatus = async () => {
    if (loading) {
      return
    }

    const validationError = validateFormValue(formValue)
    setFormError(validationError)
    if (hasFormError(validationError)) {
      toast.push(alert('error', formatMessage({ id: 'alert.validation_error' })), { placement: 'topStart' })
      return
    }

    setLoading(true)
    try {
      let options = { visibility: visibility }
      if (props.in_reply_to) {
        options = Object.assign({}, options, {
          in_reply_to_id: props.in_reply_to.id
        })
      }
      if (props.quote_target) {
        options = Object.assign({}, options, {
          quote_id: props.quote_target.id
        })
      }
      if (formValue.attachments) {
        options = Object.assign({}, options, {
          media_ids: formValue.attachments.map(m => m.id)
        })
      }
      if (formValue.nsfw !== undefined) {
        options = Object.assign({}, options, {
          sensitive: formValue.nsfw
        })
      }
      if (language) {
        options = Object.assign({}, options, {
          language: language
        })
      }
      if (formValue.spoiler.length > 0) {
        options = Object.assign({}, options, {
          spoiler_text: formValue.spoiler
        })
      }
      if (formValue.poll !== undefined && formValue.poll.options.length > 0) {
        options = Object.assign({}, options, {
          poll: formValue.poll
        })
      }
      if (formValue.scheduled_at !== undefined) {
        options = Object.assign({}, options, {
          scheduled_at: formValue.scheduled_at.toISOString()
        })
      }
      if (props.edit_target) {
        await props.client.editStatus(
          props.edit_target.id,
          Object.assign({}, options, {
            status: formValue.status
          })
        )
      } else {
        await props.client.postStatus(formValue.status, options)
      }
      clear()
    } catch (err) {
      console.error(err)
      toast.push(alert('error', formatMessage({ id: 'alert.failed_post' })), { placement: 'topStart' })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = () => {
    void submitStatus()
  }

  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if ((event.ctrlKey === true || event.metaKey === true) && event.key === 'Enter') {
        if (document.activeElement === statusRef.current || document.activeElement === cwRef.current) {
          event.preventDefault()
          handleSubmit()
        }
      }
    },
    [handleSubmit]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress)

    return () => {
      document.removeEventListener('keydown', handleKeyPress)
    }
  }, [handleKeyPress])

  const clear = () => {
    setFormValue({
      spoiler: '',
      status: ''
    })
    setFormError({})
    setCW(false)
    if (props.onClose) {
      props.onClose()
    }
  }

  const onEmojiSelect = emoji => {
    const textarea = statusRef.current
    if (!textarea) {
      return
    }
    const cursor = textarea.selectionStart
    if (emoji.native) {
      setFormValue(current =>
        Object.assign({}, current, {
          status: `${current.status.slice(0, cursor)}${emoji.native} ${current.status.slice(cursor)}`
        })
      )
    } else if (emoji.shortcodes) {
      // Custom emojis don't have native code
      setFormValue(current =>
        Object.assign({}, current, {
          status: `${current.status.slice(0, cursor)}${emoji.shortcodes} ${current.status.slice(cursor)}`
        })
      )
    }
    emojiPickerRef?.current.close()
  }

  const selectFile = () => {
    if (uploaderRef.current) {
      uploaderRef.current.click()
    }
  }

  const isSupportedAttachment = (file: File) => {
    if (file.type.includes('image') || file.type.includes('video')) {
      return true
    }

    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension) {
      return false
    }

    return SUPPORTED_ATTACHMENT_EXTENSIONS.has(extension)
  }

  const uploadAttachmentDirect = useCallback(async (file: File): Promise<Entity.Attachment | Entity.AsyncAttachment> => {
    const endpoint =
      props.server.sns === 'firefish'
        ? new URL('/api/drive/files/create', props.server.base_url).toString()
        : new URL('/api/v2/media', props.server.base_url).toString()

    const formData = new FormData()
    formData.append('file', file, file.name || 'attachment')

    const headers: Record<string, string> = {}

    if (props.server.sns === 'firefish') {
      formData.append('i', props.account.access_token)
    } else {
      headers.Authorization = `Bearer ${props.account.access_token}`
    }

    const response = await tauriFetch(endpoint, {
      method: 'POST',
      headers,
      body: formData
    })

    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`.trim()

      try {
        const payload = await response.json()
        if (typeof payload?.error === 'string') {
          detail = payload.error
        } else if (typeof payload?.message === 'string') {
          detail = payload.message
        }
      } catch {
        try {
          const text = await response.text()
          if (text.trim().length > 0) {
            detail = text.trim()
          }
        } catch {
          // Ignore response body parsing failures and keep the status line.
        }
      }

      throw new Error(detail)
    }

    const data = await response.json()
    return props.server.sns === 'firefish' ? firefishAttachmentFromResponse(data) : data
  }, [props.account.access_token, props.server.base_url, props.server.sns])

  const appendAttachments = useCallback(async (files: Array<File>) => {
    try {
      let attachableCount = formValue.attachments?.length ?? 0
      const uploadTargets: Array<File> = []

      for (const candidate of files) {
        if (!isUsableUploadFile(candidate)) {
          console.error('Rejected dropped attachment candidate', {
            candidate: describeUploadCandidate(candidate)
          })
          toast.push(alert('error', `${formatMessage({ id: 'alert.upload_error' })}: failed to read the dropped file.`), {
            placement: 'topStart'
          })
          continue
        }

        if (attachableCount >= MAX_ATTACHMENTS) {
          toast.push(alert('error', formatMessage({ id: 'alert.validation_attachments_length' }, { limit: MAX_ATTACHMENTS })), {
            placement: 'topStart'
          })
          break
        }

        if (!isSupportedAttachment(candidate)) {
          toast.push(alert('error', formatMessage({ id: 'alert.validation_attachments_type' })), { placement: 'topStart' })
          continue
        }

        uploadTargets.push(candidate)
        attachableCount += 1
      }

      if (uploadTargets.length === 0) {
        return
      }

      setLoading(true)
      for (const file of uploadTargets) {
        let attachment: Entity.Attachment | Entity.AsyncAttachment

        try {
          const res = await props.client.uploadMedia(file)
          attachment = res.data
        } catch (error) {
          console.error('uploadMedia failed, falling back to native upload', {
            error,
            file: describeUploadCandidate(file)
          })
          attachment = await uploadAttachmentDirect(file)
        }

        setFormValue(current => {
          if (current.attachments) {
            return Object.assign({}, current, { attachments: [...current.attachments, attachment] })
          }
          return Object.assign({}, current, { attachments: [attachment] })
        })
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.error('Attachment upload failed', error)
      toast.push(alert('error', `${formatMessage({ id: 'alert.upload_error' })}: ${detail}`), { placement: 'topStart' })
    } finally {
      setLoading(false)
    }
  }, [formValue.attachments, formatMessage, props.client, toast, uploadAttachmentDirect])

  useEffect(() => {
    props.setAttachmentDropHandler?.(files => {
      void appendAttachments(files)
    })

    return () => {
      props.setAttachmentDropHandler?.(null)
    }
  }, [appendAttachments, props.setAttachmentDropHandler])

  const fileChanged = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) {
      return
    }

    void appendAttachments(files)
    event.target.value = ''
  }

  const clipboardImageToFile = async () => {
    const clipboardImage = await readImage()
    try {
      const size = await clipboardImage.size()
      const rgba = await clipboardImage.rgba()
      const canvas = document.createElement('canvas')
      canvas.width = size.width
      canvas.height = size.height
      const context = canvas.getContext('2d')
      if (!context) {
        return null
      }

      context.putImageData(new ImageData(new Uint8ClampedArray(rgba), size.width, size.height), 0, 0)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!blob) {
        return null
      }

      return new File([blob], `clipboard-${Date.now()}.png`, { type: 'image/png' })
    } finally {
      await clipboardImage.close()
    }
  }

  const statusPasted: ClipboardEventHandler<any> = event => {
    const imageItem = Array.from(event.clipboardData.items).find(item => item.type.startsWith('image/'))
    const pastedFile = imageItem?.getAsFile()

    if (pastedFile) {
      event.preventDefault()
      void appendAttachments([pastedFile])
      return
    }

    if (event.clipboardData.files.length > 0 || event.clipboardData.getData('text').length > 0) {
      return
    }

    event.preventDefault()
    void (async () => {
      try {
        const clipboardFile = await clipboardImageToFile()
        if (!clipboardFile) {
          return
        }

        await appendAttachments([clipboardFile])
      } catch {
        // Ignore clipboard read failures when there is no normal paste payload.
      }
    })()
  }

  const asAttachmentDragEvent = (event: DragEvent<HTMLTextAreaElement>) => event as unknown as DragEvent<HTMLDivElement>

  const textareaAttachmentDragEnter: DragEventHandler<HTMLTextAreaElement> = event => {
    props.onAttachmentDragEnter?.(asAttachmentDragEvent(event))
    event.stopPropagation()
  }

  const textareaAttachmentDragOver: DragEventHandler<HTMLTextAreaElement> = event => {
    props.onAttachmentDragOver?.(asAttachmentDragEvent(event))
    event.stopPropagation()
  }

  const textareaAttachmentDragLeave: DragEventHandler<HTMLTextAreaElement> = event => {
    props.onAttachmentDragLeave?.(asAttachmentDragEvent(event))
    event.stopPropagation()
  }

  const textareaAttachmentDropped: DragEventHandler<HTMLTextAreaElement> = event => {
    props.onAttachmentDrop?.(asAttachmentDragEvent(event))
    event.stopPropagation()
  }

  const dropzoneActive = Boolean(props.draggingAttachment)

  const removeAttachment = (index: number) => {
    setFormValue(current =>
      Object.assign({}, current, {
        attachments: current.attachments.filter((_, i) => i !== index)
      })
    )
  }

  const openAttachment = (index: number) => {
    setEditMedia(formValue.attachments[index])
    setEditMediaModal(true)
  }

  const togglePoll = () => {
    if (formValue.poll) {
      setFormValue(current =>
        Object.assign({}, current, {
          poll: undefined
        })
      )
    } else {
      setFormValue(current =>
        Object.assign({}, current, {
          poll: defaultPoll()
        })
      )
    }
  }

  const toggleSchedule = () => {
    if (formValue.scheduled_at) {
      setFormValue(current =>
        Object.assign({}, current, {
          scheduled_at: undefined
        })
      )
    } else {
      setFormValue(current =>
        Object.assign({}, current, {
          scheduled_at: new Date()
        })
      )
    }
  }

  const toggleCW = () => {
    setCW(current => !current)
    setFormValue(current => Object.assign({}, current, { spoiler: '' }))
  }

  const simpleLocale = props.locale ? props.locale.split('-')[0] : 'en'

  const EmojiPicker = forwardRef<HTMLDivElement>((props, ref) => (
    <div ref={ref} {...props} style={{ position: 'absolute' }}>
      <Picker
        data={data}
        custom={customEmojis}
        onEmojiSelect={onEmojiSelect}
        previewPosition="none"
        set="native"
        perLine="7"
        theme={theme === 'high-contrast' ? 'dark' : theme}
        locale={simpleLocale}
      />
    </div>
  ))

  const VisibilityDropdown = ({ onClose, left, top, className }, ref: any) => {
    const handleSelect = (key: string) => {
      onClose()
      if (key === 'public' || key === 'unlisted' || key === 'private' || key === 'direct' || key === 'local') {
        setVisibility(key)
      }
    }
    return (
      <Popover ref={ref} className={className} style={{ left, top }} full>
        <Dropdown.Menu onSelect={handleSelect}>
          <Dropdown.Item eventKey={'public'} icon={<Icon as={BsGlobe} />}>
            <FormattedMessage id="compose.visibility.public" />
          </Dropdown.Item>
          <Dropdown.Item eventKey={'local'} icon={<Icon as={BsPeople} />}>
            <FormattedMessage id="compose.visibility.local" />
          </Dropdown.Item>
          <Dropdown.Item eventKey={'unlisted'} icon={<Icon as={BsUnlock} />}>
            <FormattedMessage id="compose.visibility.unlisted" />
          </Dropdown.Item>
          <Dropdown.Item eventKey={'private'} icon={<Icon as={BsLock} />}>
            <FormattedMessage id="compose.visibility.private" />
          </Dropdown.Item>
          <Dropdown.Item eventKey={'direct'} icon={<Icon as={BsEnvelope} />}>
            <FormattedMessage id="compose.visibility.direct" />
          </Dropdown.Item>
        </Dropdown.Menu>
      </Popover>
    )
  }

  const LanguageDropdown = ({ onClose, left, top, className }, ref: any) => {
    const handleSelect = (key: string) => {
      setLanguage(key)
      localStorage.setItem('language', key)
      onClose()
    }

    return (
      <Popover ref={ref} className={className} style={{ left, top }} full>
        <Dropdown.Menu onSelect={handleSelect} style={{ maxHeight: '300px', overflowX: 'scroll' }}>
          {languages.map((l, index) => (
            <Dropdown.Item key={index} eventKey={l.value}>
              {l.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Popover>
    )
  }

  const targetId = () => {
    if (props.in_reply_to) {
      return `emoji-picker-reply-${props.in_reply_to.id}`
    } else if (props.edit_target) {
      return `emoji-picker-edit-${props.edit_target.id}`
    } else {
      return `emoji-picker-compose`
    }
  }

  return (
    <>
      <div className={dropzoneActive ? 'compose-dropzone dragging' : 'compose-dropzone'}>
        {cw && (
          <div style={{ marginBottom: '4px' }}>
            <Input
              inputRef={cwRef}
              onChange={value => {
                setFormError({})
                setFormValue(current => Object.assign({}, current, { spoiler: value }))
              }}
              placeholder={formatMessage({ id: 'compose.spoiler.placeholder' })}
              value={formValue.spoiler}
            />
          </div>
        )}

        <div style={{ position: 'relative', marginBottom: '4px' }}>
          <Textarea
            rows={5}
            ref={statusRef}
            value={formValue.status}
            onChange={value => {
              setFormError({})
              setFormValue(current => Object.assign({}, current, { status: value }))
            }}
            onPaste={statusPasted}
            onDragEnter={textareaAttachmentDragEnter}
            onDragOver={textareaAttachmentDragOver}
            onDragLeave={textareaAttachmentDragLeave}
            onDrop={textareaAttachmentDropped}
            placeholder={formatMessage({ id: 'compose.status.placeholder' })}
            emojis={customEmojis}
            client={props.client}
            style={{ fontSize: '1em' }}
          />
          {/** delay is required to fix popover position **/}
          <Whisper
            trigger="click"
            placement="bottomEnd"
            controlId={targetId()}
            delay={100}
            preventOverflow={false}
            ref={emojiPickerRef}
            speaker={<EmojiPicker />}
          >
            <Button appearance="link" style={{ position: 'absolute', top: '4px', right: '8px', padding: 0 }}>
              <Icon as={BsEmojiLaughing} style={{ fontSize: '1.2em' }} />
            </Button>
          </Whisper>
          {remaining !== null && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {remaining >= 0 ? (
                <span style={{ color: 'var(--rs-text-tertiary)' }}>{remaining}</span>
              ) : (
                <span style={{ color: 'red' }}>{remaining}</span>
              )}
            </div>
          )}
          {formError.status ? <ErrorMessage>{formError.status}</ErrorMessage> : null}
        </div>
        {formValue.poll && (
          <PollInputControl
            fieldError={formError.poll}
            onChange={poll => {
              setFormError({})
              setFormValue(current => Object.assign({}, current, { poll }))
            }}
            value={formValue.poll}
          />
        )}
        {formValue.scheduled_at && (
          <div style={{ marginBottom: '4px' }}>
            <ScheduleInputControl
              onChange={scheduled_at => {
                setFormError({})
                setFormValue(current => Object.assign({}, current, { scheduled_at }))
              }}
              value={formValue.scheduled_at}
            />
            {formError.scheduled_at ? <ErrorMessage>{formError.scheduled_at}</ErrorMessage> : null}
          </div>
        )}

        <div style={{ marginBottom: '4px' }}>
          <ButtonToolbar>
            <input
              ref={uploaderRef}
              type="file"
              style={{ display: 'none' }}
              onChange={fileChanged}
              multiple
              accept="image/*,video/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.avif,.heic,.heif,.mp4,.mov,.m4v,.webm,.mkv"
            />
            <Button appearance="subtle" onClick={selectFile}>
              <Icon as={BsPaperclip} style={{ fontSize: '1.1em' }} />
            </Button>
            <Button appearance="subtle" onClick={togglePoll}>
              <Icon as={BsMenuButtonWide} style={{ fontSize: '1.1em' }} />
            </Button>
            <Whisper placement="bottomStart" trigger="click" speaker={VisibilityDropdown}>
              <Button appearance="subtle">
                <Icon as={privacyIcon(visibility)} style={{ fontSize: '1.1em' }} />
              </Button>
            </Whisper>
            <Button appearance="subtle" onClick={() => toggleCW()}>
              <span style={{ fontSize: '0.8em' }}>CW</span>
            </Button>
            <Whisper placement="bottomEnd" delay={100} trigger="click" speaker={LanguageDropdown} preventOverflow>
              <Button appearance="subtle">
                <span style={{ fontSize: '0.8em' }}>{language.toUpperCase()}</span>
              </Button>
            </Whisper>
            <Button appearance="subtle" onClick={toggleSchedule}>
              <Icon as={BsClock} style={{ fontSize: '1.1em' }} />
            </Button>
          </ButtonToolbar>
        </div>
        {formValue.attachments?.length > 0 && (
          <div style={{ marginBottom: '4px' }}>
            <Toggle
              checkedChildren={<FormattedMessage id="compose.nsfw.sensitive" />}
              checked={Boolean(formValue.nsfw)}
              onChange={value => {
                setFormError({})
                setFormValue(current => Object.assign({}, current, { nsfw: value }))
              }}
              unCheckedChildren={<FormattedMessage id="compose.nsfw.not_sensitive" />}
            />
          </div>
        )}

        <div style={{ marginBottom: '4px' }}>
          <div>
            {formValue.attachments?.map((media, index) => (
              <div key={index} style={{ position: 'relative' }}>
                <IconButton
                  icon={<Icon as={BsXCircle} style={{ fontSize: '1.0em' }} />}
                  appearance="subtle"
                  size="sm"
                  style={{ position: 'absolute', top: 4, left: 4 }}
                  onClick={() => removeAttachment(index)}
                />
                <IconButton
                  icon={<Icon as={BsPencil} style={{ fontSize: '1.0em' }} />}
                  appearance="subtle"
                  size="sm"
                  style={{ position: 'absolute', top: 4, right: 4 }}
                  onClick={() => openAttachment(index)}
                />

                <img
                  src={attachmentPreviewUrl(media as Entity.Attachment)}
                  alt={media.description ? media.description : media.id}
                  style={{
                    width: '100%',
                    height: '140px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    boxSizing: 'border-box',
                    marginBottom: '4px'
                  }}
                />
              </div>
            ))}
          </div>
        </div>
        <div>
          <ButtonToolbar style={{ justifyContent: 'flex-end' }}>
            {(props.in_reply_to || props.edit_target || props.quote_target) && (
              <Button onClick={clear}>
                <FormattedMessage id="compose.cancel" />
              </Button>
            )}
            <Button appearance="primary" onClick={handleSubmit} loading={loading}>
              {postMessage(props.in_reply_to, props.edit_target, props.quote_target)}
            </Button>
          </ButtonToolbar>
        </div>
      </div>
      <EditMedia
        opened={editMediaModal}
        attachment={editMedia}
        client={props.client}
        close={() => {
          setEditMedia(null)
          setEditMediaModal(false)
        }}
      />
    </>
  )
}

const privacyIcon = (visibility: 'public' | 'unlisted' | 'private' | 'direct' | 'local') => {
  switch (visibility) {
    case 'public':
      return BsGlobe
    case 'unlisted':
      return BsUnlock
    case 'private':
      return BsLock
    case 'direct':
      return BsEnvelope
    case 'local':
      return BsPeople
    default:
      return BsGlobe
  }
}

const postMessage = (in_reply_to: any, edit_target: any, quote_target: any) => {
  if (in_reply_to) {
    return <FormattedMessage id="compose.reply" />
  } else if (edit_target) {
    return <FormattedMessage id="compose.edit" />
  } else if (quote_target) {
    return <FormattedMessage id="compose.quote" />
  } else {
    return <FormattedMessage id="compose.post" />
  }
}

const Textarea = forwardRef<HTMLTextAreaElement, AutoCompleteTextareaProps>(AutoCompleteTextarea)

const defaultPoll = () => ({
  options: ['', ''],
  expires_in: 86400,
  multiple: false
})

const isOwnAccountMention = (acct: string, username: string, domain: string) => {
  const normalized = acct.toLowerCase()
  const ownMentions = [username, `${username}@${domain}`].map(value => value.toLowerCase())
  return ownMentions.includes(normalized)
}

type PollInputControlProps = {
  fieldError?: PollError
  onChange: (value: Poll) => void
  value: Poll
}

const PollInputControl = ({ value, onChange, fieldError }: PollInputControlProps) => {
  const { formatMessage } = useIntl()
  const [poll, setPoll] = useState<Poll>(value ?? defaultPoll())
  const errors = fieldError ?? {}

  const expiresList = [
    { label: formatMessage({ id: 'compose.poll.5min' }), value: '300' },
    { label: formatMessage({ id: 'compose.poll.30min' }), value: '1800' },
    { label: formatMessage({ id: 'compose.poll.1h' }), value: '3600' },
    { label: formatMessage({ id: 'compose.poll.6h' }), value: '21600' },
    { label: formatMessage({ id: 'compose.poll.1d' }), value: '86400' },
    { label: formatMessage({ id: 'compose.poll.3d' }), value: '259200' },
    { label: formatMessage({ id: 'compose.poll.7d' }), value: '604800' }
  ]

  useEffect(() => {
    setPoll(value ?? defaultPoll())
  }, [value])

  const handleChangePoll = (nextPoll: Poll) => {
    setPoll(nextPoll)
    onChange(nextPoll)
  }

  const setOption = (value: string, index: number) => {
    const current = poll
    const next = Object.assign({}, current, {
      options: current.options.map((v, i) => {
        if (i === index) return value
        return v
      })
    })
    handleChangePoll(next)
  }

  const addOption = () => {
    const current = poll
    const next = Object.assign({}, current, {
      options: [...current.options, '']
    })
    handleChangePoll(next)
  }

  const removeOption = (index: number) => {
    const current = poll
    const next = Object.assign({}, current, {
      options: current.options.filter((_, i) => i !== index)
    })
    handleChangePoll(next)
  }

  return (
    <>
      <div style={{ marginBottom: '4px' }}>
        {poll.options.map((option, index) => (
          <div key={index}>
            <FlexboxGrid align="middle">
              <FlexboxGrid.Item>{poll.multiple ? <Checkbox disabled /> : <Radio />}</FlexboxGrid.Item>
              <FlexboxGrid.Item>
                <Input value={option} onChange={value => setOption(value, index)} />
              </FlexboxGrid.Item>
              <FlexboxGrid.Item>
                <Button appearance="link" onClick={() => removeOption(index)}>
                  <Icon as={BsX} />
                </Button>
              </FlexboxGrid.Item>
            </FlexboxGrid>
            {errors.options?.[index] ? <ErrorMessage>{errors.options[index]}</ErrorMessage> : null}
          </div>
        ))}
        {errors.general ? <ErrorMessage>{errors.general}</ErrorMessage> : null}
      </div>
      <div style={{ marginBottom: '4px' }}>
        <FlexboxGrid align="middle" justify="space-between">
          <FlexboxGrid.Item>
            <Toggle
              checkedChildren={<FormattedMessage id="compose.poll.multiple" />}
              unCheckedChildren={<FormattedMessage id="compose.poll.simple" />}
              checked={poll.multiple}
              onChange={value => handleChangePoll(Object.assign({}, poll, { multiple: value }))}
            />
          </FlexboxGrid.Item>
          <FlexboxGrid.Item>
            <Button appearance="ghost" onClick={addOption}>
              <FormattedMessage id="compose.poll.add_choice" />
            </Button>
          </FlexboxGrid.Item>
          <FlexboxGrid.Item>
            <FormSelectControl
              options={expiresList}
              value={poll.expires_in.toString()}
              onChange={value => {
                if (!value) {
                  return
                }

                handleChangePoll(Object.assign({}, poll, { expires_in: Number(value) }))
              }}
              style={{ width: '100px' }}
            />
          </FlexboxGrid.Item>
        </FlexboxGrid>
        {errors.expires_in ? <ErrorMessage>{errors.expires_in}</ErrorMessage> : null}
      </div>
    </>
  )
}

const formatDateTimeLocal = (value?: Date) => {
  if (!value) {
    return ''
  }

  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  const hours = `${value.getHours()}`.padStart(2, '0')
  const minutes = `${value.getMinutes()}`.padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

type ScheduleInputControlProps = {
  onChange: (value?: Date) => void
  value?: Date
}

const ScheduleInputControl = ({ value, onChange }: ScheduleInputControlProps) => (
  <input
    type="datetime-local"
    value={formatDateTimeLocal(value)}
    onChange={event => {
      const nextValue = event.target.value
      onChange(nextValue ? new Date(nextValue) : undefined)
    }}
  />
)

const ErrorMessage = ({ children }) => <span style={{ color: 'red' }}>{children}</span>

const validateFormValue = (formValue: FormValue): FormError => {
  const errors: FormError = {}

  if (formValue.status.trim().length === 0) {
    errors.status = 'This field is required.'
  }

  if (formValue.poll) {
    const pollErrors: PollError = {}
    const optionErrors = formValue.poll.options.map(option => (option.trim().length === 0 ? 'Required' : null))

    if (optionErrors.some(Boolean)) {
      pollErrors.options = optionErrors
    }

    if (formValue.poll.options.length < 2) {
      pollErrors.general = 'Minimum 2 choices required'
    }

    if (!Number.isInteger(formValue.poll.expires_in)) {
      pollErrors.expires_in = 'Must be a number'
    } else if (formValue.poll.expires_in < 0) {
      pollErrors.expires_in = 'Must be greater than 0'
    }

    if (Object.keys(pollErrors).length > 0) {
      errors.poll = pollErrors
    }
  }

  if (formValue.scheduled_at) {
    const limit = new Date()
    limit.setMinutes(limit.getMinutes() + 5)
    if (formValue.scheduled_at <= limit) {
      errors.scheduled_at = 'Must be at least 5 minutes in the future'
    }
  }

  return errors
}

const hasFormError = (formError: FormError) =>
  Boolean(formError.status || formError.scheduled_at || formError.poll?.general || formError.poll?.expires_in || formError.poll?.options?.some(Boolean))

export default Status
