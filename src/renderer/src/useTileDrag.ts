import { useCallback, useEffect, useRef, useState } from 'react'

/** How far the mouse must move before a press on a title bar becomes a drag. */
const DRAG_THRESHOLD = 6

export interface TileDrag {
  /** Session being dragged, once the threshold is passed. */
  draggingId: number | null
  /** Session under the pointer that would be swapped with it. */
  overId: number | null
  /** Call from a title bar's pointerdown. */
  start(e: React.PointerEvent, id: number): void
}

/** The session id of the tile under a screen point, if any. */
function tileAt(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)?.closest('.tile') as HTMLElement | null
  return el ? Number(el.dataset.sessionId) : null
}

/**
 * Drag a session by its title bar and drop it on another to swap them.
 * Clicks and double-clicks still work: dragging starts only after the
 * pointer moves a few pixels. Esc cancels.
 */
export function useTileDrag(onSwap: (a: number, b: number) => void): TileDrag {
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [overId, setOverId] = useState<number | null>(null)
  const press = useRef<{ id: number; x: number; y: number; started: boolean } | null>(null)
  const swap = useRef(onSwap)
  swap.current = onSwap

  const stop = useCallback(() => {
    press.current = null
    setDraggingId(null)
    setOverId(null)
    document.body.classList.remove('dragging-tile')
  }, [])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current
      if (!p) return
      if (!p.started) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return
        p.started = true
        setDraggingId(p.id)
        document.body.classList.add('dragging-tile')
      }
      const target = tileAt(e.clientX, e.clientY)
      setOverId(target !== null && target !== p.id ? target : null)
    }
    const up = (e: PointerEvent) => {
      const p = press.current
      if (!p) return
      if (p.started) {
        const target = tileAt(e.clientX, e.clientY)
        if (target !== null && target !== p.id) swap.current(p.id, target)
      }
      stop()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && press.current?.started) {
        e.preventDefault()
        e.stopPropagation()
        stop()
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('keydown', key, true)
    }
  }, [stop])

  const start = useCallback((e: React.PointerEvent, id: number) => {
    if (e.button !== 0) return
    press.current = { id, x: e.clientX, y: e.clientY, started: false }
  }, [])

  return { draggingId, overId, start }
}
