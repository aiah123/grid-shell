import { describe, expect, it } from 'vitest'
import { computeLayout } from './layout'

describe('computeLayout', () => {
  it('handles 0 and 1 sessions', () => {
    expect(computeLayout(0).placements).toEqual([])
    const one = computeLayout(1)
    expect(one).toMatchObject({ rows: 1, cols: 1 })
    expect(one.placements[0]).toEqual({ row: 1, colStart: 1, colSpan: 1 })
  })

  it('uses a square-ish grid', () => {
    expect(computeLayout(4)).toMatchObject({ rows: 2, cols: 2 })
    expect(computeLayout(6)).toMatchObject({ rows: 2, cols: 3 })
    expect(computeLayout(9)).toMatchObject({ rows: 3, cols: 3 })
  })

  it('stretches a short last row to the full width', () => {
    for (let n = 1; n <= 20; n++) {
      const { rows, tracks, placements } = computeLayout(n)
      for (let r = 1; r <= rows; r++) {
        const inRow = placements.filter((p) => p.row === r)
        const width = inRow.reduce((sum, p) => sum + p.colSpan, 0)
        expect(width).toBe(tracks)
        // tiles in a row are equal width and contiguous
        expect(new Set(inRow.map((p) => p.colSpan)).size).toBe(1)
        inRow.forEach((p, i) => expect(p.colStart).toBe(1 + i * p.colSpan))
      }
    }
  })

  it('places 3 sessions as 2 on top, 1 full-width below', () => {
    const { placements } = computeLayout(3)
    expect(placements[2].row).toBe(2)
    expect(placements[2].colSpan).toBe(placements[0].colSpan * 2)
  })
})

import { equalSizes, moveBoundary, neighbor, shapeKey, tileRects } from './layout'

describe('neighbor', () => {
  it('moves within a row and stops at edges', () => {
    const l = computeLayout(4) // 2x2
    expect(neighbor(l, 0, 'right')).toBe(1)
    expect(neighbor(l, 1, 'right')).toBe(1)
    expect(neighbor(l, 0, 'left')).toBe(0)
    expect(neighbor(l, 2, 'left')).toBe(2)
  })

  it('moves between rows', () => {
    const l = computeLayout(4)
    expect(neighbor(l, 0, 'down')).toBe(2)
    expect(neighbor(l, 3, 'up')).toBe(1)
    expect(neighbor(l, 0, 'up')).toBe(0)
  })

  it('handles a stretched last row', () => {
    const l = computeLayout(3) // [0][1] / [   2   ]
    expect(neighbor(l, 0, 'down')).toBe(2)
    expect(neighbor(l, 1, 'down')).toBe(2)
    expect(neighbor(l, 2, 'up')).toBe(1) // centre of the wide tile falls in tile 1's half
    const l5 = computeLayout(5) // [0][1][2] / [3 ][4 ]
    expect(neighbor(l5, 1, 'down')).toBe(4) // centre on the boundary goes right
    expect(neighbor(l5, 0, 'down')).toBe(3)
    expect(neighbor(l5, 2, 'down')).toBe(4)
    expect(neighbor(l5, 3, 'up')).toBe(0)
    expect(neighbor(l5, 4, 'up')).toBe(2)
  })
})

describe('sizes', () => {
  it('starts equal, per row', () => {
    const l = computeLayout(5) // 3 + 2
    expect(shapeKey(l)).toBe('3,2')
    const s = equalSizes(l)
    expect(s.rows).toEqual([0.5, 0.5])
    expect(s.cols[0]).toHaveLength(3)
    expect(s.cols[1]).toEqual([0.5, 0.5])
  })

  it('moves one boundary and clamps to the minimum', () => {
    const close = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i]))
    close(moveBoundary([0.5, 0.5], 0, 0.2, 0.1), [0.7, 0.3])
    close(moveBoundary([0.25, 0.25, 0.5], 1, 0.4, 0.1), [0.25, 0.65, 0.1])
    close(moveBoundary([0.5, 0.5], 0, -1, 0.1), [0.1, 0.9])
    expect(moveBoundary([0.5, 0.5], 1, 0.1, 0.1)).toEqual([0.5, 0.5]) // no boundary after the last item
    const sum = moveBoundary([0.2, 0.3, 0.5], 1, 0.13, 0.05).reduce((a, b) => a + b)
    expect(sum).toBeCloseTo(1)
  })

  it('places tiles from the fractions', () => {
    const l = computeLayout(3) // 2 + 1
    const rects = tileRects(l, { rows: [0.7, 0.3], cols: [[0.25, 0.75], [1]] })
    expect(rects[1]).toMatchObject({ row: 0, col: 1, x: 0.25, w: 0.75, y: 0, h: 0.7, colsInRow: 2 })
    expect(rects[2]).toMatchObject({ row: 1, col: 0, x: 0, w: 1, y: 0.7, h: 0.3 })
  })

  it('navigates up/down by the resized widths', () => {
    const l = computeLayout(4) // 2 + 2
    const sizes = { rows: [0.5, 0.5], cols: [[0.8, 0.2], [0.5, 0.5]] }
    expect(neighbor(l, 3, 'up', sizes)).toBe(0) // centre of tile 3 (0.75) is under the wide tile 0
    expect(neighbor(l, 3, 'up')).toBe(1) // with equal sizes it's tile 1
  })
})
