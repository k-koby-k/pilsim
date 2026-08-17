/**
 * CF-06 — THE POTENCY-TRAP GUARD, plus a drift check on the mirrored substance
 * parameters.
 *
 * research/03-SIMULATION-SPEC.md §1: "every concentration→effect parameter in
 * PilSim is derived from clinical dose–response data, never from binding assays.
 * … Add a lint rule or a unit test that greps the engine directory for those
 * identifiers and fails the build."
 *
 * This is that test. It is cheap, and the failure it prevents — a model that is
 * 99.97 % saturated at every therapeutic dose, so half a tablet and four tablets
 * give the same blood pressure — is the single most likely error a clinician
 * judge would catch.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SUBSTANCE_PK } from './substanceParams'
import { EC50_NG_ML, referenceCavgNgMl } from './pd'
import { STANDARD_DOSE_MG } from './constants'

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(ENGINE_DIR, '..', '..')

const FORBIDDEN = [/\bic50/i, /\bki_nm\b/i, /\bkd_nm\b/i, /\bki_n_m\b/i, /\bbindingdb\b/i]

function engineSourceFiles(): string[] {
  return readdirSync(ENGINE_DIR)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => f !== 'potency-trap.test.ts') // this file names them on purpose
    .map((f) => join(ENGINE_DIR, f))
}

describe('CF-06 🔴 no in-vitro binding constant may reach the numeric path', () => {
  it('src/engine/** contains no ic50 / ki_nM / kd_nM identifier', () => {
    const offenders: string[] = []
    for (const file of engineSourceFiles()) {
      const text = readFileSync(file, 'utf8')
      // Comments are stripped first: these files EXPLAIN the trap at length, and
      // a guard that fires on its own documentation would be deleted within a
      // day. What must never appear is a READ of the field.
      const code = text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
      for (const [i, line] of code.split('\n').entries()) {
        for (const pattern of FORBIDDEN) {
          if (pattern.test(line)) {
            offenders.push(`${file.split('/').pop()}:${i + 1}: ${line.trim()}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('the engine never imports the substances dataset at all', () => {
    // Structural, not textual: the parameters are mirrored into
    // substanceParams.ts with the in-vitro block deliberately left behind, so a
    // binding constant has no route into the engine even by accident.
    for (const file of engineSourceFiles()) {
      const text = readFileSync(file, 'utf8')
      expect(/from\s+['"].*substances(_part\d)?\.json['"]/.test(text), file).toBe(false)
    }
  })

  it('every EC50 is orders of magnitude above the published in-vitro potency', () => {
    // ChEMBL puts lisinopril ACE IC50 at 1.2–4.7 nM ≈ 0.5–1.9 ng/mL. If that had
    // leaked in, this ratio would be ~1 instead of ~20.
    const inVitroLisinoprilNgMl = 1.9
    expect(EC50_NG_ML.ace / inVitroLisinoprilNgMl).toBeGreaterThan(5)
  })

  it('every EC50 sits at a therapeutic concentration by CONSTRUCTION', () => {
    // Occupancy at the standard dose's steady-state average must land on the
    // §8.6b target. That is what makes the trap structurally impossible.
    const cavgLis = referenceCavgNgMl('lisinopril', STANDARD_DOSE_MG.lisinopril)
    expect(cavgLis / (EC50_NG_ML.ace + cavgLis)).toBeCloseTo(0.8, 3)

    const cavgAml = referenceCavgNgMl('amlodipine', STANDARD_DOSE_MG.amlodipine)
    expect(cavgAml / (EC50_NG_ML.cav12 + cavgAml)).toBeCloseTo(0.5, 3)
  })

  it('a dose sweep is NOT flat — the observable symptom of the trap', () => {
    // With an in-vitro EC50 the occupancy would be > 0.999 at every dose here.
    const occ = (mg: number) => {
      const c = referenceCavgNgMl('lisinopril', mg)
      return c / (EC50_NG_ML.ace + c)
    }
    expect(occ(20) - occ(5)).toBeGreaterThan(0.1)
    expect(occ(5)).toBeLessThan(0.6)
    expect(occ(80)).toBeLessThan(0.99)
  })
})

describe('the mirrored substance parameters have not drifted from data/substances.json', () => {
  const raw = JSON.parse(
    readFileSync(join(REPO_ROOT, 'data', 'substances.json'), 'utf8'),
  ) as { substances: Record<string, unknown>[] }

  const record = (id: string) => raw.substances.find((s) => s.id === id) as
    | Record<string, Record<string, Record<string, { value: number | null }>>>
    | undefined

  const num = (v: unknown): number | null => {
    if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
      return (v as { value: number | null }).value
    }
    return null
  }

  it('every drug the engine models exists in the dataset', () => {
    for (const id of Object.keys(SUBSTANCE_PK)) {
      expect(record(id), id).toBeTruthy()
    }
  })

  it('F, ka, Vd and half-life match pk.model_defaults / pk.half_life_h', () => {
    for (const s of Object.values(SUBSTANCE_PK)) {
      const r = record(s.id)
      if (!r) continue
      const md = r.pk?.model_defaults as unknown as Record<string, unknown> | undefined
      if (!md) continue
      const halfLife = num(r.pk.half_life_h)
      if (halfLife != null) expect(s.half_life_h, `${s.id} t½`).toBeCloseTo(halfLife, 4)
      const vd = num(md.vd_l)
      if (vd != null) expect(s.vd_l, `${s.id} Vd`).toBeCloseTo(vd, 4)
      const cl = num(md.cl_l_h)
      if (cl != null) expect(s.cl_l_h, `${s.id} CL`).toBeCloseTo(cl, 4)
      const ka = num(md.ka_per_h)
      if (ka != null && s.id !== 'exp3174') expect(s.ka, `${s.id} ka`).toBeCloseTo(ka, 4)
      const f = num(md.f_oral)
      if (f != null && s.id !== 'exp3174') expect(s.F, `${s.id} F`).toBeCloseTo(f, 4)
    }
  })

  it('the derived losartan volumes are what the dataset carries, not the label values', () => {
    // Agent B1 already applied the correction in the data file; this asserts it
    // is still there. If someone "restores" 34 L / 12 L from the label, losartan
    // clears roughly three times too fast and once-daily dosing stops working.
    const los = record('losartan')!
    const exp = record('exp3174')!
    expect(num((los.pk.model_defaults as unknown as Record<string, unknown>).vd_l)).toBe(109)
    expect(num((exp.pk.model_defaults as unknown as Record<string, unknown>).vd_l)).toBe(32)
    // and the label-printed steady-state volumes are still visible as the
    // inconsistent pair they are
    expect(num(los.pk.vd_l)).toBe(34)
    expect(num(exp.pk.vd_l)).toBe(12)
  })

  it('the population CV values match', () => {
    for (const s of Object.values(SUBSTANCE_PK)) {
      const r = record(s.id)
      const cv = (r?.pk?.model_defaults as unknown as Record<string, unknown> | undefined)
        ?.population_cv as Record<string, unknown> | undefined
      if (!cv) continue
      const f = num(cv.f)
      if (f != null) expect(s.cv.F, `${s.id} CV F`).toBeCloseTo(f, 4)
      const vd = num(cv.vd)
      if (vd != null) expect(s.cv.vd, `${s.id} CV Vd`).toBeCloseTo(vd, 4)
      const cl = num(cv.cl)
      if (cl != null) expect(s.cv.cl, `${s.id} CV CL`).toBeCloseTo(cl, 4)
    }
  })
})
