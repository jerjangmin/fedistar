import { Button, Modal } from 'rsuite'
import { Entity } from 'megalodon'
import { MouseEvent, ReactElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from '@rsuite/icons'
import { BsChevronRight, BsChevronLeft } from 'react-icons/bs'
import ImageContextMenu from 'src/components/media/ImageContextMenu'
import { attachmentAlt, attachmentPreviewUrl, isImageAttachment } from 'src/utils/mediaAttachment'
import { preloadPlayableMedia } from 'src/utils/mediaPlayback'

type Props = {
  index: number
  media: Array<Entity.Attachment>
  opened: boolean
  close: () => void
}

type LoadedImage = {
  height: number
  width: number
}

const imageCache = new Map<string, Promise<LoadedImage>>()
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const Media: React.FC<Props> = props => {
  const [index, setIndex] = useState<number>(0)
  const showNavigation = props.media.length > 1

  useEffect(() => {
    setIndex(props.index)
  }, [props.index])

  useEffect(() => {
    if (!props.opened || !props.media[index]) {
      return
    }

    const preloadTargets = [props.media[index], props.media[index + 1], props.media[index - 1]].filter(
      (media): media is Entity.Attachment => Boolean(media)
    )

    for (const media of preloadTargets) {
      const preload = isImageAttachment(media) ? preloadImage(media.url) : preloadPlayableMedia(media.url)
      void preload.catch(err => {
        console.error(err)
      })
    }
  }, [index, props.media, props.opened])

  useIsomorphicLayoutEffect(() => {
    if (!props.opened) {
      return
    }

    const previousDocumentOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow
    const previousDocumentOverscroll = document.documentElement.style.overscrollBehavior
    const previousBodyOverscroll = document.body.style.overscrollBehavior
    const previousDocumentScrollbarGutter = document.documentElement.style.scrollbarGutter
    const previousBodyScrollbarGutter = document.body.style.scrollbarGutter

    document.documentElement.classList.add('media-modal-open')
    document.body.classList.add('media-modal-open')
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overscrollBehavior = 'none'
    document.body.style.overscrollBehavior = 'none'
    document.documentElement.style.scrollbarGutter = 'auto'
    document.body.style.scrollbarGutter = 'auto'

    return () => {
      document.documentElement.classList.remove('media-modal-open')
      document.body.classList.remove('media-modal-open')
      document.documentElement.style.overflow = previousDocumentOverflow
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overscrollBehavior = previousDocumentOverscroll
      document.body.style.overscrollBehavior = previousBodyOverscroll
      document.documentElement.style.scrollbarGutter = previousDocumentScrollbarGutter
      document.body.style.scrollbarGutter = previousBodyScrollbarGutter
    }
  }, [props.opened])

  const next = useCallback(() => {
    if (index >= props.media.length - 1) {
      return
    }
    setIndex(current => current + 1)
  }, [props.media, index, setIndex])

  const previous = useCallback(() => {
    if (index <= 0) {
      return
    }
    setIndex(current => current - 1)
  }, [props.media, index, setIndex])

  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if (props.opened) {
        if (event.key === 'ArrowLeft') {
          previous()
        } else if (event.key === 'ArrowRight') {
          next()
        }
      }
    },
    [props.opened, previous, next]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress)

    return () => {
      document.removeEventListener('keydown', handleKeyPress)
    }
  }, [handleKeyPress])

  const close = useCallback(() => {
    props.close()
    setIndex(0)
  }, [props])

  const stopPropagation = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation()
  }

  return (
    <Modal
      className="media-modal"
      open={props.opened}
      size="full"
      onClose={close}
      dialogClassName="media-dialog"
    >
      <Modal.Body style={{ height: '100%' }} onClick={close}>
        <div className="media-stage">
          {showNavigation && (
            <Button
              appearance="link"
              className="media-nav media-nav-left"
              disabled={index < 1}
              onClick={event => {
                stopPropagation(event)
                previous()
              }}
            >
              <Icon as={BsChevronLeft} style={{ fontSize: '1.5em' }} />
            </Button>
          )}
          <div className="media-asset">
            {props.media[index] && mediaComponent(props.media[index], stopPropagation)}
          </div>
          {showNavigation && (
            <Button
              appearance="link"
              className="media-nav media-nav-right"
              disabled={index >= props.media.length - 1}
              onClick={event => {
                stopPropagation(event)
                next()
              }}
            >
              <Icon as={BsChevronRight} style={{ fontSize: '1.5em' }} />
            </Button>
          )}
        </div>
      </Modal.Body>
    </Modal>
  )
}

const preloadImage = (src: string) => {
  const cached = imageCache.get(src)
  if (cached) {
    return cached
  }

  const pending = new Promise<LoadedImage>((resolve, reject) => {
    const image = new window.Image()
    image.decoding = 'async'
    image.onload = () =>
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    image.onerror = () => {
      imageCache.delete(src)
      reject(new Error(`Failed to load image: ${src}`))
    }
    image.src = src
  })
  imageCache.set(src, pending)
  return pending
}

const LightboxImage: React.FC<{ media: Entity.Attachment; onClick: (event: MouseEvent<HTMLElement>) => void }> = ({
  media,
  onClick,
}) => {
  const mediaAlt = attachmentAlt(media)
  const previewSrc = media.preview_url?.trim() || media.url
  const [displaySrc, setDisplaySrc] = useState(previewSrc)
  const [showPreviewStyle, setShowPreviewStyle] = useState(previewSrc !== media.url)

  useEffect(() => {
    let cancelled = false

    setDisplaySrc(previewSrc)
    setShowPreviewStyle(previewSrc !== media.url)

    if (previewSrc === media.url) {
      void preloadImage(media.url)
        .then(() => undefined)
        .catch(err => {
          console.error(err)
        })
      return () => {
        cancelled = true
      }
    }

    void preloadImage(media.url)
      .then(() => {
        if (cancelled) {
          return
        }
        setDisplaySrc(media.url)
        setShowPreviewStyle(false)
      })
      .catch(err => {
        if (!cancelled) {
          console.error(err)
        }
      })

    return () => {
      cancelled = true
    }
  }, [media.url, previewSrc])

  return (
    <ImageContextMenu imageUrl={media.url}>
      <div className="media-frame media-frame-image" onClick={onClick}>
        <img
          src={displaySrc}
          alt={mediaAlt}
          title={mediaAlt}
          className={`media-content media-image ${showPreviewStyle ? 'media-image-preview' : ''}`}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          draggable={false}
          onError={() => {
            if (displaySrc !== previewSrc) {
              setDisplaySrc(previewSrc)
              setShowPreviewStyle(true)
            }
          }}
        />
      </div>
    </ImageContextMenu>
  )
}

const LightboxVideo: React.FC<{
  media: Entity.Attachment
  controls?: boolean
  onClick: (event: MouseEvent<HTMLElement>) => void
}> = ({ media, controls = false, onClick }) => {
  const mediaAlt = attachmentAlt(media)
  const poster = attachmentPreviewUrl(media)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReady(false)

    void preloadPlayableMedia(media.url)
      .then(() => {
        if (!cancelled) {
          setReady(true)
          void videoRef.current?.play().catch(() => {
            // Autoplay can still be blocked in some environments.
          })
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.error(err)
        }
      })

    return () => {
      cancelled = true
    }
  }, [media.url])

  return (
    <div className="media-frame" onClick={onClick}>
      <video
        ref={videoRef}
        src={media.url}
        poster={poster}
        title={mediaAlt}
        aria-label={mediaAlt}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        controls={controls}
        className="media-content"
        style={{ opacity: ready ? 1 : 0.001 }}
        onLoadedData={() => {
          setReady(true)
          void videoRef.current?.play().catch(() => {
            // Autoplay can still be blocked in some environments.
          })
        }}
      />
    </div>
  )
}

const mediaComponent = (
  media: Entity.Attachment,
  onClick: (event: MouseEvent<HTMLElement>) => void
): ReactElement => {
  switch (media.type) {
    case 'gifv':
      return <LightboxVideo media={media} onClick={onClick} />
    case 'video':
      return <LightboxVideo media={media} controls onClick={onClick} />
    case 'audio':
      return (
        <div className="media-frame" onClick={onClick}>
          <video src={media.url} autoPlay loop controls className="media-content" />
        </div>
      )
    default:
      return <LightboxImage media={media} onClick={onClick} />
  }
}

export default Media
