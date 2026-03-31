import { Entity, MegalodonInterface } from 'megalodon'
import Image from 'next/image'
import { forwardRef, useEffect, useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { Button, ButtonToolbar, FlexboxGrid, Input, Modal } from 'rsuite'

type Props = {
  attachment: Entity.Attachment | null
  client: MegalodonInterface
  opened: boolean
  close: () => void
}

type FormValue = {
  description: string
}

export default function EditMedia(props: Props) {
  const [formValue, setFormValue] = useState<FormValue>({
    description: ''
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [attachment, setAttachment] = useState<Entity.Attachment | null>(null)

  useEffect(() => {
    if (!props.attachment) {
      setAttachment(null)
      return
    }
    const f = async () => {
      const res = await props.client.getMedia(props.attachment.id)
      setAttachment(res.data)
      if (res.data.description) {
        setFormValue({
          description: res.data.description
        })
      } else {
        setFormValue({
          description: ''
        })
      }
      setFormError(null)
    }
    f()
  }, [props.attachment, props.client])

  const handleSubmit = () => {
    if (loading) return
    if (formValue.description.trim().length === 0) {
      setFormError('This field is required')
      return
    }
    if (formValue.description.length > 1500) {
      setFormError('Must be 1500 characters or less')
      return
    }

    setFormError(null)
    setLoading(true)
    void props.client
      .updateMedia(attachment.id, { description: formValue.description })
      .finally(() => {
        setLoading(false)
      })
  }

  return (
    <Modal open={props.opened} onClose={() => props.close()} size="md">
      <Modal.Header>
        <FormattedMessage id="compose.edit_attachment.title" />
      </Modal.Header>
      <Modal.Body>
        <FlexboxGrid>
          <FlexboxGrid.Item colspan={8}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px' }}>
                <FormattedMessage id="compose.edit_attachment.label" />
              </label>
              <Textarea
                rows={5}
                value={formValue.description}
                onChange={value => {
                  setFormError(null)
                  setFormValue({ description: value })
                }}
              />
              {formError ? <span style={{ color: 'red' }}>{formError}</span> : null}
              <ButtonToolbar style={{ justifyContent: 'flex-end', marginTop: '12px' }}>
                <Button appearance="primary" type="button" loading={loading} onClick={handleSubmit}>
                  <FormattedMessage id="compose.edit_attachment.submit" />
                </Button>
              </ButtonToolbar>
            </div>
          </FlexboxGrid.Item>
          <FlexboxGrid.Item colspan={16}>
            <div style={{ height: '320px', width: '320px' }}>
              {attachment && <Image src={attachment.preview_url} fill alt="" style={{ objectFit: 'contain' }} />}
            </div>
          </FlexboxGrid.Item>
        </FlexboxGrid>
      </Modal.Body>
    </Modal>
  )
}

const Textarea = forwardRef<HTMLTextAreaElement, any>((props, ref) => <Input {...(props as any)} as="textarea" ref={ref} />)
