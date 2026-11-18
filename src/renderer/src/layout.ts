export interface TilePlacement {
  row: number // 1-based CSS grid row
  colStart: number // 1-based CSS grid column line
  colSpan: number
}

export interface GridLayout {
  rows: number
  cols: number
  /** Number of CSS grid column tracks (fine-grained so the last row can stretch). */
  tracks: number
  placements: TilePlacement[]
}

/**
 * Split the window into equal parts for `n` sessions.
 * cols = ceil(sqrt(n)), rows = ceil(n / cols). A short last row stretches its
 * tiles to fill the full width, so there are never empty cells.
 */
export function computeLayout(n: number): GridLayout {
  if (n <= 0) return { rows: 0, cols: 0, tracks: 1, placements: [] }
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  const lastCount = n - cols * (rows - 1)
  const tracks = cols * lastCount
  const placements: TilePlacement[] = []
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols)
    const isLast = row === rows - 1
    const span = isLast ? tracks / lastCount : tracks / cols
    const indexInRow = i - row * cols
    placements.push({ row: row + 1, colStart: indexInRow * span + 1, colSpan: span })
  }
  return { rows, cols, tracks, placements }
}

export type Direction = 'left' | 'right' | 'up' | 'down'

/**
 * Size fractions for a layout: one per row (heights) and, for each row, one
 * per tile (widths). Each list sums to 1.
 */
export interface Sizes {
  rows: number[]
  cols: number[][]
}

/** Tiles per row, e.g. [3, 2]. Sizes are only reused while this stays the same. */
export function rowCounts(layout: GridLayout): number[] {
  const counts: number[] = []
  for (const p of layout.placements) counts[p.row - 1] = (counts[p.row - 1] ?? 0) + 1
  return counts
}

export function shapeKey(layout: GridLayout): string {
  return rowCounts(layout).join(',')
}

export function equalSizes(layout: GridLayout): Sizes {
  const counts = rowCounts(layout)
  return { rows: counts.map(() => 1 / counts.length), cols: counts.map((n) => Array(n).fill(1 / n)) }
}

/**
 * Move the boundary between items `index` and `index + 1` by `delta` (as a
 * fraction of the whole), keeping both at least `min`. Others don't change.
 */
export function moveBoundary(fracs: number[], index: number, delta: number, min: number): number[] {
  const out = [...fracs]
  const a = out[index]
  const b = out[index + 1]
  if (a === undefined || b === undefined) return out
  const lo = Math.min(min, (a + b) / 2)
  const d = Math.max(lo - a, Math.min(b - lo, delta))
  out[index] = a + d
  out[index + 1] = b - d
  return out
}

export interface TileRect {
  row: number // 0-based
  col: number // 0-based within the row
  x: number // left edge, fraction of the width available to tiles in this row
  w: number
  y: number // top edge, fraction of the height available to rows
  h: number
  colsInRow: number
}

/** Where each tile goes, as fractions; gaps are added when styling. */
export function tileRects(layout: GridLayout, sizes: Sizes): TileRect[] {
  const counts = rowCounts(layout)
  const rects: TileRect[] = []
  let y = 0
  counts.forEach((n, r) => {
    let x = 0
    for (let c = 0; c < n; c++) {
      const w = sizes.cols[r][c]
      rects.push({ row: r, col: c, x, w, y, h: sizes.rows[r], colsInRow: n })
      x += w
    }
    y += sizes.rows[r]
  })
  return rects
}

const EPS = 1e-9

/**
 * Index of the tile next to `index` in `dir`, or `index` itself at an edge.
 * Left/right move within the row. Up/down go to the tile in the adjacent row
 * under the current tile's horizontal centre, using the real (possibly
 * resized) widths.
 */
export function neighbor(layout: GridLayout, index: number, dir: Direction, sizes: Sizes = equalSizes(layout)): number {
  const rects = tileRects(layout, sizes)
  const cur = rects[index]
  if (!cur) return index
  if (dir === 'left' || dir === 'right') {
    const target = index + (dir === 'left' ? -1 : 1)
    return rects[target]?.row === cur.row ? target : index
  }
  const row = cur.row + (dir === 'up' ? -1 : 1)
  const centre = cur.x + cur.w / 2
  let best = index
  let bestDist = Infinity
  rects.forEach((r, i) => {
    if (r.row !== row) return
    if (centre + EPS >= r.x && centre + EPS < r.x + r.w) {
      best = i
      bestDist = -1
    } else if (bestDist !== -1) {
      const d = Math.abs(r.x + r.w / 2 - centre)
      if (d < bestDist) {
        best = i
        bestDist = d
      }
    }
  })
  return best
}
