/**
 * STATIC organ-effect knowledge — research/04-ORGAN-EFFECT-MAP.md §§5–11.
 *
 * This file answers one question and no other: *where in the body does this substance
 * work, on what, and in which direction* — before any dose is given and before any
 * simulation has run. Nothing here reads an `EffectFrame`, a concentration or an
 * engagement value; there is no run to read. It is the drug's address book.
 *
 * PROVENANCE. Every row restates a binding table in research/04 (the section is named on
 * the row). No mechanism is invented here, and no magnitude is quoted here — magnitudes
 * belong to the run report, which is calibrated; this view is qualitative on purpose.
 *
 * WORDING RULE. `where` is the anatomical site a clinician would name out loud and `what`
 * is the mechanism in a handful of plain words, direction included. Both are read in one
 * glance beside the figure, so both stay short. The distal convoluted tubule is the only
 * named cell population anywhere in this UI (§14) and it is named on exactly one row.
 */

import type { DrugId } from '../../types'
import type { AnatomicalTier } from './channels'

// ---------------------------------------------------------------------------
// Sites — the addressable regions of the whole-body figure.
//
// Geometry is stated in the figure's own 600 x 720 user space, the same space
// BodyFigure draws its organs in, so a halo lands on the organ it names.
// ---------------------------------------------------------------------------

export type OrganSiteId = 'lungs' | 'heart' | 'liver' | 'kidney' | 'adrenal' | 'arterioles' | 'limbs'

export interface Halo {
  cx: number
  cy: number
  rx: number
  ry: number
}

export interface OrganSite {
  id: OrganSiteId
  /** What the callout is titled. */
  label: string
  /** Soft highlight shapes laid over the organ. */
  halos: Halo[]
  /** Vessels are highlighted as a stroked run, not as a blob. */
  paths?: string[]
  /** Where the leader line lands on the body. */
  anchor: [number, number]
  side: 'left' | 'right'
  /** Preferred first baseline for this callout. layoutLane() may push it DOWN, never up. */
  y: number
}

/**
 * Declared in the order the leaders meet the body, top to bottom, within each column —
 * the ordering `layoutLane()` needs if the leader lines are not to cross.
 */
export const ORGAN_SITES: Record<OrganSiteId, OrganSite> = {
  lungs: {
    id: 'lungs',
    label: 'Lungs',
    halos: [{ cx: 300, cy: 208, rx: 66, ry: 76 }],
    anchor: [250, 196],
    side: 'left',
    y: 190,
  },
  heart: {
    id: 'heart',
    label: 'Heart',
    halos: [{ cx: 308, cy: 222, rx: 34, ry: 32 }],
    anchor: [334, 218],
    side: 'right',
    y: 196,
  },
  liver: {
    id: 'liver',
    label: 'Liver',
    halos: [{ cx: 292, cy: 276, rx: 48, ry: 26 }],
    anchor: [262, 268],
    side: 'left',
    y: 292,
  },
  adrenal: {
    id: 'adrenal',
    label: 'Adrenal cortex',
    halos: [{ cx: 332, cy: 291, rx: 19, ry: 15 }],
    anchor: [342, 290],
    side: 'right',
    y: 300,
  },
  kidney: {
    id: 'kidney',
    label: 'Kidneys',
    halos: [
      { cx: 266, cy: 320, rx: 22, ry: 26 },
      { cx: 334, cy: 320, rx: 22, ry: 26 },
    ],
    anchor: [254, 316],
    side: 'left',
    y: 372,
  },
  arterioles: {
    id: 'arterioles',
    // Resistance vessels are everywhere, so the highlight runs down all four limbs and
    // the iliacs rather than sitting on one organ. That is the honest picture: a
    // vasodilator is not acting in one place, it is acting in every small vessel.
    label: 'Arterioles',
    halos: [],
    paths: [
      'M 302 300 C 304 330 303 340 302 351',
      'M 302 351 C 297 362 289 372 284 392',
      'M 302 351 C 307 362 315 372 320 392',
      'M 269 436 L 266 508',
      'M 331 436 L 334 508',
      'M 232 214 L 220 264',
      'M 368 214 L 380 264',
    ],
    anchor: [332, 470],
    side: 'right',
    y: 448,
  },
  limbs: {
    id: 'limbs',
    label: 'Dependent limbs',
    halos: [
      { cx: 268, cy: 622, rx: 24, ry: 44 },
      { cx: 332, cy: 622, rx: 24, ry: 44 },
    ],
    anchor: [252, 622],
    side: 'left',
    y: 606,
  },
}

/**
 * How many mechanism rows one callout may print before it summarises the rest.
 *
 * A callout is read at a glance, and seven lines of mechanism on one organ is not a
 * glance — it is a paragraph printed over the kidney. It is also the case that four
 * blocks of seven rows cannot fit down a 720-unit figure at any type size, so this
 * bound is what keeps the lane layout inside the frame no matter how many substances
 * a caller passes. Anything beyond it is counted, not dropped silently.
 */
export const MAX_CALLOUT_ROWS = 4

/** Column order, top to bottom. Both lists must stay monotonic in `anchor[1]`. */
export const LEFT_COLUMN: OrganSiteId[] = ['lungs', 'liver', 'kidney', 'limbs']
export const RIGHT_COLUMN: OrganSiteId[] = ['heart', 'adrenal', 'arterioles']

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface OrganAction {
  site: OrganSiteId
  /** The site a clinician would name. Kept to a few words. */
  where: string
  /** Mechanism and direction, in plain words. */
  what: string
  /**
   * `target` — the substance acts here.
   * `absent` — it deliberately does NOT act here, and the absence is the teaching point
   *            (§9.2 "render the absence"). An absent row never lights an organ up.
   */
  tone: 'target' | 'absent'
  tier: AnatomicalTier
  /** Which section of research/04 this row restates. */
  ref: string
}

/**
 * The address book. Keys are the modelled actives; everything else — every excipient —
 * has no entry, and the view says so in words rather than showing an empty body.
 */
export const ORGAN_ACTIONS: Record<DrugId, OrganAction[]> = {
  lisinopril: [
    {
      site: 'arterioles',
      where: 'vascular ACE',
      what: 'less angiotensin II — vessels widen',
      tone: 'target',
      tier: 'T3',
      ref: '§6.2',
    },
    {
      site: 'kidney',
      where: 'efferent arteriole',
      what: 'dilates — filtration pressure falls',
      tone: 'target',
      tier: 'T3',
      ref: '§7.3',
    },
    {
      site: 'lungs',
      where: 'pulmonary capillary ACE',
      what: 'bradykinin builds — cough follows',
      tone: 'target',
      tier: 'T3',
      ref: '§9.2',
    },
    {
      site: 'adrenal',
      where: 'outer cortex (zona glomerulosa)',
      what: 'aldosterone falls — potassium retained',
      tone: 'target',
      tier: 'T3',
      ref: '§10',
    },
    {
      site: 'liver',
      where: 'not metabolised',
      what: 'passes through — cleared by the kidney',
      tone: 'absent',
      tier: 'T2',
      ref: '§8.2',
    },
  ],

  losartan: [
    {
      site: 'arterioles',
      where: 'AT1 receptor',
      what: 'angiotensin II blocked — vessels widen',
      tone: 'target',
      tier: 'T3',
      ref: '§6.2',
    },
    {
      site: 'liver',
      where: 'CYP2C9',
      what: 'converted to EXP3174, the stronger blocker',
      tone: 'target',
      tier: 'T2',
      ref: '§8.2',
    },
    {
      site: 'kidney',
      where: 'efferent arteriole',
      what: 'dilates — filtration pressure falls',
      tone: 'target',
      tier: 'T3',
      ref: '§7.3',
    },
    {
      site: 'kidney',
      where: 'proximal tubule',
      what: 'URAT1 blocked — urate leaves in the urine',
      tone: 'target',
      tier: 'T2',
      ref: '§7.4',
    },
    {
      site: 'adrenal',
      where: 'outer cortex (zona glomerulosa)',
      what: 'aldosterone falls — potassium retained',
      tone: 'target',
      tier: 'T3',
      ref: '§10',
    },
    {
      site: 'lungs',
      where: 'no airway channel',
      what: 'no bradykinin, so no cough',
      tone: 'absent',
      tier: 'T2',
      ref: '§9.2',
    },
  ],

  exp3174: [
    {
      site: 'arterioles',
      where: 'AT1 receptor',
      what: 'the active metabolite — a longer block',
      tone: 'target',
      tier: 'T3',
      ref: '§6.2',
    },
    {
      site: 'kidney',
      where: 'efferent arteriole',
      what: 'dilates — filtration pressure falls',
      tone: 'target',
      tier: 'T3',
      ref: '§7.3',
    },
    {
      site: 'adrenal',
      where: 'outer cortex (zona glomerulosa)',
      what: 'aldosterone falls — potassium retained',
      tone: 'target',
      tier: 'T3',
      ref: '§10',
    },
  ],

  amlodipine: [
    {
      site: 'arterioles',
      where: 'Cav1.2 channel, arteriolar muscle',
      what: 'blocks calcium entry — arterioles widen',
      tone: 'target',
      tier: 'T3',
      ref: '§6.2',
    },
    {
      site: 'limbs',
      where: 'dependent capillary bed',
      what: 'inlet opens, outlet does not — ankles swell',
      tone: 'target',
      tier: 'T3',
      ref: '§11.2',
    },
    {
      site: 'liver',
      where: 'CYP3A4',
      what: 'extensively metabolised — slow to clear',
      tone: 'target',
      tier: 'T2',
      ref: '§8.2',
    },
    {
      site: 'kidney',
      where: 'afferent arteriole',
      what: 'mild dilation — filtration preserved',
      tone: 'target',
      tier: 'T3',
      ref: '§7.3',
    },
    {
      site: 'heart',
      where: 'myocardium',
      what: 'vascular-selective — reflex rate rise only',
      tone: 'absent',
      tier: 'T3',
      ref: '§5.2',
    },
  ],

  hydrochlorothiazide: [
    {
      site: 'kidney',
      // §14: the one place in this UI permitted to name a cell population.
      where: 'distal convoluted tubule cells',
      what: 'blocks NCC — salt stays in the urine',
      tone: 'target',
      tier: 'T1',
      ref: '§7.4',
    },
    {
      site: 'kidney',
      where: 'collecting duct',
      what: 'more sodium arrives — potassium leaves',
      tone: 'target',
      tier: 'T3',
      ref: '§7.4',
    },
    {
      site: 'kidney',
      where: 'proximal tubule',
      what: 'volume falls — urate reabsorption rises',
      tone: 'target',
      tier: 'T3',
      ref: '§7.4',
    },
    {
      site: 'adrenal',
      where: 'outer cortex (zona glomerulosa)',
      what: 'volume loss raises aldosterone',
      tone: 'target',
      tier: 'T3',
      ref: '§10',
    },
  ],

  metoprolol: [
    {
      site: 'heart',
      where: 'β1 receptors, node and ventricle',
      what: 'rate and force fall',
      tone: 'target',
      tier: 'T2',
      ref: '§5.2',
    },
    {
      site: 'liver',
      where: 'CYP2D6 gate',
      what: 'genotype decides how fast it clears',
      tone: 'target',
      tier: 'T2',
      ref: '§8.2',
    },
    {
      site: 'lungs',
      where: 'β2 spillover, airway muscle',
      what: 'selectivity fades as the level climbs',
      tone: 'target',
      tier: 'T3',
      ref: '§9.2',
    },
  ],
}

/** Every id this map knows about. Anything else is inert as far as the body is concerned. */
export const ACTING_SUBSTANCES: DrugId[] = Object.keys(ORGAN_ACTIONS) as DrugId[]

export function hasOrganAction(id: string): id is DrugId {
  return Object.prototype.hasOwnProperty.call(ORGAN_ACTIONS, id)
}

export function organActions(id: string): OrganAction[] {
  return hasOrganAction(id) ? ORGAN_ACTIONS[id] : []
}

/**
 * A readable name for a substance the drug map does not carry — every excipient.
 * Ids arrive as `sodium_starch_glycolate`; a reader wants "Sodium starch glycolate".
 */
export function substanceLabel(id: string): string {
  const words = id.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
