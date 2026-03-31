import { Icon } from '@rsuite/icons'
import { Entity, MegalodonInterface } from 'megalodon'
import { useEffect, useState } from 'react'
import { BsCheck2, BsX } from 'react-icons/bs'
import { useIntl } from 'react-intl'
import { Avatar, Button, FlexboxGrid, Input, List, Loader, Modal } from 'rsuite'
import emojify from 'src/utils/emojify'

type Props = {
  opened: boolean
  list: Entity.List
  client: MegalodonInterface
  close: () => void
}

export default function ListMemberships(props: Props) {
  const { formatMessage } = useIntl()
  const [accounts, setAccounts] = useState<Array<Entity.Account>>([])
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searching, setSearching] = useState(false)
  const [title, setTitle] = useState('')
  const [users, setUsers] = useState<Array<Entity.Account>>([])

  useEffect(() => {
    if (props.list && props.client) {
      setTitle(props.list.title)
      setSearchKeyword('')
      setUsers([])
      void reload(props.list.id)
    }
  }, [props.list, props.client])

  useEffect(() => {
    const keyword = searchKeyword.trim()
    if (keyword.length === 0) {
      setUsers([])
      setSearching(false)
      return
    }

    let active = true
    setSearching(true)
    const timer = setTimeout(() => {
      void props.client
        .searchAccount(keyword, { following: true, resolve: true })
        .then(res => {
          if (!active) {
            return
          }

          setUsers(res.data)
        })
        .catch(error => {
          console.error(error)
        })
        .finally(() => {
          if (active) {
            setSearching(false)
          }
        })
    }, 300)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [props.client, searchKeyword])

  const reload = async (listID: string) => {
    const res = await props.client.getAccountsInList(listID)
    setAccounts(res.data)
  }

  const remove = async (account: Entity.Account) => {
    await props.client.deleteAccountsFromList(props.list.id, [account.id])
    await reload(props.list.id)
  }

  const updateListTitle = () => {
    void props.client.updateList(props.list.id, title)
  }

  const onSelect = (value: string) => {
    void props.client
      .addAccountsToList(props.list.id, [value])
      .then(() => {
        setUsers([])
        setSearchKeyword('')
        return reload(props.list.id)
      })
      .catch(error => {
        console.error(error)
      })
  }

  return (
    <Modal
      size="xs"
      open={props.opened}
      onClose={() => {
        props.close()
      }}
    >
      <Modal.Header>
        <div style={{ display: 'flex', paddingBottom: '0.7em' }}>
          <Input value={title} onChange={value => setTitle(value)} />
          <Button appearance="link" onClick={() => updateListTitle()}>
            <Icon as={BsCheck2} />
          </Button>
        </div>
        <Input
          placeholder={formatMessage({ id: 'list_memberships.search_placeholder' })}
          value={searchKeyword}
          onChange={value => setSearchKeyword(value)}
        />
      </Modal.Header>
      <Modal.Body>
        <div>
          {searchKeyword.trim().length > 0 && (
            <List bordered>
              {searching ? (
                <List.Item style={{ textAlign: 'center' }}>
                  <Loader />
                </List.Item>
              ) : (
                users.map(user => (
                  <List.Item key={user.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(user.id)}>
                    @{user.acct}
                  </List.Item>
                ))
              )}
            </List>
          )}
          <List>
            {accounts.map((account, index) => (
              <List.Item key={index} style={{ padding: 0 }}>
                <FlexboxGrid align="middle">
                  {/** icon **/}
                  <FlexboxGrid.Item colspan={4}>
                    <div style={{ margin: '6px' }}>
                      <Avatar src={account.avatar} />
                    </div>
                  </FlexboxGrid.Item>
                  {/** name **/}
                  <FlexboxGrid.Item colspan={17}>
                    <div>
                      <span dangerouslySetInnerHTML={{ __html: emojify(account.display_name, account.emojis, account.acct) }} />
                    </div>
                    <div>
                      <span style={{ color: 'var(--rs-text-tertiary)' }}>@{account.acct}</span>
                    </div>
                  </FlexboxGrid.Item>
                  <FlexboxGrid.Item colspan={3}>
                    <Button appearance="link" size="sm" onClick={() => remove(account)}>
                      <Icon as={BsX} style={{ fontSize: '1.4em', color: 'var(--rs-text-tertiary)' }} />
                    </Button>
                  </FlexboxGrid.Item>
                </FlexboxGrid>
              </List.Item>
            ))}
          </List>
        </div>
      </Modal.Body>
    </Modal>
  )
}
