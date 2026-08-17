/**
 * Where the chat panel is allowed to be, and how much space it may take.
 *
 * Kept as a pure function of the viewport width so the one decision that
 * matters — DOCK (page reflows beside it) or SHEET (deliberate full screen) —
 * is testable and stated in one place rather than spread across a stylesheet.
 *
 * The reasoning, in the order the numbers were chosen:
 *
 *  - The shell frame is nav 248px · centre (max 940px) · rail 360–420px, and
 *    the shell already collapses the centre/rail split at 1240px of viewport
 *    (research/10-LAYOUT-BLUEPRINT.md §1 and the responsive block in
 *    src/ui/shell/styles.css). Docking narrows the page by the panel's width,
 *    so the page behaves as though the viewport were that much smaller.
 *
 *  - Below DOCK_MIN_VIEWPORT there is no column to give away: taking 340px from
 *    a 1300px window leaves a centre nobody can read. So the panel stops trying
 *    to share and becomes a full opaque sheet instead. That is the honest
 *    trade — a second screen you opened and can close — rather than a
 *    translucent flap with the page ghosting through it.
 *
 *  - When docking WOULD fit but leaves the page under the shell's own split
 *    threshold, the anatomy rail moves beneath the centre column, exactly as
 *    the shell does at 1240px. The centre is what yields; the rail is a
 *    headline result and never disappears.
 */

export type ChatMode = 'dock' | 'sheet'

/** Narrower than this and there is nothing left to dock beside. */
export const DOCK_MIN_VIEWPORT = 1400

/** The shell's own centre/rail split threshold, mirrored here. */
export const SPLIT_MIN = 1240

export const DOCK_MIN_W = 340
export const DOCK_MAX_W = 420
const DOCK_SHARE = 0.24

export interface DockGeometry {
  mode: ChatMode
  /** Panel width in px. Only meaningful when `mode` is 'dock'. */
  width: number
  /**
   * True when the page, once narrowed, is too tight for the centre and the rail
   * side by side. The rail stacks beneath the centre; it is never hidden.
   */
  stackRail: boolean
}

export function dockWidth(viewport: number): number {
  return Math.round(Math.min(DOCK_MAX_W, Math.max(DOCK_MIN_W, viewport * DOCK_SHARE)))
}

export function dockGeometry(viewport: number): DockGeometry {
  if (viewport < DOCK_MIN_VIEWPORT) return { mode: 'sheet', width: viewport, stackRail: false }
  const width = dockWidth(viewport)
  return { mode: 'dock', width, stackRail: viewport - width <= SPLIT_MIN }
}
