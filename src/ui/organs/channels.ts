/**
 * Visual channel vocabulary — research/04-ORGAN-EFFECT-MAP.md §3 and §4.
 *
 * Every number in this file is either quoted from that document or marked VISUAL.
 * VISUAL constants carry NO clinical claim and must never reach the run report.
 *
 * Implementation rule from §0: if a mapping is not in §3 and a signal is not in §2,
 * that is a defect in the spec — flag it, do not invent it. Nothing here is invented.
 */

import type { CSSProperties } from 'react'
import type { DrugId, EffectFrame } from '../../types'
import { PROXY_FIELDS as ENGINE_PROXY_FIELDS } from '../../engine/tiers'

// ---------------------------------------------------------------------------
// §3 helpers — verbatim
// ---------------------------------------------------------------------------

/** unipolar: magnitude 0..1 */
export const norm = (x: number, lo: number, hi: number): number =>
  Math.min(1, Math.max(0, (x - lo) / (hi - lo)))

/** bipolar: -1 (suppressed) .. 0 (baseline) .. +1 (activated) */
export const bip = (x: number, base: number, span: number): number =>
  Math.min(1, Math.max(-1, (x - base) / span))

export const clamp = (x: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, x))

/**
 * §2 bus completeness check: a field the engine cannot produce arrives as null.
 * The UI must render that channel `unmodelled` — it must NOT fall back to zero,
 * because zero is a physiological claim and null is not.
 */
export const modelled = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

/** Read a bus field, or `null` if the engine did not model it. */
export function sig(v: number | null | undefined): number | null {
  return modelled(v) ? v : null
}

/** Read a bus field with a baseline substitute, and report whether it was real. */
export function sigOr(v: number | null | undefined, fallback: number): number {
  return modelled(v) ? v : fallback
}

// ---------------------------------------------------------------------------
// §3 V1 — tint. 3-stop diverging ramp, interpolated in Oklch (not sRGB).
// ---------------------------------------------------------------------------

export const TINT_SUPPRESSED = '#2E6FD9' // -1 : we turned something down
export const TINT_BASELINE = '#9AA3AE' //  0 : untreated baseline grey
export const TINT_ACTIVATED = '#E0533D' // +1 : we turned something up / stressed it

/** V1. `t` in [-1,+1]. Oklch interpolation per §3, via CSS color-mix. */
export function tint(t: number | null): string {
  if (t === null) return 'var(--pil-unmodelled, #b3bcc6)'
  const c = clamp(t, -1, 1)
  if (c < 0) return `color-mix(in oklch, ${TINT_SUPPRESSED} ${Math.round(-c * 100)}%, ${TINT_BASELINE})`
  if (c > 0) return `color-mix(in oklch, ${TINT_ACTIVATED} ${Math.round(c * 100)}%, ${TINT_BASELINE})`
  return TINT_BASELINE
}

/**
 * V1, drawn on a light clinical ground.
 *
 * `tint()` replaces an organ's colour outright, which was right on a black canvas but wrong
 * on white: at baseline it repaints healthy tissue a dead grey. The redraw keeps the natural
 * anatomical fill and lays the SAME diverging ramp over it as a wash whose opacity is the
 * magnitude. Untreated therefore looks untreated, and every trace of colour on the figure is
 * a drug doing something. Direction and magnitude are unchanged — only the substrate is.
 */
export interface TintWash {
  colour: string
  opacity: number
}

export function tintWash(t: number | null, gain = 0.62): TintWash {
  if (t === null) return { colour: TINT_BASELINE, opacity: 0 }
  const c = clamp(t, -1, 1)
  return {
    colour: c < 0 ? TINT_SUPPRESSED : TINT_ACTIVATED,
    opacity: Math.abs(c) * gain,
  }
}

// ---------------------------------------------------------------------------
// Anatomical palette — the tissue colours a careful textbook plate would use.
//
// House rule: colour values live in exactly one place. The shell's :root owns the
// interface palette; the anatomical palette has no counterpart there, so it is declared
// once as custom properties at the top of src/ui/organs/organs.css and only referenced
// from here. Every entry is a var() with the same literal repeated as its fallback, which
// is the convention already used for --pil-stroke: it keeps a figure rendering correctly
// if it is ever mounted without the stylesheet.
//
// None of these encodes a signal. Signal is carried by the diverging wash above, by
// per-drug hue, and by nothing else.
// ---------------------------------------------------------------------------

export const ORGAN = {
  skin: 'var(--pil-skin, #f4e6dc)',
  skinShade: 'var(--pil-skin-shade, #ead5c8)',
  skinLine: 'var(--pil-skin-line, #c4a495)',

  myocardium: 'var(--pil-myocardium, #cd6f77)',
  atrium: 'var(--pil-atrium, #dc9aa0)',
  node: 'var(--pil-node, #7d5a5f)',
  artery: 'var(--pil-artery, #cf6f72)',
  vein: 'var(--pil-vein, #7f9bc2)',
  perfusion: 'var(--pil-perfusion, #fdf3f0)',

  lung: 'var(--pil-lung, #eab8b5)',
  lungShade: 'var(--pil-lung-shade, #d59d98)',
  lungLine: 'var(--pil-lung-line, #c98d88)',
  airway: 'var(--pil-airway, #c8d3dd)',
  nerve: 'var(--pil-nerve, #b08b3a)',

  liver: 'var(--pil-liver, #b07a63)',
  liverDeep: 'var(--pil-liver-deep, #9a6653)',
  gallbladder: 'var(--pil-gallbladder, #8fa86d)',
  hepatocyte: 'var(--pil-hepatocyte, #d8a45e)',
  cyp3a4: 'var(--pil-cyp3a4, #a8722f)',

  kidney: 'var(--pil-kidney, #b46e60)',
  kidneyMedulla: 'var(--pil-kidney-medulla, #cf9285)',
  kidneyLine: 'var(--pil-kidney-line, #8f5348)',
  kidneyPelvis: 'var(--pil-kidney-pelvis, #e2d4c4)',
  adrenal: 'var(--pil-adrenal, #e0c98f)',
  adrenalCortex: 'var(--pil-adrenal-cortex, #efe0b2)',
  adrenalLine: 'var(--pil-adrenal-line, #bfa059)',
  adrenalMedulla: 'var(--pil-adrenal-medulla, #c9ae74)',
  aldosterone: 'var(--pil-aldosterone, #c9973c)',

  tubule: 'var(--pil-tubule, #d9cbb4)',
  tubuleDeep: 'var(--pil-tubule-deep, #c3b092)',
  filtrate: 'var(--pil-filtrate, #cfdce8)',
  creatinine: 'var(--pil-creatinine, #7b8a99)',

  panel: 'var(--surface-1, #ffffff)',
  panelLine: 'var(--line, #e3e8ef)',
  reactor: 'var(--surface-2, #f4f6f9)',
  warn: 'var(--warn, #a35410)',
  bad: 'var(--bad, #b3261e)',
} as const

// ---------------------------------------------------------------------------
// §4 Per-drug identity constants. Hues locked app-wide.
// c_ref values are VISUAL sprite-cloud scaling only — NOT PK claims (§4).
// ---------------------------------------------------------------------------

export interface DrugIdentity {
  id: DrugId
  label: string
  hue: string
  /** VISUAL only. §4: "must not be used in any calculation that reaches the report." */
  cRefNgMl: number
}

/**
 * Hues are the app-wide per-drug identity tokens declared in src/ui/shell/styles.css, so
 * the colour a reader learns for amlodipine on the concentration chart is the same one it
 * has on the organ figure, and so the palette retunes in one place. They were re-picked
 * for a light ground: each clears 4.5:1 against white, so a 1 px stroke or a 9 px label in
 * a drug's colour is still legible at projector distance.
 *
 * Identity, not intensity — a drug keeps its hue whether it is doing much or nothing.
 */
export const DRUGS: Record<DrugId, DrugIdentity> = {
  lisinopril: { id: 'lisinopril', label: 'Lisinopril', hue: 'var(--drug-lisinopril, #2563c9)', cRefNgMl: 90 },
  losartan: { id: 'losartan', label: 'Losartan', hue: 'var(--drug-losartan, #0f8a8a)', cRefNgMl: 250 },
  exp3174: { id: 'exp3174', label: 'EXP3174', hue: 'var(--drug-exp3174, #0b6b6b)', cRefNgMl: 100 },
  amlodipine: { id: 'amlodipine', label: 'Amlodipine', hue: 'var(--drug-amlodipine, #b3591e)', cRefNgMl: 12 },
  hydrochlorothiazide: {
    id: 'hydrochlorothiazide',
    label: 'Hydrochlorothiazide',
    hue: 'var(--drug-hydrochlorothiazide, #6b3fb5)',
    cRefNgMl: 200,
  },
  metoprolol: { id: 'metoprolol', label: 'Metoprolol', hue: 'var(--drug-metoprolol, #b3264f)', cRefNgMl: 200 },
}

export const DRUG_ORDER: DrugId[] = [
  'lisinopril',
  'losartan',
  'exp3174',
  'amlodipine',
  'hydrochlorothiazide',
  'metoprolol',
]

/**
 * Metoprolol beta-1 selectivity crossover.
 * FDA label, LOPRESSOR (metoprolol tartrate), SPL 0283bc9d-6998-493a-824a-d4c85f704111:
 * "The relative beta1-selectivity of metoprolol diminishes and blockade of
 *  beta2-adrenoceptors increases at plasma concentration above 300 nmol/L."
 * 300 nmol/L x 0.26736 = 80.2 ng/mL. Tier 1, CITED.
 */
export const METOPROLOL_BETA2_CROSSOVER_NG_ML = 80.2
export const METOPROLOL_CROSSOVER_QUOTE =
  'The relative beta1-selectivity of metoprolol diminishes and blockade of beta2-adrenoceptors ' +
  'increases at plasma concentration above 300 nmol/L. (300 nmol/L = 80.2 ng/mL)'
export const METOPROLOL_CROSSOVER_SOURCE =
  'FDA label, LOPRESSOR (metoprolol tartrate) tablets — DailyMed, retrieved 2026-08-17'

// ---------------------------------------------------------------------------
// §3 V2 — glow
// ---------------------------------------------------------------------------

/**
 * V2, restated for a light ground.
 *
 * A 24 px halo was the right answer on a black canvas and is the wrong one on white,
 * where it reads as a printing smudge rather than as activity. The organ modules now
 * express V2 as density and contrast instead — more capillaries drawn in the pulmonary
 * bed, more metabolising lobules marked in the liver, a heavier reactor wall — and this
 * helper survives, tuned down to a short soft shadow, for any caller that still wants the
 * effect as a style. The signal it carries is unchanged: `u` in [0,1] is the magnitude.
 */
export function glow(u: number | null, hue: string): CSSProperties {
  if (u === null) return {}
  const k = clamp(u, 0, 1)
  return {
    filter: k > 0.02 ? `drop-shadow(0 0 ${(k * 6).toFixed(1)}px ${hue})` : 'none',
    opacity: 0.7 + 0.3 * k,
  }
}

/** Raw glow parameters, for callers that want the numbers rather than a style. */
export const glowRadiusPx = (u: number): number => 24 * clamp(u, 0, 1)
export const glowAlpha = (u: number): number => 0.85 * clamp(u, 0, 1)

// ---------------------------------------------------------------------------
// §3 V3 / V4 — heart beat
// ---------------------------------------------------------------------------

/** V3. period_s = clamp(60 / hr, 0.30, 2.00) — i.e. 30..200 bpm. Bind directly. */
export const beatPeriodS = (hr: number): number => clamp(60 / hr, 0.3, 2.0)

/** V4. amp = 0.020 + 0.055 * norm(contractility_index, 0.55, 1.35). */
export const beatAmplitude = (contractilityIndex: number): number =>
  0.02 + 0.055 * norm(contractilityIndex, 0.55, 1.35)

// ---------------------------------------------------------------------------
// §3 V5 — particle stream
// ---------------------------------------------------------------------------

export interface FlowSpec {
  /** particles alive on the path */
  count: number
  /** seconds for one traversal */
  durationS: number
}

/** V5. spawn 0.5..14 /s, travel 20..160 px/s, both over norm() of the signal. */
export function flow(u: number | null, pathLengthPx = 220): FlowSpec | null {
  if (u === null) return null
  const k = clamp(u, 0, 1)
  const spawnPerS = 0.5 + 13.5 * k
  const speedPxS = 20 + 140 * k
  const durationS = pathLengthPx / speedPxS
  return { count: Math.min(18, Math.round(spawnPerS * durationS)), durationS }
}

// ---------------------------------------------------------------------------
// §3 V6 — lumen radius. base_px per vessel class from §6.1.
// ---------------------------------------------------------------------------

export const VESSEL_BASE_PX = {
  /** aorta and large branches */
  conduit: 14,
  /** precapillary resistance vessels — the SVR element */
  arteriole: 6,
  /** postcapillary venules — amlodipine barely touches these (§11.1) */
  venule: 8,
} as const

export type VesselClass = keyof typeof VESSEL_BASE_PX

/** V6. stroke width = base_px x idx, idx clamped [0.70, 1.60]. */
export function lumen(basePx: number, idx: number | null): number | null {
  if (idx === null) return null
  return basePx * clamp(idx, 0.7, 1.6)
}

// ---------------------------------------------------------------------------
// §3 V7 — swell (ankle / foot only, gravity-dependent)
// ---------------------------------------------------------------------------

/** V7. mesh scale 1.00 -> 1.14 over norm(idx, 1.00, 1.15), plus a 0->3 px blur. */
export function swell(interstitialVolumeIndex: number | null): { scale: number; blurPx: number } | null {
  if (interstitialVolumeIndex === null) return null
  const k = norm(interstitialVolumeIndex, 1.0, 1.15)
  return { scale: 1.0 + 0.14 * k, blurPx: 3 * k }
}

// ---------------------------------------------------------------------------
// §3 V8 — urine droplets
// ---------------------------------------------------------------------------

/** V8. drops/s = 0.2 + 2.8 * norm(urine_flow, 30, 260). */
export const dropsPerS = (urineFlowMlH: number): number => 0.2 + 2.8 * norm(urineFlowMlH, 30, 260)

// ---------------------------------------------------------------------------
// §3 V9 — typed ion sprites. Colour is IDENTITY, not intensity. Locked per ion.
// ---------------------------------------------------------------------------

/**
 * Hue per ion is locked — it is identity, never intensity. Values are declared with the
 * rest of the illustration palette in organs.css. They were darkened for the light ground
 * so a 3 px sprite and a 9 px label in the same colour both stay legible on white; the
 * hues themselves are unchanged, so a reader who learned "purple is potassium" on the
 * previous build still reads it correctly here.
 */
export const ION = {
  Na: { label: 'Na⁺', colour: 'var(--pil-ion-na, #2f8f4e)' },
  K: { label: 'K⁺', colour: 'var(--pil-ion-k, #7343c4)' },
  urate: { label: 'urate', colour: 'var(--pil-ion-urate, #b5731e)' },
  Cl: { label: 'Cl⁻', colour: 'var(--pil-ion-cl, #2f8fa3)' },
  H2O: { label: 'H₂O', colour: 'var(--pil-ion-h2o, #2f7fc4)' },
} as const

export type IonId = keyof typeof ION

// ---------------------------------------------------------------------------
// §3 V11 — occupancy ring
// ---------------------------------------------------------------------------

/** V11. arc sweep 0 -> 360 degrees over an engagement fraction in [0,1]. */
export const ringSweepDeg = (engagement: number): number => 360 * clamp(engagement, 0, 1)

// ---------------------------------------------------------------------------
// §3 V12 — drug sprite cloud
// ---------------------------------------------------------------------------

export interface CloudSpec {
  count: number
  opacity: number
  hue: string
}

/** V12. sprite count = round(2 + 26 * norm(c, 0, c_ref)); opacity = 0.35 + 0.5 * norm(...). */
export function cloud(drug: DrugId, concNgMl: number | null): CloudSpec | null {
  if (concNgMl === null) return null
  const id = DRUGS[drug]
  const k = norm(concNgMl, 0, id.cRefNgMl)
  return { count: Math.round(2 + 26 * k), opacity: 0.35 + 0.5 * k, hue: id.hue }
}

/** Is this drug meaningfully on board? Used to decide whether an organ channel is live. */
export function onBoard(concNgMl: number | null | undefined, drug: DrugId): boolean {
  return modelled(concNgMl) && concNgMl > 0.01 * DRUGS[drug].cRefNgMl
}

// ---------------------------------------------------------------------------
// PROXY-tier fields — research/04 and types.ts FrameFieldTier.
// "PROXY fields are uncalibrated indices and MUST NOT be rendered with absolute units."
// ---------------------------------------------------------------------------

/**
 * Dotted paths into EffectFrame that render WITHOUT units.
 *
 * The engine's `src/engine/tiers.ts` is authoritative — it is imported rather than
 * duplicated, so a field the engine reclassifies as PROXY cannot silently keep its units
 * here. `renal.p_glomerular` is the one that matters most: the entire renal-protection
 * animation rests on it and it is uncalibrated, so it is only ever shown as a relative
 * index against baseline.
 *
 * The extra paths added here are dimensionless indices normalised to 1.00 at baseline.
 * They are unitless by construction, so printing a unit beside them would be meaningless
 * even where the engine calls them DERIVED.
 */
export const PROXY_FIELDS: ReadonlySet<string> = new Set([
  ...ENGINE_PROXY_FIELDS,
  'renal.p_glomerular',
  'renal.afferent_radius_index',
  'renal.efferent_radius_index',
  'haemo.arteriolar_radius_index',
  'haemo.venous_tone_index',
  'haemo.contractility_index',
  'haemo.capillary_hydrostatic_p',
  'periph.interstitial_volume_index',
  'periph.edema_grade',
  'mediators.bradykinin_fold',
  'mediators.sympathetic_tone_fold',
  'lung.bradykinin_airway_fold',
  'lung.airway_smooth_muscle_tone_index',
  'lung.cough_hazard',
])

export const isProxy = (path: string): boolean => PROXY_FIELDS.has(path)

/**
 * Format a bus value for display. PROXY fields never get a unit; they render as a
 * relative index against baseline, with an explicit marker.
 */
export function formatSignal(path: string, value: number | null, unit?: string, digits = 1): string {
  if (value === null) return 'not modelled'
  if (isProxy(path)) return `${value.toFixed(digits)} × baseline (relative)`
  return unit ? `${value.toFixed(digits)} ${unit}` : value.toFixed(digits)
}

// ---------------------------------------------------------------------------
// §12 badge thresholds. All theta values are ESTIMATED VISUAL tuning constants,
// except the serum_k / serum_urate / hr gates, which are conventional lab bounds
// and are read from data/patient_model.json where available.
// ---------------------------------------------------------------------------

export interface BadgeSpec {
  id: string
  label: string
  /** Which drug(s) drive it — for the tooltip. */
  drugs: string
  thetaOn: number
  thetaOff: number
  /** Anchor incidence, shown as a RANGE where the sources disagree. Never a point estimate. */
  incidence: string
  source: string
  /** §12.1 — rare events must not render with the same visual weight as common ones. */
  rare?: boolean
  icon: string
}

export const BADGES: BadgeSpec[] = [
  {
    id: 'cough',
    label: 'Dry cough',
    drugs: 'lisinopril',
    thetaOn: 0.3,
    thetaOff: 0.2,
    incidence: '3.9 % (label, lisinopril/HCTZ trials) — literature range 5–35 %',
    source: 'FDA label lisinopril+HCTZ [S5]; ACCP / Ann Intern Med review [S11]',
    icon: 'cough',
  },
  {
    id: 'dizziness_orthostatic',
    label: 'Orthostatic dizziness',
    drugs: 'all, especially lisinopril',
    thetaOn: 0.35,
    thetaOff: 0.25,
    incidence: 'ATLAS 19 % high dose vs 12 % low dose; lisinopril/HCTZ 7.5 %; amlodipine 1.1/3.4/3.4 % vs 1.5 % placebo',
    source: 'FDA labels [S2][S5][S1]',
    icon: 'dizzy',
  },
  {
    id: 'peripheral_edema',
    label: 'Peripheral oedema',
    drugs: 'amlodipine',
    thetaOn: 0.25,
    thetaOff: 0.15,
    incidence: '1.8 / 3.0 / 10.8 % at 2.5 / 5 / 10 mg vs 0.6 % placebo; female 14.6 % vs male 5.6 %',
    source: 'FDA label amlodipine besylate [S1]; meta-analysis RR 2.9 [S9]',
    icon: 'edema',
  },
  {
    id: 'bradycardia',
    label: 'Bradycardia',
    drugs: 'metoprolol',
    thetaOn: 0.3,
    thetaOff: 0.2,
    incidence: 'listed among the most common reactions on the label; gate fires at HR < 50 bpm',
    source: 'FDA label metoprolol succinate ER [S4]',
    icon: 'brady',
  },
  {
    id: 'bronchospasm',
    label: 'Bronchospasm / wheeze',
    drugs: 'metoprolol',
    thetaOn: 0.3,
    thetaOff: 0.2,
    incidence: 'β2 occupancy 6–38 % at 100 mg b.i.d. (vs β1 54–92 % in the same subjects)',
    source: 'FDA label [S4]; receptor-occupancy study [S12]',
    icon: 'wheeze',
  },
  {
    id: 'hyperkalemia',
    label: 'Hyperkalaemia',
    drugs: 'lisinopril, losartan',
    thetaOn: 0.3,
    thetaOff: 0.2,
    incidence: 'ATLAS 6 % high dose vs 4 % low dose',
    source: 'FDA label Zestril [S2]',
    icon: 'k-high',
  },
  {
    id: 'hypokalemia',
    label: 'Hypokalaemia',
    drugs: 'hydrochlorothiazide',
    thetaOn: 0.3,
    thetaOff: 0.2,
    incidence: 'ΔK −0.35 mmol/L at 25–50 mg/day; −0.22 mmol/L in a low-dose meta-analysis',
    source: 'thiazide electrolyte meta-analyses [S10] — SECONDARY',
    icon: 'k-low',
  },
  {
    id: 'hyponatremia',
    label: 'Hyponatraemia',
    drugs: 'hydrochlorothiazide',
    thetaOn: 0.3,
    thetaOff: 0.2,
    incidence: 'direction sourced; magnitude NOT_FOUND',
    source: '[S10] — SECONDARY',
    icon: 'na-low',
  },
  {
    id: 'hyperuricemia_gout',
    label: 'Hyperuricaemia / gout flare',
    drugs: 'hydrochlorothiazide',
    thetaOn: 0.3,
    thetaOff: 0.2,
    incidence: '≈ +90 µmol/L (≈ +1.5 mg/dL) at ≥ 50 mg/day, roughly half that at ≤ 25 mg/day',
    source: '[S10] — SECONDARY',
    icon: 'gout',
  },
  {
    id: 'acute_gfr_drop',
    label: 'Acute eGFR drop',
    drugs: 'lisinopril, losartan (especially together)',
    thetaOn: 0.3,
    thetaOff: 0.2,
    incidence: 'ATLAS creatinine increased 10 % (high dose) vs 7 % (low dose)',
    source: 'FDA label Zestril [S2]',
    icon: 'gfr',
  },
  {
    id: 'angioedema',
    label: 'Angioedema (rare)',
    drugs: 'lisinopril',
    thetaOn: 0.3,
    thetaOff: 0.2,
    incidence: 'rare — the label carries a dedicated angioedema warning; no incidence asserted here',
    source: 'FDA label Zestril [S2]',
    rare: true,
    icon: 'angio',
  },
]

/**
 * §12.1 hysteresis. Without it badges flicker every frame and the demo looks broken.
 * Pure function over the previous latched set.
 */
export function latchBadges(
  hazards: Record<string, number> | null | undefined,
  prev: ReadonlySet<string>,
  gates: { hr?: number | null; serumK?: number | null; serumUrate?: number | null; kLow: number; kHigh: number; urateHigh: number },
): Set<string> {
  const next = new Set<string>()
  for (const b of BADGES) {
    const wasOn = prev.has(b.id)
    const h = hazards ? hazards[b.id] : undefined
    let on = wasOn
    if (modelled(h)) on = wasOn ? h > b.thetaOff : h >= b.thetaOn
    // Conventional clinical gates override the hazard channel where one exists.
    if (b.id === 'bradycardia' && modelled(gates.hr)) on = gates.hr < 50
    if (b.id === 'hyperkalemia' && modelled(gates.serumK)) on = gates.serumK > gates.kHigh
    if (b.id === 'hypokalemia' && modelled(gates.serumK)) on = gates.serumK < gates.kLow
    if (b.id === 'hyperuricemia_gout' && modelled(gates.serumUrate)) on = gates.serumUrate > gates.urateHigh
    if (on) next.add(b.id)
  }
  return next
}

// ---------------------------------------------------------------------------
// Reference ranges. §7.5 / §12.1 require these to be read from Agent D's
// data/patient_model.json rather than hard-coded. These are the documented
// fallbacks used only when that file has not loaded.
// ---------------------------------------------------------------------------

export interface RefRanges {
  kLow: number
  kHigh: number
  naLow: number
  naHigh: number
  urateHigh: number
  hrLow: number
  /** VISUAL gauge bounds, §7.5. */
  kGauge: [number, number]
  urateGauge: [number, number]
}

export const FALLBACK_REF: RefRanges = {
  kLow: 3.5,
  kHigh: 5.5,
  naLow: 136,
  naHigh: 146,
  urateHigh: 6.8,
  hrLow: 50,
  kGauge: [2.5, 7.0],
  urateGauge: [2.0, 12.0],
}

// ---------------------------------------------------------------------------
// Anatomical evidence tiers — §0.2 and §14.
// The UI may name a cell population ONLY for the single T1 row.
// ---------------------------------------------------------------------------

export type AnatomicalTier = 'T1' | 'T2' | 'T3' | 'T4'

export const TIER_NOTE: Record<AnatomicalTier, string> = {
  T1: 'Human single-cell evidence for this target in this cell population.',
  T2: 'Human tissue-level evidence. Rendered at tissue level — no cell population named.',
  T3: 'Mechanism inferred. Direction is confident; localisation is textbook, not sourced here.',
  T4: 'Visual continuity only — no physiological claim.',
}

/**
 * §14: the ONLY target in the whole drug set with single-cell evidence.
 * HPA single-cell: SLC12A3 9100.1 nCPM, "cell type enriched (distal convoluted tubule
 * cells)", tau 0.94. This is the one place the UI is permitted to name a cell population.
 */
export const T1_CELL_POPULATION = {
  element: 'n.dct',
  cellPopulation: 'distal convoluted tubule cells',
  gene: 'SLC12A3',
  protein: 'NCC',
  uniprot: 'P55017',
  evidence: 'HPA single-cell: 9100.1 nCPM, "cell type enriched (distal convoluted tubule cells)", tau 0.94',
  source: 'Human Protein Atlas, retrieved 2026-08-17 [S6c]',
} as const

// ---------------------------------------------------------------------------
// A resting, untreated baseline frame. Used when `frame` is null so the figure
// still breathes, and as the substitute value for individual unmodelled fields.
// Every number here is a resting-adult reference value, NOT a simulation output;
// the caller must label the figure as idle when it uses this.
// ---------------------------------------------------------------------------

export function baselineFrame(patch?: DeepPartial<EffectFrame>): EffectFrame {
  const base: EffectFrame = {
    t_h: 0,
    conc: {
      lisinopril: 0,
      losartan: 0,
      exp3174: 0,
      amlodipine: 0,
      hydrochlorothiazide: 0,
      metoprolol: 0,
    },
    engagement: {
      ace_inhibition_plasma: 0,
      ace_inhibition_pulmonary: 0,
      ace_inhibition_renal: 0,
      at1_blockade: 0,
      cav12_block_vsmc: 0,
      cav12_block_myocardium: 0,
      ncc_inhibition: 0,
      urat1_inhibition: 0,
      beta1_occupancy: 0,
      beta2_occupancy: 0,
    },
    mediators: {
      renin_pra: 1.0,
      renin_pra_fold: 1.0,
      ang_ii: 20,
      ang_ii_fold: 1.0,
      aldosterone: 10,
      aldosterone_fold: 1.0,
      bradykinin_fold: 1.0,
      sympathetic_tone_fold: 1.0,
    },
    haemo: {
      sbp: 118,
      dbp: 72,
      map: 87,
      hr: 70,
      stroke_volume: 93,
      cardiac_output: 6.5,
      svr: 1010,
      arteriolar_radius_index: 1.0,
      venous_tone_index: 1.0,
      capillary_hydrostatic_p: 25,
      contractility_index: 1.0,
    },
    renal: {
      gfr: 100,
      renal_blood_flow: 1235,
      filtration_fraction: 0.2,
      p_glomerular: 55,
      afferent_radius_index: 1.0,
      efferent_radius_index: 1.0,
      na_excretion_rate: 6,
      k_excretion_rate: 2.5,
      urate_excretion_rate: 25,
      urine_flow: 62,
      frac_na_reab_pt: 0.65,
      frac_na_reab_tal: 0.25,
      frac_na_reab_dct: 0.05,
      frac_na_reab_cd: 0.04,
    },
    chem: {
      plasma_volume: 3.0,
      ecf_volume: 17,
      serum_k: 4.2,
      serum_na: 140,
      serum_urate: 5.5,
      serum_creatinine: 0.9,
      fasting_glucose: 90,
    },
    periph: { interstitial_volume_index: 1.0, edema_grade: 0 },
    liver: {
      cyp3a4_flux: 0,
      cyp2c9_flux: 0,
      cyp2d6_flux: 0,
      cyp2d6_capacity_fold: 1.0,
      first_pass_extraction: { losartan: 0, amlodipine: 0, metoprolol: 0 },
    },
    lung: {
      fev1_pct_baseline: 100,
      airway_smooth_muscle_tone_index: 1.0,
      bradykinin_airway_fold: 1.0,
      cough_hazard: 0,
    },
    hazards: {
      cough: 0,
      dizziness_orthostatic: 0,
      peripheral_edema: 0,
      bradycardia: 0,
      bronchospasm: 0,
      hyperkalemia: 0,
    },
  }
  return patch ? deepMerge(base, patch) : base
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  const out = { ...base } as Record<string, unknown>
  for (const key of Object.keys(patch as object)) {
    const pv = (patch as Record<string, unknown>)[key]
    const bv = out[key]
    if (pv === undefined) continue
    if (pv && typeof pv === 'object' && !Array.isArray(pv) && bv && typeof bv === 'object') {
      out[key] = deepMerge(bv, pv as DeepPartial<unknown>)
    } else {
      out[key] = pv
    }
  }
  return out as T
}

// ---------------------------------------------------------------------------
// Small render helpers
// ---------------------------------------------------------------------------

/** Inline CSS custom properties, typed for React. */
export function vars(o: Record<string, string | number>): CSSProperties {
  return o as CSSProperties
}

/** Describe an arc for V11 occupancy rings. */
export function arcPath(cx: number, cy: number, r: number, sweepDeg: number): string {
  const s = clamp(sweepDeg, 0, 359.99)
  const a0 = -Math.PI / 2
  const a1 = a0 + (s * Math.PI) / 180
  const x0 = cx + r * Math.cos(a0)
  const y0 = cy + r * Math.sin(a0)
  const x1 = cx + r * Math.cos(a1)
  const y1 = cy + r * Math.sin(a1)
  const large = s > 180 ? 1 : 0
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

/** Quantise a duration so CSS animation restarts are rare during a run. */
export const qdur = (s: number): number => Math.max(0.2, Math.round(s * 8) / 8)
