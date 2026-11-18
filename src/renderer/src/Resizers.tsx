import { useRef, type ReactElement } from 'react'
import { equalSizes, GridLayout, moveBoundary, rowCounts, Sizes } from './layout'

/** Smallest a session can be dragged to, in pixels. */
export const MIN_TILE_WIDTH = 160
export const MIN_TILE_HEIGHT = 90

function gapPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 0
}

const sum = (xs: number[], n: number) => xs.slice(0, n).reduce((a, b) => a + b, 0)

interface Props {
  layout: GridLayout
  sizes: Sizes
  /** The element tiles are positioned in (for converting pixels to fractions). */
  container: React.RefObject<HTMLDivElement | null>
  onChange(sizes: Sizes): void
}

/**
 * Draggable borders between sessions: vertical ones between tiles in a row
 * (each row sizes independently) and horizontal ones between rows.
 * Double-click a border to make that row (or the rows) equal again.
 */
export function Resizers({ layout, sizes, container, onChange }: Props) {
  const drag = useRef<{ kind: 'col' | 'row'; row: number; index: number; start: number; startSizes: Sizes; avail: number; count: number } | null>(null)
  const counts = rowCounts(layout)
  const R = counts.length

  const begin = (e: React.PointerEvent, kind: 'col' | 'row', row: number, index: number) => {
    const box = container.current?.getBoundingClientRect()
    if (!box || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const count = kind === 'col' ? counts[row] : R
    const total = kind === 'col' ? box.width : box.height
    drag.current = { kind, row, index, start: kind === 'col' ? e.clientX : e.clientY, startSizes: sizes, avail: total - (count - 1) * gapPx(), count }
    document.body.classList.add(kind === 'col' ? 'resizing-col' : 'resizing-row')
  }

  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.avail <= 0) return
    const delta = ((d.kind === 'col' ? e.clientX : e.clientY) - d.start) / d.avail
    const min = (d.kind === 'col' ? MIN_TILE_WIDTH : MIN_TILE_HEIGHT) / d.avail
    if (d.kind === 'col') {
      const cols = d.startSizes.cols.map((r, i) => (i === d.row ? moveBoundary(r, d.index, delta, min) : r))
      onChange({ ...d.startSizes, cols })
    } else {
      onChange({ ...d.startSizes, rows: moveBoundary(d.startSizes.rows, d.index, delta, min) })
    }
  }

  const end = (e: React.PointerEvent) => {
    if (!drag.current) return
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    drag.current = null
    document.body.classList.remove('resizing-col', 'resizing-row')
  }

  const equal = equalSizes(layout)
  const handlers = { onPointerMove: move, onPointerUp: end, onPointerCancel: end }
  const g = 'var(--gap)'
  const out: ReactElement[] = []

  counts.forEach((n, r) => {
    const top = `calc((100% - ${R - 1} * ${g}) * ${sum(sizes.rows, r)} + ${r} * ${g})`
    const height = `calc((100% - ${R - 1} * ${g}) * ${sizes.rows[r]})`
    for (let c = 0; c < n - 1; c++) {
      // Centered on the gap after tile c, with a comfortable hit area.
      const left = `calc((100% - ${n - 1} * ${g}) * ${sum(sizes.cols[r], c + 1)} + ${c} * ${g} + ${g} / 2 - 5px)`
      out.push(
        <div
          key={`c${r}-${c}`}
          className="resizer col"
          data-testid={`resizer-col-${r}-${c}`}
          style={{ left, top, height }}
          onPointerDown={(e) => begin(e, 'col', r, c)}
          onDoubleClick={() => onChange({ ...sizes, cols: sizes.cols.map((row, i) => (i === r ? equal.cols[r] : row)) })}
          title="Drag to resize · double-click to make equal"
          {...handlers}
        />
      )
    }
  })
  for (let r = 0; r < R - 1; r++) {
    const top = `calc((100% - ${R - 1} * ${g}) * ${sum(sizes.rows, r + 1)} + ${r} * ${g} + ${g} / 2 - 5px)`
    out.push(
      <div
        key={`r${r}`}
        className="resizer row"
        data-testid={`resizer-row-${r}`}
        style={{ top, left: 0, width: '100%' }}
        onPointerDown={(e) => begin(e, 'row', 0, r)}
        onDoubleClick={() => onChange({ ...sizes, rows: equal.rows })}
        title="Drag to resize · double-click to make equal"
        {...handlers}
      />
    )
  }
  return <>{out}</>
}
