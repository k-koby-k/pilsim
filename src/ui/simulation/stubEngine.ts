/**
 * PLACEHOLDER ENGINE — src/ui/simulation/stubEngine.ts
 *
 * ============================ READ THIS FIRST ============================
 * This is NOT the PilSim engine. The real engine is `src/engine/index.ts`
 * (Agent ENG). This file exists only so the simulation view is demonstrable
 * while that module is being written, and it is superseded automatically the
 * moment `src/engine/` exports a runner (see `adapters.ts`).
 *
 * Every constant below is a SHAPE PLACEHOLDER, not a sourced pharmacokinetic
 * value. Nothing here has provenance. The UI renders a loud red banner
 * whenever these numbers are on screen, because an unlabelled synthetic trace
 * next to a cited one is exactly the failure mode the research warns about.
 *
 * Two structural choices are deliberate and worth keeping even as placeholders,
 * because they are *structure* rather than answers:
 *
 *  1. Effects saturate per PATHWAY, not per drug. Two drugs on the same
 *     pathway share one saturating curve; two drugs on different pathways add.
 *     Nothing in this file says "dual RAAS blockade is bad" or "half-doses of
 *     two beat a double dose of one" — those fall out of the shared curve.
 *  2. Dosing history is superposed from before t=0 when `initial` is
 *     'steady_state', so amlodipine accumulates over its own long half-life
 *     rather than being told to.
 * =======================================================================
 */

import type {
  DrugId,
  EffectFrame,
  RunSummary,
  SimRequest,
} from '../../types'

export const STUB_ENGINE_NOTICE =
  'Placeholder trace — the simulation engine module (src/engine) is not loaded. ' +
  'Curve shapes are illustrative only. No value in this view is sourced.'

export const ALL_DRUGS: DrugId[] = [
  'lisinopril',
  'losartan',
  'exp3174',
  'amlodipine',
  'hydrochlorothiazide',
  'metoprolol',
]

/** Which saturating pathway a moiety acts through. Shared pathway => shared curve. */
type Pathway = 'raas' | 'ccb' | 'thiazide' | 'beta'

interface StubPk {
  /** first-order absorption rate, 1/h — PLACEHOLDER */
  ka: number
  /** elimination rate, 1/h — PLACEHOLDER */
  ke: number
  /** apparent volume of distribution / F, litres — PLACEHOLDER */
  vdF: number
  /** fraction of the parent dose appearing as this moiety — PLACEHOLDER */
  fraction: number
  pathway: Pathway
  /** concentration producing half-maximal target engagement, ng/mL — PLACEHOLDER */
  ec50: number
}

const PK: Record<DrugId, StubPk> = {
  lisinopril: { ka: 0.6, ke: 0.058, vdF: 100, fraction: 1, pathway: 'raas', ec50: 12 },
  losartan: { ka: 1.2, ke: 0.347, vdF: 34, fraction: 1, pathway: 'raas', ec50: 220 },
  exp3174: { ka: 0.5, ke: 0.116, vdF: 12, fraction: 0.14, pathway: 'raas', ec50: 60 },
  amlodipine: { ka: 0.35, ke: 0.0173, vdF: 1400, fraction: 1, pathway: 'ccb', ec50: 4 },
  hydrochlorothiazide: { ka: 1.0, ke: 0.077, vdF: 250, fraction: 1, pathway: 'thiazide', ec50: 60 },
  metoprolol: { ka: 1.0, ke: 0.173, vdF: 250, fraction: 1, pathway: 'beta', ec50: 45 },
}

/** Maximum achievable MAP reduction per pathway, mmHg — PLACEHOLDER. */
const PATHWAY_EMAX: Record<Pathway, number> = {
  raas: 13,
  ccb: 13,
  thiazide: 11,
  beta: 10,
}

/**
 * β1-selectivity is lost above 300 nmol/L = 80.2 ng/mL of metoprolol.
 * research/00-DECISIONS.md §7, research/B2-notes.md §101. Tier 1.
 * This one IS sourced; it is the gate the CYP2D6 demo turns on.
 */
export const METOPROLOL_BETA1_SELECTIVITY_NG_ML = 80.2

/** Amlodipine oedema incidence at 2.5 / 5 / 10 mg vs placebo 0.6 % — FDA label [P1]. */
const AMLODIPINE_EDEMA_PCT: [number, number][] = [
  [0, 0.6],
  [2.5, 1.8],
  [5, 3.0],
  [10, 10.8],
]

function interp(table: [number, number][], x: number): number {
  if (x <= table[0][0]) return table[0][1]
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i]
    if (x <= x1) {
      const [x0, y0] = table[i - 1]
      const f = (x - x0) / (x1 - x0)
      return y0 + f * (y1 - y0)
    }
  }
  return table[table.length - 1][1]
}

/** Bateman function, one compartment with first-order input. */
function bateman(dose_mg: number, t_h: number, pk: StubPk): number {
  if (t_h <= 0) return 0
  const { ka, ke, vdF } = pk
  const amt_ng = dose_mg * 1e6 * pk.fraction
  const c = (amt_ng / (vdF * 1000)) * (ka / (ka - ke)) * (Math.exp(-ke * t_h) - Math.exp(-ka * t_h))
  return Math.max(0, c)
}

function emax(c: number, ec50: number): number {
  return c <= 0 ? 0 : c / (c + ec50)
}

/** CYP2D6 phenotype changes metoprolol clearance. Multipliers are PLACEHOLDERS. */
function cyp2d6Factor(pheno: string | undefined): { keMul: number; capacity: number } {
  switch (pheno) {
    case 'poor':
      return { keMul: 0.42, capacity: 0.05 }
    case 'intermediate':
      return { keMul: 0.68, capacity: 0.5 }
    case 'ultrarapid':
      return { keMul: 1.55, capacity: 1.7 }
    default:
      return { keMul: 1, capacity: 1 }
  }
}

interface DoseEvent {
  drug: DrugId
  mg: number
  t_h: number
}

function buildDoseSchedule(req: SimRequest): DoseEvent[] {
  const events: DoseEvent[] = []
  // Steady state is reached by superposing a real dosing history before t=0
  // rather than by asserting a steady-state concentration. Amlodipine's long
  // half-life then produces its own accumulation.
  const preloadDays = req.options.initial === 'steady_state' ? 21 : 0
  for (const d of req.regimen.doses) {
    const perDay = Math.max(1, d.perDay || 1)
    const interval = 24 / perDay
    const start = -preloadDays * 24
    for (let t = start; t < req.options.horizonHours; t += interval) {
      events.push({ drug: d.substanceId, mg: d.mg, t_h: t })
      // Losartan generates EXP3174; the metabolite carries the effect.
      if (d.substanceId === 'losartan') {
        events.push({ drug: 'exp3174', mg: d.mg, t_h: t })
      }
    }
  }
  return events
}

function concAt(events: DoseEvent[], t: number, keMul: Partial<Record<DrugId, number>>): Record<DrugId, number> {
  const out = {} as Record<DrugId, number>
  for (const drug of ALL_DRUGS) out[drug] = 0
  for (const e of events) {
    const base = PK[e.drug]
    const pk: StubPk = keMul[e.drug] ? { ...base, ke: base.ke * (keMul[e.drug] as number) } : base
    out[e.drug] += bateman(e.mg, t - e.t_h, pk)
  }
  return out
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * Build one EffectFrame. Every field of the frozen interface is populated;
 * PROXY-tier fields are indices around 1.0 and must never be shown with units.
 */
function makeFrame(
  t_h: number,
  conc: Record<DrugId, number>,
  req: SimRequest,
  base: { sbp: number; dbp: number; hr: number },
  cyp: { keMul: number; capacity: number },
): EffectFrame {
  const eng = {
    ace: emax(conc.lisinopril, PK.lisinopril.ec50),
    at1: emax(conc.exp3174, PK.exp3174.ec50) * 0.75 + emax(conc.losartan, PK.losartan.ec50) * 0.25,
    ccb: emax(conc.amlodipine, PK.amlodipine.ec50),
    ncc: emax(conc.hydrochlorothiazide, PK.hydrochlorothiazide.ec50),
    b1: emax(conc.metoprolol, PK.metoprolol.ec50),
  }
  // β2 occupancy only becomes material once the selectivity gate is crossed.
  const overGate = Math.max(0, conc.metoprolol - METOPROLOL_BETA1_SELECTIVITY_NG_ML)
  const beta2 = clamp(eng.b1 * (0.06 + 0.55 * (overGate / (overGate + 60))), 0, 1)

  // --- pathway-level saturation. Two drugs on one pathway share one curve. ---
  const pathwayDrive: Record<Pathway, number> = {
    raas: eng.ace + eng.at1,
    ccb: eng.ccb,
    thiazide: eng.ncc,
    beta: eng.b1,
  }
  let dMap = 0
  for (const p of Object.keys(pathwayDrive) as Pathway[]) {
    const drive = pathwayDrive[p]
    dMap += PATHWAY_EMAX[p] * (drive / (drive + 0.75))
  }

  const baseMap = base.dbp + (base.sbp - base.dbp) / 3
  const map = baseMap - dMap
  const pulsePressure = (base.sbp - base.dbp) * (1 - 0.18 * eng.ccb - 0.05 * eng.ncc)
  const dbp = map - pulsePressure / 3
  const sbp = dbp + pulsePressure
  const hr = base.hr * (1 - 0.22 * eng.b1) + 3 * eng.ccb

  const svr = 1200 * (1 - 0.30 * eng.ccb - 0.22 * eng.ace - 0.20 * eng.at1)
  const co = (map * 80) / Math.max(400, svr) / 10 + 3.2
  const sv = (co * 1000) / Math.max(35, hr)

  const amloDailyMg = req.regimen.doses
    .filter((d) => d.substanceId === 'amlodipine')
    .reduce((s, d) => s + d.mg * Math.max(1, d.perDay), 0)
  const edemaPct = interp(AMLODIPINE_EDEMA_PCT, amloDailyMg)

  const reninFold = 1 + 2.4 * eng.ncc + 1.6 * eng.ace + 1.2 * eng.at1 - 0.5 * eng.b1
  const angFold = 1 - 0.75 * eng.ace + 1.9 * eng.at1

  return {
    t_h,
    conc: { ...conc },
    engagement: {
      ace_inhibition_plasma: eng.ace,
      ace_inhibition_pulmonary: eng.ace * 0.92,
      ace_inhibition_renal: eng.ace * 0.97,
      at1_blockade: clamp(eng.at1, 0, 1),
      cav12_block_vsmc: eng.ccb,
      cav12_block_myocardium: eng.ccb * 0.04,
      ncc_inhibition: eng.ncc,
      urat1_inhibition: emax(conc.losartan, PK.losartan.ec50) * 0.6,
      beta1_occupancy: eng.b1,
      beta2_occupancy: beta2,
    },
    mediators: {
      renin_pra: 1.0 * Math.max(0.1, reninFold),
      renin_pra_fold: Math.max(0.1, reninFold),
      ang_ii: 20 * Math.max(0.05, angFold),
      ang_ii_fold: Math.max(0.05, angFold),
      aldosterone: 12 * Math.max(0.1, 1 - 0.55 * eng.ace - 0.5 * eng.at1 + 0.3 * eng.ncc),
      aldosterone_fold: Math.max(0.1, 1 - 0.55 * eng.ace - 0.5 * eng.at1 + 0.3 * eng.ncc),
      bradykinin_fold: 1 + 1.6 * eng.ace,
      sympathetic_tone_fold: 1 + 0.35 * eng.ccb + 0.2 * eng.ncc - 0.4 * eng.b1,
    },
    haemo: {
      sbp,
      dbp,
      map,
      hr,
      stroke_volume: sv,
      cardiac_output: co,
      svr,
      arteriolar_radius_index: 1 + 0.22 * eng.ccb + 0.1 * eng.ace,
      venous_tone_index: 1 - 0.03 * eng.ccb,
      capillary_hydrostatic_p: 17 + 6 * eng.ccb,
      contractility_index: 1 - 0.18 * eng.b1,
    },
    renal: {
      gfr: 100 * (1 - 0.06 * eng.ace - 0.05 * eng.at1),
      renal_blood_flow: 1100 * (1 + 0.08 * eng.ace),
      filtration_fraction: 0.18 * (1 - 0.09 * eng.ace),
      p_glomerular: 55 * (1 - 0.07 * eng.ace - 0.06 * eng.at1),
      afferent_radius_index: 1 + 0.05 * eng.ccb,
      efferent_radius_index: 1 + 0.16 * eng.ace + 0.14 * eng.at1,
      na_excretion_rate: 100 * (1 + 1.6 * eng.ncc + 0.2 * eng.ace),
      k_excretion_rate: 60 * (1 + 1.1 * eng.ncc - 0.35 * eng.ace - 0.3 * eng.at1),
      urate_excretion_rate: 40 * (1 - 0.35 * eng.ncc + 0.5 * emax(conc.losartan, PK.losartan.ec50)),
      urine_flow: 60 * (1 + 0.9 * eng.ncc),
      frac_na_reab_pt: 0.65,
      frac_na_reab_tal: 0.25,
      frac_na_reab_dct: 0.07 * (1 - 0.75 * eng.ncc),
      frac_na_reab_cd: 0.02 * (1 + 0.6 * eng.ncc),
    },
    chem: {
      plasma_volume: 3.0 * (1 - 0.05 * eng.ncc),
      ecf_volume: 14 * (1 - 0.03 * eng.ncc),
      serum_k: 4.2 - 0.35 * eng.ncc + 0.35 * eng.ace + 0.3 * eng.at1,
      serum_na: 140 - 1.6 * eng.ncc,
      serum_urate: 5.4 + 1.5 * eng.ncc - 0.29 * emax(conc.losartan, PK.losartan.ec50),
      serum_creatinine: 0.95 * (1 + 0.07 * eng.ace + 0.05 * eng.at1),
      fasting_glucose: 95 * (1 + 0.03 * eng.ncc),
    },
    periph: {
      interstitial_volume_index: 1 + 0.09 * eng.ccb,
      edema_grade: clamp((edemaPct / 10.8) * 1.6 * eng.ccb, 0, 3),
    },
    liver: {
      cyp3a4_flux: 1,
      cyp2c9_flux: 1,
      cyp2d6_flux: cyp.capacity,
      cyp2d6_capacity_fold: cyp.capacity,
      first_pass_extraction: { losartan: 0.67, amlodipine: 0.36, metoprolol: 0.5 },
    },
    lung: {
      fev1_pct_baseline: 100 - 6.9 * beta2,
      airway_smooth_muscle_tone_index: 1 + 0.5 * beta2,
      bradykinin_airway_fold: 1 + 1.4 * eng.ace,
      cough_hazard: 0.039 * eng.ace,
    },
    hazards: {
      cough: 0.039 * eng.ace,
      dizziness_orthostatic: clamp(0.015 + 0.05 * (dMap / 20), 0, 1),
      peripheral_edema: edemaPct / 100,
      bradycardia: clamp(hr < 55 ? 0.2 + (55 - hr) * 0.02 : 0.01, 0, 1),
      bronchospasm: clamp(beta2 * 0.5, 0, 1),
      hyperkalemia: clamp(0.02 + 0.09 * (eng.ace + eng.at1) - 0.05 * eng.ncc, 0, 1),
      hypokalemia: clamp(0.02 + 0.12 * eng.ncc, 0, 1),
      hyperuricemia_gout: clamp(0.01 + 0.1 * eng.ncc, 0, 1),
      hyponatremia: clamp(0.005 + 0.05 * eng.ncc, 0, 1),
      acute_gfr_drop: clamp(0.02 + 0.06 * (eng.ace + eng.at1), 0, 1),
      angioedema: clamp(0.002 * eng.ace, 0, 1),
    },
  }
}

export function stubBaseline(req: SimRequest) {
  const i = req.patient.inputs
  return {
    sbp: Number(i.sbp_mmHg) || 145,
    dbp: Number(i.dbp_mmHg) || 90,
    hr: Number(i.hr_bpm) || 74,
  }
}

/** Generates the full frame series for a request. Synchronous; the caller chunks it. */
export function stubRun(req: SimRequest): { frames: EffectFrame[]; summary: RunSummary } {
  const base = stubBaseline(req)
  const cyp = cyp2d6Factor(req.patient.inputs.cyp2d6)
  const keMul: Partial<Record<DrugId, number>> = { metoprolol: cyp.keMul }

  // Rule-engine PK multipliers land on apparent clearance in this placeholder.
  for (const [drug, mul] of Object.entries(req.modifiers?.pkMultipliers ?? {})) {
    if (typeof mul === 'number' && mul > 0) {
      keMul[drug as DrugId] = (keMul[drug as DrugId] ?? 1) / mul
    }
  }

  const events = buildDoseSchedule(req)
  const stepH = Math.max(1, req.options.outputEveryMin) / 60
  const frames: EffectFrame[] = []
  for (let t = 0; t <= req.options.horizonHours + 1e-9; t += stepH) {
    frames.push(makeFrame(t, concAt(events, t, keMul), req, base, cyp))
  }

  const baseMap = base.dbp + (base.sbp - base.dbp) / 3
  const tail = frames.slice(Math.floor(frames.length * 0.75))
  const meanSbp = tail.reduce((s, f) => s + f.haemo.sbp, 0) / Math.max(1, tail.length)
  const meanDbp = tail.reduce((s, f) => s + f.haemo.dbp, 0) / Math.max(1, tail.length)
  void baseMap

  const peak = {} as Partial<Record<DrugId, number>>
  const trough = {} as Partial<Record<DrugId, number>>
  for (const d of ALL_DRUGS) {
    const tailC = tail.map((f) => f.conc[d])
    if (tailC.some((v) => v > 0)) {
      peak[d] = Math.max(...tailC)
      trough[d] = Math.min(...tailC)
    }
  }

  const hazards: Record<string, number> = {}
  const last = frames[frames.length - 1]
  for (const [k, v] of Object.entries(last.hazards)) hazards[k] = v

  // A crude population spread so the report has something to widen. PLACEHOLDER.
  const n = req.options.populationN ?? 1
  const spread = n > 1 ? Math.abs(meanSbp - base.sbp) * 0.45 + 3 : 0

  return {
    frames,
    summary: {
      // RunSummary.deltaSbp is a REDUCTION, so a positive number means the
      // pressure came down. Matching the engine's convention here matters:
      // flipping the sign silently inverts every ranking that consumes it.
      deltaSbp: base.sbp - meanSbp,
      deltaDbp: base.dbp - meanDbp,
      deltaSbpP05: n > 1 ? base.sbp - meanSbp - spread : undefined,
      deltaSbpP95: n > 1 ? base.sbp - meanSbp + spread : undefined,
      peakConc: peak,
      troughConc: trough,
      hazards,
      finalChem: last.chem,
      framesEmitted: frames.length,
    },
  }
}
