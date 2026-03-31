const playableMediaCache = new Map<string, Promise<void>>()

export const preloadPlayableMedia = (src: string) => {
  const cached = playableMediaCache.get(src)
  if (cached) {
    return cached
  }

  const pending = new Promise<void>((resolve, reject) => {
    const video = document.createElement('video')
    const cleanup = () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }

    const handleLoadedData = () => {
      cleanup()
      resolve()
    }
    const handleError = () => {
      playableMediaCache.delete(src)
      cleanup()
      reject(new Error(`Failed to preload playable media: ${src}`))
    }

    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.onloadeddata = handleLoadedData
    video.onerror = handleError
    video.src = src
    void video.play().catch(() => {
      // Warm the fetch pipeline even when autoplay is blocked.
    })
  })

  playableMediaCache.set(src, pending)
  return pending
}
