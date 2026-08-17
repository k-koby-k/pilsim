import { describe, it, expect } from 'vitest'
import {
  DOCK_MAX_W,
  DOCK_MIN_VIEWPORT,
  DOCK_MIN_W,
  SPLIT_MIN,
  dockGeometry,
  dockWidth,
} from './dock'

describe('the panel never covers the page', () => {
  it('docks only when there is a column left to give away', () => {
    expect(dockGeometry(DOCK_MIN_VIEWPORT - 1).mode).toBe('sheet')
    expect(dockGeometry(DOCK_MIN_VIEWPORT).mode).toBe('dock')
  })

  it('leaves the page at least the shell’s minimum readable width when docked', () => {
    for (let v = DOCK_MIN_VIEWPORT; v <= 2400; v += 17) {
      const g = dockGeometry(v)
      // The page keeps viewport − panel. Nothing overlaps, so this is literally
      // the width the app has to lay itself out in.
      expect(v - g.width).toBeGreaterThanOrEqual(1000)
    }
  })

  it('stacks the anatomy rail rather than squeezing it, and only when it must', () => {
    for (let v = DOCK_MIN_VIEWPORT; v <= 2400; v += 17) {
      const g = dockGeometry(v)
      expect(g.stackRail).toBe(v - g.width <= SPLIT_MIN)
    }
    // Wide enough and the frame stays intact: centre and rail side by side.
    expect(dockGeometry(1920).stackRail).toBe(false)
  })

  it('keeps the panel inside its stated bounds', () => {
    for (let v = DOCK_MIN_VIEWPORT; v <= 3200; v += 29) {
      const w = dockWidth(v)
      expect(w).toBeGreaterThanOrEqual(DOCK_MIN_W)
      expect(w).toBeLessThanOrEqual(DOCK_MAX_W)
    }
  })

  it('a sheet is the whole viewport, deliberately — not a flap over it', () => {
    const g = dockGeometry(900)
    expect(g.mode).toBe('sheet')
    expect(g.width).toBe(900)
  })
})
