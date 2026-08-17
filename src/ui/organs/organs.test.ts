/**
 * Guards the organ animation's bindings against a real engine run.
 *
 * Every visual channel is a pure function of one named bus field, so the whole animation
 * layer is testable without a DOM: if a binding would produce NaN, an out-of-range stroke
 * width or a negative particle count on stage, it fails here instead.
 */

import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { runSimulationSync, referencePatient } from '../../engine'
import type { EffectFrame, SimRequest } from '../../types'
import {
  beatAmplitude,
  beatPeriodS,
  cloud,
  dropsPerS,
  flow,
  isProxy,
  formatSignal,
  lumen,
  ringSweepDeg,
  swell,
  tint,
  VESSEL_BASE_PX,
} from './channels'
import { airwayWidth } from './Lungs'
import { derivedEdemaGrade } from './Periphery'
import { DRUG_ORDER, T1_CELL_POPULATION } from './channels'
import {
  LEFT_COLUMN,
  MAX_CALLOUT_ROWS,
  ORGAN_ACTIONS,
  ORGAN_SITES,
  RIGHT_COLUMN,
  hasOrganAction,
  organActions,
  substanceLabel,
  type OrganSiteId,
} from './effectMap'
import { layoutLane, LANE_GAP, LINE_PITCH, TITLE_LEAD, TYPE } from './primitives'
import { AffectedAnatomy } from './AffectedAnatomy'

function frames(): EffectFrame[] {
  const patient = referencePatient()
  const req: SimRequest = {
    kind: 'run',
    runId: 'organs-test',
    patient,
    regimen: {
      id: 'combo',
      label: 'lisinopril 20 + HCTZ 25 + amlodipine 10 + metoprolol 100',
      doses: [
        { substanceId: 'lisinopril', mg: 20, perDay: 1 },
        { substanceId: 'hydrochlorothiazide', mg: 25, perDay: 1 },
        { substanceId: 'amlodipine', mg: 10, perDay: 1 },
        { substanceId: 'metoprolol', mg: 100, perDay: 2 },
      ],
    },
    modifiers: {
      hits: [], blocked: false, blockReasons: [],
      pkMultipliers: {}, pdMultipliers: {}, stateShifts: {},
      doseCaps: {}, phenoconversions: {},
    },
    options: { horizonHours: 24, outputEveryMin: 30, initial: 'steady_state' },
  }
  return runSimulationSync(req).frames
}

describe('organ bindings over a real run', () => {
  const fs = frames()

  it('produces frames', () => {
    expect(fs.length).toBeGreaterThan(10)
  })

  it('every visual channel stays finite and in range', () => {
    for (const f of fs) {
      const period = beatPeriodS(f.haemo.hr)
      expect(period).toBeGreaterThanOrEqual(0.3)
      expect(period).toBeLessThanOrEqual(2.0)

      const amp = beatAmplitude(f.haemo.contractility_index)
      expect(amp).toBeGreaterThan(0)
      expect(amp).toBeLessThan(0.08)

      const art = lumen(VESSEL_BASE_PX.arteriole, f.haemo.arteriolar_radius_index)!
      expect(art).toBeGreaterThanOrEqual(VESSEL_BASE_PX.arteriole * 0.7 - 1e-9)
      expect(art).toBeLessThanOrEqual(VESSEL_BASE_PX.arteriole * 1.6 + 1e-9)

      const aw = airwayWidth(f.engagement.beta2_occupancy)!
      expect(aw).toBeGreaterThan(0)

      expect(Number.isFinite(dropsPerS(f.renal.urine_flow))).toBe(true)
      expect(ringSweepDeg(f.engagement.ncc_inhibition)).toBeLessThanOrEqual(360)

      const s = swell(f.periph.interstitial_volume_index)!
      expect(s.scale).toBeGreaterThanOrEqual(1)
      expect(s.scale).toBeLessThanOrEqual(1.14 + 1e-9)

      const grade = derivedEdemaGrade(f.periph.interstitial_volume_index)!
      expect(grade).toBeGreaterThanOrEqual(0)
      expect(grade).toBeLessThanOrEqual(3)

      const fl = flow(f.renal.gfr / 130, 90)!
      expect(fl.count).toBeGreaterThanOrEqual(0)
      expect(fl.durationS).toBeGreaterThan(0)

      const c = cloud('metoprolol', f.conc.metoprolol)!
      expect(c.count).toBeGreaterThanOrEqual(2)
      expect(c.opacity).toBeLessThanOrEqual(0.85 + 1e-9)

      expect(tint(0)).toBe('#9AA3AE')
    }
  })

  it('intraglomerular pressure never renders with absolute units', () => {
    expect(isProxy('renal.p_glomerular')).toBe(true)
    const rendered = formatSignal('renal.p_glomerular', fs[0]!.renal.p_glomerular, 'mmHg')
    expect(rendered).not.toContain('mmHg')
    expect(rendered).toContain('relative')
  })

  it('beta1 and beta2 occupancy are separate channels', () => {
    const peak = fs.reduce((a, b) => (b.conc.metoprolol > a.conc.metoprolol ? b : a))
    expect(peak.engagement.beta1_occupancy).not.toBe(peak.engagement.beta2_occupancy)
    expect(peak.engagement.beta1_occupancy).toBeGreaterThan(peak.engagement.beta2_occupancy)
  })
})

/**
 * The static organ-effect map behind <AffectedAnatomy>. It carries no bus binding, so
 * what has to be guarded is different: that every row lands on a site that exists, that
 * the callout columns cannot tangle their leaders or overprint each other however many
 * drugs are passed at once, and that the one T1 cell-population claim stays the only one.
 */
describe('organ effect map', () => {
  const every = DRUG_ORDER.flatMap((d) => ORGAN_ACTIONS[d].map((a) => ({ drug: d, ...a })))

  it('every modelled drug acts somewhere, and every row lands on a real site', () => {
    for (const d of DRUG_ORDER) {
      expect(ORGAN_ACTIONS[d].length).toBeGreaterThan(0)
      expect(ORGAN_ACTIONS[d].some((a) => a.tone === 'target')).toBe(true)
    }
    for (const a of every) expect(ORGAN_SITES[a.site]).toBeDefined()
  })

  it('every site belongs to exactly one column', () => {
    const ids = Object.keys(ORGAN_SITES) as OrganSiteId[]
    for (const id of ids) {
      const inLeft = LEFT_COLUMN.includes(id)
      const inRight = RIGHT_COLUMN.includes(id)
      expect(inLeft !== inRight).toBe(true)
      expect(ORGAN_SITES[id].side).toBe(inLeft ? 'left' : 'right')
    }
    expect(LEFT_COLUMN.length + RIGHT_COLUMN.length).toBe(ids.length)
  })

  it('leader anchors run down each column, so two leaders cannot cross', () => {
    for (const column of [LEFT_COLUMN, RIGHT_COLUMN]) {
      for (let i = 1; i < column.length; i++) {
        const prev = ORGAN_SITES[column[i - 1]!]!
        const here = ORGAN_SITES[column[i]!]!
        expect(here.anchor[1]).toBeGreaterThan(prev.anchor[1])
        expect(here.y).toBeGreaterThan(prev.y)
      }
    }
  })

  /**
   * The worst case a caller can produce: every modelled substance at once, so every
   * callout carries every mechanism any drug has at that site. Reserved space, not a
   * hardcoded baseline, is what has to hold here.
   */
  it('callouts never overlap, even with every substance selected at once', () => {
    for (const column of [LEFT_COLUMN, RIGHT_COLUMN]) {
      const items = column
        .map((id) => {
          const all = every.filter((a) => a.site === id).length
          const shown = Math.min(all, MAX_CALLOUT_ROWS)
          return { site: ORGAN_SITES[id]!, all, lines: shown * 2 + (all > shown ? 1 : 0) }
        })
        .filter((it) => it.all > 0)

      const ys = layoutLane(items.map((it) => ({ y: it.site.y, lines: it.lines })))

      for (let i = 1; i < items.length; i++) {
        const above = items[i - 1]!
        const bottom =
          ys[i - 1]! + TITLE_LEAD + LINE_PITCH * (above.lines - 1) + TYPE.calloutLine * 0.25
        expect(ys[i]!).toBeGreaterThanOrEqual(bottom + LANE_GAP - 1e-9)
      }
      // Nothing may be pushed off the bottom of the 720-unit figure.
      const last = items[items.length - 1]
      if (last) {
        const end = ys[ys.length - 1]! + TITLE_LEAD + LINE_PITCH * (last.lines - 1)
        expect(end).toBeLessThan(720)
      }
    }
  })

  it('the distal convoluted tubule is the only named cell population', () => {
    const t1 = every.filter((a) => a.tier === 'T1')
    expect(t1.length).toBe(1)
    expect(t1[0]!.drug).toBe('hydrochlorothiazide')
    expect(t1[0]!.where).toBe(T1_CELL_POPULATION.cellPopulation)
  })

  it('labels stay short enough for the margin they are drawn in', () => {
    for (const a of every) {
      expect(a.where.length).toBeLessThanOrEqual(34)
      expect(a.what.length).toBeLessThanOrEqual(44)
    }
  })

  it('an excipient has no organ action, and still gets a readable name', () => {
    expect(hasOrganAction('talc')).toBe(false)
    expect(organActions('talc')).toEqual([])
    expect(substanceLabel('sodium_starch_glycolate')).toBe('Sodium starch glycolate')
    expect(hasOrganAction('amlodipine')).toBe(true)
  })

  it('quotes no magnitude — this view is qualitative by design', () => {
    for (const a of every) {
      expect(`${a.where} ${a.what}`).not.toMatch(/\d+(\.\d+)?\s*(%|mg|mmHg|ng\/mL|mmol)/)
    }
  })
})

/**
 * <AffectedAnatomy> renders with NO EffectFrame at all — it is knowledge, not a run —
 * so it must produce a complete figure on a server render, where there is no DOM, no
 * ResizeObserver and no simulation to read from.
 */
describe('AffectedAnatomy renders without a run', () => {
  const html = (ids: string[]) =>
    renderToStaticMarkup(createElement(AffectedAnatomy, { substanceIds: ids }))

  it('names the mechanism and the segment for a thiazide', () => {
    const out = html(['hydrochlorothiazide'])
    expect(out).toContain('Kidneys')
    expect(out).toContain(T1_CELL_POPULATION.cellPopulation)
    expect(out).toContain('blocks NCC')
    // A quiet organ is still drawn — the body is never a torso full of holes.
    expect(out).toContain('aa-organ')
  })

  it('colours each organ by the drug acting on it when several are passed', () => {
    const out = html(['amlodipine', 'lisinopril'])
    expect(out).toContain('var(--drug-amlodipine')
    expect(out).toContain('var(--drug-lisinopril')
    expect(out).toContain('Lungs')
    expect(out).toContain('Dependent limbs')
  })

  it('says so plainly when nothing on the list acts on an organ', () => {
    const out = html(['talc', 'povidone'])
    expect(out).toContain('No modelled organ action')
    expect(out).toContain('Talc')
    expect(out).toContain('excipients')
  })

  it('renders the absence where the absence is the point', () => {
    const out = html(['losartan'])
    expect(out).toContain('no airway channel')
    expect(out).toContain('no bradykinin, so no cough')
  })
})
