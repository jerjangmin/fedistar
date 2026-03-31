import { useEffect, useEffectEvent } from 'react'
import { Event, EventName, listen, UnlistenFn } from '@tauri-apps/api/event'

type Handler<T> = (event: Event<T>) => void | Promise<void>

export const useTauriListen = <T>(eventName: EventName, handler: Handler<T>) => {
  const onEvent = useEffectEvent(handler)

  useEffect(() => {
    let active = true
    let unlisten: UnlistenFn | null = null

    void listen<T>(eventName, event => {
      if (!active) {
        return
      }

      void onEvent(event)
    })
      .then(fn => {
        if (!active) {
          void fn()
          return
        }

        unlisten = fn
      })
      .catch(error => {
        console.error(error)
      })

    return () => {
      active = false
      if (unlisten) {
        void unlisten()
      }
    }
  }, [eventName])
}
