import { useEffect, useRef } from 'react'

/**
 * Calls `handler` when Escape is pressed, while `active` is true.
 *
 * The handler is held in a ref so the listener is attached once per open/close
 * rather than on every parent render — callers almost always pass an inline
 * arrow, which would otherwise re-bind the listener continuously.
 */
export default function useEscapeKey(active, handler) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!active) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') handlerRef.current?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [active])
}
