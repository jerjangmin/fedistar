import { Container, Header, Content, FlexboxGrid, Dropdown, Avatar } from 'rsuite'
import { DragEventHandler, useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import generator, { MegalodonInterface } from 'megalodon'

import { USER_AGENT } from 'src/defaults'
import { Server, ServerSet } from 'src/entities/server'
import { Account } from 'src/entities/account'
import failoverImg from 'src/utils/failoverImg'
import Status from './Status'
import { FormattedMessage } from 'react-intl'
import { collectDroppedFiles, hasDraggedFiles } from './dragDrop'

export const renderAccountIcon = (props: any, ref: any, account: [Account, Server] | undefined) => {
  if (account && account.length > 0) {
    return (
      <FlexboxGrid {...props} ref={ref} align="middle">
        <FlexboxGrid.Item style={{ marginLeft: '12px' }}>
          <Avatar src={failoverImg(account[0].avatar)} alt={account[0].username} size="sm" circle />
        </FlexboxGrid.Item>
        <FlexboxGrid.Item style={{ paddingLeft: '12px' }}>
          @{account[0].username}@{account[1].domain}
        </FlexboxGrid.Item>
      </FlexboxGrid>
    )
  } else {
    return (
      <FlexboxGrid {...props} ref={ref} align="middle">
        <FlexboxGrid.Item>
          <Avatar src={failoverImg('')} />
        </FlexboxGrid.Item>
        <FlexboxGrid.Item>undefined</FlexboxGrid.Item>
      </FlexboxGrid>
    )
  }
}

type Props = {
  servers: Array<ServerSet>
  locale: string
}

const Compose: React.FC<Props> = props => {
  const [accounts, setAccounts] = useState<Array<[Account, Server]>>([])
  const [fromAccount, setFromAccount] = useState<[Account, Server]>()
  const [defaultVisibility, setDefaultVisibility] = useState<'public' | 'unlisted' | 'private' | 'direct' | 'local'>('public')
  const [defaultNSFW, setDefaultNSFW] = useState(false)
  const [defaultLanguage, setDefaultLanguage] = useState<string | null>(null)
  const [client, setClient] = useState<MegalodonInterface>()
  const [draggingAttachment, setDraggingAttachment] = useState(false)
  const [attachmentDropHandler, setAttachmentDropHandler] = useState<((files: Array<File>) => void) | null>(null)
  const dragDepthRef = useRef(0)

  const registerAttachmentDropHandler = useCallback((handler: ((files: Array<File>) => void) | null) => {
    setAttachmentDropHandler(() => handler)
  }, [])

  useEffect(() => {
    let active = true

    void invoke<Array<[Account, Server]>>('list_accounts')
      .then(accounts => {
        if (!active) {
          return
        }

        setAccounts(accounts)

        const usual = accounts.find(([a]) => a.usual)
        if (usual) {
          setFromAccount(usual)
        } else {
          setFromAccount(accounts[0])
        }
      })
      .catch(error => {
        console.error(error)
      })

    return () => {
      active = false
    }
  }, [props.servers])

  useEffect(() => {
    if (!fromAccount || fromAccount.length < 2) {
      return
    }

    let active = true
    const client = generator(fromAccount[1].sns, fromAccount[1].base_url, fromAccount[0].access_token, USER_AGENT)
    setClient(client)

    void client
      .verifyAccountCredentials()
      .then(res => {
        if (!active || !res.data.source) {
          return
        }

        setDefaultVisibility(res.data.source.privacy as 'public' | 'unlisted' | 'private' | 'direct' | 'local')
        setDefaultNSFW(res.data.source.sensitive)
        setDefaultLanguage(res.data.source.language)
      })
      .catch(error => {
        console.error(error)
      })

    return () => {
      active = false
    }
  }, [fromAccount])

  const selectAccount = (eventKey: string) => {
    const account = accounts[parseInt(eventKey)]
    if (!account) {
      return
    }
    setFromAccount(account)
    void invoke('set_usual_account', { id: account[0].id })
  }

  const attachmentDragEnter: DragEventHandler<HTMLDivElement> = event => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current += 1
    setDraggingAttachment(true)
  }

  const attachmentDragOver: DragEventHandler<HTMLDivElement> = event => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }

  const attachmentDragLeave: DragEventHandler<HTMLDivElement> = event => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setDraggingAttachment(false)
    }
  }

  const attachmentDropped: DragEventHandler<HTMLDivElement> = event => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = 0
    setDraggingAttachment(false)
    const files = collectDroppedFiles(event.dataTransfer)

    if (files.length === 0 || !attachmentDropHandler) {
      return
    }

    attachmentDropHandler(files)
  }

  return (
    <Container style={{ backgroundColor: 'var(--rs-border-secondary)', height: '100%', overflowY: 'auto' }}>
      <Header style={{ borderBottom: '1px solid var(--rs-divider-border)', backgroundColor: 'var(--rs-border-secondary)' }}>
        <FlexboxGrid align="middle">
          <FlexboxGrid.Item style={{ lineHeight: '53px', paddingLeft: '12px', fontSize: '18px' }}>
            <FormattedMessage id="compose.title" />
          </FlexboxGrid.Item>
        </FlexboxGrid>
      </Header>
      <Content
        className={draggingAttachment ? 'compose-dropzone dragging' : 'compose-dropzone'}
        style={{ height: '100%', margin: '12px', backgroundColor: 'var(--rs-border-secondary)' }}
        onDragEnter={attachmentDragEnter}
        onDragOver={attachmentDragOver}
        onDragLeave={attachmentDragLeave}
        onDrop={attachmentDropped}
      >
        <div style={{ fontSize: '1.2em', padding: '12px 0' }}>
          <FormattedMessage id="compose.from" />
        </div>
        <FlexboxGrid>
          <FlexboxGrid.Item>
            <Dropdown renderToggle={(props, ref) => renderAccountIcon(props, ref, fromAccount)} onSelect={selectAccount}>
              {accounts.map((account, index) => (
                <Dropdown.Item eventKey={index} key={index}>
                  @{account[0].username}@{account[1].domain}
                </Dropdown.Item>
              ))}
            </Dropdown>
          </FlexboxGrid.Item>
        </FlexboxGrid>
        <div style={{ fontSize: '1.2em', padding: '12px 0' }}>
          <FormattedMessage id="compose.status.title" />
        </div>
        {fromAccount && (
          <Status
            client={client}
            server={fromAccount[1]}
            account={fromAccount[0]}
            defaultVisibility={defaultVisibility}
            defaultNSFW={defaultNSFW}
            defaultLanguage={defaultLanguage}
            locale={props.locale}
            draggingAttachment={draggingAttachment}
            setAttachmentDropHandler={registerAttachmentDropHandler}
            onAttachmentDragEnter={attachmentDragEnter}
            onAttachmentDragOver={attachmentDragOver}
            onAttachmentDragLeave={attachmentDragLeave}
            onAttachmentDrop={attachmentDropped}
          />
        )}
      </Content>
    </Container>
  )
}

export default Compose
