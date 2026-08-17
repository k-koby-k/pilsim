# 02 — The Virtual Human

**Agent D.** Owns `data/patient_model.json` and this file.
All sources retrieved **2026-08-17** unless stated otherwise.

> **Framing that must reach the UI:** PilSim's virtual human is a *lumped-parameter
> research simulator* calibrated to published population reference values. It is not
> calibrated to any individual, it has not been validated against clinical outcomes,
> and it must not be used to prescribe, withhold or adjust therapy for a real person.

---

## 1. What the twin is, in one paragraph

The twin is a small set of coupled physiological states — pressures, flows, volumes,
electrolytes, two neurohormonal tone indices and two enzyme-activity indices — derived
from a handful of things a clinician actually knows about a patient: age, sex, height,
weight, blood pressure, heart rate, a routine chemistry panel, any comorbidities, and
optionally a CYP2D6 and CYP2C9 genotype. Everything else is computed from published
equations, each of which is written out explicitly in `data/patient_model.json` as a
JavaScript expression with its citation attached. The twin is deliberately *not* a
whole-body PBPK model: it is a circulatory–renal–hepatic core rich enough that all five
modelled drugs act on genuinely different variables, that the safety rules have real
numbers to test, and that the organ animation has quantities to bind to.

---

## 2. The one design decision that makes the model work: calibrate, then run

The naive way to build this is to compute a blood pressure from population averages
and then apply drug effects to it. That produces a twin that does not reproduce the
patient the user actually described, and a judge notices immediately when they type in
160/95 and the model shows 128/80.

PilSim inverts it. **Blood pressure is an input at baseline and an output during
simulation.**

The circulation is expressed through two standard identities:

```
MAP = CVP + SVR × CO / 80          (SVR in dyn·s·cm⁻⁵, CO in L/min)
PP  = SV / C_a                      (C_a = total arterial compliance, mL/mmHg)
```

At baseline the engine runs these *backwards*:

1. Cardiac output comes from the ICRP reference individual, scaled by body surface
   area and adjusted by any active comorbidity presets.
2. Stroke volume = CO ÷ heart rate (heart rate is a user input).
3. MAP and pulse pressure come from the entered systolic and diastolic pressures.
4. **Systemic vascular resistance is then solved:** `SVR = 80 × (MAP − CVP) / CO`.
5. **Arterial compliance is then solved:** `C_a = SV / PP`.

The twin therefore reproduces the entered blood pressure *exactly*, by construction,
while every underlying haemodynamic variable is a physiologically meaningful number in
a physiologically plausible range. During simulation the identities run forwards: drugs
move heart rate, contractility, plasma volume, SVR and compliance, and blood pressure
falls out of them.

Why this matters for the pitch: it means the five drugs reach the same endpoint by four
mechanistically distinct routes, and the model shows it.

| Drug | Primary lever | What the animation sees |
|---|---|---|
| Amlodipine | ↓ SVR (arteriolar smooth muscle) | vessel lumen widens, heart rate barely moves |
| Lisinopril / Losartan | ↓ SVR via angiotensin II / AT1, ↓ aldosterone | vessel widens **and** kidney/adrenal channel changes |
| Hydrochlorothiazide | ↓ plasma volume → ↓ stroke volume → ↓ CO | nephron distal tubule, then falling ventricular filling |
| Metoprolol | ↓ heart rate and ↓ contractility → ↓ CO | the heart itself slows and beats less forcefully |

Two drugs that both lower blood pressure by 10 mmHg look completely different inside
the twin. That is the demo.

---

## 3. Equations, and which version is current

This is the section a clinician judge will read first. Several widely-taught equations
have been formally revised in the last few years and the superseded versions are still
everywhere on the web. Here is what PilSim uses and what changed.

### 3.1 Kidney function — **2021 CKD-EPI creatinine equation, race-free**

```
eGFR = 142 × min(SCr/κ, 1)^α × max(SCr/κ, 1)^−1.200 × 0.9938^age × 1.012 [if female]
       female: κ = 0.7,  α = −0.241
       male:   κ = 0.9,  α = −0.302
```
Source: NIDDK, *eGFR Equations for Adults*
(https://www.niddk.nih.gov/research-funding/research-programs/kidney-clinical-research-epidemiology/laboratory/glomerular-filtration-rate-equations/adults),
retrieved 2026-08-17.

**What changed and why.** The 2021 equation replaced the 2009 CKD-EPI equation, which
carried a coefficient that raised estimated GFR in patients recorded as Black. The
NKF–ASN Task Force recommended removing race because it is a social, not a biological,
variable and the coefficient systematically delayed diagnosis and referral. It also
replaced the older MDRD equation. **Any implementation that takes race as an input to
eGFR is out of date and must not ship.** PilSim's `ancestry_group` input exists only to
select pharmacogenomic prior probabilities and BMI cut-point sets; it is structurally
prevented from touching renal function.

Two further consequences, both of which the coding agent must get right:

- **De-index before dosing.** Laboratories report eGFR per 1.73 m² of body surface
  area. Renal *drug clearance* is a whole-body quantity, so the PK layer must use
  `eGFR × BSA / 1.73`. Skipping this under-predicts renal clearance by roughly 20% in a
  110 kg patient. The National Kidney Foundation workgroup consensus (Am J Health-Syst
  Pharm 2025;82(12):644) explicitly recommends the 2021 CKD-EPI equation "with results
  adjusted for body surface area" for medication decisions.
- **Cockcroft–Gault is legacy, and it is kept anyway.** The FDA's 2024 renal-impairment
  guidance and the 2025 NKF consensus both recommend moving off Cockcroft–Gault
  creatinine clearance for medication decisions. But essentially every drug label still
  expresses renal dose adjustment in Cockcroft–Gault bands, so PilSim computes it —
  clearly labelled *display only* — to check label-based dose caps. It never drives the
  model.

**Agent C: this is the unambiguous answer you asked for.** Hydrochlorothiazide
dose-modification logic should key on `labs.egfr_ml_min_1_73` (the indexed 2021 CKD-EPI
value) for guideline-style thresholds, because that is the unit guideline thresholds
are written in. It should key on `egfr_absolute_mL_min` only if you are scaling
clearance rather than applying a threshold.

### 3.2 Body composition

| Quantity | Equation | Source and note |
|---|---|---|
| BSA | `0.007184 × ht_cm^0.725 × wt_kg^0.425` | Du Bois & Du Bois 1916. Reproduces ICRP's stated 1.90 m² / 1.66 m² to within 1%. |
| Lean body weight | male `9270·W/(6680+216·BMI)`, female `9270·W/(8780+244·BMI)` | **Janmahasatian 2005.** This *supersedes* the James (1976) formula, which is non-monotonic and returns *falling* lean mass at high BMI — a genuine failure mode, not a nuance. Janmahasatian was derived specifically to behave at extremes of size. |
| Total body water | male `2.447 − 0.09516·age + 0.1074·ht + 0.3362·wt`, female `−2.097 + 0.1069·ht + 0.2466·wt` | Watson 1980. Gives 41.5 L for the ICRP reference male — 57% of body mass, consistent with the textbook 42 L in a 70 kg man. |
| Extracellular fluid | `0.414 × TBW + 0.306` | Forbes regression as reproduced in ICRP 89 ¶102. ICRP states no significant sex difference. |
| Blood volume | male `0.3669·H³ + 0.03219·W + 0.6041`, female `0.3561·H³ + 0.03308·W + 0.1833` (H in m) | Nadler 1962. **Runs about 6% below ICRP's stated reference values.** Documented, not fudged; the resulting plasma volume still lands inside the NBME reference interval of 25–43 mL/kg (male). |
| Blood volume above BMI 30 | `70 / √(BMI/22)` mL/kg | Lemmens 2006. **Prefer this to Nadler in obesity.** Indexed blood volume falls from 70 mL/kg lean to ~50 mL/kg obese while *total* volume still rises — Nadler does not capture that curvature. |
| Ideal body weight | male `50 + 2.3·(in over 60")`, female `45 + 2.3·(in over 60")` | Devine 1974. Devine's original female intercept is often quoted as 45.5 kg; the ≤0.5 kg difference is immaterial here. |

### 3.3 Haemodynamics

- `SVR (dyn·s·cm⁻⁵) = 80 × (MAP − CVP) / CO`, normal range 800–1200.
- `MAP ≈ DBP + PP/3`. This is an approximation with a 1:2 systole:diastole time
  weighting; it degrades above about 100 bpm and the error is a few mmHg. Accepted.
- `C_a = SV / PP`, the stroke-volume-to-pulse-pressure ratio. Chemla 1998 validated it
  against the area method (r = 0.98) and reports a mean of 1.46 ± 0.69 mL/mmHg. This is
  the variable that carries arterial stiffening, and it is why the elderly twin develops
  the isolated-systolic-hypertension phenotype rather than having it hard-coded.
- Central venous pressure is fixed at 5 mmHg. StatPearls quotes 8–12 mmHg but that is a
  *resuscitation target*, not a healthy resting value; awake healthy subjects are
  commonly reported nearer 2–3 mmHg. SVR is weakly sensitive to the choice — ±3 mmHg
  moves it about 4% — so 5 mmHg is used and flagged as an estimate.

### 3.4 Baroreflex — the reason the model does not produce absurdities

Any antihypertensive model without counter-regulation drives blood pressure
monotonically downward and looks ridiculous over hours. PilSim carries an explicit
cardiovagal baroreflex gain, derived rather than guessed:

Published baroreflex sensitivity is in ms of R-R interval per mmHg (~15 ms/mmHg by the
phenylephrine method in normals). Since HR = 60000/RR,

```
dHR/dSBP = −(60000 / RR²) × dRR/dSBP
```

which at RR = 857 ms (HR 70) gives **−1.23 bpm/mmHg**. Age scaling uses the reported
~33% reduction in middle-aged and ~60% reduction in older sedentary men
(Monahan 2001). The sign is negative: pressure up, heart rate down.

The second counter-regulatory loop is the RAAS. `raas_activity` is a dimensionless
index normalised to 1.0, suppressed by lisinopril and losartan and *raised* by
hydrochlorothiazide-induced volume depletion. **That loop is the mechanistic reason a
thiazide plus a RAAS blocker is more than additive**, and Agent E should model it
rather than hard-code a synergy coefficient.

---

## 4. Blood-pressure guidelines: which one, and why it matters

Two current guidelines disagree on where hypertension starts, and PilSim should show
both rather than pick a side silently.

| | 2025 AHA/ACC | 2024 ESC |
|---|---|---|
| Hypertension threshold | ≥130/80 | ≥140/90 |
| Intermediate category | Stage 1 = 130–139/80–89 | "Elevated BP" = 120–139/70–89 (new category) |
| Treatment goal | <130/80 for all adults | systolic 120–129 default |
| Risk tool | **PREVENT** (replaces the Pooled Cohort Equations) | CVD risk based |

Two things the team's draft scope (§1.3) gets subtly wrong here:

- It attributes the 130/80 threshold to diabetes specifically. Under the 2025 AHA/ACC
  guideline **130/80 is the goal for all adults**, so it is no longer a diabetes-specific
  rule. Diabetes still matters — it moves a stage 1 patient into "treat now" — but the
  threshold itself is general.
- The 2025 guideline uses PREVENT, not the Pooled Cohort Equations, for the ≥7.5%
  10-year risk trigger in stage 1. Anything computing risk should say which equation.

---

## 5. Pharmacogenomics: two genes, and what each actually buys

### CYP2D6 → metoprolol

Phenotype bins are quoted verbatim from the **CPIC 2024 beta-blocker guideline**
(Duarte et al., PMID 38951961) Table 1:

| Phenotype | Activity score |
|---|---|
| Ultrarapid | > 2.25 |
| Normal | 1.25 ≤ x ≤ 2.25 |
| Intermediate | 0 < x < 1.25 |
| Poor | 0 |

**What changed:** the 2019 CPIC/DPWG consensus moved activity score 1.0 from *normal*
into *intermediate*, and reassigned CYP2D6\*10 an activity value of 0.25 (previously
0.5). Because \*10 is common in Central/South Asian and East Asian populations, an
implementation using the old bins misclassifies a large share of exactly the population
this product is being demonstrated for.

The model binding is calibrated, not invented. A validated PBPK model reports that poor
metabolizers show **approximately five-fold higher metoprolol exposure** than normal
metabolizers (Rüdesheim 2020, Pharmaceutics 12:1200). PilSim sets metoprolol's
CYP2D6-mediated clearance fraction to 0.80 and the poor-metaboliser pathway multiplier
to 0, which reproduces exactly 5× AUC. The intermediate value (0.5 → 1.67× AUC) and the
ultrarapid value (1.6 → 0.81× AUC) are **estimates** — CPIC explicitly declines to make
an ultrarapid recommendation for lack of evidence, so the UI must not present an
ultrarapid prediction confidently.

CPIC's actual recommendations are carried verbatim in the data file. Note the
clinically important nuance: CPIC recommends *standard dosing* for intermediate
metabolizers, and only for poor metabolizers advises the lowest starting dose with
careful titration and closer bradycardia monitoring.

### CYP2C9 → losartan

Losartan is effectively a prodrug: roughly 14% of an oral dose is converted to E-3174
(EXP3174), which carries most of the AT1 blockade. CYP2C9 does most of that conversion.
A poor metaboliser therefore has near-normal *parent* exposure and markedly reduced
*active metabolite* exposure — a patient who takes the drug faithfully and does not
respond. That is a genuinely compelling demo for problem 12.

- Meta-analysis (Park 2021, J Pers Med 11:617; 8 studies, 139 subjects): variant
  carriers vs \*1/\*1 show losartan AUC **+0.17 μg·h/mL** (95% CI 0.04–0.29) and
  E-3174 AUC **−0.35 μg·h/mL** (95% CI −0.62 to −0.08).
- Genotype detail (Yasar 2002, Clin Pharmacol Ther 71:89): the losartan/E-3174 AUC ratio
  was **30-fold** higher in the single \*3/\*3 subject and about 2- and 3-fold higher in
  \*1/\*3 and \*2/\*3 respectively.

PilSim maps activity score linearly (`AS/2`) onto CYP2C9 pathway activity and sets the
CYP2C9-mediated fraction of E-3174 formation to 0.95. **Known limitation, stated
plainly:** this reproduces roughly a 20-fold ratio shift at AS 0 (vs Yasar's observed
30-fold, in n = 1), but it *understates* the heterozygote effect — it predicts 1.14×
and 1.35× where Yasar observed 2–3×. The linear activity-score mapping is too gentle in
the middle. That is documented in the data file rather than papered over.

The 14% conversion fraction and the "10–40× more potent than losartan" figure for
E-3174 are widely quoted but **were not verified against the FDA label within this
agent's budget**. They are flagged `NEEDS VERIFICATION` for Agent B.

### CYP3A4/5 → amlodipine: deliberately nothing

There is no CPIC-level actionable genotype recommendation for amlodipine. Modelling a
CYP3A5 effect would give the demo a pharmacogenomic claim the evidence does not
support. CYP3A capacity is instead exposed as a free multiplier so that inhibitor,
inducer and cirrhosis scenarios can act on it.

### Population frequencies — and an honest gap

Phenotype frequencies were computed by parsing the CPIC frequency tables directly
(`files.cpicpgx.org/data/report/current/frequency/CYP2D6_frequency_table.xlsx` and the
CYP2C9 equivalent) and summing the published activity-score rows into CPIC's phenotype
bins.

| CYP2D6 | UM | NM | IM | PM | Indeterminate |
|---|---|---|---|---|---|
| Central/South Asian | 1.5% | 58.1% | 28.1% | 2.4% | 10.0% |
| Near Eastern | 7.4% | 56.5% | 30.2% | 2.2% | 3.7% |
| European | 2.3% | 49.2% | 38.3% | 6.5% | 3.7% |
| East Asian | 0.9% | 53.2% | 38.5% | 0.8% | 6.7% |

| CYP2C9 | NM | IM | PM |
|---|---|---|---|
| Central/South Asian | 59.6% | 36.2% | 3.8% |
| European | 62.9% | 34.5% | 2.6% |
| East Asian | 83.8% | 15.2% | 0.6% |

**`NOT_FOUND`: no CYP2D6 or CYP2C9 frequency dataset specific to Uzbekistan or to Uzbek
populations was located.** "Central/South Asian" is the nearest CPIC biogeographic
group; "Near Eastern" is an equally defensible proxy, and the two differ materially —
1.5% vs 7.4% ultrarapid metabolizers. The UI must present the chosen group as an
assumption about the virtual population, never as a fact about Uzbek patients. This is
a real limitation of the pitch and it is better to name it than to have a judge find it.

---

## 6. Comorbidity presets: how they work and what they are worth

A preset is a list of typed modifiers (`set`, `multiply`, `add`, `clamp_min`,
`clamp_max`) against named state variables. Multiple presets compose; `multiply`
composes multiplicatively, `add` additively, and two presets both issuing `set` on the
same target must raise a visible UI warning rather than silently overwrite. Presets are
self-contained keyed records with no cross-references, so one can be added, corrected
or deleted without touching the pipeline or the state vector.

### Preset evidence status

| Preset | Confidence | Honest summary |
|---|---|---|
| Gout | **high** | ACR 2020 thresholds; cohort baseline urate 9.2 mg/dL. Solid. |
| CAD / prior stroke | **high (as a negative)** | Deliberately carries *no* physiological modifiers. Searched, nothing found, and that is the correct answer. |
| Ageing 65+ | **medium** | Cardiac index, stroke-volume index, heart rate, pulse-wave velocity, GFR and hepatic-flow decline all cited. Arterial compliance is *derived* from cited SV and PP data. |
| T2DM | **medium** | ADA 2026 thresholds; cited heart-rate and pulse-wave-velocity data. Hyperfiltration magnitude is soft — see below. |
| Asthma / COPD | **medium** | GOLD grades and Salpeter meta-analysis FEV₁ numbers are the sharpest data in the whole preset set. |
| HFrEF | **medium** | LVEF definition, cardiac index and blood-volume expansion cited; heart rate and renal blood flow are estimates. |
| Pregnancy | **medium** | Trimester-resolved measured eGFR and creatinine; haemodynamics from standard physiology sources. |
| Hepatic impairment | **medium** | Child-Pugh-stratified PBPK parameter table; CYP2C9 and shunt fraction are gaps. |
| CKD | **medium** | KDIGO categories exact; potassium/haemoglobin/bicarbonate deltas calibrated against *prevalence* data, not against published mean deltas. |
| Obesity / metabolic | **low–medium** | Good continuous relations, but sourced from a secondary educational site citing Stelfox 2006 and de Divitiis 1981. Confirm before quoting to a clinician. |

### Eight things the literature review changed

These were estimates in the first draft and are now either cited or corrected. They are
listed because a judge who checks one of them should find the file already honest about
it.

1. **T2DM does not expand plasma volume.** The one direct measurement found shows
   absolute plasma volume statistically identical to matched controls (2628 ± 338 mL vs
   2597 ± 256 mL, p = 0.716). The modifier was removed.
2. **Obesity lowers systemic vascular resistance by about 20%.** Obesity hypertension
   is a high-output, *low*-resistance state. The first draft had SVR unchanged, which
   would have made the twin respond wrongly to a vasodilator. This also complicates the
   team's draft claim that obesity gives "higher CCB response typical."
3. **Ageing cuts cardiac output by 27%, not 12%.** Resting cardiac index falls from 3.0
   to 2.2 L/min/m² between under-40 and over-60.
4. **Resting heart rate does not fall with age** (79 / 76 / 75 bpm across age bands,
   r = 0.10, p = 0.15). The entire cardiac-output decline is carried by stroke volume.
   The modifier is pinned at exactly 0 so nobody re-adds an age-related bradycardia.
5. **Arterial compliance in ageing is now derived, not guessed.** Pulse pressure rises
   from 40 to 54 mmHg while stroke volume index falls from 39 to 31 mL/m²; compliance
   ratio = 0.795 / 1.35 = **0.59**. The original guess of 0.62 was close, but this is
   arithmetic over cited data.
6. **Pregnancy: eGFR rises 23%, not 45%.** The textbook "+50% GFR" refers to *measured*
   GFR; a creatinine-based equation in the same women reports 105 → 129 mL/min/1.73 m².
   Conflating those two would have been a visible error.
7. **Beta-blockers in COPD are not contraindicated.** A cardioselective beta-1 blocker
   reduces FEV₁ by about 2% in COPD (−2.05%, 95% CI −6.05 to +1.96) and the effect does
   not worsen with continued treatment. In reactive airway disease a single dose drops
   FEV₁ 7.46%, fully reversed by a beta-2 agonist, and continued treatment produced no
   significant drop in 141 participants. Non-selective blockade is the harmful case
   (−0.14 L vs −0.03 L). **The team's draft "beta-blocker contraindicated
   (bronchospasm)" is too strong and a pulmonologist judge will say so.** Metoprolol is
   beta-1 selective. The correct model is graded, dose-dependent caution, with absolute
   contraindication reserved for severe or unstable asthma.
8. **Cirrhosis barely reduces total hepatic blood flow.** Portal flow collapses to 0.63
   of normal at Child-Pugh B but hepatic arterial flow rises to 1.62 — the hepatic
   arterial buffer response — so total flow is ~0.93. What actually falls is intrinsic
   metabolic capacity: CYP3A4 intrinsic clearance drops to 0.39. That is a genuinely
   counter-intuitive result worth putting on screen.

### Where presets remain weak, named explicitly

- CKD plasma-volume and SVR expansion: **NOT_FOUND** quantitatively. Direction certain,
  magnitude estimated.
- HFrEF resting heart rate and stroke volume: **NOT_FOUND**. The only HFrEF renal blood
  flow number located was in a patent document and was rejected rather than used.
- CYP2C9 and CYP2C19 abundance by Child-Pugh class: **NOT_FOUND** (only CYP3A4 is
  tabulated), so losartan's activation in cirrhosis is estimated.
- Age-stratified total body water and lean mass as percentages: **NOT_FOUND**.
- Diabetic hyperfiltration has **no consensus threshold**: 405 studies used values from
  90.7 to 175 mL/min/1.73 m² (median 135), and reported prevalence swings from under 1%
  to about 50% purely as a function of that choice. If the UI ever labels a patient
  "hyperfiltering" it must say which threshold it used.

One important note on the ageing preset: **it is not a disease.** Age already enters the
CKD-EPI, Watson and baroreflex equations directly. The preset carries only the effects
that those equations do not already contain, and the baroreflex modifier is pinned at
1.0 with a comment saying why, so that a future editor does not double-count it.

---

## 7. Where the physiology data comes from

Two independent, freely available sources, cross-checked against each other:

**Primary — ICRP Publication 89** (Valentin ed., *Ann ICRP* 32(3–4), 2002). The full
text was obtained and the reference-individual values quoted verbatim: blood volume
5.3 L / 3.9 L, plasma volume 3000 / 2400 mL, cardiac output 6.5 / 5.9 L/min, kidney
flow 19% / 17% of cardiac output, liver flow 25.5% / 27.0%, GFR 125 mL/min, renal
plasma flow 700 mL/min, filtration fraction 0.18. ICRP gives sex-specific values, which
matters for a twin whose user picks a sex.

**Machine-readable — US EPA `httk` datatables** (GPL-3, ~58 KB of TSV, no
authentication, verified by Agent A and re-verified here). Every row carries its own
in-band citation: organ volumes cite ILSI-RSI 1994, organ blood flows cite Davies and
Morris 1993. This is the source to bake into the repo at build time. It reproduces GFR
125 mL/min and plasma volume 3.0 L exactly at 70 kg, and its liver fraction (25.9% of
cardiac output) matches ICRP's 25.5%.

**They disagree on one thing and it is worth knowing.** httk's allometric form gives a
cardiac output of 5.60 L/min at 70 kg; ICRP states 6.5 L/min for the 73 kg reference
male — a 14% gap. That is not an error in either: httk uses a sex-agnostic allometric
average, ICRP defines a single sex-specific reference individual. PilSim uses the ICRP
sex-specific BSA-scaled value as primary and keeps the httk form as a documented
fallback. **The engine must not mix them.**

Laboratory reference intervals come from the NBME Laboratory Values table (March 2025
edition), downloaded and text-extracted. It is a single, stable, citable document
covering every analyte the model uses, including plasma volume in mL/kg — which turned
out to be a useful independent check on the Nadler equation.

---

## 8. Binding to the rest of the build

`data/patient_model.json` carries a `rules_engine_binding` section that is the single
authoritative translation between Agent C's rule vocabulary (`labs.serum_k_mmol_l`,
`vitals.hr_bpm`, `phenotype.cyp2d6 = PM`) and this file's state-variable ids. Every
condition key Agent C's rules use is listed there and resolves either to a preset with
physiology or to an explicitly physiology-free boolean flag. Allergies, lactase
deficiency and galactosaemia are flags with **no** invented haemodynamics — that is
deliberate, not an omission.

Three notes for the other agents:

- **Agent C:** `phenotype.cyp3a4` will only ever return `NM`, because no CYP3A genotype
  is modelled. Key CYP3A interactions on co-medication class, not on phenotype. Also,
  `risk.fetal_toxicity` must render as a hard block, never as a percentage.
- **Agent E:** creatinine and eGFR are two views of one state. Integrate **creatinine**
  and recompute eGFR, or the twin drifts out of self-consistency within a few hundred
  time steps. Allometry: clearance scales as weight^0.75, volume as weight^1.0, but pick
  the right anchor per drug — lean body weight or total body water for hydrophilic
  lisinopril, total weight for lipophilic amlodipine and metoprolol.
- **Agent F:** the `machine_readable_physiology.organs` table gives every rendered organ
  a citable perfusion value that responds to the drug:
  `perfusion(t) = flow_per_kg^0.75 × weight^0.75 × CO(t)/CO(baseline)`. The
  `risk_channels` registry is the fixed list of adverse-effect channels to bind to.

---

## 9. Validity limits — read this before the demo

**Not modelled at all:** pulmonary circulation and right-heart mechanics; regional
autoregulation (organ flows are fixed fractions of cardiac output); acid–base chemistry
beyond a bicarbonate state; circadian blood-pressure variation; dietary sodium as an
input; any drug outside the five modelled substances, including background therapy;
adherence; pharmacodynamic tolerance beyond the explicit RAAS and baroreflex loops.

**Equations that become invalid at specific boundaries**, and what the UI should do:

| Equation | Invalid when | UI action |
|---|---|---|
| CKD-EPI 2021 | pregnancy; acute kidney injury / non-steady-state creatinine; extremes of muscle mass; non-IDMS-traceable assay | show greyed with a "not valid in this patient" badge — do **not** hide it |
| Watson TBW | morbid obesity; oedematous states including HFrEF congestion and pregnancy | flag as approximate |
| Nadler blood volume | pregnancy; extremes of BMI (use Lemmens above BMI 30) | flag as approximate |
| MAP = DBP + PP/3 | heart rate above ~100 bpm | none; error is a few mmHg |
| SV/PP compliance | significant aortic valve disease | none; lumped estimate by design |
| Janmahasatian LBW | BMI below ~16 | clamp and flag |

**Hard output clamps** are specified in the data file (systolic 40–300 mmHg, potassium
1.5–9.0 mmol/L, and so on). They sit just outside the range compatible with life, so a
clamp firing means a numerical failure, not a physiological extreme, and should raise a
visible engine warning. An unclamped model can render a negative blood pressure, and a
judge will see it.

**The single most misleading thing this model can output** is metoprolol in the HFrEF
preset. A beta-blocker acutely reduces cardiac output before it produces long-term
benefit. If the engine simulates only hours, metoprolol will look harmful in exactly
the patient population where it is prognostic therapy. Either simulate the chronic
reverse-remodelling arm, or say plainly in the UI that the acute run does not represent
the chronic benefit. This is the failure mode a cardiologist judge is most likely to
find.

---

## Cross-agent notes

**For Agent A (`01-DATA-ACQUISITION.md`)** — PharmGKB has moved: `pharmgkb.org` now
301-redirects to **`clinpgx.org`**. Verified 2026-08-17. Any recipe pointing at
pharmgkb.org URLs needs updating. Also worth adding as verified sources: the CPIC
frequency tables are plain XLSX at
`https://files.cpicpgx.org/data/report/current/frequency/<GENE>_frequency_table.xlsx`
(CYP2D6 is 426 KB, HTTP 200, no auth) and there is a live JSON API at
`https://api.cpicpgx.org/v1/population_frequency_view?genesymbol=eq.CYP2D6` (HTTP 200,
no auth). NCBI E-utilities `efetch` with `rettype=abstract&retmode=text` retrieves full
PubMed abstracts as plain text with no key, which is the most reliable way to get a
verbatim quote out of a paywalled paper — several sources in this file were verified
that way after WebFetch hit cookie walls. CDC (`cdc.gov/nchs`), Labcorp and NBME all
403 or block automated fetches to varying degrees; NBME yields to `curl -A "Mozilla/5.0"`
plus `pdftotext`.

**For Agent B (`substances.json`)** — two numbers this file depends on and could not
verify: the fraction of a losartan dose converted to E-3174 (widely quoted as ~14%) and
E-3174's relative AT1 potency (widely quoted as 10–40× losartan). Please confirm both
from the Cozaar label on DailyMed. Also: metoprolol's CYP2D6-mediated clearance fraction
is set to **0.80** in this model, calibrated to reproduce the observed 5× AUC increase
in poor metabolizers; if your PK record specifies a different `f_CYP2D6`, tell me rather
than letting the two files disagree. Volume-of-distribution scaling anchors matter —
please state per substance whether V scales on total weight, lean body weight or total
body water.

**For Agent E (`03-SIMULATION-SPEC.md`)** — a validated whole-body PBPK model of
metoprolol enantiomers with CYP2D6 drug-gene interaction is published in the Open
Systems Pharmacology repository (Rüdesheim 2020) if higher fidelity is ever wanted, and
`httk` itself is a validated open PBPK implementation under GPL-3. Also: the
`raas_activity` state variable is the mechanistic reason a thiazide plus a RAAS blocker
is more than additive — please model that loop rather than hard-coding a synergy
coefficient, because the loop generalises to combinations you have not tuned and a
coefficient does not.

**For Agent C (`rules.json`)** — three corrections your rules may want. (1) The 130/80
threshold is now general to all adults under 2025 AHA/ACC, not diabetes-specific. (2)
Beta-1-selective beta-blockade in COPD is graded caution, not contraindication; the
FEV₁ numbers are in the `asthma_copd` preset. (3) Per the 2023 AHA/ACC chronic coronary
disease guideline, beta-blockers are **not recommended** in chronic coronary disease
with LVEF above 50%, so CAD alone should not award metoprolol a compelling-indication
bonus in a patient with preserved ejection fraction.
