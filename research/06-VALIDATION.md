# 06 — Validation Suite & Known Failure Modes

**Owner:** Agent E · **Status:** COMPLETE · **All values retrieved 2026-08-17**
**Companion to:** `research/03-SIMULATION-SPEC.md` (the engine this validates)

> **This is a research simulator, not a clinical decision tool.** Passing every test below
> means the engine reproduces published *population averages*. It does not mean the engine
> can predict any individual's response, and it must never be used to prescribe.

---

## How to use this file

Every row is a test. Each has: an **ID**, the **input** to set up, the **assertion**, the
**published value**, the **source with URL**, and an **acceptance tolerance**.

**Turn these into `test/validation.test.ts` before writing the UI.** If the engine cannot
pass §1–§3, the numbers on screen are wrong and the demo is a liability. Tests are graded:

| Grade | Meaning | Action if failing |
|---|---|---|
| 🔴 **BLOCKER** | The engine is scientifically wrong | Do not demo. Fix or remove the feature. |
| 🟠 **MAJOR** | A visible number will be defensibly challengeable | Fix, or label the output as an estimate in the UI |
| 🟡 **ADVISORY** | Known model limitation; document it | Add a footnote in the report |

**Reference virtual subject `REF-1`** unless a test says otherwise: 55-year-old male,
70 kg, BMI 26, eGFR 90 mL/min/1.73 m², CYP2D6 normal metaboliser, CYP2C9 `*1/*1`, no
comorbidities, baseline **154/97 mmHg** (the Law 2003 trial-population mean — using it
makes every §2 tolerance tight, because no baseline-BP scaling is applied), HR 72 bpm,
CO 5.0 L/min, K⁺ 4.2 mmol/L, Na⁺ 140 mmol/L, urate 5.5 mg/dL.

---

## 1. Pharmacokinetics — single dose in `REF-1`

Sources: FDA product labels via DailyMed unless noted. All retrieved 2026-08-17.

| ID | Drug / dose | Quantity | Expected | Tolerance | Source |
|---|---|---|---|---|---|
| **PK-01** 🔴 | Lisinopril 10 mg PO | Tmax | *"peak serum concentrations … occur within about **7 hours**"* | 5–9 h | [Lisinopril SPL](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8f20acd7-2635-4a9b-b732-2a84ea93dea7) |
| **PK-02** 🔴 | Lisinopril 10 mg | Cmax | **40.7 ± 17.8 ng/mL** | 23–58 ng/mL (±1 SD) | Beermann et al., via label PK study |
| **PK-03** 🔴 | Lisinopril, repeated dosing | accumulation half-life | *"**effective half-life of 12 hours**"* / *"accumulation half-life averages **12.6 hours**"* | 10–15 h | Lisinopril SPL |
| **PK-03b** 🟠 | Lisinopril | terminal half-life | *"approximately **40 hours**"* — **but the label states this terminal phase "does not contribute to drug accumulation"** | engine must use **12 h** for accumulation; assert the model does NOT use 40 h | Lisinopril SPL |
| **PK-04** 🔴 | Lisinopril | bioavailability | *"approximately **25 %**, with large intersubject variability (**6 % to 60 %**)"* | F = 0.25; **the population sampler's F must span 0.06–0.60** (VAL-P03) | Lisinopril SPL |
| **PK-05** 🔴 | Losartan 50 mg × 7 d | parent Tmax | **0.9 h** (label: *"1 hour"*) | 0.5–1.5 h | [COZAAR SPL](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=9949448f-c3b9-44ee-94ed-c1aca8c90f39) |
| **PK-06** 🔴 | Losartan 50 mg × 7 d | parent Cmax | **224 ± 82 ng/mL** | 142–306 ng/mL | COZAAR SPL Table 2 |
| **PK-07** 🔴 | Losartan 50 mg × 7 d | **E-3174 Tmax** | **3.5 h** (label: *"3-4 hours"*) | 2.5–4.5 h | COZAAR SPL Table 2 |
| **PK-08** 🔴 | Losartan 50 mg × 7 d | **E-3174 Cmax** | **212 ± 73 ng/mL** | 139–285 ng/mL | COZAAR SPL Table 2 |
| **PK-09** 🔴 | Losartan | parent / metabolite t½ | **2.1 ± 0.70 h** / **7.4 ± 2.4 h** | 1.4–2.8 h / 5.0–9.8 h | COZAAR SPL Table 2 |
| **PK-10** 🔴 | Losartan 50 mg | **fraction of the AT1 effect carried by E-3174 at 24 h post-dose** | must be **> 90 %** | assert `w_m·C_m / (C_p + w_m·C_m) > 0.90` at t = 24 h | derived from `f_m` = 14 %, potency 10–40×, t½ 2 h vs 7.4 h (COZAAR §12.1/12.3). **This is the test that catches a single-species losartan model.** |
| **PK-10b** 🔴 | Losartan 50 mg, `w_m` (metabolite potency) | **uncertainty propagation** | label states **10–40×**, a 4-fold range. **Assert the engine does NOT silently use a single midpoint:** for N ≥ 50, `w_m` must be sampled log-uniform on [10, 40]; for N = 1, three runs at 10 / 20 / 40 must be reported as a band. | behavioural. **Also assert the §4 algebraic ranking is unchanged across all three `w_m` values** — the ranking is dose-based and must be immune to this uncertainty. | COZAAR SPL §12.1; flagged by Agent B1 as a least-confident value |
| **PK-11** 🔴 | Amlodipine 5 mg | Tmax | *"peak plasma concentrations between **6 and 12 hours**"* | 6–12 h | [NORVASC SPL](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=7367289c-b0b0-466a-83e2-558e2985c29f) |
| **PK-12** 🔴 | Amlodipine | terminal t½ | *"about **30–50 hours**"* | 30–50 h | NORVASC SPL |
| **PK-13** 🔴 | Amlodipine 5 mg once daily | **time to steady state** | *"Steady-state plasma levels … reached after **7 to 8 days** of consecutive daily dosing"* | assert Cmax(day 8) / Cmax(day 7) < 1.03 and Cmax(day 8)/Cmax(day 1) ≈ 3–4× | NORVASC SPL |
| **PK-13b** 🔴 | Amlodipine 10 mg once daily | **accumulation ratio, first dose → steady state** | **≈ 2.9×** | **2.4–3.4×**. Assert `Cmax(steady state) / Cmax(dose 1)` and that 90 % of steady state is reached at **7–8 days**. ⚠️ **This is the test that catches the accumulation bias (spec §6.1b): a 24 h run represents amlodipine at ~35 % of its chronic exposure while representing the other four drugs correctly, which silently biases the combination optimiser against amlodipine.** | Agent B1; NORVASC SPL (*"Steady-state plasma levels … reached after 7 to 8 days"*) |
| **PK-13c** 🔴 | Any regimen containing amlodipine | **ranking provenance** | the combination ranking and "best dose" output must be computed by `combinationRule()` (steady-state, dose-based), **never** from the final frame of a time-truncated ODE run | code assertion + behavioural: assert a 24 h run and a steady-state run produce the **same ranking** | spec §6.1b(a) |
| **PK-13d** 🟠 | Any regimen | **mode labelling** | every concentration and BP chart must display which mode it is in (`first_dose` vs `steady_state`), and `steady_state` must be the default | UI assertion. An unlabelled chart will be misread. | spec §6.1b(b),(c) |
| **PK-14** 🟠 | Amlodipine 5 mg | Cmax | **4.042 ± 1.147 ng/mL** | 2.9–5.2 ng/mL | Faulkner 1986 (peer-reviewed; **not in the FDA label**) |
| **PK-15** 🔴 | HCTZ 25 mg | Tmax | *"**2 to 5 hours**"* | 2–5 h | [HCTZ / Diovan HCT labels](https://dailymed.nlm.nih.gov/) |
| **PK-16** 🔴 | HCTZ | t½ | *"vary between **5.6 and 14.8 hours**"* | 5.6–14.8 h | HCTZ generic SPL |
| **PK-17** 🟠 | HCTZ 25 mg | Cmax | **142.0 ± 50.0 ng/mL** | 92–192 ng/mL | published PK study (no label Cmax) |
| **PK-18** 🔴 | HCTZ | fraction excreted unchanged | *"about **70 %** … eliminated in the urine as unchanged drug"* | `f_ru` = 0.70 ± 0.10; **assert clearance scales with eGFR accordingly** | HCTZ SPL |
| **PK-19** 🔴 | Metoprolol tartrate IR 100 mg | Tmax | **1.50 h** (label: *"1.5–2 hours"*) | 0.75–3.0 h | Lopressor SPL + PK study |
| **PK-20** 🔴 | Metoprolol tartrate IR 100 mg | Cmax | **154.6 ng/mL (CV 84 %)** | wide — assert 60–320 ng/mL | published PK study |
| **PK-21** 🔴 | Metoprolol tartrate IR | t½ (normal metaboliser) | *"**3 to 4 hours**"* | 3–4 h | [Lopressor SPL](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b5f4fed2-369c-4808-a682-8a5b8cfdbb4f) |
| **PK-22** 🔴 | Metoprolol tartrate IR | F | *"about **50 %** because of pre-systemic metabolism"* | 0.40–0.60 | Lopressor SPL |
| **PK-23** 🟠 | Metoprolol **succinate ER** 50 mg, steady state | Tmax | **6.1 ± 3.6 h** (label gives only *"longer time to peak"*) | 3–10 h | published PK study — **flag: label omits this** |
| **PK-24** 🔴 | Metoprolol succinate ER vs. tartrate IR, same daily dose | **peak-to-trough swing** | ER must be **materially flatter** than IR | assert `PTS(ER) < 0.5 · PTS(IR)`. **This is the test that makes the "best formulation type" claim defensible.** | ER label: *"average bioavailability … **77 % relative to** the corresponding single or divided doses of conventional metoprolol"* |

### 1a. Pharmacogenomic PK — the personalisation story

| ID | Setup | Assertion | Expected | Tolerance | Source |
|---|---|---|---|---|---|
| **PK-25** 🔴 | Metoprolol 100 mg, CYP2D6 **PM** vs **NM** | AUC ratio | **4.9×** (90 % CI 4.7–5.0). CPIC 2024: *"nearly five-fold increase in AUC"* | **4.0–5.5×** | [Blake 2013, PMC3818912](https://pmc.ncbi.nlm.nih.gov/articles/PMC3818912/) · [CPIC, PMC11502236](https://pmc.ncbi.nlm.nih.gov/articles/PMC11502236/) |
| **PK-26** 🔴 | same | Cmax ratio | **2.3×** (90 % CI 2.2–2.4) | 1.9–2.7× | Blake 2013 |
| **PK-27** 🔴 | same | t½ ratio | **2.3×**; label: PM t½ *"**7 to 9 hours**"* vs NM 3–4 h | PM t½ in 6–10 h | Blake 2013 + Lopressor SPL |
| **PK-28** 🟠 | Metoprolol, CYP2D6 **UM** vs **PM** | AUC ratio | **13×**; CL/F ratio **15×** | 10–16× | Blake 2013 |
| **PK-29** 🔴 | Metoprolol, PM | fraction excreted unchanged | *"less than 5 %"* (NM) vs *"up to **30 % or 40 %**"* (PM) | model need not reproduce this, but **must not** claim renal clearance is unchanged | Lopressor SPL |
| **PK-30** 🟠 | Losartan 50 mg, CYP2C9 `*3/*3` vs `*1/*1` | E-3174 AUC | *"the AUC₀–∞ of E-3174 … in CYP2C9\*3/\*3 subjects was **only 12 %** of that in CYP2C9\*1/\*1"* (n = 1) | 5–25 % — **wide, because n = 1** | [Bae 2011, PMC4010224](https://pmc.ncbi.nlm.nih.gov/articles/PMC4010224/) |
| **PK-31** 🟡 | Losartan, CYP2C9 `*2`/`*3` carriers vs `*1/*1` | E-3174 AUC mean difference | **−0.35 µg·h/mL (95 % CI −0.62 to −0.08)**; significant in Asian, **not significant in Caucasian** subgroups | direction only; **the UI must show a "contested evidence" badge** | [PMC8303964](https://pmc.ncbi.nlm.nih.gov/articles/PMC8303964/); contradicted by [Bae 2012, PMID 22735459](https://pubmed.ncbi.nlm.nih.gov/22735459/) |
| **PK-32** 🟠 | Losartan "non-converter" preset | conversion | *"**less than 1 % of the dose** compared to 14 % … in about **one percent** of individuals"* | `f_m < 0.01`; assert the BP response is < 30 % of normal | 2009 COZAAR label (removed from current version — **cite the archived label, say it is archived**) |
| **PK-33** 🟠 | Amlodipine + diltiazem 180 mg/day, elderly | amlodipine AUC | **+60 %** (FDA) — Health Canada says **+57 %**; **pick one, do not average** | 1.4–1.8× | NORVASC SPL §7 |
| **PK-34** 🟠 | Amlodipine, elderly subject | amlodipine AUC vs. young | *"decreased clearance … increase of AUC of approximately **40–60 %**"* | 1.3–1.7× | NORVASC SPL §8.5/12.3 |
| **PK-35** 🔴 | Metoprolol + a **strong CYP2D6 inhibitor** (paroxetine, fluoxetine, quinidine, propafenone) | phenoconversion | engine must set activity score **to 0** (treat as PM), per CPIC 2024 verbatim rule | exact behavioural assertion, not numeric | CPIC 2024 |
| **PK-36** 🔴 | Amlodipine + clarithromycin | **exposure** | engine must apply **NO exposure multiplier** — no labelled AUC ratio exists | assert `f_CYP == 1.0`; assert an **AKI outcome-risk flag** is raised instead (OR **1.61**, 95 % CI 1.29–2.02) | Gandhi, *JAMA* 2013;310(23):2544-2553, [PMID 24346990](https://pubmed.ncbi.nlm.nih.gov/24346990/). **This test exists specifically to prevent a fabricated fold-change.** |

---

## 2. Pharmacodynamics — blood pressure at standard dose

**Primary source for the whole section:** Law MR, Wald NJ, Morris JK, Jordan RE. *Value of
low dose combination treatment with blood pressure lowering drugs: analysis of 354
randomised trials.* BMJ 2003;326:1427.
<https://pmc.ncbi.nlm.nih.gov/articles/PMC162261/> — retrieved 2026-08-17.

Setup: `REF-1` at 154/97 mmHg, steady state (≥ 14 simulated days), placebo-subtracted.

| ID | Drug (dose = 1× standard) | ΔSBP expected | ΔDBP expected | Tolerance |
|---|---|---|---|---|
| **PD-01** 🔴 | Lisinopril 20 mg (ACE inhibitor) | **8.5** | **4.7** | **± 1.0 mmHg** |
| **PD-02** 🔴 | Losartan 50 mg (ARB) | **10.3** | **5.7** | ± 1.0 mmHg |
| **PD-03** 🔴 | Amlodipine 5 mg (CCB) | **8.8** | **5.9** | ± 1.0 mmHg |
| **PD-04** 🔴 | HCTZ 25 mg (thiazide) | **8.8** | **4.4** | ± 1.0 mmHg |
| **PD-05** 🔴 | Metoprolol 100 mg (β-blocker) | **9.2** | **6.7** | ± 1.0 mmHg |

### 2a. Dose–response shape — the test that proves dose escalation is modelled, not faked

| ID | Class | ½ std | 1× std | 2× std | Tolerance |
|---|---|---|---|---|---|
| **PD-06** 🔴 | Thiazide SBP | **7.4** | 8.8 | **10.3** | ± 1.0 mmHg each |
| **PD-07** 🔴 | β-blocker SBP | **7.4** | 9.2 | **11.1** | ± 1.0 |
| **PD-08** 🔴 | ACE inhibitor SBP | **6.9** | 8.5 | **10.0** | ± 1.0 |
| **PD-09** 🔴 | ARB SBP | **7.8** | 10.3 | **12.3** | ± 1.0 |
| **PD-10** 🔴 | CCB SBP | **5.9** | 8.8 | **11.7** | ± 1.0 |
| **PD-11** 🔴 | *shape assertion* | half-dose effect is *"about **20 %** less"* than standard-dose across all classes | assert `1 − E(0.5)/E(1.0)` ∈ **[0.15, 0.28]** for every class | — |
| **PD-12** 🔴 | *shape assertion* | **thiazide dose–response must be flat**: `E(2×) − E(1×) < 2.0 mmHg` | catches a linear-in-dose model | — |
| **PD-13** 🔴 | *shape assertion* | **CCB dose–response must be steep**: `E(2×) − E(1×) > 2.0 mmHg` | PD-12 and PD-13 together prove the model has per-class slopes, not one global slope | — |
| **PD-14** 🔴 | *guard* | dose = **8× standard** | engine must **clamp to 4× and set `extrapolated: true`** | behavioural assertion — see FM-01 |

### 2a-bis. ⭐ SATURATION — the tests that fail a linear implementation

**Why this matters more than it looks.** If dose–response is linear, the optimiser will
*always* select the maximum dose, and the product's headline "best dose" output becomes
trivially and visibly wrong. Agent F flagged this independently. These tests exist to make
a linear implementation impossible to ship.

| ID | Test | Expected | Tolerance |
|---|---|---|---|
| **SAT-01** 🔴 | ARB, ΔSBP from **¼ standard dose to 4× standard dose** | gain of only **≈ 2.7 mmHg** across a **16-fold** dose range | **1.5–4.5 mmHg.** A linear model spans ~40 mmHg here and fails by an order of magnitude. |
| **SAT-02** 🔴 | HCTZ, ΔSBP from **6.25 mg to 25 mg** | gain of **≈ 4.0 mmHg** across a 4-fold dose range | **2.5–5.5 mmHg** |
| **SAT-03** 🔴 | *second-derivative assertion*, every class | `E(2×) − E(1×) < E(1×) − E(0.5×)` — **each doubling must buy strictly less than the previous one** | strict inequality, all five classes. **This is the cleanest single test that the curve is concave.** A linear model gives equality; an exponential gives the reverse. |
| **SAT-04** 🔴 | *elasticity assertion* | `d(logE)/d(logD)` at the standard dose must be **< 0.5** for every class | i.e. a 100 % dose increase gives < 50 % effect increase. Values from the fits: thiazide 0.23, ACEi 0.26, ARB 0.32, β-blocker 0.29, CCB 0.49. |
| **SAT-05** 🔴 | *optimiser behaviour* | run the "best dose" search with an efficacy-only objective and no dose penalty | it **should** pick the max dose. Then add the §4.7 adverse-effect term and re-run: **it must no longer pick the max dose for thiazide or CCB.** If the answer does not change, the safety term is not wired in. |
| **SAT-06** 🔴 | *rank-order assertion* | at standard dose, rank the five classes by `E(2×) − E(1×)` | must be **CCB > β-blocker > ARB > ACEi > thiazide** — the per-class slope ordering from Law 2003. A single global slope produces a tie and fails. |

### 2a-ter. Structural PK/PD tests (added after Agent B1's findings)

| ID | Test | Expected | Tolerance | Source |
|---|---|---|---|---|
| **PD-18** 🔴 | Lisinopril 20 mg single dose | **time to 50 % of peak effect** vs **plasma Tmax** | effect onset **≈ 1 h**, plasma Tmax **≈ 7 h** — **effect must PRECEDE peak concentration** | strict ordering assertion. **A direct-effect model cannot pass this.** Also assert the concentration-vs-effect plot forms a **counter-clockwise hysteresis loop**, not a line. | Agent B1, `substances_part1.json`; requires the §3.4b effect compartment |
| **PD-19** 🔴 | Every drug in `substances.json` | **`t½ ≈ ln2 · V_d / CL`** | must hold within **± 25 %** | build-time assertion over the whole dataset. **This catches the losartan label's steady-state-vs-terminal volume inconsistency** (34 L / 12 L printed vs 109 L / 32 L derived) — with the label values, losartan clears ~3× too fast. | Agent B1 |
| **PD-20** 🟠 | Steady-state peak-to-trough ratio | amlodipine **1.30**, lisinopril **2.7**, EXP3174 **6.8**, losartan parent **≈ 2 000** | ± 30 % (± 3× for the losartan parent). **Also assert the UI's default plotted series for losartan is `exp3174`, not the parent** — the parent's 4-orders-of-magnitude swing destroys a shared axis. | Agent B1 |
| **PD-21** 🔴 | Population sampling of `F` | lisinopril **25 % (range 6–60 %, a 10× spread)** vs amlodipine **64–90 %** | assert lisinopril's sampled `F` coefficient of variation is **> 3×** amlodipine's. **Same virtual patient, radically different exposure uncertainty — this is worth surfacing in the UI as an uncertainty band, not hiding.** | Agent B1; lisinopril & NORVASC SPLs |

### 2b. Baseline-BP dependence

| ID | Setup | Assertion | Expected | Tolerance | Source |
|---|---|---|---|---|---|
| **PD-15** 🔴 | Any one drug, standard dose, baseline SBP **164** vs **154** | extra ΔSBP | **+1.0 mmHg** (95 % CI 0.7–1.2) per 10 mmHg higher pre-treatment SBP | 0.6–1.4 | Law 2003, verbatim |
| **PD-16** 🔴 | same, DBP **107** vs **97** | extra ΔDBP | **+1.1 mmHg** (0.8–1.4) | 0.7–1.6 | Law 2003 |
| **PD-17** 🔴 | `REF-1` modified to **normotensive 118/76** | ΔSBP on lisinopril 20 mg | must be **materially smaller** than 8.5 | assert **< 5.0 mmHg** and `SBP_final > 100`. **This is the single most important guard against nonsense output** — see FM-02 | Law 2003 scaling |

---

## 3. ⭐ Combination therapy — the crux tests

### 3a. Cross-class additivity

**Source:** Wald DS, Law M, Morris JK, Bestwick JP, Wald NJ. *Combination therapy versus
monotherapy in reducing blood pressure: meta-analysis on 11,000 participants from 42
trials.* Am J Med 2009;122(3):290–300. PMID 19272490. Abstract retrieved 2026-08-17 via
the Europe PMC REST API.

| ID | Test | Expected | Tolerance |
|---|---|---|---|
| **CO-01** 🔴 | For every cross-pathway pair of the 5 drugs at standard dose: `obs / (mono_a + mono_b)` | **1.01** (Wald overall observed/expected) | **0.90–1.12** (the published 95 % CI). Engine currently gives **0.967–0.971** ✅ |
| **CO-02** 🔴 | Thiazide alone vs. thiazide + another class | **7.3 → 14.6 mmHg** SBP | ± 2.0 mmHg on the combined value |
| **CO-03** 🔴 | β-blocker alone vs. + another class | **9.3 → 18.9** | ± 2.0 |
| **CO-04** 🔴 | ACE inhibitor alone vs. + another class | **6.8 → 13.9** | ± 2.0 |
| **CO-05** 🔴 | CCB alone vs. + another class | **8.4 → 14.3** | ± 2.5 (Wald's CCB ratio was the lowest at 0.89) |
| **CO-06** 🟡 | Ratio of *(gain from doubling one dose)* to *(gain from adding a second class)* | **0.22** (95 % CI 0.19–0.25) | **ADVISORY, wide tolerance 0.10–0.35.** The engine gives per-class 0.10–0.25, **mean 0.175 — below the published CI.** This is a *known, documented* discrepancy: Law's per-class slopes are shallower than Wald's pooled average implies, and the engine is faithful to Law. **Do not "fix" this by breaking PD-06…PD-10.** |
| **CO-07** 🔴 | *headline assertion* | adding a second class must give **≥ 3×** the gain of doubling one dose, for **every** drug in the set | the "approximately 5 times greater" claim; 3× is the conservative floor | Wald 2009 |
| **CO-08** 🔴 | **Half doses of two classes vs. double dose of one** | e.g. lisinopril ½ + HCTZ ½ = **13.8 mmHg** vs. lisinopril 2× = **9.9 mmHg** | low-dose combo must **win by > 2.5 mmHg**. This is the product's central clinical message. |

### 3b. Same-pathway sub-additivity — dual RAAS blockade

| ID | Test | Expected | Tolerance | Source |
|---|---|---|---|---|
| **CO-09** 🔴 | Lisinopril 20 mg + losartan 50 mg, **incremental** ΔSBP/ΔDBP over lisinopril alone | **+2.4 / +1.4 mmHg** | **SBP 1.0–4.5**, DBP 0.5–3.0. Engine gives **+2.57/+1.80** ✅ | ONTARGET, [Hypertension 2012](https://www.ahajournals.org/doi/10.1161/hypertensionaha.112.199562) |
| **CO-10** 🔴 | same | the increment must be **< 40 % of losartan's monotherapy effect** (10.3 mmHg) | assert `increment / 10.3 < 0.40`. **This is the test that catches a naively additive combination rule**, which would predict +10.3 — a 4× overstatement. | derived from ONTARGET |
| **CO-11** 🔴 | Ranking of all 10 two-drug pairs by ΔSBP | **lisinopril + losartan must rank LAST** | strict ordering assertion | emergent from CO-09 |

### 3c. Cross-class sub-additivity — β-blocker + RAS inhibitor

| ID | Test | Expected | Tolerance | Source |
|---|---|---|---|---|
| **CO-12** 🟡 | Metoprolol added on top of lisinopril or losartan, incremental ΔSBP | published add-on value **−2.9 (95 % CI −4.3 to −1.5)** vs. **−10.2 (−14.2 to −6.2)** when added to a diuretic | **ADVISORY.** The engine treats these as separate pathways and gives a near-additive result. **Known limitation — document it.** See FM-06. Acceptance: engine's β-blocker+RASi increment must be **≤** its β-blocker+thiazide increment. | [PMC9994166](https://pmc.ncbi.nlm.nih.gov/articles/PMC9994166/) |

---

## 4. Non-BP physiological endpoints

| ID | Setup | Endpoint | Expected | Tolerance | Source |
|---|---|---|---|---|---|
| **VAL-01** 🔴 | Metoprolol tartrate 50 mg b.i.d. (100 mg/day), 2 weeks, CYP2D6 **normal** metaboliser | Δ resting heart rate | **−7.1 ± 5.6 bpm** | **−4 to −11 bpm** | [PEAR-2, PMC7762806](https://pmc.ncbi.nlm.nih.gov/articles/PMC7762806/) (n = 227) |
| **VAL-02** 🔴 | same, CYP2D6 **poor** metaboliser | Δ resting heart rate | **−13.7 ± 4.7 bpm**; CPIC: *"approximately **3–8 beats/min**"* additional reduction vs NM | PM must be **3–9 bpm lower** than NM | PEAR-2 + CPIC 2024 |
| **VAL-03** 🔴 | same, CYP2D6 **poor** metaboliser | additional ΔSBP / ΔDBP vs NM | CPIC verbatim: *"approximately **3–6 mmHg** systolic; **2–6 mmHg** diastolic"* | SBP **2–7 mmHg**, DBP **1.5–7 mmHg** additional | [CPIC 2024, PMC11502236](https://pmc.ncbi.nlm.nih.gov/articles/PMC11502236/) |
| **VAL-04** 🟠 | Metoprolol succinate ER 100 mg once daily | Δ **exercise** heart rate, peak / trough | **16 % / 10 %** reduction (label dose–response: 14/9, 16/10, 24/14, 27/22, 27/20 % for 50/100/200/300/400 mg) | ± 6 percentage points | [Metoprolol succinate SPL](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=1806dadd-9ebb-46ee-9b86-f153e6db3b48) |
| **VAL-05** 🔴 | HCTZ **25 mg**/day, steady state | Δ serum K⁺ | **−0.30 mmol/L (95 % CI −0.36 to −0.24)** | **−0.20 to −0.42** | [Cochrane, PMC10612990](https://pmc.ncbi.nlm.nih.gov/articles/PMC10612990/) |
| **VAL-06** 🔴 | HCTZ **12.5 mg** and **50 mg**/day | Δ serum K⁺ | **−0.16 (−0.21, −0.11)** and **−0.48 (−0.68, −0.29)** | ± 0.12 mmol/L. **Together with VAL-05 this asserts a monotonic dose–K⁺ relationship** | Cochrane |
| **VAL-07** 🔴 | HCTZ 25 mg/day | Δ serum urate | **+32.9 µmol/L (26.1–39.7) ≈ +0.55 mg/dL** (pooled 3–100 mg/day); dose predicted to raise urate 36 µmol/L is **12.3 mg** | **+0.30 to +0.90 mg/dL** | [Peterzan 2012, PMC4930655](https://pmc.ncbi.nlm.nih.gov/articles/PMC4930655/) |
| **VAL-08** 🔴 | Losartan 50 mg/day | Δ serum urate | **−0.29 mg/dL (95 % CI −0.46 to −0.12)** placebo-controlled; *"This modest biochemical effect (~0.3 mg/dL)"* ≈ −17 µmol/L | **−0.10 to −0.60 mg/dL**. ⚠️ Head-to-head Chinese network meta-analyses report far larger values (e.g. 106.88 µmol/L vs. enalapril) — **use the placebo-controlled figure** | [Hypertens Res 2026, PMID 42458015](https://europepmc.org/article/MED/42458015) |
| **VAL-08b** 🔴 | Losartan + HCTZ together | Δ serum urate | must be **less positive** than HCTZ alone (the two terms have opposite sign) | assert `Δurate(combo) < Δurate(HCTZ)` — the mechanism behind the losartan/HCTZ fixed-dose product | VAL-07 + VAL-08 |
| **VAL-09** 🔴 | Amlodipine 5–10 mg, **chronic oral**, steady state | Δ heart rate | label: *"chronic oral administration … did not lead to clinically significant changes in heart rate"*; ASCOT measured **−1.3 (SD 12.1) bpm** | **−4 to +3 bpm.** ⚠️ **Fails if the model animates reflex tachycardia** — that is the *intravenous* pharmacology | [NORVASC SPL §12.2](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=7367289c-b0b0-466a-83e2-558e2985c29f) · ASCOT PMID 19761936 |
| **VAL-10** 🔴 | Amlodipine, peripheral oedema incidence by dose | 2.5 mg **1.8 %**, 5 mg **3.0 %**, 10 mg **10.8 %**, placebo **0.6 %** | ± 2 percentage points; **must be strongly supra-linear in dose** | NORVASC SPL adverse-reaction table (N = 275/296/268/520) |
| **VAL-11** 🟠 | Lisinopril 20 mg | Δ serum K⁺ | *"the mean increase in serum potassium was approximately **0.1 mEq/L**"* (normal renal function, up to 24 weeks) | **+0.05 to +0.25 mmol/L** | Lisinopril SPL |
| **VAL-12** 🟠 | Lisinopril | hyperkalaemia incidence (K⁺ > 5.7 mEq/L) | **2.2 %** in hypertension, **4.8 %** in heart failure | ± 2 percentage points | Lisinopril SPL |
| **VAL-13** 🟠 | Lisinopril | cough incidence | label gives only the placebo-subtracted excess: *"cough (by **2.5 %**)"*. ⚠️ **An absolute lisinopril-vs-placebo cough percentage is NOT_FOUND in any current FDA label.** Context: a randomised pilot found 9.1 % vs 6.1 %; a 2025 review cites 5–35 % | assert the **excess over placebo is 1.5–4 %**. Do not assert an absolute rate. | Lisinopril SPL |
| **VAL-14** 🔴 | **Engine self-consistency** | \|ΔSBP(algebraic rule, §4.4) − ΔSBP(ODE steady state, §5)\| for every 1- and 2-drug regimen | must be **< 2.0 mmHg** | if this fails, the ODE parameterisation has drifted — recalibrate per §5.4 |
| **VAL-15** 🔴 | **Determinism** | run the same regimen + subject + seed twice | byte-identical results | zero tolerance. A judge asking "run it again" must get the same answer. |

---

## 5. Comorbidity-driven differences

These are the tests that prove the "digital twin" is doing something. Each compares
`REF-1` against `REF-1 + one comorbidity`.

| ID | Comorbidity applied | Assertion | Expected direction / value | Tolerance | Source |
|---|---|---|---|---|---|
| **CM-01** 🔴 | **Pregnancy** + lisinopril or losartan | run must be **REJECTED**, not merely warned | boolean | zero tolerance — this is the flagship safety demo | Both labels carry a boxed warning on fetal toxicity |
| **CM-02** 🔴 | **Gout** (urate 8.0 mg/dL) + HCTZ 25 mg | urate must rise into a flagged range and the regimen must be **downgraded/warned** | urate → ~8.55 mg/dL, warning raised | VAL-07 tolerance | Peterzan 2012 |
| **CM-03** 🔴 | **Gout** + losartan | must **NOT** be flagged; urate should **fall** | −0.29 mg/dL | VAL-08 tolerance | VAL-08. **CM-02 and CM-03 together are the strongest single demo of drug-specific reasoning in the product.** |
| **CM-04** 🔴 | **Asthma** + metoprolol 25 mg vs. 200 mg | the bronchial risk index must be **materially higher at 200 mg** | assert `θ_B2(200 mg) > 2 × θ_B2(25 mg)` and that only the high dose crosses the warning threshold | behavioural | FDA label: *"Increases in plasma concentration decrease the cardioselectivity of metoprolol"* (§3.5 of the spec) |
| **CM-05** 🔴 | **Asthma + CYP2D6 poor metaboliser** + metoprolol 100 mg | must reach the same warning level as a normal metaboliser on a much higher dose | assert warning fires at 100 mg for PM but not for NM | derived from PK-25 (≈ 5× AUC) + label statement that PM status *"decreas[es] metoprolol's cardioselectivity"* |
| **CM-06** 🔴 | **CKD, eGFR 30** + lisinopril 20 mg | lisinopril exposure must rise substantially (it is *"excreted unchanged entirely in the urine"*) | AUC ≈ **2.5–3×** that at eGFR 90 | 2.0–3.5× | Lisinopril SPL; `f_ru = 1.0` in §3.3 |
| **CM-07** 🔴 | **CKD, eGFR 30** + amlodipine 5 mg | exposure must be **essentially unchanged** | AUC ratio **0.9–1.15** | label verbatim: *"The pharmacokinetics of amlodipine are **not significantly influenced by renal impairment**. Patients with renal failure may therefore receive the usual initial dose."* |
| **CM-08** 🔴 | **CKD, eGFR 30** + losartan 50 mg | exposure rises but **no dose cap is applied** | AUC **+50–90 %** at CrCl 30–74; **assert the engine emits NO milligram cap** | COZAAR SPL: *"No adjustment necessary."* ⚠️ **Do not encode a numeric renal mg cap for losartan — the label gives none.** A great teaching moment for the report: altered PK ≠ altered dosing. |
| **CM-09** 🟡 | **CKD, eGFR 25** + HCTZ 25 mg | thiazide efficacy | **CONTESTED — this test must document the conflict, not pick a winner.** Classic: 2017 ACC/AHA *"thiazides should be avoided … GFR < 30"*; 2018 ESC/ESH *"less effective … eGFR < 45 … ineffective when the eGFR is < 30."* Contradicted by **CLICK (NEJM 2021, n=160, mean eGFR 23.2)**: chlorthalidone gave **−10.5 mmHg (95 % CI −14.6 to −6.4)** 24-h SBP vs placebo in stage-4 CKD; a 5-trial meta-analysis (mean GFR 13–26.8) found **−6.18 mmHg (−7.77 to −4.59)**. | Acceptance: engine may apply an efficacy reduction of **0–50 %** at eGFR < 30, **and the UI must show both positions with citations.** Also assert the hypokalaemia risk rises (CLICK: 10 % vs 0 %). | [Teles 2023, PMC9848247](https://pmc.ncbi.nlm.nih.gov/articles/PMC9848247/) · [CLICK, PMC9119310](https://pmc.ncbi.nlm.nih.gov/articles/PMC9119310/) · [Minutolo 2022, PMC9871852](https://pmc.ncbi.nlm.nih.gov/articles/PMC9871852/) |
| **CM-10** 🔴 | **Type 2 diabetes + albuminuria** + lisinopril **and** losartan together | must raise **hyperkalaemia and AKI** risk, and report **no outcome benefit** | VA NEPHRON-D (this exact pairing: losartan 100 mg + lisinopril 10–40 mg): hyperkalaemia **6.3 vs 2.6 events/100 person-yr**; AKI **12.2 vs 6.7**; primary endpoint HR **0.88 (0.70–1.12)**; *"stopped early owing to safety concerns"* | assert risk ratios ≈ **2.4×** (K⁺) and **1.8×** (AKI), ± 50 % | NEJM 2013, [PMID 24206457](https://pubmed.ncbi.nlm.nih.gov/24206457/) |
| **CM-11** 🔴 | any dual-RAAS regimen | severity label | must be **"AVOID / high-severity warning"**, **NOT** `CONTRAINDICATED` | exact string assertion. Labels say *"In general, avoid combined use of RAS inhibitors"*; **"do not co-administer" is reserved for aliskiren in diabetes.** | Lisinopril & COZAAR SPL §7.4 |
| **CM-12** 🔴 | any dual-RAAS regimen | eGFR threshold | engine must emit **no numeric eGFR threshold** for ACEi+ARB | assert absent. The `< 60 mL/min` figure in those labels is **aliskiren-specific** — NOT_FOUND for ACEi+ARB. | Lisinopril & COZAAR SPL |
| **CM-13** 🔴 | **Diabetes** + metoprolol | must warn about masked hypoglycaemia | boolean | label §5.6: *"Beta-blockers may prevent early warning signs of hypoglycemia, such as tachycardia"* | Lopressor SPL |
| **CM-14** 🟠 | **Elderly (≥ 75)** + amlodipine | starting dose recommendation | must recommend **2.5 mg**, not 5 mg | exact | NORVASC SPL §2: *"Small, fragile, or elderly … Start 2.5 mg once daily"* |
| **CM-15** 🟠 | **Hepatic impairment** + losartan | exposure and starting dose | losartan/metabolite plasma concentrations **5× and 1.7×** healthy; clearance **~50 % lower**; F **~doubled**; start **25 mg** | ± 50 % on the fold-changes; exact on the 25 mg | COZAAR SPL |
| **CM-16** 🟠 | **Hepatic impairment** + amlodipine | half-life | **56 hours** | 45–70 h | NORVASC SPL |
| **CM-17** 🔴 | **Obesity** preset | baseline haemodynamics | **SVR must FALL by ≈ 20 %** — obesity is a **high-output, low-resistance** state | ± 10 percentage points. ⚠️ **This corrects the team's §1.3 draft**, which claimed "higher CCB response typical" in obesity. A *lower* baseline SVR does not straightforwardly imply a larger CCB response, and the draft's claim should not be asserted. Agent D flags obesity haemodynamics as one of its own least-confident items — treat the magnitude as soft, the **direction as firm**. | Agent D, `02-VIRTUAL-HUMAN.md` §preset notes |
| **CM-18** 🔴 | **Type 2 diabetes** preset | plasma volume | must be **unchanged** | zero tolerance. ⚠️ **Correction: type 2 diabetes does NOT expand plasma volume.** Any model or preset that expands it is wrong. | Agent D |
| **CM-20** 🔴 | **Obesity** + HCTZ vs. **obesity** + amlodipine | relative efficacy | ⚠️ **The team's §1.3 draft is INVERTED here.** ACCOMPLISH found the **hydrochlorothiazide arm performed best in obese patients**, with amlodipine's advantage confined to **non-obese** patients. **Assert the engine does NOT apply a thiazide efficacy penalty in obesity.** | assert `pd_multiply(thiazide, obesity) ≥ 1.0` | Agent C, `rules.json` / ACCOMPLISH |
| **CM-21** 🔴 | **Asthma** vs. **COPD** + metoprolol | respiratory effect | **Keep these as two distinct rules — do NOT average them.** Asthma: **−6.9 % FEV₁**, CI **not** crossing zero. COPD: **−2.05 %**, CI **does** cross zero. Genuinely different populations. | assert two separate rule ids fire (`RX-ASTHMA-METOPROLOL` vs `RX-COPD-METOPROLOL-NO-CARDIAC-INDICATION`) with **different severities**, and that neither uses a pooled value | Agents C and D produced different numbers and deliberately kept them separate |
| **CM-22** 🔴 | **Heart failure** + metoprolol **tartrate** vs **succinate** | indication | **Metoprolol tartrate must NOT be recommended for heart failure. Only metoprolol succinate ER carries that indication.** Salt form determines indication. | strict boolean; **assert the two are separate products in `products.json`**. If the engine treats "metoprolol" as one substance it will produce a clinically false recommendation. | Agent C |
| **CM-19** 🟡 | **CKD** and **heart failure** presets | plasma volume, SVR (CKD); HR, renal blood flow (HF) | Agent D flags these as **least-confident / NOT_FOUND quantitatively**: *"CKD plasma-volume and SVR expansion: NOT_FOUND quantitatively. Direction certain."* | **ADVISORY only — assert direction, not magnitude.** Do not write a tight numeric test against a value Agent D has marked soft. | Agent D |

---

## 5a. Target-engagement and counter-regulation tests (the animation contract)

These validate the `EffectFrame.engagement.*` and `mediators.*` fields that
`04-ORGAN-EFFECT-MAP.md` binds the animation to. Without them the animation is decoration.

| ID | Test | Expected | Tolerance | Source |
|---|---|---|---|---|
| **EN-01** 🔴 | Metoprolol 100 mg b.i.d., steady state | `beta1_occupancy` / `beta2_occupancy` | **0.54–0.92** / **0.06–0.38** | must fall inside those bands | Agent F, `04-ORGAN-EFFECT-MAP.md` [S12] |
| **EN-02** 🔴 | same | `selectivity_ratio = β1/β2` | **≈ 4.6** | 2.5–9.0 | derived from EN-01 |
| **EN-03** 🔴 | Metoprolol dose sweep 25 → 400 mg | `selectivity_ratio` | must **fall monotonically towards 1.0** | strict monotone decrease. **This is the selectivity-loss animation; if the ratio is constant, the two occupancies share one EC50 and the feature is fake.** | FDA label: *"Increases in plasma concentration decrease the cardioselectivity of metoprolol"* |
| **EN-04** 🔴 | Losartan 50 mg, single dose | time of peak `urat1_inhibition` vs. time of peak `at1_blockade` | **≈ 1 h vs ≈ 3.5 h** — they must **not** peak together | separation **> 1.5 h**. `urat1_inhibition` is **parent-driven**; `at1_blockade` is **parent + EXP3174**. If they peak together, the metabolite is not modelled separately and PK-10 will also fail. | COZAAR SPL Table 2 (Tmax 0.9 h parent, 3.5 h metabolite) + Agent F [S15] |
| **EN-05** 🔴 | Losartan 100 mg, steady state | `mediators.renin_pra_fold` | **2.0–3.0×** baseline (*"doubles to triples"*) | 1.7–3.5× | Agent F `04-ORGAN-EFFECT-MAP.md` [S3] |
| **EN-06** 🔴 | Losartan 100 mg, steady state | `renin_pra_fold` rises **while** `ang_ii_fold` at the vasculature and SBP both **fall** | sign assertion: PRA ↑, effective AngII ↓, SBP ↓ **simultaneously** | strict. **This is the counter-regulation demo. If PRA does not rise while BP falls, the model has no feedback and a clinician judge will see it immediately.** | §8.6c |
| **EN-07** 🔴 | Metoprolol 100 mg | `renin_pra_fold` | must be **< 1.0** — β-blockers *lower* renin | strict `< 0.85`. Opposite sign to EN-05, and the mechanistic reason β-blocker + RASi is partly redundant. | §8.6c |
| **EN-08** 🔴 | HCTZ 25 mg | `renin_pra_fold` | must be **> 1.0** (thiazide-induced renin activation) | 1.15–1.8× | §8.6c, magnitude `ESTIMATED` |
| **EN-09** 🔴 | Lisinopril 20 mg vs. losartan 50 mg | `mediators.bradykinin_fold` | lisinopril **> 1.5×**, losartan **= 1.00 exactly** | strict. This is why cough is an ACE-inhibitor channel and not an ARB one — the single cleanest class-contrast in the whole product. | §8.6a |
| **EN-10** 🔴 | Amlodipine 10 mg | `cav12_block_myocardium` vs `cav12_block_vsmc` | myocardial must be **< 5 %** of vascular | amlodipine is vascular-selective | Agent F: *"near 0 for amlodipine"* |
| **EN-11** 🔴 | Each drug alone, steady state, same ΔSBP normalised | **the internal route must differ** | amlodipine: ΔSVR dominant, ΔHR ≈ 0. HCTZ: Δplasma-volume → ΔSV dominant. Metoprolol: ΔHR and Δcontractility dominant. RAAS drugs: ΔSVR with ΔPRA ↑. | assert the largest-contributing haemodynamic term differs across all four mechanism groups. **If they all reduce BP the same way, the animation has no reason to exist.** | Agent D, `02-VIRTUAL-HUMAN.md` §2 |
| **EN-12** 🔴 | Baroreflex | Δ heart rate per mmHg fall in MAP, at HR 70 | **−1.23 bpm/mmHg** | ± 0.25 | **Agent D's derived value** (from ~15 ms R-R/mmHg baroreflex sensitivity) — use theirs, do not invent one |
| **EN-13** 🟠 | `EffectFrame` completeness | every field in `04-ORGAN-EFFECT-MAP.md` §2 is present, correctly typed and unit-correct, with a `provenance` tier of COMPUTED / DERIVED / PROXY | schema assertion | zero missing fields; **no PROXY field may be rendered with absolute units** | §8.6a |

---

## 6. Population / variability tests

| ID | Test | Expected | Tolerance |
|---|---|---|---|
| **VAL-P01** 🔴 | N = 200 virtual subjects, lisinopril 20 mg | mean ΔSBP | must match PD-01 within **± 1.0 mmHg** |
| **VAL-P02** 🔴 | same | SD of ΔSBP | **8–12 mmHg**. Under 4 → residual error term missing. Over 20 → CVs too high. |
| **VAL-P03** 🔴 | same | 5th–95th percentile of sampled `F` for lisinopril | must span roughly **0.06–0.60** (the label's stated intersubject range) | ± 30 % on each bound |
| **VAL-P04** 🔴 | same | fraction of non-responders (ΔSBP < 3 mmHg) | **10–25 %**. **A population where everyone responds is the signature of a fake simulation.** |
| **VAL-P05** 🔴 | N = 200, metoprolol 100 mg, CYP2D6 sampled | AUC histogram | must be **visibly multimodal** — assert dip statistic or simply that the PM subgroup mean is ≥ 4× the NM subgroup mean | per PK-25 |
| **VAL-P06** 🔴 | any drug, N = 200 | `Cmax` and `AUC` distributions | must be **right-skewed** (log-normal). Assert skewness > 0.3. A symmetric AUC histogram means normal sampling was used by mistake. |
| **VAL-P07** 🟠 | N = 200, subject correlations | no subject may have `t½ = V_d/CL` outside **0.2×–5×** the population value | catches an uncorrelated `CL`/`V_d` draw producing impossible people |
| **VAL-P08** 🔴 | N = 50 vs N = 200 vs N = 1000, same seed prefix | mean ΔSBP | all three within **± 1.5 mmHg** of each other. Proves 200 is sufficient and that "more subjects" is not buying accuracy. |

---

## 7. Long-horizon (5-year) tests

**Source:** Ettehad D, Emdin CA, et al. Lancet 2016;387:957–967, PMID 26724178.

| ID | Test | Expected | Tolerance |
|---|---|---|---|
| **LH-01** 🔴 | ΔSBP = 10 mmHg sustained | RR major CV event | **0.80** (95 % CI 0.77–0.83) | exact to 2 dp |
| **LH-02** 🔴 | ΔSBP = 10 mmHg | RR stroke / CHD / heart failure / all-cause death | **0.73 / 0.83 / 0.72 / 0.87** | exact to 2 dp |
| **LH-03** 🔴 | ΔSBP = 20 mmHg | RR major CV event | **0.80² = 0.64** | ± 0.02 — asserts the exponential form `RR^(Δ/10)` |
| **LH-04** 🔴 | ΔSBP = 0 | RR | **1.00** exactly | zero tolerance |
| **LH-05** 🔴 | any 5-year projection | output shape | must be a **band, never a point** — assert the response contains lower/upper bounds derived from the published CIs |
| **LH-06** 🔴 | adherence = 0.7 | ΔSBP_sustained | must be **0.7 ×** the full value, and the report must say adherence was assumed | behavioural |
| **LH-07** 🟠 | 5-year run | CPU time | must **not** integrate 5 years — assert total integration steps < 50 000 | per §6.2 |

---

## 8. Cloudflare / engineering tests

| ID | Test | Expected | Tolerance |
|---|---|---|---|
| **CF-01** 🔴 | Single-subject acute run (72 h, Δt = 1 min) | CPU time | **< 500 ms** (est. 30–120 ms). Measure with `wrangler dev` + DevTools CPU profiling |
| **CF-02** 🔴 | N = 200 population run | must complete without an `exceededCpu` error | requires `"limits": { "cpu_ms": 300000 }` and chunked alarm continuation (§8.5) |
| **CF-03** 🔴 | N = 1000 population run | must chunk across ≥ 2 alarm invocations and still complete | asserts the continuation logic actually works — **test it, do not assume it** |
| **CF-04** 🔴 | Kill the WebSocket mid-run, reconnect | must replay missed frames from DO SQLite and complete | venue-network insurance |
| **CF-05** 🔴 | Whole app, network disabled except the Worker origin | must run end to end | proves zero live third-party API dependency |
| **CF-06** 🔴 | grep `src/engine/` for `ic50`, `ki_nM`, `kd_nM` | **zero matches** | the §1 potency-trap guard |
| **CF-07** 🟠 | Worker bundle size | < 10 MB gzip (Paid) / < 3 MB (Free) | the bundled JSON datasets are a few hundred KB — large headroom |
| **CF-08** 🔴 | Deploy on Workers **Free** | **expected to fail** the 10 ms CPU limit | documents that Workers **Paid is a hard prerequisite** |

---

## 9. Known failure modes — inputs that produce nonsense, and what the UI must do

Every row here is a real boundary of this model. **The UI behaviour column is not optional
polish — it is the difference between an honest simulator and a misleading one.**

| ID | Failure mode | What the model does wrong | Detection | **Required UI behaviour** |
|---|---|---|---|---|
| **FM-01** | **Dose far outside 0.25×–4× standard** | The Emax fit (§4.1) is an interpolation over 3 points spanning ½×–2× standard. `Emax` is a curve-fit asymptote, not a physiological maximum. At 20× standard it returns a confident, meaningless number. | `D < 0.25` or `D > 4.0` | **Clamp to the bound, render the dose–response curve hatched/greyed outside the window, and print "outside the validated dose range — result is an extrapolation." Never present `Emax` to the user as "the maximum possible effect."** |
| **FM-02** | **Normotensive or hypotensive virtual subject** | Without baseline scaling the model would drop a healthy 118/76 subject by a full 9 mmHg per drug and, on a triple regimen, below 90/60. | `SBP_pre < 130` | Baseline scaling (§4.5a) handles the magnitude. **Additionally: show a banner "this subject is not hypertensive; antihypertensive efficacy data does not apply," and disable the 'recommend' output entirely.** The engine may still simulate; it must not advise. |
| **FM-03** | **Blood pressure driven below the physiological floor** | Multi-drug regimens at high doses can push the algebraic sum past what the body tolerates. | `MAP < 60`, `SBP < 90`, `DBP < 50` | Clamp (§5.6), set `hypotension_floor_hit`. **The result must be rendered with a distinct "constrained" visual treatment, and the report must state that the simulation hit a physiological limit — never present a clamped number as a clean prediction.** |
| **FM-04** | **eGFR near zero / dialysis** | `f_renal` floors at 0.1, so lisinopril clearance stops falling. Real anuric patients accumulate ACE inhibitors far more. HCTZ pharmacodynamics are also not modelled at all below eGFR ~15. | `eGFR < 15` | **Refuse to produce a dose recommendation. Show "advanced kidney disease is outside this model's validated range."** Dialysis is entirely unmodelled — say so explicitly. |
| **FM-05** | **Extreme body weight** | Allometric `(WT/70)^0.75` is fitted around normal adults. At 25 kg or 200 kg it extrapolates, and no body-composition model corrects `V_d` for adipose vs lean mass. | `WT < 40` or `WT > 150` kg | Warn; flag PK outputs as extrapolated. **Paediatric subjects must be blocked outright** — amlodipine's label says *"Effect on patients less than 6 years old is not known"* and none of this engine's PD data comes from children. |
| **FM-06** | **β-blocker + RAS inhibitor is modelled as fully additive** | Real add-on data suggests the increment is smaller (−2.9 mmHg on a RASi vs −10.2 on a diuretic). The engine's pathway graph does not represent β1-mediated renin suppression in the *algebraic* rule (the ODE does, partially). | any regimen containing metoprolol + lisinopril/losartan | **Show a footnote: "combining a β-blocker with a RAS inhibitor may be less effective than this estimate — the two act partly through the same pathway."** Do not let this pair win the top-ranked slot without that caveat. |
| **FM-07** | **Same-pathway ceilings are `ESTIMATED`** | `C_RAAS = 11.5 mmHg` is calibrated to a single trial's increment (ONTARGET). It is the least evidence-backed constant in the engine, and it is the one that decides the dual-RAAS answer. | always | Report dual-RAAS efficacy as a **range**, not a point. State the calibration source in the methods panel. |
| **FM-08** | **Three or more drugs** | Every source meta-analysis is about **one or two** drugs. Triple therapy is an extrapolation of the pooling rule, validated by nothing in this file. | `regimen.length ≥ 3` | **Show "three-drug regimens are extrapolated beyond the validating evidence."** Do not present a triple-therapy number with the same confidence as a pair. |
| **FM-08b** | **Short-horizon runs understate amlodipine specifically** | Amlodipine accumulates 2.9× over 7–8 days; the other four drugs are at steady state within a day. A 24 h run therefore shows amlodipine at ~35 % of its chronic effect **while showing the others correctly** — a *selective* distortion that biases any comparison against amlodipine and looks entirely plausible on screen. | `mode == 'first_dose'` **and** the regimen contains amlodipine **and** the user is comparing regimens | **Default to `steady_state` (spec §6.1b). If the user opts into `first_dose`, disable regimen comparison and ranking, and show "first-dose kinetics — amlodipine has not yet accumulated; not comparable to the other drugs at this time point."** Never let a ranked recommendation come from a truncated trace. |
| **FM-09** | **Time horizons beyond ~3 weeks** | The ODE reaches steady state and then does nothing. There is no disease progression, no drug tolerance, no vascular remodelling, no aging. A 6-month "simulation" is a flat line. | `horizon > 21 d` in acute mode | **Switch automatically to chronic mode (§6.2) and say so.** Never draw a flat 6-month ODE trace as if it were a simulation result. |
| **FM-10** | **The 5-year prognosis applied to a synthetic individual** | Ettehad's relative risks come from randomised trial *populations* over ~4 years. Applying them to a user-invented individual is a double extrapolation (population → individual, and 4 y → 5 y). | always, in chronic mode | **Mandatory on-screen text, per `05-OUTPUT-REPORT-SPEC.md`.** Report as a band. Never as "your risk is X %." |
| **FM-11** | **Zero dose / empty regimen** | Emax at `D = 0` returns 0, which is correct, but downstream ratio calculations divide by it. | `D = 0` or empty regimen | Return a valid placebo trace with `ΔBP = 0` and no NaNs. **Test this explicitly** — it is the most common crash in this class of model. |
| **FM-12** | **Numerical divergence** | RK4 at Δt = 1 min is stable for the shipped parameters, but a user-edited physiological parameter (e.g. a very low `τ`) can destabilise it. | any state `NaN` or outside ±10× baseline | **Abort with `integrator_diverged` and the step index. Show "the simulation became numerically unstable with these parameters." Never render a partial diverged trace.** |
| **FM-13** | **`ka ≈ ke` flip-flop** | The Bateman closed form divides by `(ka − ke)`. HCTZ and metoprolol have values close enough that a sampled subject can land near the singularity. | `\|ka − ke\| < 0.01 h⁻¹` | Use the limiting form (§3.1). **Test with a deliberately constructed subject at the singularity.** |
| **FM-14** | **Excipient-driven effects are not simulated** | Lactose, dyes, sodium content etc. appear in `substances.json` and can raise safety flags, but have **no pharmacokinetic or pharmacodynamic effect in this engine.** | always | The Pills page may show excipient warnings; the simulation panel must not imply excipients changed the curve. **Say "excipient effects are checked as rules, not simulated."** |
| **FM-15** | **Ethnicity / ancestry effects** | Reduced ACEi/ARB monotherapy response in Black patients is well documented but is applied here as a blunt `S_covariate` multiplier from `rules.json`, not a mechanism. Central Asian populations — the actual target users — have essentially no published antihypertensive response data. | subject ancestry set | **State plainly: "response modifiers are derived from studies in European, North American, and East Asian populations. Data specific to Central Asian populations is not available."** This is an honest, pitch-relevant limitation, not a weakness to hide. |
| **FM-16** | **Formulation recommendation with no formulation data** | If `substances.json` has only one formulation for a drug, the "best formulation type" claim has nothing to compare. | `< 2` formulations available | **Suppress the formulation recommendation entirely.** Do not emit "immediate-release is best" when it was the only option. |
| **FM-17** | **Drug interactions the dataset does not contain** | The engine only knows the interactions in `rules.json`. Absence of a warning is **not** evidence of safety, and no free comprehensive DDI API exists (RxNav's interaction API was retired ~Jan 2024). | always | **Persistent footer: "Only the interactions in this curated dataset are checked. Absence of a warning does not mean a combination is safe."** |
| **FM-18** | **LLM-generated narrative drifting from the numbers** | Workers AI writes the prose summary. An LLM will happily round, re-interpret, or invent. | always | **The narrative layer receives only pre-computed, pre-formatted numbers and may not compute. Render the numeric table independently of the LLM output, and make the page fully usable if the AI call fails.** |

---

## 10. Test-suite priority order

If the vibecoder can only write some of these before the demo, write them in this order:

1. **PD-01…PD-05** — the five monotherapy blood-pressure values. If these are wrong, everything on screen is wrong.
2. **CO-01, CO-09, CO-10** — additive across classes, sub-additive within a pathway. This is the product's one novel claim.
3. **CO-08** — low-dose combination beats high-dose monotherapy. This is the pitch.
4. **SAT-03, SAT-05, SAT-06** — saturation. These three fail a linear implementation, and a linear implementation makes the "best dose" output trivially wrong.
5. **PD-06…PD-13** — the dose–response shape, including the flat-thiazide / steep-CCB contrast.
6. **EN-06, EN-11** — renin rises while BP falls (counter-regulation is visible), and each drug reaches the endpoint by a different internal route (the animation has a reason to exist).
7. **FM-02, FM-03, FM-11** — the three failure modes that produce visibly absurd output.
8. **CM-01, CM-02, CM-03** — pregnancy reject, gout reject, and the losartan contrast. The safety demo.
9. **PK-13b, PK-13c** — amlodipine accumulation and the guarantee that no ranking is computed from a truncated trace. A selective, invisible bias against one drug in the set.
10. **PK-10, EN-04** — losartan's metabolite carries the effect and peaks 2.5 h after the parent. Catches a structurally wrong PK model.
11. **VAL-15, CF-06** — determinism and the potency-trap guard. Cheap, and both are things a judge could expose.
12. Everything else.

---

## 11. Values I am least confident in

Listed so the team knows where to expect a challenge.

1. **`C_RAAS = 11.5 mmHg`** — the same-pathway ceiling. Calibrated to ONTARGET's single 2.4/1.4 mmHg increment. It is the constant that decides the dual-RAAS answer and it rests on one trial in a non-hypertension-trial population (high-risk CVD patients, many already on other therapy). Genuinely `ESTIMATED`.
2. **`C_g = 150 mmHg`** — the global ceiling. Chosen to make Step 3 near-additive so it reproduces Wald. It has no direct empirical anchor; it is a shape parameter.
3. **The entire ODE gain set** (`G_b`, `G_r`, `k_p`, `g_A`, …). These are calibrated to reproduce the right steady state, which means the *steady state* is validated and the *transients* are not. The time constants (`τ_V = 72 h` etc.) are physiologically motivated but not fitted to data.
4. **The 0.175 doubling-vs-adding ratio** (CO-06) sits below Wald's published 0.19–0.25 CI. Two source papers disagree; I chose fidelity to the per-class table.
5. **CYP2D6 IM/UM clearance multipliers** (0.70 / 1.4). Only the PM value (0.21) is anchored to published data. CPIC deliberately makes no dosing recommendation for UM.
6. **`ρ_sel = 14.2`** for metoprolol β1:β2 selectivity — the parameter behind the whole dose-dependent asthma story. It is *derived* from Agent F's sourced occupancy target pair (54–92 % β1 vs 6–38 % β2 at 100 mg b.i.d.), which is better than my original `ESTIMATED` 75, but those source bands are wide and the derived ratio is sensitive to where inside them you sit.
6b. **The PRA gain constants** (1.5 / 1.2 / 0.8 for AT1 / ACE / NCC). Only the ARB anchor (losartan 2–3× PRA) is sourced; the ACE-inhibitor and thiazide magnitudes are `ESTIMATED` from direction alone.
6c. **Every `PROXY`-tier `EffectFrame` field** (§8.6a of the spec): tissue-specific ACE inhibition, venous tone, capillary hydrostatic pressure, intraglomerular pressure, proximal/TAL/collecting-duct sodium fractions, fasting glucose. These are normalised indices with no absolute calibration. The intraglomerular-pressure one matters most because the renal-protection animation rests on it.
7. **HCTZ efficacy at eGFR < 30** (CM-09) — the classic guideline position and recent trial evidence directly contradict each other. I have deliberately not resolved it.
8. **Serum sodium change on HCTZ** — genuinely `NOT_FOUND` as a pooled number; Cochrane omitted sodium and a 2019 review states the data does not exist. Do not publish a number for it.
9. **Lisinopril adult `V_d` and total `CL`** — not stated in the label and not found in reachable literature. The engine needs them; whatever Agent B supplies should be treated as the weakest PK input in the set.
10. **`w_m`, the EXP3174 potency ratio (10–40×).** A 4-fold labelled range and the widest single uncertainty in the parameter set — flagged independently by Agent B1. It is now propagated as a distribution rather than averaged (PK-10b), so it shows up as an honest band instead of a hidden assumption. It does **not** affect the combination ranking, which is dose-based.
11. **Everything about Central Asian populations.** No allele frequencies, no response data, no local trial evidence was found. The virtual population's CYP2D6/2C9 frequencies are European reference values.

---

## 12. Cross-agent notes

**→ Agent B1 — two gaps you flagged, now filled.**
1. **Losartan's uricosuric magnitude: I have a sourced number.** Placebo-controlled
   meta-analysis (6 RCTs, 1119 vs 1093): *"losartan reduced serum urate levels by
   **approximately 0.29 mg/dL** relative to placebo (95 % CI: −0.46 to −0.12, p = 0.0009)"*;
   a target-trial-emulation arm gave **0.35 mg/dL** (95 % CI −0.66 to −0.03); the authors
   summarise it as *"This modest biochemical effect (~0.3 mg/dL)"* ≈ 17 µmol/L.
   Hypertens Res 2026, [PMID 42458015](https://europepmc.org/article/MED/42458015) ·
   [PMC12673777](https://pmc.ncbi.nlm.nih.gov/articles/PMC12673777/), retrieved 2026-08-17.
   ⚠️ Head-to-head Chinese network meta-analyses report far larger values (e.g. 106.88 µmol/L
   vs enalapril) — **use the placebo-controlled figure.** See VAL-08.
2. **Lisinopril placebo-adjusted BP: sourced from meta-analysis**, as you asked. Law 2003
   BMJ ACE-inhibitor class, standard dose: **8.5 / 4.7 mmHg** placebo-subtracted (half dose
   6.9/3.7, double dose 10.0/5.7). See PD-01 and PD-06…PD-10. This is a class value, not
   lisinopril-specific — label it as such in the UI.

**→ Agent B (`substances.json`):** the §1 table is a ready-made checklist of PK values with
sources. Three genuine gaps to record as `NOT_FOUND` rather than fill: lisinopril adult
`V_d`/`CL`, metoprolol ER `Tmax`/`V_d`/`CL`/`Cmax` (absent from the label), amlodipine `CL`
(absent from every FDA label; only Faulkner 1986's 7 mL/min/kg exists). Two self-conflicts
to resolve deliberately, not average: losartan renal clearance (narrative 75/25 mL/min vs.
Table 2's 56 ± 23 / 20 ± 3 mL/min) and amlodipine F/protein-binding (US 64–90 %/93 % vs.
UK 64–80 %/97.5 %).

**→ Agent C (`rules.json`):** **CM-11 and CM-12 are corrections to the likely default
encoding.** ACEi + ARB is *"in general, avoid"*, **not** contraindicated — "do not
co-administer" is aliskiren-in-diabetes language. And there is **no numeric eGFR threshold
in any label for ACEi + ARB**; the `< 60 mL/min` figure is aliskiren-specific. Also: the
metoprolol–asthma rule should be *graded by exposure* (CM-04/CM-05), not binary. And
amlodipine + clarithromycin must be an outcome-risk rule (AKI OR 1.61), never an exposure
multiplier (PK-36).

**→ Agent F (`05-OUTPUT-REPORT-SPEC.md`):** §9's "required UI behaviour" column is a spec
for your report, not a suggestion. FM-01, FM-02, FM-03, FM-08, FM-10, FM-16 and FM-17 each
require specific on-screen text at specific boundaries. Also: **VAL-10's oedema table
(1.8 / 3.0 / 10.8 % at 2.5 / 5 / 10 mg vs 0.6 % placebo) is the best single number in this
whole file for the safety half of your objective function** — it is steeply supra-linear in
dose, so it will visibly stop the optimiser from recommending 10 mg amlodipine by default.

**→ the lead (`00-DECISIONS.md`):** CF-08 — **the engine cannot run on the Workers Free
plan** (10 ms CPU vs. an estimated 30–120 ms for a single acute run). Confirm the account
is on Workers Paid. Also worth putting in the pitch: the engine reproduces three
independent published meta-analyses (Law 2003 monotherapy dose–response to ±0.2 mmHg,
Wald 2009 cross-class additivity, ONTARGET dual-RAAS sub-additivity) **without a fudge
factor between them** — that is a checkable, defensible claim and it is unusual for a
hackathon build.
