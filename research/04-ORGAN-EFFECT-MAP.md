# 04 — Organ Effect Map

**Owner:** Agent F · **Written:** 2026-08-17 · **Status:** COMPLETE
**Consumers:** the animation layer, `data/organ_map.json`, and the run-report renderer.

> **This is a research simulator, not a clinical decision tool.** Nothing in this file
> is a treatment recommendation. See `05-OUTPUT-REPORT-SPEC.md` §7 for the mandatory
> disclaimer text that must appear in the UI.

---

## 0. What this file is, and the contract it makes with the coding agent

The team wants an animated human where you can *see* each substance hitting each organ.
Animation is only defensible if every moving pixel is bound to a named number the
simulation actually produces. So this file defines three things, in order:

1. **§2 The effect bus** — the exact list of named signals the simulation must emit each
   frame, with units and physiological ranges. This is the only interface between the
   engine (`03-SIMULATION-SPEC.md`, Agent E) and the animation. Nothing may be animated
   that is not on this bus.
2. **§3 The visual channel vocabulary** — twelve visual variables, each with an explicit
   normalization function and numeric output range. The coding agent picks a channel and
   a signal; it never invents a mapping.
3. **§5–§16 Per-organ binding tables** — for every organ/tissue the UI renders: which of
   the five drugs acts on it, through which molecular entity, in which direction, over
   what timescale, how strongly at a stated dose, which bus signal carries it, and which
   visual channel + numeric range renders it.

**Implementation rule for the coding agent:** if you need a mapping that is not in §3 or a
signal that is not in §2, that is a defect in this file — flag it, do not invent it. An
invented mapping is how the animation becomes decorative nonsense.

### 0.1 Provenance convention (locked decision 4)

Every numeric claim carries one of:

- `[S#]` — a source in §17, with the value as that source states it.
- `SECONDARY` — value taken from a review/summary rather than a primary paper I read in
  full. Treat as indicative; do not put it on a slide as a precise figure.
- `ESTIMATED` — my number, with a one-line justification. Not from any source.
- `NOT_FOUND` — I looked and could not source it. Left as a gap on purpose.

Values that exist **only to make the animation legible** (colour endpoints, pixel ranges,
easing curves) are marked `VISUAL` and carry **no clinical claim whatsoever**. They must
never appear in the run report as if they were physiology.

**Sources deliberately excluded — FAERS.** No adverse-effect incidence in this file comes
from the FDA Adverse Event Reporting System, and none may be added from it. FAERS is
spontaneous-report data with no denominator, distorted by polypharmacy and reporting bias.
Agent A demonstrated the failure concretely: amlodipine's top ten reported FAERS reactions
are largely polypharmacy noise, and **peripheral oedema — the single most characteristic
and most animatable adverse effect in this entire drug set — does not appear in the top
ten at all.** Ranking animation channels by FAERS frequency would have deleted the best
visual in the product. Every incidence figure in §12 therefore comes from regulatory
product labelling or from trial/meta-analysis literature that has a denominator. SIDER 4.1
is label-derived and acceptable as an *index* of which effects exist, but any magnitude
taken from it must be confirmed against the label before it reaches the UI.

### 0.2 Evidence tiers for anatomical resolution

The brief asks for cell-population detail *where the evidence supports it* and honesty
where it does not. Every row in every organ table carries a tier:

| Tier | Meaning | May the UI label a named cell population? |
|------|---------|-------------------------------------------|
| **T1** | Human single-cell or cell-resolved expression evidence for the drug target in that cell population, cited. | **Yes** — name the cell type in the UI. |
| **T2** | Human tissue-level evidence (regulatory labelling, tissue expression, classical human physiology) but no cell-resolved dataset cited here. | **No** — render and label at tissue level only. |
| **T3** | Mechanistic inference from established pharmacology; direction is confident, localisation is textbook rather than sourced here. | **No** — tissue level, and the tooltip must say "mechanism inferred". |
| **T4** | Present for visual continuity only (e.g. a drug sprite travelling through a vessel). | **No** — no physiological label at all. |

**We only have T1 for one target in this whole set** (SLC12A3/NCC in distal convoluted
tubule cells, §7.4). Everything else is T2 or T3. That is stated plainly in §14, and the
UI is required to be honest about it. Claiming cell-level resolution we do not have is
exactly the failure mode a clinician judge will catch.

---

## 1. The five drugs and their primary organ signatures

Locked set (`_SHARED_CONTEXT.md` decision 1). The point of the animation is that these
five look **visibly different** from each other. Here is the one-line visual signature of
each, which is what a judge will remember:

| Drug | Visual signature — what the viewer sees that no other drug in the set does |
|------|---------------------------------------------------------------------------|
| **Lisinopril** | The **lung** lights up as a drug target (pulmonary capillary endothelial ACE), and a bradykinin cloud builds there → cough badge. Kidney **efferent** arteriole dilates while the afferent does not. |
| **Losartan** | Two-stage: parent drug appears, then the **liver** converts it and a *second, brighter* molecule (EXP3174) emerges and goes to the receptor. Renin/AngII **rise** while blood pressure **falls** — the counter-intuitive one. Urate particles flush *out* of the proximal tubule. |
| **Amlodipine** | Slowest onset and never washes out during the run (t½ 30–50 h [S1]). Arterioles dilate hard; the **ankle swells** while nothing bad happens to the kidney. Reflex palpitation in the heart. |
| **Hydrochlorothiazide** | The only drug that produces **visible urine flow** and **ion particles leaving the body**. Its target is one specific, nameable nephron segment. Potassium drains out, urate backs up — the exact opposite of losartan's urate arrow. |
| **Metoprolol** | The **heart visibly slows and its beat weakens**. At high dose the effect spills into the lung (β2) and the airway narrows. The liver's CYP2D6 gate can be wide open or nearly shut depending on the patient's genotype — the same dose gives two different animations. |

---

## 2. The effect bus — signals the engine must emit

The engine emits one `EffectFrame` per simulated output step. Every animated property in
this document binds to a field of this frame. Field names here are normative — Agent E's
engine and the UI must use these exact names.

```ts
// TypeScript shape. Units are normative. All fields required unless marked ?.
interface EffectFrame {
  t_h: number;                    // simulated time, hours since first dose

  // --- 2.1 Plasma concentrations (ng/mL) ---
  conc: {
    lisinopril: number;
    losartan: number;             // parent
    exp3174: number;              // losartan active metabolite
    amlodipine: number;
    hydrochlorothiazide: number;
    metoprolol: number;
  };

  // --- 2.2 Target engagement, all fractions in [0,1] ---
  engagement: {
    ace_inhibition_plasma: number;    // fraction of circulating ACE activity inhibited
    ace_inhibition_pulmonary: number; // same, pulmonary capillary endothelial bed
    ace_inhibition_renal: number;     // same, renal vascular bed
    at1_blockade: number;             // fraction of AT1 receptors occupied (losartan+EXP3174)
    cav12_block_vsmc: number;         // fraction of L-type Ca current blocked, vascular SMC
    cav12_block_myocardium: number;   // same, cardiac — near 0 for amlodipine (vascular selective)
    ncc_inhibition: number;           // fraction of NCC-mediated Na-Cl flux inhibited
    urat1_inhibition: number;         // fraction of URAT1 urate reabsorption inhibited
    beta1_occupancy: number;          // cardiac beta-1 adrenoceptor occupancy
    beta2_occupancy: number;          // airway beta-2 adrenoceptor occupancy (selectivity loss)
  };

  // --- 2.3 Circulating mediators, absolute + fold-of-baseline ---
  mediators: {
    renin_pra: number;            // ng AngI/mL/h
    renin_pra_fold: number;       // /baseline
    ang_ii: number;               // pg/mL
    ang_ii_fold: number;
    aldosterone: number;          // ng/dL
    aldosterone_fold: number;
    bradykinin_fold: number;      // /baseline, tissue-level proxy (no absolute assay modelled)
    sympathetic_tone_fold: number;// /baseline
  };

  // --- 2.4 Haemodynamics ---
  haemo: {
    sbp: number;                  // mmHg
    dbp: number;                  // mmHg
    map: number;                  // mmHg
    hr: number;                   // bpm
    stroke_volume: number;        // mL
    cardiac_output: number;       // L/min
    svr: number;                  // dyn·s·cm^-5
    arteriolar_radius_index: number; // dimensionless, 1.00 = untreated baseline
    venous_tone_index: number;       // dimensionless, 1.00 = baseline
    capillary_hydrostatic_p: number; // mmHg, dependent-limb capillary bed
    contractility_index: number;     // dimensionless, 1.00 = baseline dP/dt_max
  };

  // --- 2.5 Renal ---
  renal: {
    gfr: number;                  // mL/min/1.73m^2
    renal_blood_flow: number;     // mL/min
    filtration_fraction: number;  // dimensionless
    p_glomerular: number;         // mmHg, intraglomerular capillary pressure
    afferent_radius_index: number;// 1.00 = baseline
    efferent_radius_index: number;// 1.00 = baseline
    na_excretion_rate: number;    // mmol/h
    k_excretion_rate: number;     // mmol/h
    urate_excretion_rate: number; // mg/h
    urine_flow: number;           // mL/h
    frac_na_reab_pt: number;      // fraction of filtered Na reabsorbed, proximal tubule
    frac_na_reab_tal: number;     // thick ascending limb
    frac_na_reab_dct: number;     // distal convoluted tubule  <-- HCTZ target
    frac_na_reab_cd: number;      // connecting tubule + collecting duct
  };

  // --- 2.6 Body fluids & chemistry ---
  chem: {
    plasma_volume: number;        // L
    ecf_volume: number;           // L
    serum_k: number;              // mmol/L
    serum_na: number;             // mmol/L
    serum_urate: number;          // mg/dL
    serum_creatinine: number;     // mg/dL
    fasting_glucose: number;      // mg/dL
  };

  // --- 2.7 Peripheral tissue ---
  periph: {
    interstitial_volume_index: number; // 1.00 = baseline, dependent limb compartment
    edema_grade: number;               // 0..3, clinical pitting scale (derived, see §11)
  };

  // --- 2.8 Liver ---
  liver: {
    cyp3a4_flux: number;          // mg/h of substrate cleared
    cyp2c9_flux: number;          // mg/h
    cyp2d6_flux: number;          // mg/h
    cyp2d6_capacity_fold: number; // genotype multiplier vs normal metaboliser (see §8)
    first_pass_extraction: {      // fraction removed on first pass, per drug
      losartan: number; amlodipine: number; metoprolol: number;
    };
  };

  // --- 2.9 Lung ---
  lung: {
    fev1_pct_baseline: number;    // % of that patient's untreated FEV1
    airway_smooth_muscle_tone_index: number; // 1.00 = baseline
    bradykinin_airway_fold: number;
    cough_hazard: number;         // 0..1, instantaneous hazard, see §9.3
  };

  // --- 2.10 Adverse-event hazards, all 0..1 ---
  hazards: {
    cough: number; dizziness_orthostatic: number; peripheral_edema: number;
    bradycardia: number; bronchospasm: number; hyperkalemia: number;
    hypokalemia: number; hyponatremia: number; hyperuricemia_gout: number;
    acute_gfr_drop: number; angioedema: number; fetal_toxicity: number;
  };

  // --- 2.11 Safety gates fired this frame (from data/rules.json, Agent C) ---
  fired_rules: string[];          // stable rule ids
}
```

**Bus completeness check for the coding agent:** if the engine cannot produce a field,
emit `null` and the UI must render that organ channel in an explicit `unmodelled` state
(dashed outline, 35 % opacity, tooltip "not modelled in this build"). It must **not**
fall back to zero — zero is a physiological claim, `null` is not.

---

## 3. Visual channel vocabulary

Twelve channels. Each has an input signal type, a normalisation function, and an output
range. All output ranges are `VISUAL` — chosen for legibility, no clinical meaning.

Two helper functions, used everywhere:

```ts
// unipolar: magnitude 0..1
const norm = (x, lo, hi) => Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
// bipolar: -1 (suppressed) .. 0 (baseline) .. +1 (activated)
const bip = (x, base, span) => Math.min(1, Math.max(-1, (x - base) / span));
```

| # | Channel | Input | Output range | Notes |
|---|---------|-------|--------------|-------|
| **V1** | `tint` — organ body fill | bipolar `[-1,+1]` | 3-stop diverging ramp: `-1` `#2E6FD9` (suppressed/blocked) → `0` `#9AA3AE` (baseline grey) → `+1` `#E0533D` (activated/stressed). Interpolate in Oklch, not sRGB. | The single most-read channel. Never use it for two different meanings on one organ. |
| **V2** | `glow` — outer bloom | unipolar `[0,1]` | blur radius 0→24 px, alpha 0→0.85, hue = the acting drug's assigned hue (§4) | "This drug is engaging a target here right now." |
| **V3** | `pulse_rate` — beat frequency | `haemo.hr` bpm | animation period = `60 / hr` seconds, clamped to `[0.30 s, 2.00 s]` (i.e. 30–200 bpm) | Bind directly. Do not smooth across more than 2 s of sim time or the bradycardia will be invisible. |
| **V4** | `pulse_amplitude` — beat depth | `haemo.contractility_index` | scale oscillation `1.00 ± A`, where `A = 0.020 + 0.055 × norm(ci, 0.55, 1.35)` | Amplitude at baseline (`ci = 1.0`) ≈ ±5.0 %. Falls visibly under metoprolol. |
| **V5** | `flow_rate` — particle stream | any flow signal | particle spawn 0.5→14 /s and travel speed 20→160 px/s, both over `norm()` of the signal | Used for blood flow, urine flow, bile-free hepatic flow. |
| **V6** | `lumen_radius` — vessel calibre | `*_radius_index` | stroke width = `base_px × idx`, `idx` clamped `[0.70, 1.60]`; `base_px` per vessel in §6 | The arteriolar dilation channel. Must be visible at a glance for amlodipine. |
| **V7** | `swell` — soft-body region scale | `periph.interstitial_volume_index` | mesh scale `1.00 → 1.14` over `norm(idx, 1.00, 1.15)`, plus a 0→3 px outward blur | Ankle/foot only. Gravity-dependent placement. |
| **V8** | `droplet_rate` — discrete drops | `renal.urine_flow` mL/h | drops/s = `0.2 + 2.8 × norm(flow, 30, 260)` | Ureter → bladder. The HCTZ signature. |
| **V9** | `ion_particle` — typed ion sprites | `renal.*_excretion_rate` | count/s = `norm()`; colours: Na⁺ `#3BA55D`, K⁺ `#8E5BD9`, urate `#D98A2B`, Cl⁻ `#4FB3C4`, H₂O `#5AA9E6` | Colour is identity, not intensity. Locked per ion. |
| **V10** | `badge` — discrete symptom icon | a `hazards.*` value | fires when hazard ≥ `θ_on`, clears below `θ_off` (hysteresis, §12); icon fades in over 400 ms at 0.15 Hz idle bob | Never continuous. A badge is a claim that something *happened*. |
| **V11** | `occupancy_ring` — radial arc | any `engagement.*` `[0,1]` | arc sweep 0→360°, stroke 3 px, drug hue, drawn around the receptor/enzyme icon | This is the honest "how much of the target is engaged" readout. |
| **V12** | `molecule_cloud` — drug sprite density | `conc.*` ng/mL | sprite count = `round(2 + 26 × norm(c, 0, c_ref))`, `c_ref` per drug in §4 | Also carries drug hue. `opacity = 0.35 + 0.5 × norm(...)`. |

### 3.1 Two hard rules on encoding

1. **One meaning per channel per organ.** If the heart is already using `V1 tint` for
   sympathetic drive, it may not also use tint for ischaemia. Add a second element, do not
   overload the channel.
2. **Direction must be readable without the legend.** Blue = we turned something down.
   Red/amber = we turned something up or stressed it. This holds across every organ. A
   viewer who learns it once at the heart must not have to relearn it at the kidney.

---

## 4. Per-drug identity constants

Locked so the same drug is the same colour everywhere in the app.

| Drug | Hue (`--drug-hue`) | `c_ref` for V12 (ng/mL) | `c_ref` provenance |
|------|--------------------|--------------------------|--------------------|
| Lisinopril | `#3B82F6` blue | 90 | `ESTIMATED` — set to ≈ Cmax after 20 mg; scales the sprite cloud to fill at a typical peak. Not a PK claim; Agent B owns the real Cmax. |
| Losartan (parent) | `#22C3A6` teal | 250 | `ESTIMATED`, same basis. |
| EXP3174 (metabolite) | `#0E9488` deep teal | 100 | `ESTIMATED`. Deliberately a *darker* shade of the parent so the conversion reads as "same family, more potent". |
| Amlodipine | `#A855F7` violet | 12 | `ESTIMATED`. Low `c_ref` because amlodipine plasma levels are low in absolute terms; without a separate scale its cloud would be invisible next to losartan's. |
| Hydrochlorothiazide | `#F59E0B` amber | 200 | `ESTIMATED`. |
| Metoprolol | `#EF4444` red | 200 | `ESTIMATED`. |

All six `c_ref` values are `VISUAL` scaling constants. **They must not be used in any
calculation that reaches the report.** Agent B's `substances.json` holds the real PK.

---

## 5. HEART

### 5.1 Anatomy the UI renders

Four addressable sub-elements: **SA node** (small, top-right of the right atrium),
**atrial myocardium**, **ventricular myocardium** (the mass that pulses), **coronary
arterioles** (a branching tree on the surface).

### 5.2 Binding table

| Drug | Molecular entity | Cell/tissue target | Tier | Direction | Onset → peak | Magnitude at stated dose | Bus signal | Visual binding |
|------|------------------|--------------------|------|-----------|--------------|--------------------------|------------|----------------|
| **Metoprolol** | β1-adrenoceptor, `ADRB1`, UniProt **P08588** [S6] | SA nodal pacemaker cells + ventricular cardiomyocytes — **T2**, render at tissue level (see §5.4) | T2 | ↓ rate, ↓ contractility | IR: ~1–2 h to effect; ER: blunted peak, ~1/4–1/2 of IR Cmax [S4] | β1 occupancy **54–92 %** at 100 mg b.i.d. [S12]; HR −14 bpm at ER 200 mg o.d.; −13.4 % of baseline HR at ER 100 mg o.d.; −19.1 % at IR 50 mg b.i.d. [S12b] | `engagement.beta1_occupancy`, `haemo.hr`, `haemo.contractility_index` | **V11** ring on the SA-node icon ← `beta1_occupancy`. **V3** whole-heart pulse period ← `hr`. **V4** amplitude ← `contractility_index`. **V1** tint ← `bip(1 - beta1_occupancy, 1.0, 1.0)` → drives toward blue `#2E6FD9` as blockade rises. |
| **Amlodipine** | L-type Cav1.2, `CACNA1C`, UniProt **Q13936** [S6] | Cardiac myocytes — **minimal effect**: amlodipine is vascular-selective. Set `cav12_block_myocardium ≈ 0.05 × cav12_block_vsmc` — `ESTIMATED`, chosen to be visibly near-zero. | T3 | ~neutral direct; **reflex ↑ HR** via baroreflex | 6–12 h to Cmax [S1] | Palpitation **4.5 %** at 10 mg vs **0.6 %** placebo (1.4 % at 5 mg, 0.7 % at 2.5 mg) [S1] | `haemo.hr`, `hazards.*` (palpitation, optional 13th hazard) | **V3** small rate *increase*. **V1** tint drifts slightly toward `#E0533D` — this is the demo moment where a "good" drug makes an organ redder, which is honest and memorable. |
| **Lisinopril** | (no cardiac receptor target) | — | T3 | ↓ afterload → ↓ wall stress; ↑ HR only mildly (baroreflex blunted by RAAS blockade) | onset 1 h, peak BP effect **6 h** [S2] | — | `haemo.stroke_volume`, `haemo.svr` | **V4** amplitude *rises slightly* as afterload falls (`contractility_index` unchanged, ejection improves). Tint unchanged. |
| **Losartan** | (no cardiac receptor target in this model) | — | T3 | as lisinopril | 100 mg blocks the AngII pressor response **~85 % at peak, 25–40 % at 24 h** [S3] | — | as lisinopril | as lisinopril |
| **HCTZ** | (no cardiac target) | — | T3 | ↓ preload via plasma volume | days | see §7 | `haemo.stroke_volume` | **V4** amplitude falls modestly as preload falls. |

### 5.3 Composite heart animation spec

```
period_s      = clamp(60 / frame.haemo.hr, 0.30, 2.00)
amp           = 0.020 + 0.055 * norm(frame.haemo.contractility_index, 0.55, 1.35)
tint_t        = bip(1 - frame.engagement.beta1_occupancy, 1.0, 1.0)   // -1 blue .. 0 grey
                + 0.35 * norm(frame.mediators.sympathetic_tone_fold, 1.0, 1.8) // reflex, pushes red
tint_t        = clamp(tint_t, -1, 1)
coronary_flow = V5 with norm(frame.haemo.cardiac_output, 2.5, 8.0)
```

**Why this reads well on stage:** metoprolol makes the heart *slower, gentler, and bluer*
in one continuous gesture. Amlodipine makes it *faster and slightly redder* while the
arteries go blue. Two drugs, opposite heart animations, both correct.

### 5.4 Honesty note on cardiac cell populations

`ADRB1` in the Human Protein Atlas single-cell dataset is classified **"cell type
enhanced"** with a tau of 0.79, and its top single-cell hit is **cytotrophoblasts (99.7
nCPM)** — *not* cardiomyocytes [S6b]. Tissue-level `ADRB1` RNA in heart muscle is 20.3
nTPM [S6]. The claim that β1 receptors sit on SA nodal pacemaker cells and cardiomyocytes
is well established by radioligand-binding and electrophysiology, but **I did not source a
cell-resolved human dataset for it here.** Therefore: tier **T2**, render at tissue level,
and the SA-node element must be labelled "sinoatrial node (region)" not "pacemaker cells".
Do not put a named cell population in the UI for this target.

---

## 6. ARTERIES AND ARTERIOLES (vascular smooth muscle)

### 6.1 Anatomy the UI renders

Three separate vessel classes, because the drugs hit them differently and the difference
*is* the amlodipine-edema story:

- **Conduit arteries** — aorta and large branches. `base_px = 14`.
- **Precapillary arterioles (resistance vessels)** — the SVR element. `base_px = 6`.
- **Postcapillary venules** — `base_px = 8`. Critically, **amlodipine barely touches
  these**, which is why fluid accumulates (§11).

### 6.2 Binding table

| Drug | Molecular entity | Tissue target | Tier | Direction | Timescale | Magnitude | Bus signal | Visual binding |
|------|------------------|---------------|------|-----------|-----------|-----------|------------|----------------|
| **Amlodipine** | L-type Cav1.2, `CACNA1C` / Q13936 [S6] | arteriolar smooth muscle — **T2/T3** (HPA tissue specificity for `CACNA1C` is *intestine* 25.0 nTPM [S6]; vascular localisation is classical pharmacology, not sourced cell-resolved here) | T3 | ↓ Ca²⁺ influx → ↓ tone → **dilate** | slow; Cmax 6–12 h [S1], steady state **7–8 days** [S1] | monotherapy BP effect on the order of −9/−5 mmHg class-typical; use Agent E's dose-response | `engagement.cav12_block_vsmc`, `haemo.arteriolar_radius_index`, `haemo.svr` | **V6** precapillary arteriole `lumen_radius` ← `arteriolar_radius_index` (clamp 0.70–1.60). **V6** on venules ← `venous_tone_index`, which stays ≈ 1.00 → *the asymmetry is visible*. **V11** ring on a Cav1.2 channel icon. **V1** vessel wall tint → blue. |
| **Lisinopril** | ACE / kininase II, `ACE`, UniProt **P12821** [S6] | vascular endothelium — T3 | T3 | ↓ AngII → ↓ AT1-mediated constriction; ↑ bradykinin → NO/PGI₂ → dilate | onset 1 h, peak **6 h** [S2], effective t½ **12 h** [S2] | HCTZ-combo trials: dizziness 7.5 %, orthostatic 3.2 % [S5] — the hypotension read-out | `engagement.ace_inhibition_plasma`, `mediators.ang_ii_fold`, `mediators.bradykinin_fold` | **V6** dilation. **V2** glow in lisinopril blue along the endothelial layer. A separate **bradykinin haze** sprite layer at `alpha = 0.4 × norm(bradykinin_fold, 1.0, 3.0)`. |
| **Losartan** | AT1 receptor, `AGTR1`, UniProt **P30556** [S6] | arteriolar smooth muscle — T3 (HPA tissue specificity for `AGTR1`: liver 90.3, placenta 133.2 nTPM [S6]; vascular expression not cell-resolved here) | T3 | competitive AT1 blockade → dilate. **No bradykinin haze** — this is the visual contrast with lisinopril. | parent t½ ~2 h, EXP3174 **6–9 h** [S3] | **85 % pressor-response inhibition at peak, 25–40 % at 24 h**, 100 mg [S3] | `engagement.at1_blockade` | **V11** ring on an AT1 receptor icon ← `at1_blockade`. **V6** dilation. Deliberately **no** haze layer. |
| **Metoprolol** | β1 (cardiac) — vascular effect is indirect | — | T3 | ↓ CO → ↓ BP; **unopposed α → mild peripheral vasoconstriction early** (the "cold extremities" the label reports [S4]) | hours | Label lists cold extremities, arterial insufficiency of Raynaud type [S4] | `haemo.svr`, `hazards.*` | **V6** *narrowing* of distal arterioles early in the run, then recovery. **V1** distal limb tint → cool. This is a rare "beta-blocker makes a vessel smaller" beat and it is label-supported. |
| **HCTZ** | none direct on VSMC in this model | — | T3 | ↓ plasma volume → ↓ SVR only after days; some direct vasodilation reported long-term — **not modelled**, say so | days–weeks | 6.25/12.5/25/50 mg → **−4/−2, −6/−3, −8/−3, −11/−5 mmHg** [S7] | `haemo.svr` | slow, low-amplitude **V6** change. |

### 6.3 The SVR element

```
svr_norm = norm(frame.haemo.svr, 700, 2200)      // dyn·s·cm^-5, VISUAL clamp bounds
tint     = bip(svr_norm, 0.5, 0.5)               // high SVR red, low SVR blue
radius   = base_px * clamp(frame.haemo.arteriolar_radius_index, 0.70, 1.60)
flow     = V5 with norm(frame.haemo.cardiac_output, 2.5, 8.0)
```

---

## 7. KIDNEY — down to nephron segment

This is the best organ in the demo, because **four of the five drugs act here, in four
anatomically distinct places**, and the viewer can see all four at once.

### 7.1 The nephron elements the UI renders

Render one large schematic nephron beside the whole-kidney outline. Addressable elements:

| Element id | Anatomy | Which drug lands here |
|------------|---------|-----------------------|
| `n.afferent` | afferent arteriole | (reference — stays near baseline) |
| `n.jga` | juxtaglomerular apparatus | renin release site; **losartan & lisinopril raise it** |
| `n.glomerulus` | glomerular capillary tuft | filtration; `p_glomerular` |
| `n.efferent` | **efferent arteriole** | **lisinopril & losartan dilate this one specifically** |
| `n.pct` | proximal convoluted tubule | **losartan → URAT1**; bulk Na reabsorption |
| `n.tal` | thick ascending limb | (reference — not a target in this set) |
| `n.dct` | **distal convoluted tubule** | **HCTZ → NCC. The one T1 cell-level claim in this file.** |
| `n.cnt_cd` | connecting tubule + collecting duct | aldosterone-driven Na/K exchange → the K⁺ story |
| `n.ureter` | ureter → bladder | urine flow droplets |

### 7.2 The four-site simultaneous view — why this is the money shot

At `t = 6 h` on a lisinopril + HCTZ combination product, the viewer sees, in one frame:

- `n.efferent` **dilating** (blue, wider) while `n.afferent` holds — lisinopril.
- `n.glomerulus` pressure falling → a small, honest **GFR dip**, rendered as *slightly
  slower* filtration particles.
- `n.dct` **blocked** (amber occupancy ring at high sweep) — HCTZ.
- Na⁺ and Cl⁻ particles streaming *past* the DCT and out through `n.ureter` — the drug's
  actual mechanism, visible.
- `n.cnt_cd` **compensating**: increased distal Na⁺ delivery drives Na⁺/K⁺ exchange, so
  K⁺ particles start leaving too — the adverse effect emerging *from the mechanism*, not
  bolted on.

That last beat — the side effect visibly arising from the therapeutic mechanism — is the
single most persuasive thing this animation can do.

### 7.3 Binding table — glomerular / vascular

| Drug | Entity | Site | Tier | Direction | Timescale | Magnitude | Bus signal | Visual binding |
|------|--------|------|------|-----------|-----------|-----------|------------|----------------|
| **Lisinopril** | ACE / P12821 [S6] | efferent arteriole, renal vascular bed | T3 | **dilates efferent > afferent** → ↓ `p_glomerular` → ↓ GFR acutely, ↓ filtration fraction | onset ~1 h, plateau by 6 h [S2] | ATLAS: **creatinine increased 10 % (high dose 32.5–35 mg) vs 7 % (low dose 2.5–5 mg)** [S2] | `renal.efferent_radius_index`, `renal.p_glomerular`, `renal.gfr`, `chem.serum_creatinine`, `hazards.acute_gfr_drop` | **V6** on `n.efferent` only. **V5** filtration particle rate ← `norm(gfr, 15, 130)`. **V1** tint on `n.glomerulus` ← `bip(p_glomerular, baseline, 12 mmHg)`. |
| **Losartan** | AT1 / P30556 [S6] | efferent arteriole | T3 | same direction, AT1-mediated | EXP3174 t½ 6–9 h [S3] | label: hyperkalemia and renal effects in the heart-failure population [S3] | same | same, in teal |
| **Both together** | — | — | — | **dual RAAS blockade → additive efferent dilation → disproportionate GFR fall and K⁺ rise** | — | see Agent C `rules.json` for the reject rule | `fired_rules` | Both rings light; `n.efferent` goes to the **clamp floor (0.70)** and a **V10 warning badge** fires on the kidney. This is the drug–drug reject case, animated. |
| **Lisinopril** | ACE, at `n.jga` | juxtaglomerular granular cells | T2 (`REN` kidney-specific, 134.7 nTPM [S6]; JG-cell localisation classical) | ↓ AngII removes negative feedback → **renin ↑** | hours | losartan 100 mg causes a **doubling to tripling of plasma renin activity** [S3]; ACE-inhibitor direction is the same | `mediators.renin_pra_fold` | **V1** tint on `n.jga` toward **red** (`bip(renin_pra_fold, 1.0, 2.0)`) *while the rest of the kidney goes blue*. The counter-intuitive frame. Tooltip: "renin rises — this is expected, not a failure." |
| **Amlodipine** | Cav1.2 | preglomerular vessels | T3 | mild afferent dilation; **GFR essentially preserved** | — | label: "pharmacokinetics not significantly influenced by renal impairment" [S1] | `renal.afferent_radius_index` | small **V6** change on `n.afferent`. The teaching point: amlodipine spares the kidney where ACE-i stresses it. |

### 7.4 Binding table — tubular. **The one T1 row in this document.**

| Drug | Entity | Cell population | Tier | Direction | Timescale | Magnitude | Bus signal | Visual binding |
|------|--------|-----------------|------|-----------|-----------|-----------|------------|----------------|
| **HCTZ** | Na⁺-Cl⁻ cotransporter **NCC**, gene `SLC12A3`, UniProt **P55017**, synonyms NCC/NCCT [S6] | **Distal convoluted tubule cells** — HPA single-cell: **9100.1 nCPM**, classification *"cell type enriched (distal convoluted tubule cells)"*, **tau 0.94** [S6c]. Tissue: kidney-specific, 94.2 nTPM [S6]. | **T1** | blocks apical Na⁺-Cl⁻ reabsorption → natriuresis, diuresis | diuresis within 2 h, BP effect over days–weeks | dose-response **−4/−2, −6/−3, −8/−3, −11/−5 mmHg** at 6.25/12.5/25/50 mg [S7]; class overall −9/−4 [S7] | `engagement.ncc_inhibition`, `renal.frac_na_reab_dct`, `renal.na_excretion_rate`, `renal.urine_flow` | **V11** ring on an NCC transporter icon drawn *on the apical membrane of a DCT cell* — **the UI may name this cell population.** **V9** Na⁺ `#3BA55D` + Cl⁻ `#4FB3C4` particles that previously turned into the cell now flow *past* it. **V8** droplets at the ureter. **V1** `n.dct` tint → blue as `ncc_inhibition` rises. |
| **Losartan** | urate transporter **URAT1**, gene `SLC22A12`, UniProt **Q96S37** [S6] | proximal tubule — kidney-specific 103.6 nTPM [S6]; **T2**, PCT apical localisation classical, not cell-resolved here | T2 | inhibits urate reabsorption → **uricosuria, serum urate falls** | **peak uricosuric effect 2–4 h after dose**, and it is **parent losartan, not EXP3174**, that blocks URAT1 [S15] | Direction and mechanism confirmed in humans [S15]; **magnitude in mg/dL: `NOT_FOUND` from a primary source I read.** Use SECONDARY range −0.4 to −1.0 mg/dL at 50 mg and mark it. | `engagement.urat1_inhibition`, `renal.urate_excretion_rate`, `chem.serum_urate` | **V9** urate particles `#D98A2B` leaving via `n.pct` into the tubular lumen. **V11** ring on a URAT1 icon at `n.pct`. Note the **timing contrast**: this ring peaks at 2–4 h and *decays before* the AT1 ring does, because it is the parent drug. That timing difference is real and animatable [S15]. |
| **HCTZ** | urate handling (volume contraction → ↑ proximal urate reabsorption) | proximal tubule | T3 | **raises serum urate — the exact opposite arrow to losartan** | days | ≥50 mg/day: ≈ **+90 µmol/L (≈ +1.5 mg/dL)**; ≤25 mg/day ≈ half that `SECONDARY` [S10] | `chem.serum_urate`, `hazards.hyperuricemia_gout` | Urate particles flow *into* `n.pct` (reversed direction vs losartan). **Run both drugs and the arrows visibly oppose** — one of the best two-drug frames available. |
| **HCTZ** | increased distal Na⁺ delivery → Na⁺/K⁺ exchange at ENaC/ROMK | connecting tubule / collecting duct **principal cells** | T3 — mechanism inferred, do **not** name the cell type in UI | **K⁺ wasting**, and water retention risk → hyponatraemia | days | HCTZ 25–50 mg/day: **plasma K⁻0.35 mmol/L**; low-dose meta-analysis **−0.22 mmol/L**; −0.4 mmol/L estimated at 40.5 mg `SECONDARY` [S10] | `renal.k_excretion_rate`, `chem.serum_k`, `hazards.hypokalemia`, `hazards.hyponatremia` | **V9** K⁺ `#8E5BD9` particles exiting at `n.cnt_cd`. **V1** tint of `n.cnt_cd` toward red as `k_excretion_rate` rises. **V10** hypokalaemia badge per §12. |
| **Lisinopril / Losartan** | ↓ aldosterone (via §10) → ↓ ENaC-driven K⁺ secretion | connecting tubule / collecting duct | T3 | **K⁺ retention → hyperkalaemia**, the mirror image of HCTZ | days | ATLAS: **hyperkalemia 6 % high dose vs 4 % low dose** [S2] | `chem.serum_k`, `hazards.hyperkalemia` | K⁺ particles **stop leaving** and the `n.cnt_cd` element tints blue. On lisinopril+HCTZ the two effects partially cancel — and *that is exactly why the combination product exists*. Show the cancellation. |

### 7.5 Serum-potassium composite gauge (a first-class UI element)

Because two drugs in the set push K⁺ in opposite directions, put a dedicated K⁺ gauge on
screen whenever any of lisinopril / losartan / HCTZ is active.

```
K_pos   = norm(frame.chem.serum_k, 2.5, 7.0)          // VISUAL scale bounds
zone    = k < 3.5 ? "low" : k > 5.5 ? "high" : "normal"
tint    = bip(frame.chem.serum_k, 4.2, 1.5)           // 4.2 mmol/L nominal mid, VISUAL
```
Zone thresholds 3.5 and 5.5 mmol/L are conventional laboratory reference bounds —
**Agent D owns the authoritative reference ranges in `patient_model.json`; read them from
there rather than hard-coding these.** Marked here as `SECONDARY` placeholders.

---

## 8. LIVER — three different CYP enzymes

The five-drug set was chosen partly so the liver has a real job. It does: **three
different enzymes, three different stories.**

### 8.1 Anatomy the UI renders

Liver outline with three enzyme "reactor" nodes, plus a **portal-vein inflow** and a
**hepatic-vein outflow** so first-pass extraction is visible as *molecules going in and
fewer coming out*. Optionally zone the reactors toward the pericentral region (zone 3),
where CYP expression is classically highest — **T3, mark the tooltip "zonation is
schematic"**.

### 8.2 Binding table

| Drug | Enzyme | Gene / UniProt | Liver expression | Tier | What happens | Timescale | Bus signal | Visual binding |
|------|--------|----------------|------------------|------|--------------|-----------|------------|----------------|
| **Losartan** | CYP2C9 (primary) + CYP3A4 | `CYP2C9` / **P11712**; `CYP3A4` / **P08684** [S6] | CYP2C9 **1607.6 nTPM**, liver-specific; CYP3A4 **3367.1 nTPM**, liver-specific [S6] | T2 | **converts parent → EXP3174**, a more potent active metabolite. Clearance: parent 600 mL/min, metabolite 50 mL/min; renal 75 vs 25 mL/min [S3] | parent t½ ~2 h; metabolite **6–9 h** [S3] | `liver.cyp2c9_flux`, `conc.losartan`, `conc.exp3174` | **The signature liver animation.** Teal parent sprites enter the CYP2C9 reactor; **darker teal EXP3174 sprites exit** and travel onward to the AT1 receptors. Reactor **V2 glow** ← `norm(cyp2c9_flux, 0, max)`. Two **V12** clouds visible simultaneously with different decay rates. |
| **Amlodipine** | CYP3A4 | `CYP3A4` / P08684, **3367.1 nTPM** [S6] | liver-specific | T2 | extensive metabolism; **10 % parent + 60 % metabolites excreted in urine** [S1]; bioavailability 64–90 % [S1] | slow; t½ 30–50 h, steady state 7–8 days [S1] | `liver.cyp3a4_flux`, `liver.first_pass_extraction.amlodipine` | Violet sprites enter the **shared CYP3A4** reactor. **Competition beat:** when losartan and amlodipine are both present, the CYP3A4 reactor visibly saturates — draw a queue. Direction is defensible; **quantitative interaction magnitude is `NOT_FOUND` here — Agent C owns whether this rises to a rule. Do not put a number on it.** |
| **Metoprolol** | CYP2D6 | `CYP2D6` / **P10635**, **386.2 nTPM**, liver-specific [S6] | liver-specific | T2 | **polymorphic**. <5 % of an oral dose recovered unchanged in urine [S4]. Quinidine 100 mg (strong CYP2D6 inhibitor) **tripled S-metoprolol and doubled its half-life** [S4]; propafenone raised steady-state 2-fold or more [S4] | t½ **3–7 h** normally [S4] | `liver.cyp2d6_flux`, `liver.cyp2d6_capacity_fold` | **The personalisation animation, and problem 12's "genetics" requirement made visible.** Render the CYP2D6 reactor with a **gate aperture** bound to `cyp2d6_capacity_fold`: aperture width = `clamp(cyp2d6_capacity_fold, 0.05, 2.0) × base`. Poor metaboliser → gate nearly shut → red sprites pile up in plasma → **the heart slows far more on the same dose**. Same dose, two patients, two visibly different animations. |
| **Lisinopril** | **none** | — | — | T2 | "Lisinopril does not undergo metabolism and is excreted unchanged entirely in the urine" [S2] | — | — | **Blue sprites pass straight through the liver, untouched.** Render this explicitly. It is the clearest possible teaching contrast, and it is exactly why lisinopril is the simplest PK baseline in the set. |
| **HCTZ** | not substantially metabolised in this model | — | — | T3 | renally eliminated | — | — | amber sprites pass through, like lisinopril. |

### 8.3 CYP2D6 genotype → `cyp2d6_capacity_fold`

The multiplier the gate aperture binds to. **These four values are `ESTIMATED`** —
ordinal, chosen so the four phenotypes are visually distinct — with one anchor: the
quinidine result showing a strong CYP2D6 inhibitor triples S-metoprolol exposure and
doubles its half-life [S4], i.e. a near-poor-metaboliser phenotype corresponds to roughly
a 3× exposure increase.

| Phenotype | `cyp2d6_capacity_fold` | Provenance |
|-----------|------------------------|------------|
| Ultrarapid (UM) | 1.6 | `ESTIMATED` |
| Normal / extensive (NM) | 1.0 | reference by definition |
| Intermediate (IM) | 0.55 | `ESTIMATED` |
| Poor (PM) | 0.30 | `ESTIMATED`, anchored to the ≈3× exposure increase implied by [S4] |

**Agent B and Agent D own the authoritative pharmacogenomic parameters.** If they publish
CPIC-derived activity scores, those supersede this table and the aperture binds to theirs.
Do not ship these four numbers in the run report as if they were literature values.
`NOT_FOUND`: CYP2D6 phenotype frequencies in Uzbek / Central Asian populations — I could
not source these, and inventing them for a hackathon in Uzbekistan would be a bad idea.

---

## 9. LUNGS

Three distinct lung stories from three different drugs. The lung is a **drug target
organ** here, not just scenery — most viewers do not know that, which makes it a good
reveal.

### 9.1 Anatomy the UI renders

**Pulmonary capillary bed** (a fine mesh over the lung fields), **bronchial tree with
airway smooth muscle** (the airways narrow or widen), and **airway sensory nerve fibres**
(a thin vagal filament along the large airways, used only for the cough channel).

### 9.2 Binding table

| Drug | Entity | Tissue | Tier | Direction | Timescale | Magnitude | Bus signal | Visual binding |
|------|--------|--------|------|-----------|-----------|-----------|------------|----------------|
| **Lisinopril** | ACE / kininase II, `ACE` / **P12821** [S6] | pulmonary capillary endothelium — **T2/T3.** Honesty note: HPA tissue specificity for `ACE` is **intestine 249.7, testis 96.4 nTPM** [S6] — *lung is not in the specificity list*. Pulmonary endothelial ACE is classical physiology, not supported by the tissue-specificity data I pulled. Render at tissue level, tooltip must say "mechanism inferred". | T3 | ACE inhibited where the whole cardiac output passes → **bradykinin and substance P accumulate** | minutes–hours for the biochemistry; **cough onset typically over days–weeks** | Bradykinin and substance P are both ACE substrates; accumulation sensitises airway sensory nerves [S11] | `engagement.ace_inhibition_pulmonary`, `lung.bradykinin_airway_fold` | **V2** glow across the pulmonary capillary mesh in lisinopril blue ← `ace_inhibition_pulmonary`. A slowly building **bradykinin haze** over the airways: `alpha = 0.45 × norm(bradykinin_airway_fold, 1.0, 3.0)`. |
| **Lisinopril → cough** | B2 receptor `BDKRB2` / **P30411** [S6] on vagal C-fibres → TRPV1/TRPA1 sensitisation | airway sensory C-fibres — **T3**, mechanism inferred | T3 | ↑ cough reflex sensitivity | days–weeks | Label: **cough 3.9 %** in lisinopril/HCTZ controlled trials [S5]. Literature range for ACE-inhibitor cough: **5–35 %**, more common in women [S11] `SECONDARY`. Mechanism: bradykinin sensitises the cough reflex via B2 → TRPV1 and TRPA1, through COX and 12-LOX metabolites [S11b] | `lung.cough_hazard`, `hazards.cough` | **V10 cough badge** — a small puff sprite at the mouth plus a 250 ms torso jolt, fired stochastically at rate `= 0.5 × hazards.cough` events per simulated hour. Because the incidence range is wide (3.9 % label vs 5–35 % literature), the badge tooltip **must show the range, not a point estimate.** |
| **Losartan** | — | — | T2 | **no bradykinin accumulation → no cough channel** | — | The losartan label itself notes that persistent dry cough "with an incidence of a few percent" is associated with **ACE-inhibitor** use [S3] | — | **Render the absence.** When the user swaps lisinopril → losartan, the airway haze fades out and the cough badge stops. This is the single most legible "why would a doctor switch drugs" moment in the product, and it is directly label-supported. |
| **Metoprolol** | β2-adrenoceptor (off-target; β1-selective, not β1-specific) | airway smooth muscle — T3 | T3 | ↓ endogenous β2 bronchodilation → **bronchoconstriction**, and blunted response to β-agonist rescue | dose-dependent; selectivity is lost as dose rises | **β2 occupancy 6–38 % at metoprolol 100 mg b.i.d.**, vs β1 occupancy 54–92 % in the same subjects [S12]. Label: "may interfere with endogenous adrenergic bronchodilator activity in patients subject to bronchospasm and may also interfere with **exogenous** bronchodilators" [S4]; adverse reactions include **wheezing (bronchospasm), dyspnea** [S4] | `engagement.beta2_occupancy`, `lung.airway_smooth_muscle_tone_index`, `lung.fev1_pct_baseline`, `hazards.bronchospasm` | **V6** applied to bronchial lumen: `radius = base × (1 − 0.45 × beta2_occupancy)` — `0.45` is `ESTIMATED`, a `VISUAL` gain chosen so 38 % occupancy produces a clearly visible ~17 % narrowing. **V1** airway tint → red. **V10 bronchospasm badge** when the asthma/COPD comorbidity flag is set. **V11** dual rings — β1 and β2 side by side — so the viewer *sees selectivity being lost as the dose climbs.* That dual ring is the best single argument that this simulator understands pharmacology. |
| **Amlodipine, HCTZ** | none | — | — | no lung channel | — | — | — | leave neutral. Resisting the urge to animate every organ for every drug is what makes the animated organs mean something. |

### 9.3 `cough_hazard` construction

```
cough_hazard = f_patient × norm(lung.bradykinin_airway_fold, 1.0, 3.0)
                        × ramp(days_on_drug, 0, 14)     // sensitisation builds
```
`f_patient` is a per-subject susceptibility multiplier sampled from the virtual
population (Agent E owns the sampling). Justification for the ramp: ACE-inhibitor cough is
characteristically delayed rather than first-dose — `ESTIMATED` shape, `T3`.
The 3.9 % label figure [S5] and the 5–35 % literature range [S11] should both be shown in
the report; a single point estimate here would be false precision.

---

## 10. ADRENAL GLAND

Small organ, disproportionate narrative value: it is where the viewer learns that a drug
acting on the *lung's* enzyme changes a hormone made *above the kidney* which changes
*potassium*. That chain, animated, is the whole argument for mechanistic simulation.

| Drug | Entity | Tissue | Tier | Direction | Timescale | Magnitude | Bus signal | Visual binding |
|------|--------|--------|------|-----------|-----------|-----------|------------|----------------|
| **Lisinopril** | ↓ AngII → ↓ AT1 stimulation of aldosterone synthesis | **adrenal cortex, zona glomerulosa** — T3, render as "outer cortex (zona glomerulosa)" at tissue level | T3 | **↓ aldosterone** | hours; partial escape over weeks (aldosterone breakthrough) — flag as **not modelled** unless Agent E implements it | Downstream read-out is the ATLAS hyperkalaemia signal: **6 % vs 4 %** [S2] | `mediators.aldosterone`, `mediators.aldosterone_fold` | **V1** tint of the zona glomerulosa band ← `bip(aldosterone_fold, 1.0, 0.6)` → blue as it falls. **V12** a stream of aldosterone hormone sprites travelling **adrenal → collecting duct**, spawn rate ← `norm(aldosterone_fold, 0.3, 1.8)`. When lisinopril is on, **the stream visibly thins**, and one frame later K⁺ particles stop leaving the collecting duct. Animate the causal chain with a deliberate lag. |
| **Losartan** | AT1 receptor `AGTR1` / P30556 [S6] blocked on zona glomerulosa cells | same | T3 | **↓ aldosterone**, same direction, different step in the cascade | EXP3174 t½ 6–9 h [S3] | Losartan **doubles to triples plasma renin activity** [S3] — the compensatory arm | same | Same stream thinning, teal-tinted. **The contrast to teach:** lisinopril blocks *production of the signal*, losartan blocks *reception of the signal*. Same downstream result. Render the block at two different points on the same cascade diagram. |
| **HCTZ** | volume depletion → RAAS activation | zona glomerulosa | T3 | **↑ aldosterone** — this is why HCTZ wastes potassium *twice over* | days | `NOT_FOUND` for a magnitude I could source | `mediators.aldosterone_fold` | Stream **thickens**, band tints red. Combined with lisinopril the two arrows partially cancel — animate the cancellation, it is the pharmacological rationale for the real fixed-dose combination product. |
| **Amlodipine, Metoprolol** | metoprolol suppresses renin release via β1 on JG cells (T3, direction only) | — | T3 | mild ↓ renin | — | `NOT_FOUND` for magnitude | `mediators.renin_pra_fold` | small effect; render only if Agent E emits it, otherwise leave neutral. |

**RAAS cascade panel (recommended dedicated UI element).** A horizontal cascade:
`Renin → AngI → [ACE] → AngII → [AT1] → vasoconstriction + aldosterone`. Overlay a **red
stop-bar** at `[ACE]` for lisinopril and at `[AT1]` for losartan, with the bar height ←
the corresponding `engagement.*` value. Upstream nodes glow *brighter* (renin, AngI rise
[S3]) while downstream nodes dim. This panel alone answers "what does this drug actually
do", and it makes the dual-RAAS-blockade reject case self-evident: two stop-bars on one
cascade.

---

## 11. PERIPHERAL TISSUE — where the oedema appears

The amlodipine channel. Highly recognisable, dose-dependent, sex-dependent, and fully
sourced from the label — so it is both the most viewer-legible adverse effect in the set
and the best-documented.

### 11.1 Mechanism, and why it is the *right* thing to animate

Dihydropyridines dilate **precapillary arterioles** without a matching change in
**postcapillary venules**. The unmatched drop in precapillary resistance raises capillary
hydrostatic pressure and drives fluid into the interstitium of **gravitationally dependent
sites** [S14]. It is **not** salt-and-water retention. That distinction matters: it is why
a diuretic does not fix it and why adding a RAAS blocker does. Get it right and a
clinician judge will notice.

### 11.2 Binding table

| Drug | Site | Tier | Direction | Timescale | Magnitude | Bus signal | Visual binding |
|------|------|------|-----------|-----------|-----------|------------|----------------|
| **Amlodipine** | dependent-limb capillary bed + interstitium (ankle, foot) — T3 | T3 | ↑ `capillary_hydrostatic_p` → interstitial fluid accumulation | builds over **days**, tracks steady state at 7–8 days [S1] | **Label, dose-related:** oedema **1.8 % (2.5 mg), 3.0 % (5 mg), 10.8 % (10 mg)** vs **0.6 % placebo** [S1]. **Sex-related:** **male 5.6 %, female 14.6 %** vs placebo male 1.4 %, female 5.1 % [S1]. **Meta-analysis:** oedema **16.6 % vs 6.2 %** placebo, RR **2.9**; low/medium dose RR **2.01** vs 10 mg RR **3.08**; 22 trials, 7226 patients [S9] | `haemo.capillary_hydrostatic_p`, `periph.interstitial_volume_index`, `periph.edema_grade`, `hazards.peripheral_edema` | **V7 swell** on the ankle/foot mesh, scale `1.00 → 1.14` over `norm(interstitial_volume_index, 1.00, 1.15)`. **V1** local tint → warm. Optional **pitting interaction**: on click, indent the mesh and hold the indentation for `1.5 s × edema_grade` — a genuinely memorable interaction, and physiologically apt. |
| **Amlodipine + Lisinopril/Losartan** | same | T3 | **RAAS blockade reduces CCB oedema** by dilating the postcapillary side, restoring the pre/post balance [S14 context] | days | Direction well supported [S14]; **quantitative reduction `NOT_FOUND` from a primary source I read** — do not put a percentage on it | `periph.interstitial_volume_index` | The swell **partly recedes** when a RAAS blocker is added. This is a genuine, mechanistic, *positive* combination result — a strong demo beat for "the simulator found a better combination", and it is a real clinical phenomenon, not an artefact. |
| **HCTZ** | — | T3 | plasma-volume contraction; **does not target the mechanism** | days | — | `chem.plasma_volume` | The honest negative result: **adding HCTZ barely reduces the swell.** Showing a treatment that *doesn't* work is a credibility win. |
| **Metoprolol** | — | T2 | label lists peripheral oedema and **cold extremities / Raynaud-type arterial insufficiency** [S4] | — | qualitative only | `hazards.*` | Distal limb tint → cool blue, distinct from amlodipine's warm swell. |

### 11.3 `edema_grade` derivation

```
edema_grade = floor(4 * norm(periph.interstitial_volume_index, 1.00, 1.16))  // 0..3
```
`ESTIMATED` mapping. The clinical 0–3+ pitting scale is not defined in terms of
interstitial volume, so this is a presentational bridge, not a measurement. **The report
must express oedema as a probability from the label incidences [S1][S9], never as a
grade computed by this formula.**

---

## 12. ADVERSE-EFFECT CHANNELS — the badge system

A simulation that only shows benefit is not convincing. These are the channels a viewer
recognises. All are **stochastic events**, not continuous states: a badge is a claim that
something happened.

| Hazard | Drug(s) | Badge | `θ_on` / `θ_off` | Anchor incidence | Source |
|--------|---------|-------|------------------|------------------|--------|
| `cough` | lisinopril | mouth puff + torso jolt | 0.30 / 0.20 | **3.9 %** (label, lisinopril/HCTZ trials); literature **5–35 %** | [S5][S11] |
| `dizziness_orthostatic` | all, esp. lisinopril | screen-edge vignette + brief horizon tilt on the figure | 0.35 / 0.25 | ATLAS **19 % high dose vs 12 % low dose**; lisinopril/HCTZ **7.5 %**; amlodipine **1.1/3.4/3.4 %** at 2.5/5/10 mg vs **1.5 %** placebo | [S2][S5][S1] |
| `peripheral_edema` | amlodipine | ankle swell (V7) + badge | 0.25 / 0.15 | **1.8/3.0/10.8 %** by dose vs **0.6 %** placebo; **F 14.6 % vs M 5.6 %** | [S1] |
| `bradycardia` | metoprolol | heart-rate numeral turns amber + slow-beat icon | fires when `haemo.hr < 50` | label: bradycardia among most common reactions | [S4] |
| `bronchospasm` | metoprolol | airway narrowing (V6) + wheeze icon | 0.30 / 0.20 | label: wheezing (bronchospasm), dyspnoea; β2 occupancy **6–38 %** at 100 mg b.i.d. | [S4][S12] |
| `hyperkalemia` | lisinopril, losartan | K⁺ gauge into red zone + badge | `serum_k > 5.5` | ATLAS **6 % high vs 4 % low dose** | [S2] |
| `hypokalemia` | HCTZ | K⁺ gauge into blue zone + badge | `serum_k < 3.5` | ΔK **−0.35 mmol/L** at 25–50 mg; **−0.22** low-dose meta `SECONDARY` | [S10] |
| `hyponatremia` | HCTZ | Na gauge + badge | Agent D's reference range | direction sourced; magnitude `NOT_FOUND` | [S10] |
| `hyperuricemia_gout` | HCTZ | urate gauge + **joint flare** on the great toe | `serum_urate > 6.8 mg/dL` | ≈ **+90 µmol/L** at ≥50 mg, ≈half at ≤25 mg `SECONDARY` | [S10] |
| `acute_gfr_drop` | lisinopril, losartan (esp. together) | kidney tints amber, filtration particles slow, badge | 0.30 / 0.20 | ATLAS creatinine increased **10 % vs 7 %** | [S2] |
| `angioedema` | lisinopril | **rare-event badge, distinct styling** — see below | rare | label carries a dedicated angioedema warning | [S2] |
| `fetal_toxicity` | lisinopril, losartan | **hard gate, not a badge** — see §13 | — | label boxed warning on fetal toxicity | [S2] |

### 12.1 Rules for badges

- **Hysteresis is mandatory** (`θ_on` > `θ_off`). Without it badges flicker every frame
  and the demo looks broken.
- **Rare events are styled differently from common ones.** Angioedema must never render
  with the same visual weight as ankle swelling. Use a dashed outline and a label that
  states it is rare. A demo that shows angioedema on every run is worse than one that
  never shows it.
- **Every badge is clickable and shows its source.** Clicking the oedema badge shows
  "10.8 % at 10 mg vs 0.6 % placebo — FDA label, retrieved 2026-08-17". This turns the
  animation into the product's evidence trail, and it is the single cheapest thing the
  coding agent can do to make the whole thing feel rigorous.
- All `θ` values above are `ESTIMATED` `VISUAL` tuning constants for badge firing. They
  are **not** clinical thresholds, except `serum_k`, `serum_urate` and `hr` gates, which
  are conventional laboratory/clinical bounds and should be read from Agent D's
  `patient_model.json`.

---

## 13. HARD GATES — contraindications that stop the animation

Some things must not be animated as a graded effect. If a hard rule from
`data/rules.json` (Agent C) fires, the animation **halts** rather than continuing.

| Gate | Trigger | UI behaviour |
|------|---------|--------------|
| **Pregnancy + lisinopril or losartan** | pregnancy flag + either RAAS drug | Simulation **does not run**. The human figure greys out, a red barrier appears over the uterus/placenta region, and the report renders as `DISQUALIFIED` with the fetal-toxicity reason [S2]. Do not animate a dose curve for a contraindicated drug — running it "to show what would happen" is the wrong message from a medical simulator. |
| **Dual RAAS blockade** (lisinopril + losartan) | both present | Simulation runs but a **persistent red overlay** sits on the kidney; the efferent arteriole pins to its clamp floor; report is `DISQUALIFIED` with the renal/hyperkalaemia reason. |
| **Asthma / COPD + metoprolol** | comorbidity flag + metoprolol | Runs with a **persistent amber overlay** on the lungs; `bronchospasm` badge threshold drops; report severity escalates. Caution, not an absolute block — but the airway must be visibly narrowed for the whole run. |
| **Gout + HCTZ** | gout flag + HCTZ | Runs; urate gauge starts nearer its ceiling; **joint flare** badge becomes likely. A visible, recognisable reject case. |

Agent C's `rules.json` is authoritative for which rules exist and their severities. This
table specifies only what the *animation* does when they fire.

### 13.1 Binding `annotate_organ` to this document's elements — **required reconciliation**

Agent C's `rules.json` (read 2026-08-17, schema 1.0.0, 13 rules) emits an
`annotate_organ` effect with the shape `{ op, organ, channel, direction }`, described in
`C-notes.md` §1.5 as "drive Agent F's organ animation". Their organ/channel vocabulary is
**not** the same as this document's element ids, so the coding agent needs this lookup
table. Without it, `annotate_organ` effects will silently do nothing.

| Agent C `organ` / `channel` | Rule ids that emit it | This document's element | Visual response |
|------------------------------|------------------------|--------------------------|-----------------|
| `fetus` / `renal_perfusion` | `RX-PREG-ACEI`, `RX-PREG-ARB` | **new element `fetus.kidney`** — not otherwise in this document; see below | Hard gate (§13). Figure greys out, red barrier over the uterus, `DISQUALIFIED`. No dose curve is animated. |
| `placenta` / `perfusion` | `RX-PREG-HCTZ` | **new element `placenta`** | `contraindicated_relative` → amber overlay + override toggle, not a hard stop. |
| `airway` / `edema` | `RX-ANGIOEDEMA-ACEI` | `lung.airway` + a new **`face_throat`** element | Rare-event styling per §12.1. **Must not** reuse the bronchospasm narrowing animation — angioedema is upper-airway swelling, a different thing, and conflating them would be a real pharmacological error on screen. |
| `airway` / `bronchoconstriction` | `EXC-AZO-DYE` | `lung.airway` | Same V6 narrowing as metoprolol's β2 channel (§9.2). Note this is an **excipient**-driven channel — a genuinely good demo beat, since it proves the excipient model in locked decision 2 does real work. |
| `heart` / `sa_av_conduction` | `RX-METO-CARDIAC-CI` | `heart.sa_node` | Hard block at rank 7. SA-node element renders with a red stop overlay; do not animate a heart rate. |
| `vasculature` / `vasoconstriction` | `RX-METO-PHEO` | precapillary arteriole element (§6.1) | V6 *narrowing* + red tint — the opposite direction from every other use of that element, which is exactly the point of the rule. |
| `skin` / `hypersensitivity` | `RX-HCTZ-SULFA` | **new element `skin`** | Rash overlay on the figure. |

**Four elements this document did not previously define** and which the coding agent must
add to render Agent C's rules: `fetus.kidney`, `placenta`, `face_throat`, `skin`. They are
listed here rather than folded silently into §5–§11 so the addition is auditable.

**Direction convention must be reconciled too.** Agent C uses `direction: "up" | "down"`.
Map: `down` → tint toward `#2E6FD9` (blue, suppressed) and, where the element has a
calibre, V6 index < 1.00. `up` → tint toward `#E0533D` and V6 index > 1.00. This is
consistent with the §3.1 global rule, so no special-casing is needed.

**Gaps between §13 and `rules.json` as read on 2026-08-17.** Three of the four hard gates
in §13 did **not** have a matching rule id in the 13 rules present:

| §13 gate | Rule found? | Action |
|----------|-------------|--------|
| Pregnancy + RAAS drug | **Yes** — `RX-PREG-ACEI`, `RX-PREG-ARB` | wired |
| Dual RAAS blockade (lisinopril + losartan) | **No** | Agent C should add it; the animation is written and waiting on the id. Flagged in §18. |
| Asthma/COPD + metoprolol | **No** — `RX-METO-CARDIAC-CI` covers conduction disease/shock, not airway disease | Agent C should add it. §9.2 and §12 already specify the animation. |
| Gout + HCTZ | **No** | Agent C should add it. §7.4 and §12 already specify the animation. |

Until those ids exist, the animation must fall back to driving those three channels from
the **bus hazards** (`hazards.bronchospasm`, `hazards.hyperuricemia_gout`,
`hazards.acute_gfr_drop`) rather than from `fired_rules`, and the report must not claim a
rule fired when none did.

---

## 14. Where cell-level detail would be fabrication — read this before building

The brief asked for cell-population detail where evidence supports it, and honesty where
it does not. Here is the honest accounting.

**Sourced to cell resolution (T1) — exactly one target in the whole set:**

- **NCC / `SLC12A3` in distal convoluted tubule cells.** HPA single-cell: 9100.1 nCPM,
  "cell type enriched (distal convoluted tubule cells)", tau 0.94 [S6c]. The UI may name
  this cell population.

**Explicitly NOT sourced to cell resolution — render at tissue level, tooltip "mechanism
inferred":**

| Target | Why we are stopping at tissue level |
|--------|--------------------------------------|
| β1 / `ADRB1` on SA nodal cells and cardiomyocytes | HPA single-cell top hit is **cytotrophoblasts**, not cardiomyocytes; classification "cell type enhanced", tau 0.79 [S6b]. Cardiac β1 is solid classical pharmacology but I did not source a cell-resolved human dataset. |
| ACE / `ACE` on pulmonary capillary endothelium | HPA tissue specificity lists **intestine and testis**, not lung [S6]. Pulmonary endothelial ACE is textbook; the expression data I pulled does not demonstrate it. |
| AT1 / `AGTR1` on vascular smooth muscle and zona glomerulosa | HPA tissue specificity lists **liver and placenta** [S6]. Vascular and adrenal AT1 are classical, not cell-resolved here. |
| Cav1.2 / `CACNA1C` on arteriolar smooth muscle | HPA tissue specificity lists **intestine** [S6]. |
| URAT1 / `SLC22A12` on proximal tubule apical membrane | Kidney-specific at tissue level (103.6 nTPM [S6]) and the human clearance study confirms functional URAT1 inhibition by losartan [S15] — but I did not pull the single-cell segment assignment. Close to T1; not claimed as T1. |
| ENaC/ROMK on collecting-duct principal cells | Not sourced at all in this file. Mechanism is inferred from the distal-Na-delivery argument. |
| Hepatic zonation of CYP enzymes | Liver specificity is well sourced (CYP3A4 3367.1, CYP2C9 1607.6, CYP2D6 386.2 nTPM [S6]); **zone 3 predominance is not**. Render zonation as decorative and say so. |

**A caveat on the HPA tissue-specificity field generally:** the `RNA tissue specific nTPM`
column reports tissues where a gene is *enriched relative to other tissues*, not every
tissue where it is expressed and functionally important. `ACE` not listing lung does not
mean pulmonary ACE is absent — it means lung is not where `ACE` transcript is most
distinctive. Absence of enrichment is not absence of the protein. I am recording this so
nobody over-reads the table above in either direction.

**Bottom line for the pitch:** say "we bind one target to a named human cell population
with single-cell evidence, and we are explicit that the other nine are rendered at tissue
level." That sentence is more impressive to a knowledgeable judge than ten confident
cell-type labels would be, and it cannot be falsified on stage.

---

## 15. Scene choreography — the 90-second demo

The animation needs a narrative or it is just a dashboard that moves. Suggested camera and
time-compression plan, driven entirely by bus signals.

| Phase | Sim time | Real time | Camera | What the viewer is meant to notice |
|-------|----------|-----------|--------|-------------------------------------|
| 1. Ingestion | 0–0.5 h | 6 s | gut → portal vein | The pill dissolves into typed substance sprites (actives *and* excipients — locked decision 2). Excipients are visually distinct and go nowhere: they are inert, and showing that is the point. |
| 2. First pass | 0.5–2 h | 10 s | liver | Lisinopril passes straight through untouched [S2]. Losartan is converted, and a **second, darker molecule appears** [S3]. Metoprolol meets the CYP2D6 gate, whose aperture depends on this patient's genotype [S4]. |
| 3. Distribution | 1–6 h | 12 s | whole body | Drug clouds reach targets. Occupancy rings (V11) sweep up. Losartan's **URAT1 ring peaks at 2–4 h** [S15] and starts falling while its AT1 ring is still rising — a real, sourced timing dissociation. |
| 4. Acute effect | 4–12 h | 20 s | heart + arteries + kidney split view | BP falls. Metoprolol's heart slows [S12b]. Amlodipine's arterioles widen. The DCT block sends Na⁺ and Cl⁻ out through the ureter [S7]. |
| 5. Counter-regulation | 12–48 h | 15 s | RAAS cascade panel + adrenal | Renin **doubles to triples** [S3] while BP stays down. Aldosterone falls. K⁺ movement reverses at the collecting duct. **The best 15 seconds available** — it is where the model stops looking like a curve fit and starts looking like physiology. |
| 6. Chronic | days 2–28 | 20 s | whole body, time-lapse | Amlodipine reaches steady state at **7–8 days** [S1] and the **ankle swells** [S1][S9]. HCTZ's urate creeps up while losartan's creeps down [S10][S15]. Badges accumulate. |
| 7. Verdict | — | 7 s | pull back to full figure | Report card renders per `05-OUTPUT-REPORT-SPEC.md`, with the disclaimer visible in the same frame. |

**Time compression must be shown, not hidden.** Put a clock on screen with a visible
non-linear scrubber. A judge who realises days passed silently will distrust everything
else.

---

## 16. `data/organ_map.json` — the machine-readable form

The coding agent should generate this file from the tables above. Schema:

```jsonc
{
  "$schema_version": "1.0",
  "provenance_convention": "Each numeric field has a sibling *_prov: {kind, source_id, value_as_stated, retrieved} | {kind:'ESTIMATED', why} | {kind:'VISUAL'} | {kind:'NOT_FOUND'}",
  "drug_identity": [
    { "id": "amlodipine", "hue": "#A855F7", "c_ref_ng_ml": 12,
      "c_ref_prov": { "kind": "ESTIMATED", "why": "sprite-cloud scaling only; not a PK value" } }
  ],
  "organs": [
    {
      "id": "kidney",
      "label_en": "Kidney", "label_uz": "Buyrak", "label_ru": "Почка",
      "elements": [
        {
          "id": "n.dct",
          "label_en": "Distal convoluted tubule",
          "anatomical_tier": "T1",
          "cell_population": "distal convoluted tubule cells",
          "cell_population_prov": {
            "kind": "citation", "source_id": "S6c",
            "value_as_stated": "cell type enriched (distal convoluted tubule cells), 9100.1 nCPM, tau 0.94",
            "retrieved": "2026-08-17"
          },
          "bindings": [
            {
              "drug": "hydrochlorothiazide",
              "target": { "name": "NCC", "gene": "SLC12A3", "uniprot": "P55017" },
              "direction": "inhibit",
              "onset_h": 1.0, "onset_prov": { "kind": "ESTIMATED", "why": "diuresis is prompt after oral dosing" },
              "signal": "engagement.ncc_inhibition",
              "visual": { "channel": "V11", "property": "arc_sweep_deg",
                          "domain": [0, 1], "range": [0, 360] }
            },
            {
              "drug": "hydrochlorothiazide",
              "signal": "renal.na_excretion_rate",
              "visual": { "channel": "V9", "ion": "Na", "colour": "#3BA55D",
                          "property": "particles_per_s", "domain": [0, 25], "range": [0, 12],
                          "domain_prov": { "kind": "VISUAL" } }
            }
          ]
        }
      ]
    }
  ]
}
```

**Every `visual` block has `domain` (simulation units) and `range` (pixels/degrees/seconds).
That pair is the entire point of this document.** If a coding agent ever has to guess a
domain, this file has failed.

---

## 17. Sources

All retrieved **2026-08-17** unless stated.

| id | Source | What it gave |
|----|--------|--------------|
| **S1** | FDA structured product label, **amlodipine besylate**, via openFDA. `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"amlodipine+besylate"+AND+_exists_:adverse_reactions&limit=1` | Dose-related AE table (Edema 1.8/3.0/10.8 vs placebo 0.6; Dizziness 1.1/3.4/3.4 vs 1.5; Flushing 0.7/1.4/2.6 vs 0.0; Palpitation 0.7/1.4/4.5 vs 0.6). Sex table (Edema M 5.6 / F 14.6 vs placebo M 1.4 / F 5.1). Tmax 6–12 h; bioavailability 64–90 %; protein binding 93 %; terminal t½ 30–50 h; steady state 7–8 days; PK not significantly influenced by renal impairment. |
| **S2** | FDA label, **Zestril (lisinopril)**, via openFDA `search=openfda.brand_name:"ZESTRIL"` | ATLAS dose-related table: Dizziness 19 %/12 %, Hypotension 11 %/7 %, Creatinine increased 10 %/7 %, Hyperkalemia 6 %/4 %, Syncope 7 %/5 % (high vs low dose). Onset of antihypertensive activity 1 h, peak BP reduction 6 h. Effective t½ 12 h on multiple dosing. "Lisinopril does not undergo metabolism and is excreted unchanged entirely in the urine." Fetal toxicity warning. |
| **S3** | FDA label, **losartan potassium**, via openFDA | 100 mg inhibits the AngII pressor effect ~85 % at peak, 25–40 % at 24 h. PRA doubles to triples. Losartan t½ ~2 h, metabolite 6–9 h. Plasma clearance 600 / 50 mL/min; renal 75 / 25 mL/min. Notes cough as an **ACE-inhibitor** phenomenon. |
| **S4** | FDA label, **metoprolol succinate ER**, via openFDA | t½ 3–7 h; CYP2D6 metabolism; <5 % unchanged in urine; ER Cmax one-quarter to one-half of IR; quinidine 100 mg tripled S-metoprolol and doubled t½; propafenone raised steady state 2-fold+. AEs: bradycardia, wheezing (bronchospasm), dyspnoea, cold extremities, Raynaud-type arterial insufficiency, peripheral oedema. Interference with endogenous **and exogenous** bronchodilators. |
| **S5** | FDA label, **lisinopril and hydrochlorothiazide tablets**, via openFDA | Dizziness 7.5 %, headache 5.2 %, **cough 3.9 %**, fatigue 3.7 %, orthostatic effects 3.2 %; discontinuation for AEs 4.4 %; syncope 0.8 %. |
| **S6** | **Human Protein Atlas** API, `https://www.proteinatlas.org/api/search_download.php?...&columns=g,gs,up,rnatsm` | UniProt IDs and tissue-specific nTPM: SLC12A3 P55017 kidney 94.2; ACE P12821 intestine 249.7 / testis 96.4; AGTR1 P30556 liver 90.3 / placenta 133.2; CACNA1C Q13936 intestine 25.0; ADRB1 P08588 heart muscle 20.3 / lung 11.4 / placenta 27.4; SLC22A12 Q96S37 kidney 103.6; REN P00797 kidney 134.7; CYP2D6 P10635 liver 386.2; CYP3A4 P08684 liver 3367.1; CYP2C9 P11712 liver 1607.6; BDKRB2 P30411 urinary bladder 38.4. |
| **S6b** | HPA single-cell, `https://www.proteinatlas.org/ENSG00000043591-ADRB1/single+cell` | ADRB1 "cell type enhanced", tau 0.79, top cell type **cytotrophoblasts 99.7 nCPM**. |
| **S6c** | HPA single-cell, `https://www.proteinatlas.org/ENSG00000070915-SLC12A3/single+cell` | **"Cell type enriched (distal convoluted tubule cells)", 9100.1 nCPM, tau 0.94.** |
| **S7** | Musini VM et al., *Blood pressure-lowering efficacy of monotherapy with thiazide diuretics for primary hypertension*, Cochrane 2014. `https://pubmed.ncbi.nlm.nih.gov/24869750/` | HCTZ dose-response −4/−2, −6/−3, −8/−3, −11/−5 mmHg at 6.25/12.5/25/50 mg; class overall −9/−4 mmHg. `SECONDARY` — retrieved via search summary, abstract not read in full. |
| **S9** | Makani/Messerli-type meta-analysis of amlodipine oedema and headache, *J Hypertens* 2019. `https://pubmed.ncbi.nlm.nih.gov/31107359/` | Oedema 16.6 % vs 6.2 % placebo, RR 2.9; low/medium dose RR 2.01, 10 mg RR 3.08; 22 trials, 7226 patients. `SECONDARY`. |
| **S10** | Thiazide electrolyte/metabolic meta-analyses (incl. *J Am Soc Hypertens* low-dose thiazide meta-analysis; chlorthalidone-vs-HCTZ meta-analysis, *J Hum Hypertens* 2019) | ΔK −0.35 mmol/L at HCTZ 25–50 mg/day; −0.22 mmol/L cumulative mean in low-dose meta-analysis; −0.4 mmol/L estimated at 40.5 mg. Urate ≈ +90 µmol/L at ≥50 mg/day, ≈half at ≤25 mg/day. **`SECONDARY`** — from search summaries, primaries not read in full. Treat as indicative. |
| **S11** | Irwin RS et al., ACCP evidence-based guideline on ACE-inhibitor-induced cough; Annals of Internal Medicine review of ACE-inhibitor cough and angioedema (PMID 1616218) | Incidence 5–35 %; more common in women; mechanism via bradykinin and substance P accumulation (both ACE substrates) and prostaglandins. `SECONDARY`. |
| **S11b** | Bradykinin sensitisation of the cough reflex, `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6551914/`; Fox AJ et al., *Nature Medicine* 1996, `https://www.nature.com/articles/nm0796-814` | B2-receptor-dependent activation of TRPV1 and TRPA1 via COX and 12-LOX metabolites; vagal C-fibre responses to capsaicin markedly increased after bradykinin perfusion. `SECONDARY`. |
| **S12** | *Extent of beta1- and beta2-receptor occupancy in plasma assesses the antagonist activity of metoprolol, pindolol, and propranolol in the elderly*, Cardiovasc Drugs Ther. `https://link.springer.com/article/10.1007/BF00877714` | **β1 occupancy 54–92 %, β2 occupancy 6–38 %** on metoprolol 100 mg b.i.d. `SECONDARY`. |
| **S12b** | Population and dose-response HR data for metoprolol (incl. PMC9224772; ER dose-response study) | IR 50 mg b.i.d. → −19.1 % HR; ER 100 mg o.d. → −13.4 %; ER 200 mg o.d. → −14 bpm. `SECONDARY`. |
| **S14** | Sica DA, *Calcium channel blocker-related peripheral edema: can it be resolved?* J Clin Hypertens 2003; *Etiology of Drug-Induced Edema*, Cureus 2024, `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10908346/`; Am J Med 2010 RAS-blockade-and-CCB-oedema study | Mechanism: precapillary arteriolar dilation unmatched postcapillary → ↑ capillary hydrostatic pressure → interstitial fluid shift at gravitationally dependent sites; dose dependent; RAS blockade mitigates. `SECONDARY`. |
| **S15** | Hamada T et al., *Uricosuric action of losartan via the inhibition of urate transporter 1 (URAT1) in hypertensive patients*, Am J Hypertens 2008;21:1157–62. PMID 18670416. Abstract retrieved via NCBI E-utilities. | Losartan 50 mg/day for 1 month significantly reduced serum urate with a concomitant rise in the Cur/Ccr ratio; candesartan did not. **No effect in patients with URAT1 loss-of-function mutation** → direct genetic personalisation hook. Peak uricosuric effect 2–4 h post-dose, attributable to parent losartan rather than the metabolite. |

---

## 18. Cross-agent notes

- **To Agent E (simulation):** §2 is a hard interface request. The engine must emit
  `EffectFrame` with those exact field names, and it needs to produce **target-engagement
  fractions**, not just concentrations and blood pressure. The occupancy rings (V11) are
  the most scientifically legible part of the animation and they need `engagement.*`
  directly. Two specific asks: (a) `beta1_occupancy` and `beta2_occupancy` must be
  *separate* so the selectivity-loss animation works ([S12] gives you a range to calibrate
  against: 54–92 % vs 6–38 % at 100 mg b.i.d.); (b) losartan needs `urat1_inhibition`
  driven by **parent** concentration and `at1_blockade` driven by **parent + EXP3174**,
  because [S15] shows those two peak at different times, and that dissociation is a real
  animatable finding.
- **To Agent E:** counter-regulation must include the renin rise. [S3] gives a hard number
  — losartan 100 mg **doubles to triples** PRA. If the engine does not reproduce a renin
  rise while BP falls, §15 phase 5 (the best segment of the demo) cannot be animated, and
  a clinician judge will spot the missing feedback immediately.
- **To Agent D (virtual human):** §7.5, §11.3 and §12 reference laboratory reference
  ranges (serum K 3.5–5.5, urate 6.8 mg/dL, HR 50) as placeholders. Please publish
  authoritative ranges in `patient_model.json`; the animation should read them from there.
  Also: the amlodipine oedema **sex effect is large and label-sourced** (F 14.6 % vs M
  5.6 % [S1]) — sex should be a real modifier in the patient model, not cosmetic.
- **To Agent B (substances):** I used six `c_ref` sprite-scaling constants (§4) that are
  `ESTIMATED`. If `substances.json` carries real Cmax values at standard doses, the coding
  agent should replace them. Also please confirm losartan's EXP3174 is modelled as a
  separate entity with its own concentration — the liver animation (§8) depends on it.
- **To Agent C (rules) — read after your file, three concrete items.** (1) Your
  `annotate_organ` organ/channel vocabulary and my element ids were different namespaces;
  I have written the reconciliation table in **§13.1** rather than renaming anything on
  either side. Please sanity-check it. (2) Of my four hard gates, only the pregnancy pair
  had matching rule ids in the 13 rules I read; **dual RAAS blockade, asthma/COPD +
  metoprolol, and gout + HCTZ had no rule id.** The animations for all three are written
  and waiting — I just need stable ids. Until then the UI falls back to bus hazards and
  will not claim a rule fired. (3) `RX-ANGIOEDEMA-ACEI` maps to `airway/edema`, which
  collides with `EXC-AZO-DYE`'s `airway/bronchoconstriction` on the same organ.
  Angioedema is upper-airway swelling and bronchospasm is lower-airway narrowing; I have
  routed them to different elements in §13.1 so the animation does not conflate them.
  Also flagging that amlodipine and losartan share CYP3A4 — I found **no sourced
  magnitude** for a clinically meaningful interaction and did not invent one; your call
  whether it rises to a rule.
- **Flagged concern on the locked drug set (not a request to change it):** the set is
  well chosen for animation contrast. The only real gap is that **no drug in the set acts
  on the collecting duct directly**, so the potassium story is entirely indirect (via
  aldosterone and via distal sodium delivery). That is fine and arguably more interesting,
  but the engine must model the indirect path properly or the K⁺ animation will be
  hand-waved.
