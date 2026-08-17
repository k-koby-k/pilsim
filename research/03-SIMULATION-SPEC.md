# 03 — Simulation Engine Specification

**Owner:** Agent E · **Status:** COMPLETE · **Retrieved/verified:** 2026-08-17
**Consumers:** the coding agent (implements this verbatim), Agent F (`04-ORGAN-EFFECT-MAP.md`,
`05-OUTPUT-REPORT-SPEC.md`), the lead (`00-DECISIONS.md`).

> **This is a research simulator, not a clinical decision tool.** No output of this engine
> may be used to prescribe, withhold, or dose a medicine for a real patient. Every number
> below is a population-average pharmacological estimate reproduced from published
> meta-analyses; the engine has no knowledge of any individual patient.

---

## 0. TL;DR for the vibecoder

| Question | Answer |
|---|---|
| Model class | **Tier-1 mechanistic-lite**: analytic 1-compartment PK → pathway-occupancy PD → 6-state cardiovascular homeostasis ODE, with a meta-analysis-anchored algebraic calibration layer. |
| Language / runtime | Pure TypeScript. Runs in a Worker or Durable Object. **No Sandbox SDK needed. No WASM needed. No Python.** |
| Integrator | Fixed-step RK4 (acute), forward Euler with sub-stepping (chronic). |
| Acute horizon | 0–72 h, Δt = 1 min (RK4). 4 320 steps. |
| Chronic horizon | 5 years — **not integrated**. Closed-form risk projection off the converged steady state. |
| CPU per run | ~30–120 ms for a single-subject acute run; ~1.5–6 s for a 200-subject virtual population. Budget is 30 s default / 300 s max on Workers Paid. |
| Where it lives | `SimulationRun` Durable Object (SQLite-backed), streamed to the UI over WebSocket. |
| The one thing that must be right | **§4, the combination rule.** Everything else is presentation. |

---

## 1. ⚠️ THE POTENCY TRAP — read this before writing any PD code

**DO NOT use in-vitro IC50/Ki/Kd values as EC50 in the pharmacodynamic model.**

ChEMBL, BindingDB, and PubChem report *in-vitro target-binding* potencies. For lisinopril
against angiotensin-converting enzyme, ChEMBL reports IC50 values in the **1.2–4.7 nM**
range (flagged by Agent A, `01-DATA-ACQUISITION.md`). Therapeutic **plasma** concentrations
of lisinopril after a 20 mg dose peak around **60–90 ng/mL ≈ 140–200 nM**, i.e. 30–150×
the in-vitro IC50. If you substitute the in-vitro number into

```
E = Emax · C / (EC50 + C)
```

the model saturates at 99.97 % of Emax at every therapeutic dose, the dose–response curve
goes flat, "half a tablet" and "four tablets" produce identical blood pressure, and the
entire "5 most efficient dosage combinations" feature becomes meaningless. This is the
single most likely error a clinician judge will catch.

**Why the two numbers legitimately differ** — plasma protein binding, tissue vs. plasma
partitioning, receptor reserve, the fact that ACE inhibition is *not* the rate-limiting
step for blood-pressure change (the RAAS has slow counter-regulatory loops), and the fact
that the clinically observed endpoint is a homeostatically-defended physiological variable,
not an enzyme velocity.

**The rule this spec enforces:** every concentration→effect parameter in PilSim is derived
from **clinical dose–response data** (Law 2003 BMJ, §4.1), never from binding assays.
In-vitro potencies may be *displayed* in the Substances page as reference identity data,
and may be used to rank *relative* class membership, but they are structurally excluded
from the numeric path.

**Implementation guard (write this test):** `substances.json` fields named `ic50_nM`,
`ki_nM`, `kd_nM` must never be read by any file under `src/engine/`. Add a lint rule or a
unit test that greps the engine directory for those identifiers and fails the build.

---

## 2. Model class: the honest comparison

| Candidate | What it is | Fidelity | Build cost | Cloudflare fit | Verdict |
|---|---|---|---|---|---|
| **A. Full PBPK** (Simcyp/PK-Sim style, 15–20 perfusion-limited organ compartments, tissue:plasma partition coefficients) | Organ-by-organ mass balance; the "correct" answer for problem 12's organ animation | Highest for *drug distribution*. Says nothing about blood pressure without a PD layer bolted on anyway. | 3–5 days minimum: needs Kp prediction (Rodgers–Rowland), organ blood flows, and per-drug tissue binding data that does not exist openly for 4 of our 5 drugs | Runs fine in TS (~20 ODEs), but the *data* is the blocker, not the compute | **REJECTED** — the parameters would be 80 % `ESTIMATED`, which is worse than a smaller honest model |
| **B. Full QSP / Guyton-Coleman-Granger circulation model** (~350 states) | The canonical mechanistic blood-pressure model | Very high, and genuinely reproduces long-term pressure-natriuresis | Weeks. Parameterisation is a research project. | Would run, but is stiff → needs an implicit solver | **REJECTED** for 24 h |
| **C. Population PK + Emax PD, no feedback** | `C(t)` → `ΔBP(t)` directly | Reproduces trial means at steady state. **Fails badly over time:** BP falls monotonically with dose forever, no tolerance, no reflex tachycardia, no thiazide-induced renin rise. Long-horizon output is absurd. | Half a day | Trivial | **REJECTED as the whole model** — a judge will ask "what stops the blood pressure going to zero?" and there is no answer. Retained as the *calibration target*. |
| **D. Pure regression / meta-analysis lookup** | Table of published ΔBP per drug per dose, summed by a rule | Exactly reproduces the literature. Zero mechanism, zero animation, zero personalisation, zero time course. | 2 hours | Trivial | **REJECTED as the whole model.** Retained as the *ranking layer* (§4). |
| **E. ⭐ Tier-1 mechanistic-lite (SELECTED)** | Analytic 1-cmt PK → pathway occupancy → **6-state cardiovascular homeostasis ODE** (baroreflex, RAAS, pressure-natriuresis), with the algebraic meta-analysis rule of §4 used both to calibrate the ODE gains and to serve the fast combination search | Time course, counter-regulation, organ-level state variables, mechanistically distinct behaviour per class, and steady-state magnitudes that match Law 2003 to ±0.2 mmHg | **~6–8 h**, verified: the prototype in this document was built and run during research | Pure TS, non-stiff, RK4-stable at Δt = 1 min, ~4 300 steps per acute run | **SELECTED** |

### 2.1 What fidelity we are giving up — state this in the pitch

1. **No tissue-level drug distribution.** We do not compute liver or kidney drug
   concentrations. The organ animation (Agent F) is driven by *effect* variables (renal
   sodium excretion, vascular tone, heart rate), not by local drug concentration. This is
   defensible and we should say so rather than pretend otherwise.
2. **No absolute pressure waveform.** We compute mean arterial pressure and derive
   SBP/DBP from stroke volume and a fixed arterial compliance. No pulse contour, no
   augmentation index, no central-vs-brachial distinction.
3. **No true long-term integration.** The 5-year prognosis is a closed-form epidemiological
   projection off the converged steady state (§6.2), not a five-year ODE solve.
4. **No sodium/potassium mass balance as a real electrolyte model.** Serum K⁺, Na⁺ and
   urate move on empirical per-drug offsets (§5.5), not on a nephron model.
5. **No absorption-site physiology.** First-order absorption with a lag; no gastric
   emptying, no dissolution, no food effect beyond a per-formulation `F` and `ka`.
6. **No disease progression.** Baseline hypertension does not worsen over the 5 years
   except through the aging term in §6.2.
7. **Population-average PD.** Inter-individual variability is imposed statistically
   (§7), not derived from genotype-to-enzyme-to-effect mechanism (except CYP2D6 →
   metoprolol clearance, which *is* mechanistic).

---

## 3. Layer A — Pharmacokinetics

### 3.1 Equation

One-compartment, first-order absorption, first-order elimination, with an absorption lag.
Use the **closed-form Bateman solution**, not an ODE — it is exact, unconditionally stable,
and ~40× cheaper than integrating.

For a single dose `D` (mg) given at time `t₀`, for `t > t₀ + t_lag`:

```
τ  = t − t₀ − t_lag                                        (h)
C(τ) = (F · D · ka) / (V_d · (ka − ke)) · (e^(−ke·τ) − e^(−ka·τ))     (mg/L)
```

where
- `F` = oral bioavailability (fraction, formulation-specific)
- `ka` = first-order absorption rate constant (h⁻¹)
- `ke = CL / V_d` = elimination rate constant (h⁻¹)
- `V_d` = apparent volume of distribution (L), scaled to body weight (§7.2)
- `CL` = clearance (L/h), scaled to renal function and CYP genotype (§3.3)

**Flip-flop guard:** if `|ka − ke| < 0.01 h⁻¹` the expression is numerically unstable.
Use the limiting form:

```
C(τ) = (F · D / V_d) · ke · τ · e^(−ke·τ)
```

**Multiple doses:** superposition. Linear PK is assumed for all five drugs (justified: all
five are linear over their therapeutic range). Accumulate over the dosing history:

```
C_total(t) = Σ_{doses j, t > t_j + t_lag} C_single(t − t_j)
```

Cap the history at 7 × t½ (older doses contribute < 1 %) to keep the sum O(1).

**Derived quantities the UI wants:**
```
Tmax  = ln(ka/ke) / (ka − ke)                    (h after dose)
Cmax  = C(Tmax)
AUC∞  = F · D / CL
t½    = ln(2) / ke
Accumulation ratio R_ac = 1 / (1 − e^(−ke·τ_dose))
```

### 3.2 Extended-release and other formulations

Formulation changes **`F`, `ka`, and `t_lag` only** — no new equations. Values come from
`substances.json` (Agent B) per `formulation` record. Reference behaviour:

| Formulation | Effect on parameters | Effect on output |
|---|---|---|
| Immediate-release tablet | baseline `F`, `ka`, `t_lag ≈ 0.25 h` | reference |
| Extended-release (e.g. metoprolol succinate) | `ka` ↓ ~5–10×, `t_lag` ↑ | Tmax later, Cmax lower, **peak-to-trough swing much smaller** — this is the visible difference in the animation |
| Oral solution | `ka` ↑ ~2×, `t_lag → 0` | earlier, sharper peak |
| Sublingual | `F` ↑ (first-pass bypassed), `ka` ↑↑ | fastest onset |
| Transdermal | model as zero-order input: replace the Bateman term with `C(t) = (R₀/CL)·(1 − e^(−ke·t))` while the patch is on | flat profile, no peak |

The **peak-to-trough swing** `PTS = (Cmax − Cmin)/Cmin` at steady state is the metric
`05-OUTPUT-REPORT-SPEC.md` should use to justify a "best formulation" claim. Compute it,
do not assert it.

### 3.3 Clearance covariate model

```
CL_i = CL_pop · (WT/70)^0.75 · f_renal · f_CYP · f_age · f_hepatic
```

- `(WT/70)^0.75` — allometric scaling on lean/total body weight. Use the weight the
  virtual human carries (Agent D, `patient_model.json`).
- `f_renal = f_ru · (eGFR/90) + (1 − f_ru)` where `f_ru` is the fraction of the dose
  cleared unchanged renally. Lisinopril `f_ru ≈ 1.0` (fully renal, no metabolism) →
  clearance tracks eGFR almost 1:1. Amlodipine `f_ru ≈ 0.1`. Floor `eGFR/90` at 0.1.
- `f_CYP` — the personalisation hook:

  | Drug | Enzyme | PM | IM | NM/EM | UM | Provenance of the PM value |
  |---|---|---|---|---|---|---|
  | Metoprolol | CYP2D6 | **0.21** | 0.70 | 1.00 | 1.4 | CPIC 2024 beta-blocker guideline, verbatim: *"poor metabolizers given the same dose of metoprolol experience more than a two-fold longer elimination half-life, with a nearly five-fold increase in area under the plasma concentration–time curve (AUC)."* `AUC ∝ 1/CL` ⇒ `f_CYP(PM) = 1/4.8 ≈ 0.21`. <https://files.cpicpgx.org/data/guideline/publication/beta_blockers/2024/38951961.pdf> (PMID 38951961), retrieved 2026-08-17 |
  | Losartan → E-3174 | CYP2C9 | conversion fraction ↓ — see §3.4 | | | | |
  | Amlodipine | CYP3A4 | **1.00** — see warning below | | | | |
  | Lisinopril | none | 1.00 always | | | | |
  | HCTZ | none | 1.00 always | | | | |

  IM/UM multipliers are `ESTIMATED`. **CPIC 2024 issues a therapeutic recommendation only
  for the poor metaboliser** (*"Initiate standard dosing"* for both NM and IM; increased IM
  concentrations *"does not appear to translate into clinically significant changes in
  heart rate, blood pressure, or clinical outcomes"*; **no recommendation** for UM). The
  engine may show an IM/UM concentration difference, but the *report* must not recommend a
  dose change for IM or UM — that would contradict the guideline. Encode this as a rule.

  **Phenoconversion (machine-usable, CPIC 2024 verbatim):** *"assume a CYP2D6 activity
  score of zero (i.e., poor metabolizer) in patients taking adequate doses of a concomitant
  strong CYP2D6 inhibitor and to reduce the predicted activity score by half in patients
  taking a moderate inhibitor. No activity score adjustment is suggested for weak
  inhibitors."* Implement literally: strong inhibitor → treat as PM; moderate → halve the
  activity score, then re-map to phenotype; weak → no change.

  > ⚠️ **Do NOT apply an exposure multiplier for amlodipine + a strong CYP3A inhibitor.**
  > No quantified AUC ratio for that pair exists in any regulatory label (Agent A/salvaged
  > pharmacology, verified). The only quantitative evidence is epidemiologic — an
  > amlodipine-specific 30-day **acute-kidney-injury odds ratio of 1.61 (95 % CI 1.29–2.02)**
  > for clarithromycin vs. azithromycin (Gandhi et al., *JAMA* 2013;310(23):2544-2553,
  > PMID 24346990). **Represent this as an outcome-risk modifier on the report's adverse-event
  > panel, never as an `f_CYP` multiplier.** Fabricating a fold-change here is exactly the
  > class of error a clinician judge will catch.
  >
  > The one CYP3A figure that *is* labelled: diltiazem 180 mg/day + amlodipine 5 mg gives
  > **+60 % amlodipine AUC** (FDA Norvasc label; the Health Canada monograph says +57 % —
  > pick one jurisdiction and label it, do not average them). Also labelled: **elderly
  > patients have 40–60 % higher amlodipine AUC** from reduced intrinsic clearance — apply
  > this as an age term for amlodipine only, since amlodipine has no renal clearance
  > component for `f_renal` to capture.
- `f_age` — for drugs with a renal component this is already captured through eGFR; do
  not apply an independent age term or you will double-count.
- `f_hepatic` — 1.0 unless the virtual human carries hepatic impairment; then 0.5 for
  CYP-cleared drugs.

#### 3.4 Parent → active metabolite — **losartan is NOT a single species. This is mandatory, not optional.**

All values below are verbatim from the COZAAR US label (DailyMed setid
`9949448f-c3b9-44ee-94ed-c1aca8c90f39`, SPL v9 published Jan 2026, label text revised
6/2021), §12.1 and §12.3, retrieved 2026-08-17:

| Quantity | Label value | Symbol |
|---|---|---|
| Fraction of an oral dose converted to the active metabolite | *"About **14 %** of an orally-administered dose of losartan is converted to the active metabolite"* | `f_m = 0.14` |
| Potency of the metabolite | *"The active metabolite is **10 to 40 times more potent by weight** than losartan"* | `w_m` — **a 4-fold-wide range. DO NOT collapse it to a midpoint. See §3.4a.** |
| Losartan half-life | *"about **2 hours**"* | `t½_p = 2 h` |
| **E-3174 half-life** | *"about **6-9 hours**"* | `t½_m = 7.5 h` (`ESTIMATED` midpoint) |
| Losartan clearance | **600 mL/min** = 36 L/h | `CL_p` |
| E-3174 clearance | **50 mL/min** = 3 L/h | `CL_m` |
| Converting enzyme | *"cytochrome P450 **2C9 and 3A4** are involved"*, but *"conversion … is mediated **primarily by P450 2C9 and not P450 3A4**"* | CYP2C9 |
| Receptor mechanism | *"a reversible, **non-competitive** inhibitor of the AT1 receptor"* | |

**Why this cannot be skipped.** 14 % of the dose × 10–40× the potency ⇒ the metabolite
carries roughly **60–85 % of the total AT1 effect**, and its 6–9 h half-life — *not*
losartan's 2 h — is what makes once-daily dosing work. A single-species losartan model
gives a drug that is gone by lunchtime. It would be visibly wrong in the animation next to
amlodipine, and wrong in the report's formulation recommendation.

**Implementation — two extra integrated states, RK4 alongside the CV states:**

```
ke_p = ln2 / t½_p = 0.347 h⁻¹        ke_m = ln2 / t½_m = 0.0924 h⁻¹
A_gut(t)   = F·D·e^(−ka·(t−t₀−lag))                    (analytic, from §3.1)

dA_p/dt = ka·A_gut − ke_p·A_p
dA_m/dt = f_m · ka · A_gut · (MW_m/MW_p) − ke_m·A_m     (formation-rate parameterisation)

C_p = A_p / V_p        C_m = A_m / V_m
```

Use the **formation-rate** form (metabolite appears in proportion to the *absorbed* dose)
rather than the elimination-rate form — it is what `f_m = 0.14` as a *fraction of dose*
actually means, and it avoids having to know what fraction of parent clearance is
metabolic. `V_p = CL_p/ke_p ≈ 104 L`; `V_m = CL_m/ke_m ≈ 32 L`.

**PD input to the RAAS pathway is the potency-weighted sum:**
```
C_effective_AT1(t) = C_p(t) + w_m · C_m(t)
```
Then feed `C_effective_AT1` into the §5.3 occupancy function.

### 3.4a ⚠️ `w_m` is a 4-fold range, not a number — propagate it, do not average it

The label says **10 to 40 times more potent**. Agent B1 flags this as one of its least
confident values, and it is the single widest uncertainty in the whole parameter set. A
silent midpoint hides a 4-fold structural uncertainty behind a confident-looking curve.

**Required handling — `w_m` is treated as a distribution everywhere:**

| Context | Handling |
|---|---|
| **Virtual population (N ≥ 50)** | sample per subject, **log-uniform on [10, 40]**: `w_m = 10 · 4^u`, `u ~ U(0,1)`. Log-uniform, not uniform — the label states a ratio range, and ratios are naturally log-scaled. This propagates the uncertainty into the output distribution (§7.3) where it belongs. |
| **Single digital twin (N = 1)** | run **three** simulations at `w_m` = 10, 20, 40 and report losartan's outputs as a **band**, with 20 as the central line. Cost is three cheap PK evaluations, not three full runs. |
| **The §4 algebraic combination rule** | **unaffected** — it works on dose, not concentration, and is calibrated to Law 2003's ARB class effect, which already embeds whatever the true potency ratio is. **This is a real advantage of the two-layer design: the ranking is immune to `w_m`.** Say so. |
| **UI** | label losartan's concentration and occupancy curves with an explicit uncertainty band and the note *"active metabolite potency is stated as a 10–40× range in the product label."* |

**What `w_m` does and does not change.** It shifts the *split* of AT1 occupancy between
parent and metabolite, and therefore the *shape* of the effect-time curve. It does **not**
change the steady-state blood-pressure answer, which is pinned by §4.1. So the honest
summary for the pitch is: *"we know how much losartan lowers blood pressure; we are less
certain how much of that is the parent versus the metabolite, and we show that uncertainty
rather than hiding it."* Validation: **PK-10b**. The §4 algebraic rule is
unaffected (it works on dose, not concentration) — the metabolite matters for the *time
course*, which is what the animation and the formulation recommendation depend on.

**CYP2C9 personalisation — real PK data, but NO guideline. Say so in the UI.**
- **CPIC guideline for losartan: verified ABSENT.** DPWG: verified absent. Highest
  existing evidence is PharmGKB clinical annotation **Level 3**. The product must not imply
  guideline backing for a CYP2C9-based losartan dose change — unlike metoprolol, where CPIC
  2024 does back it.
- Yasar 2002 (PMID 11823761), 50 mg single dose, fold increase in the
  AUC_losartan/AUC_E-3174 ratio vs `*1/*1`: `*1/*3` ≈ **2×**, `*2/*3` ≈ **3×**,
  `*3/*3` ≈ **30×**. Implement as a divisor on `f_m`: `f_m(*1/*3) = 0.14/2 = 0.070`,
  `f_m(*2/*3) = 0.047`, `f_m(*3/*3) = 0.0047`.
- **Contradicting evidence must be surfaced, not resolved:** Bae 2012 (PMID 22735459,
  n = 43 Korean) found *"AUC0-∞ of E-3174 was **not different**"* and *"the clinical
  effects of losartan **may not be reduced** by CYP2C9\*1/\*3."* A 2021 meta-analysis
  (PMC8303964) found the effect significant in Asian subgroups and **not** significant in
  Caucasian subgroups. The UI should show the CYP2C9 effect with an explicit
  "evidence is contested" badge.
- **The 1 % non-converter case** (2009 COZAAR label, since removed): *"Minimal conversion
  of losartan to the active metabolite (**less than 1 % of the dose** compared to 14 % of
  the dose in normal subjects) was seen in about **one percent** of individuals studied."*
  Include this as a selectable virtual-subject preset. It is a dramatic, real, citable
  personalisation demo: the same 50 mg tablet produces a near-null response.

**Enzyme-directed interactions (label verbatim, and note the sign-convention trap):**
rifampin decreases losartan AUC by **30 %** and metabolite AUC by **40 %**; fluconazole
*"decreased the AUC of the active metabolite by approximately **40 %**, but increased the
AUC of losartan by approximately **70 %**."* ⚠️ Kaukonen 1998 states the same finding as
E-3174 AUC *"to 47 % of control"* — that is **−53 %**, not −40 % and certainly not −47 %.
**When the coding agent transcribes these into `rules.json`, check whether the source says
"decreased by X" or "to X of control." Getting this backwards is a silent, plausible-looking
bug.**

### 3.4b ⚠️ EFFECT COMPARTMENT — a direct-effect model is structurally wrong for lisinopril

**Lisinopril's pharmacodynamic onset is ~1 h; its plasma Tmax is ~7 h.** Effect *precedes*
peak concentration. **A direct-effect model — where effect is an instantaneous function of
plasma concentration — cannot reproduce that ordering at all.** Plot concentration against
effect and you get a counter-clockwise hysteresis loop; a direct model gives a straight
line. This is invisible until someone plots it, so build it now. (Finding: Agent B1,
`substances_part1.json` record notes.)

**Fix: a link/effect compartment (Sheiner hysteresis model).** One extra state per drug,
~4 lines, and it fixes the ordering for *every* drug, not just lisinopril:

```
dCe/dt = k_e0 · (C_plasma(t) − Ce(t))
```

`Ce` (the effect-site concentration) then drives the §5.3 occupancy function **in place of
`C_plasma`**. `k_e0` is the equilibration rate constant (h⁻¹); `t½_ke0 = ln2/k_e0`.

| Drug | `k_e0` (h⁻¹) | `t½` equilibration | Effect vs. plasma | Provenance |
|---|---|---|---|---|
| **Lisinopril** | **1.4** | 0.5 h | **effect LEADS plasma** — onset ~1 h vs Tmax ~7 h | `ESTIMATED`, calibrated to reproduce the labelled 1 h onset. **Note the counter-intuitive direction:** a *fast* `k_e0` on a *slowly-absorbing* drug means the effect site tracks the rising limb closely and the pharmacological effect saturates long before plasma peaks — ACE inhibition is near-maximal at concentrations well below Cmax. |
| Losartan / EXP3174 | 0.7 | 1.0 h | slight lag | `ESTIMATED` |
| Amlodipine | 0.35 | 2.0 h | lag | `ESTIMATED` |
| HCTZ | 0.5 | 1.4 h | lag | `ESTIMATED` |
| Metoprolol | 1.0 | 0.7 h | near-direct | `ESTIMATED` |

**All `k_e0` values are `ESTIMATED`** and must be labelled as such. Only the *ordering*
constraint for lisinopril is sourced. Validation test: **PD-18** below.

### 3.4c ⚠️ Volume of distribution — use the DERIVED terminal volumes, not the label's

Agent B1 found that the volumes printed on the losartan and EXP3174 labels — **34 L** and
**12 L** — are **steady-state** volumes and are **mutually inconsistent with the clearance
and half-life on those same labels**. Substituting them into `ke = CL/V_d` gives
`ke = 36/34 = 1.06 h⁻¹` ⇒ `t½ = 0.65 h`, against the label's stated 2 h.
**Losartan would disappear roughly three times too fast.**

**Use B1's derived terminal-phase volumes: losartan 109 L, EXP3174 32 L** (each satisfying
`V = CL/ke` with the labelled clearance and half-life). **Say why in the UI's parameter
panel**, because a reviewer comparing the engine's parameters against the label will
otherwise conclude you made an error. This is a good, checkable moment of rigour to have
in the pitch, not something to hide.

**General rule: whenever `CL`, `V_d` and `t½` are all quoted from a label, check
`t½ = ln2·V_d/CL` before use.** Labels frequently mix steady-state and terminal volumes.
Add this as a build-time assertion over `substances.json` — it will catch the next one.

### 3.4d Peak-to-trough ratio spans four orders of magnitude — a UI-binding consequence

Steady-state peak-to-trough ratios (Agent B1): **amlodipine 1.30, lisinopril 2.7,
EXP3174 6.8, losartan parent ≈ 2 000.**

**The parent-losartan curve is useless on a shared axis** — it would compress every other
drug to a flat line. **The interface must plot EXP3174 for losartan, not the parent**,
which is also the moiety that carries the effect (§3.4). Plot the parent only on its own
log-scaled axis, or in a "show metabolite chain" detail view. **Coordinate with Agent F's
`EffectFrame` — `conc.losartan` and `conc.exp3174` are both emitted (§8.6a); the UI's
default series must be `exp3174`.**

Amlodipine's PTR of 1.30 is itself a demo asset: it is why amlodipine is genuinely
once-daily and why its curve looks flat next to everything else.

### 3.5 Concentration-dependent loss of β1 selectivity — make the asthma case dose-dependent

Metoprolol is **β1-*selective*, not β1-*specific***, and selectivity is a
concentration-dependent property, not a fixed one. FDA Lopressor label §7.3, verbatim:
*"Increases in plasma concentration decrease the cardioselectivity of metoprolol."*
And on poor metabolisers: *"Poor CYP2D6 metabolizers exhibit several-fold higher plasma
concentrations of metoprolol …, thereby decreasing Lopressor's cardioselectivity."*
(<https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0283bc9d-6998-493a-824a-d4c85f704111>,
rev. 9/2023, retrieved 2026-08-17.)

**This converts the asthma/COPD contraindication from a binary flag into a continuous,
watchable, dose-dependent risk — which is both more truthful and a far better demo.**

Model it as a second occupancy on a second receptor, sharing one concentration:

```
θ_B1(t) = C_met(t) / (EC50_B1 + C_met(t))
θ_B2(t) = C_met(t) / (EC50_B2 + C_met(t))          EC50_B2 = ρ_sel · EC50_B1

selectivity_ratio(t) = θ_B1(t) / θ_B2(t)           → 1.0 as C → ∞ (selectivity lost)
bronchoconstriction_index(t) = θ_B2(t) · airway_sensitivity(subject)
```

| Parameter | Value | Provenance |
|---|---|---|
| `ρ_sel` (β2/β1 EC50 ratio) | **~75** | `ESTIMATED` — metoprolol's in-vitro β1:β2 selectivity is commonly cited in the 20–100× range. **This is a selectivity *ratio*, which is dimensionless and therefore NOT subject to the §1 potency trap** — ratios of in-vitro affinities transfer to the clinical setting far more safely than absolute potencies do. Flag it as `ESTIMATED` in the UI regardless. |
| `airway_sensitivity` | 0.0 (no lung disease) → 1.0 (asthma) → 0.6 (COPD) | `ESTIMATED`; Agent D owns the value, Agent C owns the threshold at which a warning fires |

**Resulting behaviour the UI should show:** at metoprolol 25 mg in a normal metaboliser,
`θ_B2` is small and the lung panel stays green. At 200 mg, or at 100 mg in a CYP2D6 poor
metaboliser (≈ 5× the AUC — §3.3), `θ_B2` rises materially and the lung panel escalates.
**Same patient, same drug, different genotype, different safety verdict.** That single
frame is probably the strongest 10 seconds of the demo for problem 12.

Note for `rules.json`: this argues the metoprolol–asthma rule should be encoded as a
*graded* rule with a dose/exposure threshold, not a flat `CONTRAINDICATED`. Agent C owns
the final call; the engine supports either.

---

## 4. ⭐ Layer B — THE COMBINATION RULE (the crux)

This section is the scientific core of the product. It is what makes "the 5 most efficient
dosage combinations" a defensible claim rather than a made-up ranking.

### 4.1 Within-drug dose–response is NOT linear — it is Emax, and it is flat

**Source:** Law MR, Wald NJ, Morris JK, Jordan RE. *Value of low dose combination treatment
with blood pressure lowering drugs: analysis of 354 randomised trials.* BMJ 2003;326:1427.
Full text: <https://pmc.ncbi.nlm.nih.gov/articles/PMC162261/> — retrieved 2026-08-17.

Placebo-subtracted mean BP reduction, by class and by dose, as that paper states them:

| Class | ½ std dose SBP | std dose SBP | 2× std dose SBP | ½ DBP | std DBP | 2× DBP |
|---|---|---|---|---|---|---|
| Thiazide | 7.4 | 8.8 | 10.3 | 3.7 | 4.4 | 5.0 |
| β-blocker | 7.4 | 9.2 | 11.1 | 5.6 | 6.7 | 7.8 |
| ACE inhibitor | 6.9 | 8.5 | 10.0 | 3.7 | 4.7 | 5.7 |
| ARB | 7.8 | 10.3 | 12.3 | 4.5 | 5.7 | 6.5 |
| Calcium channel blocker | 5.9 | 8.8 | 11.7 | 3.9 | 5.9 | 7.9 |
| **All categories** | **7.1** | **9.1** | **10.9** | **4.4** | **5.5** | **6.5** |

The paper's own summary: *"Reductions with half standard dose were about 20 % less than
those with standard dose."* Quadrupling the dose from ½× to 2× buys about **3.8 mmHg SBP**
on average — a 4-fold dose increase for a 53 % effect increase.

**We fit a Hill-1 Emax curve to each row** (least squares over the three points, dose
expressed as a multiple of the standard dose). The fits are excellent — RMSE ≤ 0.15 mmHg,
and for ARB and CCB the fit is essentially exact:

```
E_class(D) = Emax · D / (ED50 + D)          D in multiples of the standard dose
```

| Class | Emax_SBP | ED50_SBP | RMSE | Emax_DBP | ED50_DBP | RMSE |
|---|---|---|---|---|---|---|
| Thiazide | 11.75 | 0.305 | 0.145 | 5.64 | 0.267 | 0.035 |
| β-blocker | 13.25 | 0.409 | 0.146 | 8.91 | 0.305 | 0.092 |
| ACE inhibitor | 11.71 | 0.357 | 0.092 | 6.93 | 0.449 | 0.060 |
| ARB | 15.23 | 0.477 | 0.007 | 7.64 | 0.347 | 0.018 |
| CCB | 17.41 | 0.977 | 0.005 | 12.00 | 1.036 | 0.006 |
| *(all classes)* | *13.24* | *0.440* | *0.069* | *7.70* | *0.383* | *0.050* |

**Read these ED50 values — they are the whole story of within-class dose escalation:**
- Thiazide ED50 = 0.31× standard → at 25 mg HCTZ you are already at **77 % of Emax**.
  Doubling to 50 mg buys 1.2 mmHg and a large increase in hypokalaemia. This is the
  quantitative form of the clinical dictum "the thiazide dose–response curve is flat."
- CCB ED50 = 0.98× standard → amlodipine at 5 mg is at **51 % of Emax**; doubling to
  10 mg buys 2.9 mmHg. Amlodipine is the one drug in our set where dose escalation is
  genuinely worth something.
- ACEi/ARB/β-blocker sit in between at ED50 ≈ 0.36–0.48.

> **VALIDITY WINDOW — enforce this in code.** The Emax/ED50 pair is fitted to three
> points spanning 0.5×–2× the standard dose. It is an *interpolation*, not a mechanistic
> potency. **Do not evaluate it outside 0.25×–4× standard dose.** Outside that range,
> clamp and set a `extrapolated: true` flag that the UI renders as a hatched/greyed
> region on the dose–response chart. `Emax` here is a curve-fit asymptote, not a
> physiological maximum, and must never be presented to the user as "the maximum
> possible effect."

### 4.2 Two drugs from different classes ARE approximately additive

**Source:** Wald DS, Law M, Morris JK, Bestwick JP, Wald NJ. *Combination therapy versus
monotherapy in reducing blood pressure: meta-analysis on 11,000 participants from 42
trials.* Am J Med 2009;122(3):290–300. PMID 19272490. Abstract retrieved 2026-08-17 via
Europe PMC REST API (`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=...`).

Verbatim from that abstract:

- *"With a thiazide used alone, the mean placebo-subtracted reduction in systolic blood
  pressure was 7.3 mm Hg and 14.6 mm Hg combined with a drug from another class. The
  corresponding reductions were 9.3 mm Hg and 18.9 mm Hg with a beta-blocker, 6.8 mm Hg
  and 13.9 mm Hg with an angiotensin-converting enzyme, and 8.4 mm Hg and 14.3 mm Hg with
  a calcium channel blocker."*
- Observed / expected incremental reduction ratios: **thiazides 1.04 (0.88–1.20),
  β-blockers 1.00 (0.76–1.24), ACE inhibitors 1.16 (0.93–1.39), CCBs 0.89 (0.69–1.09);
  overall 1.01 (95 % CI 0.90–1.12).**
- *"doubling the dose of 1 drug had approximately one fifth of the equivalent incremental
  effect (**0.22 [95 % CI, 0.19–0.25]**)"*
- *"The extra blood pressure reduction from combining drugs from 2 different classes is
  approximately **5 times greater** than doubling the dose of 1 drug."*

Law 2003 independently reports the same thing from 119 factorial comparisons: first drug
alone 7.0 mmHg SBP, second drug alone 8.1, **both together observed 14.6 vs. expected
15.1, difference −0.5 mmHg (95 % CI −1.4 to +0.4)**.

**So: additive on the mmHg scale, across classes, to within ±1.4 mmHg.**

### 4.3 …EXCEPT when the two drugs share a pathway

Additivity is a property of *mechanistic independence*, not of "being two drugs."

**Dual RAAS blockade (lisinopril + losartan — a pairing our set can produce and must
handle).**

*Efficacy.* ONTARGET (NEJM 2008, n = 25 620, PMID 18378520; ramipril 10 mg vs.
telmisartan 80 mg vs. both, median 56 months): mean BP was *"a 2.4/1.4 mm Hg greater
reduction"* in the combination arm than in the ramipril arm. An ARB used as an independent
second class would have been expected to add ≈ 10.3/5.7 mmHg (§4.1).
**The observed increment is ~23 % of the naive additive expectation.** Primary outcome:
ramipril 16.5 %, telmisartan 16.7 % (RR 1.01, 0.94–1.09), combination 16.3 % (RR 0.99,
0.92–1.07) — **no benefit at all** despite the extra BP reduction.
<https://www.ahajournals.org/doi/10.1161/hypertensionaha.112.199562> ·
<https://www.acc.org/Latest-in-Cardiology/Clinical-Trials/2011/10/06/17/44/ONTARGET>,
retrieved 2026-08-17.

*Harm — hard event rates the engine can be validated against.*

| Trial | Outcome | Combination | Monotherapy |
|---|---|---|---|
| ONTARGET (vs. ramipril) | hypotensive symptoms | **4.8 %** | 1.7 % (P<0.001) |
| ONTARGET | syncope | 0.3 % | 0.2 % (P=0.03) |
| ONTARGET | renal dysfunction | **13.5 %** | 10.2 % (P<0.001) |
| **VA NEPHRON-D** (NEJM 2013, n=1448, PMID 24206457; **losartan 100 mg + lisinopril 10–40 mg** — literally our pairing) | hyperkalaemia | **6.3 events/100 person-yr** | 2.6 |
| VA NEPHRON-D | acute kidney injury | **12.2 events/100 person-yr** | 6.7 |
| VA NEPHRON-D | primary endpoint | HR 0.88 (0.70–1.12), **no benefit**; *"stopped early owing to safety concerns"* | |
| ALTITUDE (NEJM 2012, aliskiren added to ACEi/ARB) | hyperkalaemia, **defined as serum K⁺ ≥ 6 mmol/L** | **11.2 %** | 7.2 % (P<0.001) |
| ALTITUDE | hypotension | 12.1 % | 8.3 % (P<0.001) |

ONTARGET hyperkalaemia figures specifically: **NOT_FOUND** (not in the abstract or the
telmisartan label; NEJM full text 403s to fetchers).

> ⚠️ **Regulatory-language precision — get this right or a clinician judge will correct
> you on stage.** Both the lisinopril and COZAAR labels say, verbatim: *"In general, avoid
> combined use of RAS inhibitors."* Neither label contains a "do not co-administer"
> statement for ACE inhibitor + ARB. **That phrasing is reserved for aliskiren in
> diabetes.** ACEi + ARB is **AVOID / high-severity warning, not an absolute
> contraindication.** Encoding it as `CONTRAINDICATED` would be factually wrong. There is
> also **no numeric eGFR threshold in any label for the ACEi + ARB pairing** — the
> `< 60 mL/min` threshold that appears in those labels is aliskiren-specific. Do not
> invent one.

→ So this is a **PD rule *and* a graded safety rule**: the engine ranks it last on
efficacy (§4.7) *and* raises hyperkalaemia/AKI risk, and the report says "avoid — no
outcome benefit, materially more harm," which is exactly what the evidence supports and is
a stronger, more credible statement than a red "FORBIDDEN" banner would be.

**β-blocker + RAS inhibitor is partially sub-additive.** Meta-analysis of β-blockers as
add-on therapy (<https://pmc.ncbi.nlm.nih.gov/articles/PMC9994166/>, retrieved 2026-08-17)
reports the incremental SBP/DBP of adding a β-blocker on top of:
- a diuretic: **−10.2 (−14.2, −6.2) / −5.4 (−8.2, −2.6)** mmHg
- a **RAS inhibitor: −2.9 (−4.3, −1.5) / −4.2 (−5.0, −3.4)** mmHg
- a calcium channel blocker: **−4.1 (−7.1, −1.0) / −2.8 (−4.1, −1.5)** mmHg

Mechanism (as that paper states it): *"β-blockers suppress renin secretion and reduce the
plasma levels of angiotensin II"* — so a β-blocker has already done part of an ACE
inhibitor's job before the ACE inhibitor arrives. **Caveat we must state:** these are
add-on trials at lower on-treatment baseline BP, and Law 2003 shows effect size scales
with pre-treatment BP (§4.5); part of the apparent attenuation is that confound, not
pharmacology. Wald 2009's own β-blocker ratio was 1.00 (0.76–1.24). We therefore apply a
*moderate* rather than a *severe* penalty to this pair — see §4.4.

### 4.4 THE RULE — three steps, implement exactly this

```
────────────────────────────────────────────────────────────────────────
PilSim combination rule v1.0

Step 1  Per-drug effect
        e_i = Emax_class(i) · D_i / (ED50_class(i) + D_i)      [§4.1]
        then apply patient scaling:  e_i ← e_i · S_baseline · S_covariate   [§4.5]

Step 2  Pool within a shared mechanistic pathway
        For each pathway p with drug effects {e_1 … e_n}:
          if n == 1:  E_p = e_1
          else:       E_p = max( max_i(e_i),
                                 C_p · (1 − Π_i (1 − min(e_i, 0.98·C_p)/C_p)) )

Step 3  Pool across pathways
        E_total = C_g · (1 − Π_p (1 − min(E_p, 0.98·C_g)/C_g))
────────────────────────────────────────────────────────────────────────
```

**Pathway assignment (this is the mechanism graph):**

| Drug | Pathway id | Node acted on |
|---|---|---|
| Lisinopril | `RAAS` | ACE → AngII generation |
| Losartan (+E-3174) | `RAAS` | AT1 receptor |
| Amlodipine | `LTYPE` | vascular smooth-muscle L-type Ca²⁺ channel |
| Hydrochlorothiazide | `NCC` | distal convoluted tubule Na⁺-Cl⁻ cotransporter |
| Metoprolol | `B1` | cardiac β1 adrenoceptor |

**Ceiling constants (mmHg):**

| Constant | SBP | DBP | Provenance |
|---|---|---|---|
| `C_RAAS` | 11.5 | 7.0 | `ESTIMATED` — calibrated so that ACEi + ARB reproduces the ONTARGET increment (§4.3). See derivation below. |
| `C_NCC` | 11.8 | 5.7 | `ESTIMATED` — set to the fitted thiazide Emax; only ever binds if a second NCC drug is added (not in this set). |
| `C_LTYPE` | 17.5 | 12.0 | `ESTIMATED` — fitted CCB Emax; inert for our 5-drug set. |
| `C_B1` | 13.3 | 8.9 | `ESTIMATED` — fitted β-blocker Emax; inert for our 5-drug set. |
| `C_g` (global) | **150** | **90** | `ESTIMATED` — chosen so cross-class pooling reproduces Wald 2009's obs/exp ≈ 1.0. A large `C_g` makes Step 3 near-additive, which is what the data says; the physiological floor on blood pressure is enforced separately as a hard constraint (§5.6), not smuggled into this ceiling. |

*Only `C_RAAS` and `C_g` are load-bearing for the 5-drug set. The other three are placeholders
that become live if the team adds a second drug on the same pathway (e.g. a second CCB).*

**Why `max()` in Step 2:** without it, a single drug on a pathway would be distorted by
the ceiling and stop reproducing Law 2003. With it, a lone drug passes through exactly.

**Why this shape:** `C·(1 − Π(1 − e/C))` is Bliss-independence on a bounded effect scale.
It → additive as `e/C → 0` and saturates smoothly as effects approach the ceiling. One
formula covers both regimes; the only thing that changes is which ceiling applies.

### 4.5 Patient scaling of `e_i` — apply BEFORE pooling

**(a) Pre-treatment blood pressure.** Law 2003, verbatim: *"If the pretreatment blood
pressure was 10 mm Hg higher, the reduction in blood pressure with one drug at standard
dose increased on average by 1.0 (95 % confidence interval 0.7 to 1.2) mm Hg systolic and
1.1 (0.8 to 1.4) mm Hg diastolic."*

```
S_baseline_SBP = 1 + 0.10 · (SBP_pre − 154) / 10 · (10/9.1)
               ≈ 1 + 0.0110 · (SBP_pre − 154)
S_baseline_DBP ≈ 1 + 0.0200 · (DBP_pre − 97)
```
(reference values 154/97 are the Law 2003 trial-population means; `1.0/9.1` and `1.1/5.5`
converted to a per-mmHg fractional slope). **Clamp `S_baseline` to [0.4, 1.8].** A normotensive
virtual subject must not get a full 9 mmHg drop — this scaling is what prevents that, and it
is the model's single most important guard against nonsense in the "healthy volunteer" case.

**(b) Covariate multipliers `S_covariate`** — product of the applicable factors.
**Agent C owns these in `data/rules.json`. The engine reads them; it does not own them and
must not hard-code any of them.**

> ### ⚠️ BIND TO AGENT C's EFFECT-OPERATION VOCABULARY — do not invent one
>
> `rules.json` (48 rules) defines a closed set of effect operations. **Implement exactly
> these; reject any rule carrying an unknown `op` at load time rather than ignoring it.**
>
> | Op | Engine action |
> |---|---|
> | `pd_multiply` | multiply `e_i` **before** pathway pooling (this replaces my `S_covariate`) |
> | `pk_multiply` | multiply the PK parameter named in the rule (`CL`, `F`, `AUC`) |
> | `phenoconvert` | apply the CPIC activity-score rule (§3.3) before computing `f_CYP` |
> | `dose_cap`, `dose_start`, `titration_interval_days` | constrain the optimiser's search space (§4.7) — **the optimiser must never propose a dose the rules forbid** |
> | `block`, `require_override` | gate the run; `block` is the only hard stop |
> | `state_shift` | shift a `patient_model.json` baseline variable |
> | `risk_set`, `score_delta` | feed the report objective (Agent F), not the ODE |
> | `monitor`, `annotate_organ` | pass through to the UI; no numeric effect |
>
> Trigger predicates (`present`, `absent`, `eq`, `in`, `gte`, `lte`, `lt`, `between`) form
> a boolean tree — write a 30-line recursive evaluator, not a special case per rule.
>
> **Severity is an eight-level ladder and only the top rank hard-blocks.** Do not collapse
> it to a boolean. Bind the six demo gates by the stable ids in `demo_gate_rule_ids`:
> `RX-PREG-ACEI`, `RX-PREG-ARB`, `RX-GOUT-HCTZ`, `RX-ASTHMA-METOPROLOL`,
> `RX-COPD-METOPROLOL-NO-CARDIAC-INDICATION`, `DDI-DUAL-RAAS`.

> ### ⚠️ TWO DIRECTIONS IN THE TEAM'S §1.3 DRAFT ARE INVERTED — do not encode them
>
> The team's draft scope asserts that thiazides are **weaker in obesity** and **ineffective
> at low kidney function**. Agent C's sourcing shows both are wrong, and encoding either
> would enshrine an error as a model constant:
>
> - **Obesity: ACCOMPLISH found the hydrochlorothiazide arm performed *best* in obese
>   patients**, with amlodipine's advantage confined to non-obese patients. The draft's
>   "thiazides weaker, higher CCB response" is backwards. Agent D separately notes obesity
>   is a high-output, **low-resistance** state (SVR ≈ −20 %), which does not support a
>   larger CCB response either.
> - **Low kidney function: CLICK (NEJM 2021) gave −10.5 mmHg 24-h SBP in stage-4 CKD**
>   (mean eGFR 23). The classic "ineffective below eGFR 30" teaching is contested. See
>   `06-VALIDATION.md` CM-09, which deliberately does not resolve it.
>
> **Any `pd_multiply` in `rules.json` is authoritative over both the draft and this table.**
> The rows below are only what the engine expects to *see*; they are not defaults to apply.

| Condition | Affected class | Direction | Status |
|---|---|---|---|
| Black/African ancestry | ACEi, ARB | efficacy ↓ as monotherapy; restored when combined with a thiazide or CCB | well established |
| Age ≥ 65 / low-renin phenotype | ACEi, ARB | efficacy ↓ | well established |
| Age ≥ 65 / salt-sensitive | thiazide, CCB | efficacy ↑ | well established |
| High dietary sodium | ACEi, ARB, thiazide | efficacy ↓ | well established |
| Obesity | thiazide | ~~↓~~ **not ↓** — see box above | **draft corrected** |
| CKD, eGFR < 30 | thiazide | contested; apply 0–50 % reduction and show both positions | **draft corrected** |

If `rules.json` supplies no modifier, `S_covariate = 1.0` and the engine records
`covariate_source: "default"` so the report can say so.

### 4.5c Salt form determines indication — metoprolol is TWO products, not one

**Metoprolol tartrate (immediate-release) has no heart-failure indication. Only metoprolol
succinate (extended-release) does.** If the engine treats "metoprolol" as one substance,
the product can recommend metoprolol tartrate for heart failure — a clinically false
recommendation, and exactly the kind of error a cardiologist judge would catch instantly.

**Required implementation:** `products.json` must carry metoprolol tartrate and metoprolol
succinate as **separate products** with separate indication sets, even though they share
one active moiety and therefore one PK/PD parameter set apart from `ka`, `F` and `lag`
(§3.2). The engine keys PK on the *moiety* and indications on the *product*. Assert this
in `06-VALIDATION.md`. The same principle generalises: **never let a formulation
recommendation cross an indication boundary.**

### 4.6 Verification — the rule reproduces all three source meta-analyses

Run during research (`/tmp/pilsim/combo.py`, reproduced as `test/combination-rule.test.ts`):

**Monotherapy vs. Law 2003 (SBP, mmHg):**

| Class | rule ½× / 1× / 2× | Law 2003 observed | max error |
|---|---|---|---|
| Thiazide | 7.30 / 9.00 / 10.20 | 7.4 / 8.8 / 10.3 | 0.20 |
| β-blocker | 7.29 / 9.40 / 11.00 | 7.4 / 9.2 / 11.1 | 0.20 |
| ACE inhibitor | 6.83 / 8.63 / 9.94 | 6.9 / 8.5 / 10.0 | 0.13 |
| ARB | 7.79 / 10.31 / 12.30 | 7.8 / 10.3 / 12.3 | 0.01 |
| CCB | 5.89 / 8.81 / 11.70 | 5.9 / 8.8 / 11.7 | 0.01 |

**Cross-class additivity vs. Wald 2009 (target obs/exp = 1.01, CI 0.90–1.12):**
all nine cross-pathway pairs give **0.967–0.971, mean 0.969** ✅ inside the CI.

**Dual RAAS vs. ONTARGET (target +2.4/1.4 mmHg over ACEi alone):**
rule gives **+2.57 / +1.80 mmHg** ✅ — versus a naive additive rule which would have
claimed +10.31 mmHg, a 4× overstatement.

**Doubling-dose vs. adding-a-class ratio (Wald target 0.22, CI 0.19–0.25):**
rule gives thiazide 0.102, β-blocker 0.139, ACEi 0.153, ARB 0.235, CCB 0.247;
**mean 0.175** ⚠️ — *below* the published CI. **Report this honestly.** The reason is that
Law's per-class dose–response slopes are shallower for thiazides and ACE inhibitors than
Wald's pooled cross-class average implies; the two papers are not perfectly mutually
consistent. Our rule is faithful to the *per-class* data (Law) at the cost of a slightly
low pooled ratio. Acceptance in `06-VALIDATION.md` is therefore set on the per-class Law
table (tight) and on the cross-class additivity ratio (tight), with the doubling ratio as
an advisory check with a wide tolerance.

### 4.7 Reference output — "the 5 most efficient dosage combinations"

Computed by the rule at the Law 2003 reference baseline (154/97 mmHg), no covariates:

| Regimen | full dose ΔSBP/ΔDBP | half dose each ΔSBP/ΔDBP |
|---|---|---|
| Losartan + metoprolol | 19.07 / 12.07 | 14.70 / 9.77 |
| Losartan + HCTZ | 18.70 / 9.84 | 14.71 / 8.00 |
| Losartan + amlodipine | 18.51 / 11.19 | 13.38 / 8.22 |
| HCTZ + metoprolol | 17.84 / 10.94 | 14.23 / 8.98 |
| Amlodipine + metoprolol | 17.66 / 12.27 | 12.90 / 9.20 |
| Lisinopril + metoprolol | 17.49 / 11.25 | 13.79 / 8.96 |
| Amlodipine + HCTZ | 17.28 / 10.05 | 12.91 / 7.42 |
| Lisinopril + HCTZ | 17.12 / 9.00 | 13.80 / 7.18 |
| Lisinopril + amlodipine | 16.93 / 10.36 | 12.46 / 7.40 |
| **Lisinopril + losartan** | **11.20 / 6.58** | 10.00 / 5.81 |

Two things a judge will notice and reward:
1. **Dual RAAS blockade sits at the bottom** — the pharmacologically wrong answer is
   ranked last *by the model*, not by a hard-coded rule. The safety engine then also
   rejects it. Two independent systems agreeing is a strong demo moment.
2. **Half doses of two drugs beat a full dose of one.** Lisinopril + HCTZ at half doses
   each: 13.80 mmHg vs. lisinopril alone at *double* dose: 9.94 mmHg. That is the
   clinical message of Law 2003 falling out of the engine, and it is the correct answer
   to "what are the most efficient combinations."

**⚠️ Efficacy is only half the ranking.** The `05-OUTPUT-REPORT-SPEC.md` objective must
penalise adverse-effect burden, or the engine will recommend maximum doses. Law 2003's
adverse-symptom prevalence (treated minus placebo) is dose-steep for exactly the classes
whose efficacy is dose-flat:

| Class | ½ std | std | 2× std | severe enough to stop treatment (std dose) |
|---|---|---|---|---|
| Thiazide | 2.0 % | 9.9 % | 17.8 % | 0.1 % |
| β-blocker | 5.5 % | 7.5 % | 9.4 % | 0.8 % (0.3–1.4) |
| ACE inhibitor | 3.9 % | 3.9 % | 3.9 % | 0.1 % |
| ARB | −1.8 % | 0 % | 1.9 % | −0.2 % |
| CCB | 1.6 % | 8.3 % | 14.9 % | 1.4 % (0.4–2.4) |

Thiazide at 2× standard: **+1.2 mmHg SBP for +7.9 percentage points of symptoms.** Pass
this table to Agent F as the safety term of the objective function.

> ### ⭐ THE ASYMMETRY — the product's single strongest cited argument
>
> **Efficacy rises sub-linearly with dose. Visible harm rises supra-linearly.** That
> asymmetry is the whole reason PilSim recommends a *best* dose rather than a *maximum*
> dose, and amlodipine's own FDA label proves it in one table:
>
> | Amlodipine dose | ΔSBP (Emax fit, §4.1) | Peripheral oedema (NORVASC label) |
> |---|---|---|
> | 2.5 mg (½×) | 5.9 mmHg | **1.8 %** |
> | 5 mg (1×) | 8.8 mmHg (**+2.9**) | **3.0 %** (+1.2 pts) |
> | 10 mg (2×) | 11.7 mmHg (**+2.9**) | **10.8 %** (+7.8 pts) |
> | *placebo* | 0 | 0.6 % |
>
> **Doubling 5 → 10 mg buys 2.9 mmHg and 7.8 percentage points of visible oedema.**
> Note also what the label does *not* contain: **no dose-resolved blood-pressure figures at
> all.** The regulator quantified the harm by dose and left the benefit unresolved. That is
> the argument, and it is entirely from the label — nothing estimated.
> (Agent B1; <https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=7367289c-b0b0-466a-83e2-558e2985c29f>,
> N = 275/296/268/520, retrieved 2026-08-17.)
>
> **Sex effect, same label: oedema 14.6 % in women vs 5.6 % in men.** Sex must therefore be
> a *real* modifier in the patient model, not cosmetic. A 10 mg amlodipine recommendation
> that is reasonable for a man may not be for a woman — and that single contrast is a
> complete, cited, one-slide demonstration of why a digital twin is worth building.
> Agent D has been asked to carry sex as a genuine modifier for exactly this reason.
>
> **Consequence for the objective function (Agent F):** the safety term must be at least
> quadratic in dose, or it will not out-run the efficacy term at the top of the range.
> Validation test **SAT-05** asserts that adding the safety term actually changes the
> optimiser's answer.

---

## 5. Layer C — the cardiovascular homeostasis ODE (the counter-regulation)

The algebraic rule of §4 gives the correct **steady-state magnitude**. It gives no time
course, no organ variables, and nothing to animate. The ODE gives those, and it is what
makes the response biologically plausible over time. **They are reconciled by calibration
(§5.4), and a validation test asserts they agree within ±1.5 mmHg.**

### 5.1 State vector (6 states)

| Symbol | Meaning | Baseline | Units |
|---|---|---|---|
| `S` | sympathetic tone (normalised) | 1.0 | – |
| `A` | RAAS activity / effective AngII signal (normalised) | 1.0 | – |
| `V` | plasma/ECF volume (normalised) | 1.0 | – |
| `R` | systemic vascular resistance (normalised) | 1.0 | – |
| `C` | cardiac contractility index (normalised) | 1.0 | – |
| `HR` | heart rate | from `patient_model.json` | bpm |

### 5.2 Algebraic outputs (computed every step, these are what the UI binds to)

```
SV   = SV₀ · V^α · C                      α = 0.90  (Frank–Starling, normalised)
CO   = HR · SV / 1000                     L/min
MAP  = CO · R · SVR₀                      mmHg
PP   = SV / C_art                         pulse pressure, C_art = SV₀/(SBP₀−DBP₀)
SBP  = MAP + 2·PP/3
DBP  = MAP − PP/3
```

> ### ⚠️ BINDING TO AGENT D — calibrate, then run. Do NOT re-derive baselines here.
>
> Agent D's `patient_model.json` / `02-VIRTUAL-HUMAN.md` own the baseline. Their design
> decision is **calibrate-then-run**, and this engine must adopt it verbatim: blood
> pressure is an **input** at baseline and an **output** during simulation. Agent D's
> 44-step derivation pipeline computes cardiac output from ICRP reference values scaled by
> body surface area, `SV = CO/HR`, and then **solves** resistance and compliance from the
> haemodynamic identities so the twin reproduces the clinician's entered blood pressure
> *exactly* while every internal variable stays physiological. That is what makes the
> digital-twin premise credible rather than decorative.
>
> **Use Agent D's forms and units, not the simplified ones I drafted:**
> ```
> MAP  = CVP + SVR × CO / 80            (SVR in dyn·s·cm⁻⁵, CO in L/min)
> SVR₀ = 80 × (MAP₀ − CVP) / CO₀        ← solved, normal range 800–1200
> C_art = SV / (SBP − DBP)              ← solved
> ```
> **Bind to Agent D's 51-variable state vocabulary and its validity clamps. Do not define
> a parallel one.** The six states in §5.1 are the *dynamic* subset the integrator advances;
> every other quantity is one of Agent D's derived variables, computed by their pipeline.
>
> **Baroreflex gain is Agent D's, not mine.** They derive **−1.23 bpm/mmHg at HR 70** from
> published baroreflex sensitivity (~15 ms R-R per mmHg) rather than guessing it, with age
> scaling. **Use that value and drop my `G_b = 0.55`** — replace `G_b` with whatever
> normalisation reproduces −1.23 bpm/mmHg at the subject's own baseline heart rate, then
> **re-run the §5.4 calibration bisection**, since the θ values in that table were fitted
> against `G_b = 0.55`. The recalibration is a 5-minute script run; the ΔBP targets in
> §4.1 are unchanged, so the fitted θ values simply shift.
>
> **The property to preserve above all else:** each drug must reach the same blood-pressure
> endpoint by a *visibly different internal route* — amlodipine through SVR, HCTZ through
> plasma volume → stroke volume, metoprolol through heart rate and contractility, the RAAS
> drugs through their own path. **Do not collapse the haemodynamics into a single lumped
> BP effect.** The §4 algebraic rule is allowed to be lumped because it is the *ranker*;
> the ODE must not be, because it is the *animation*.

`SV₀`, `SVR₀`, `HR₀`, `SBP₀`, `DBP₀`, `CVP`, `C_art` all come from `patient_model.json`.

### 5.3 Drug occupancies (Layer A→B→C link)

Each drug produces a **pathway occupancy** `θ_p ∈ [0,1]`:

```
θ_i(t) = θ_max,i · C_i(t)^h / (EC50_i^h + C_i(t)^h)        h = 1
θ_p(t) = 1 − Π_{i on p} (1 − θ_i(t))
```

> **`EC50_i` MUST come from the clinical calibration of §5.4, NOT from a binding assay.**
> See §1. The correct way to obtain `EC50_i`: set it equal to the plasma concentration at
> the *average* of Cmax and Cmin at steady state for the drug's standard dose, and set
> `θ_max,i` by the calibration in §5.4. This anchors occupancy to the therapeutic
> concentration range by construction and makes the potency trap structurally impossible.

### 5.4 The ODE with drug terms

```
err   = (MAP_set − MAP) / MAP_set                          MAP_set = baseline MAP

S*    = clamp(1 + G_b·err, 0.2, 3.0)                       baroreflex target
drive = (1 + G_r·err + G_s·(S − 1)) · (1 − ρ_β1·θ_B1)      renin secretion drive
A*    = clamp(drive · (1 − θ_RAAS), 0.02, 5.0)
V*    = clamp(1 − k_p·err + k_a·(A − 1) − δ_NCC·θ_NCC, 0.5, 1.5)
R*    = clamp((1 + g_A·(A−1) + g_S·(S−1)·(1−θ_B1)) · (1 − δ_L·θ_LTYPE), 0.3, 2.5)
HR*   = HR₀ · (1 + h_S·(S−1)·(1−θ_B1)) · (1 − δ_HR·θ_B1)
C*    = (1 + c_S·(S−1)·(1−θ_B1)) · (1 − δ_C·θ_B1)

dX/dt = (X* − X) / τ_X          for X ∈ {S, A, V, R, C, HR}
```

**Constants (verified working in the prototype run; `ESTIMATED`, calibrated so the ODE
steady state matches §4.1 — that calibration IS their provenance):**

| Constant | Value | Meaning |
|---|---|---|
| `G_b` | 0.55 | baroreflex gain |
| `G_r` | 0.90 | renin response to MAP error |
| `G_s` | 0.60 | β1-mediated renin release from sympathetic tone |
| `ρ_β1` | 0.65 | fraction of renin secretion that is β1-dependent |
| `k_p` | 0.55 | pressure-natriuresis gain |
| `k_a` | 0.28 | aldosterone-driven Na/volume retention |
| `g_A` | 0.42 | SVR sensitivity to AngII |
| `g_S` | 0.35 | SVR sensitivity to sympathetic tone |
| `h_S` | 0.55 | HR sensitivity to sympathetic tone |
| `c_S` | 0.40 | contractility sensitivity to sympathetic tone |
| `α` | 0.90 | Frank–Starling exponent |
| `δ_NCC` | 0.26 | max fractional volume loss at full NCC blockade |
| `δ_L` | 0.155 | max fractional SVR reduction at full L-type blockade |
| `δ_HR` | 0.17 | max fractional HR reduction at full β1 blockade |
| `δ_C` | 0.13 | max fractional contractility reduction at full β1 blockade |

**Time constants — these are what produce the biologically plausible time course:**

| State | τ | Why it matters visually |
|---|---|---|
| `HR` | 2 min | reflex tachycardia after amlodipine appears within minutes |
| `S` | 5 min | baroreflex is the fastest loop |
| `R` | 30 min | vascular tone tracks drug concentration with a short lag |
| `C` | 30 min | |
| `A` | 6 h | RAAS activation after a thiazide dose builds over hours |
| `V` | 72 h | **this is why thiazides take ~2 weeks to reach full effect** |

**These τ values are the answer to "what stops the blood pressure going to zero."**
Set `θ_NCC = 0.4` and watch: MAP drops, `err` goes positive, `S*` and `drive` rise, `A`
rises over ~12 h, `V*` is pushed back up by `k_a·(A−1)` and by `−k_p·err`, and the pressure
partially rebounds. That rebound is *renin escape* and it is exactly why a thiazide gives
9 mmHg and not 25. A judge who asks about counter-regulation gets a live demo answer.

**Calibration procedure (run once, offline, commit the results):**
for each drug at its standard dose, bisect on `θ_max,i` until the ODE's converged ΔSBP
equals the §4.1 Emax value at `D = 1`. The prototype run produced:

| Drug/class | pathway | `θ` at standard dose | ODE ΔSBP | ODE ΔDBP | ODE HR | ODE CO |
|---|---|---|---|---|---|---|
| ACE inhibitor | RAAS | 0.166 | 8.50 | 5.96 | 73.3 | 4.87 |
| ARB | RAAS | 0.198 | 10.30 | 7.21 | 73.6 | 4.84 |
| CCB | LTYPE | 0.948 | 8.80 | 8.94 | **73.7 ↑** | **5.13 ↑** |
| Thiazide | NCC | 0.382 | 8.80 | 3.61 | 73.0 | **4.62 ↓** |
| β-blocker | B1 | 0.159 | 9.20 | 6.37 | **71.2 ↓** | 4.52 ↓ |

Note the ODE gets the *qualitative signatures* right for free: metoprolol lowers heart rate
and cardiac output, HCTZ lowers cardiac output through volume, the RAAS drugs work almost
purely through SVR with minimal heart-rate change, and amlodipine raises cardiac output
while leaving heart rate nearly untouched. **That is the material for Agent F's organ
animation, and none of it was hand-set.**

> ⚠️ **Amlodipine does NOT cause clinically significant reflex tachycardia on chronic oral
> dosing — do not animate one.** NORVASC label §12.2, verbatim: *"Although the acute
> intravenous administration of amlodipine decreases arterial blood pressure and increases
> heart rate …, **chronic oral administration of amlodipine in clinical trials did not lead
> to clinically significant changes in heart rate**"*, and BP reductions *"are not
> accompanied by a significant change in heart rate or plasma catecholamine levels."*
> ASCOT measured a mean heart-rate change of **−1.3 (SD 12.1) bpm** in the amlodipine-based
> arm (a small *decrease*). The prototype ODE predicts **+1.7 bpm** — within the
> "not clinically significant" band and acceptable, but **the acceptance test (VAL-09) caps
> the model's chronic amlodipine ΔHR at +3 bpm.** If a parameter change pushes it above
> that, reduce `G_b` (baroreflex gain) or `h_S`, do not ship it. A demo that shows the
> heart visibly speeding up on amlodipine is showing the *intravenous* pharmacology while
> claiming to model a tablet, and a cardiologist judge will say so.
> Source: <https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=7367289c-b0b0-466a-83e2-558e2985c29f>,
> retrieved 2026-08-17; ASCOT PMID 19761936.

> ⚠️ **Known ODE limitation, stated honestly.** The cross-pathway composition emerging from
> this ODE gives obs/exp ratios of 1.00–1.11 (prototype run) versus the algebraic rule's
> 0.967–0.971. Both are inside Wald's CI, but they differ by up to ~1.5 mmHg on a two-drug
> regimen. **Resolution: the algebraic rule of §4 is authoritative for reported numbers;
> the ODE is authoritative for shape and organ state.** Reconcile by scaling the ODE's
> drug terms by `E_algebraic / E_ODE` at the end of each run (a single scalar per run,
> applied to the BP trace only). Log both values. `06-VALIDATION.md` VAL-14 asserts the
> unscaled disagreement stays under 2.0 mmHg — if it grows beyond that, the ODE
> parameterisation has drifted and needs recalibration.

### 5.5 Non-haemodynamic outputs (electrolytes, urate, symptoms)

These are **empirical offsets applied at steady state and ramped with the same τ as the
relevant physiological loop**, not a nephron model. Say so in the UI.

```
Δ[K⁺]    = Σ_i  k_K,i · θ_i(t)          τ = 72 h   (tracks volume/aldosterone timescale)
Δ[Na⁺]   = Σ_i  k_Na,i · θ_i(t)         τ = 72 h
Δ[urate] = Σ_i  k_UA,i · θ_i(t)         τ = 168 h  (slow)
```

Directions the engine must reproduce (magnitudes come from Agent B/C data files):
- Lisinopril: `k_K > 0` (hyperkalaemia channel), plus a binary cough hazard
- Losartan: `k_K > 0` (smaller than lisinopril), **`k_UA < 0`** — losartan *lowers* urate
- HCTZ: **`k_K < 0`, `k_Na < 0`, `k_UA > 0`** — the gout reject case
- Amlodipine: all ≈ 0; peripheral oedema is a dose-dependent hazard, not an electrolyte
- Metoprolol: all ≈ 0

**Lisinopril + HCTZ:** the K⁺ terms have opposite sign and partially cancel. This is a real,
clinically-exploited interaction and it is one of the reasons the fixed-dose combination
product exists. The engine reproduces it for free by summing. **Demo this.**

### 5.6 Hard physiological constraints (applied after every step)

| Guard | Action |
|---|---|
| `MAP < 60` | clamp to 60, set `hypotension_floor_hit = true`, halt further dose escalation in the optimiser, surface a UI warning |
| `SBP < 90` or `DBP < 50` | flag `symptomatic_hypotension_risk`, apply a large penalty in the report objective |
| `HR < 45` | flag `bradycardia_risk` |
| `[K⁺] > 5.5` or `< 3.0 mmol/L` | flag, abort the "recommended" label |
| any state hits a clamp bound | record it; the report must say the simulation was constrained |

These are **not** part of `C_g` — keeping them separate is what lets `C_g` be large enough
to reproduce Wald 2009 while still guaranteeing physiological output.

---

## 6. Numerical method, time step, stability, horizons

### 6.1 Acute horizon — integrated

- **Integrator: classical RK4, fixed step.** The system is non-stiff at the chosen step;
  the fastest time constant is `τ_HR = 2 min`.
- **Δt = 1 minute.** Stability requires `Δt ≪ min(τ)`; `1 min` vs `τ_HR = 2 min` gives
  `Δt/τ = 0.5`, which RK4 handles comfortably (forward Euler would not — it needs
  `Δt/τ < 2` for stability but `< 0.1` for accuracy).
- **Horizon: 72 h default** (long enough to show 3 doses, accumulation, and the start of
  the volume response), **user-selectable 24 h / 72 h / 14 days.**
  - 24 h = 1 440 steps
  - 72 h = 4 320 steps
  - 14 days = 20 160 steps → switch Δt to 5 min above 7 days (τ_HR dynamics are no longer
    interesting once you are looking at a two-week trend)
- **Output downsampling:** never stream 4 320 frames. Emit one frame per 5 simulated
  minutes (864 frames for 72 h) plus every dose event. That is ~120 KB of JSON per run.
- **Stability check to implement:** after each step, if any state is `NaN` or outside
  `[−10, 10]×` its baseline, abort the run with `error: "integrator_diverged"` and report
  the step index. Do not silently produce garbage.
- **Do NOT integrate the PK.** Use the closed form (§3.1). Only the 6 ODE states plus (for
  losartan) the 2 metabolite states are integrated.

**Write the integrator yourself — this is the correct call, not a compromise.** Agent F's
prior-art survey found that every mature PK/PD tool is GPL and written in R, C#, or Julia
(none runs on Cloudflare), and that npm's six pharmacokinetics packages are all unusable.
An 8-state fixed-step RK4 is ~25 lines. If you would rather not hand-roll it, two
clean-licensed options exist: **`odex`** (BSD-2) and **`@martinjrobins/diffsol-js`** (MIT).
**Do not pull in a GPL dependency** — it would encumber the whole product.

### 6.1b ⚠️ ACCUMULATION BIAS — a 24 h run silently penalises amlodipine. Decided fix below.

**The problem (Agent B1).** Amlodipine needs **7–8 days** to reach steady state and
accumulates **≈ 2.9-fold** from first dose to steady state (t½ 30–50 h). The other four
drugs have half-lives of 2–14 h and are at steady state within a day or two. So a 24 h
simulation represents four drugs roughly correctly and amlodipine at **~35 % of its true
chronic exposure**.

**Why this is worse than a cosmetic error:** it biases the combination optimiser against
amlodipine *specifically*, and the resulting "5 most efficient combinations" ranking would
be wrong in a way that looks entirely plausible on screen. Nothing about the output would
signal the error. This is the most dangerous class of bug in the whole engine.

**DECISION — both halves, and they are not alternatives:**

**(a) The ranker never touches a time-truncated trace.** The §4 algebraic rule is a
steady-state, dose-based calculation and is therefore *already immune* to this bias. It is
what produces the combination ranking (§4.7) and the "best dose" output. **Hard rule: the
optimiser and every ranked recommendation read from `combinationRule()`, never from the
last frame of an ODE run.** Add an assertion. This alone removes the bias from every
user-visible ranking.

**(b) The ODE defaults to steady-state initial conditions, with first-dose kinetics as an
explicit opt-in.** Two named modes, always labelled on screen:

| Mode | Initial condition | Default? | What it answers |
|---|---|---|---|
| **`steady_state`** | drug history pre-loaded to convergence; ODE states pre-converged | ✅ **YES** | "What does this regimen do to my patient on ongoing therapy?" — the clinical question |
| **`first_dose`** | zero drug, baseline physiology | opt-in | "What happens when the patient takes the first tablet?" — the onset/titration question |

**Steady-state PK is closed form — no warm-up integration needed.** For dosing interval
`T`, the exact steady-state Bateman is:

```
C_ss(τ) = (F·D·ka)/(V_d·(ka−ke)) · [ e^(−ke·τ)/(1−e^(−ke·T)) − e^(−ka·τ)/(1−e^(−ka·T)) ]
```
`τ ∈ [0, T)` is time since the most recent dose. Same flip-flop guard as §3.1. This costs
one extra line versus the single-dose form and completely removes the amlodipine bias from
the PK layer. Pre-converge the six ODE states by running §5.4's bisection loop, or simply
integrate 21 simulated days at Δt = 5 min once (~6 000 steps, ~50 ms) before the display
window begins.

**(c) Make it visible — "Day 1 vs Day 8" is a demo asset, not a caveat.** The comparison is
genuinely compelling for a clinician, and it is the most legible thing amlodipine does that
no other drug in the set does. Ship a **side-by-side toggle** on the concentration and
blood-pressure panels. The mode must be named on screen at all times; a chart that does not
say which mode it is showing is a chart that will be misread.

**Accumulation ratios to display** (`R_ac = 1/(1 − e^(−ke·T))`, §3.1), 24 h dosing:

| Drug | t½ | `R_ac` | Time to 90 % of steady state |
|---|---|---|---|
| **Amlodipine** | 30–50 h | **≈ 2.9** | **7–8 days** |
| Metoprolol tartrate | 3–4 h | ≈ 1.00 | < 1 day |
| Losartan (EXP3174) | 7.4 h | ≈ 1.01 | < 1 day |
| HCTZ | 5.6–14.8 h | ≈ 1.01–1.06 | ~1–2 days |
| Lisinopril (effective) | 12 h | ≈ 1.04 | ~2 days |

**Amlodipine is the only drug in the set that accumulates at all.** That is exactly why it
was chosen for the set (locked decision 1: *"very long half-life, so the concentration-time
animation looks completely different from the others"*) — so surface it rather than letting
it silently distort the arithmetic. Validation: **PK-13b**.

### 6.2 Chronic horizon (5 years) — **approximated, not integrated**

Integrating five years at 1-minute resolution is 2.6 million steps × 8 states. That is
technically feasible in a Worker (~10–20 s CPU) but it is **scientifically worthless**: the
model contains no disease progression, no adherence dynamics, and no ageing, so all 2.6
million steps would reproduce the same steady state found in the first 3 weeks.

**What the long horizon must approximate instead:**

```
Phase 1 (integrate)  — run the ODE to convergence (typically 14–21 simulated days,
                       ~30 000 steps at Δt = 5 min, or use the algebraic rule directly).
                       Output: steady-state ΔSBP, ΔDBP, ΔHR, Δ[K⁺], Δ[Na⁺], Δurate.

Phase 2 (project)    — closed-form epidemiological projection over 5 years.
```

**Phase 2 equations.** Source: Ettehad D, Emdin CA, et al. *Blood pressure lowering for
prevention of cardiovascular disease and death: a systematic review and meta-analysis.*
Lancet 2016;387:957–967. PMID 26724178. Retrieved 2026-08-17.
Verbatim: *"every 10 mm Hg reduction in systolic blood pressure significantly reduced the
risk of major cardiovascular disease events (RR 0.80, 95 % CI 0.77–0.83), coronary heart
disease (0.83, 0.78–0.88), stroke (0.73, 0.68–0.77), and heart failure (0.72, 0.67–0.78),
which in turn led to a significant 13 % reduction in all-cause mortality (0.87, 0.84–0.91)."*

```
RR_endpoint = (RR_10mmHg) ^ (ΔSBP_sustained / 10)

  major CV event   RR_10 = 0.80  (0.77–0.83)
  coronary HD      RR_10 = 0.83  (0.78–0.88)
  stroke           RR_10 = 0.73  (0.68–0.77)
  heart failure    RR_10 = 0.72  (0.67–0.78)
  all-cause death  RR_10 = 0.87  (0.84–0.91)

Risk_treated(5y)  = Risk_baseline(5y) · RR_endpoint
Events_prevented_per_1000 = 1000 · (Risk_baseline − Risk_treated)
NNT(5y) = 1 / (Risk_baseline − Risk_treated)
```

`Risk_baseline(5y)` comes from the virtual human's baseline risk profile (Agent D). If
Agent D supplies a 10-year risk, convert with `Risk(5y) ≈ 1 − (1 − Risk(10y))^0.5`
(constant-hazard assumption — **label it `ESTIMATED` in the report**).

**Adherence and persistence.** Multiply `ΔSBP_sustained` by an adherence fraction the user
can set (default 1.0, with a "realistic adherence" preset at 0.7 — real-world
antihypertensive persistence is well below 1.0). This is the single most honest knob on
the 5-year screen and it makes the prognosis feature look sophisticated rather than naive.

**Uncertainty band.** Propagate the published CIs: run the projection at the RR point
estimate and at both CI bounds, and at `ΔSBP ± 1.96·SE` from the population spread (§7).
Report the 5-year outcome as a **band, never a point.** A single number here is the
easiest thing in the whole product for a clinician judge to attack.

**⚠️ Extrapolation warning the UI must show on the 5-year screen:** Ettehad 2016's relative
risks are derived from randomised-trial populations over ~4 years of follow-up. Applying
them to a synthetic individual with user-invented baseline characteristics is an
extrapolation. Word it exactly as `05-OUTPUT-REPORT-SPEC.md` specifies.

### 6.3 One engine, two horizons — how they share code

```
runSimulation(regimen, subject, mode):
    pk        = analyticPK(regimen, subject)          # shared
    occupancy = pkToOccupancy(pk, regimen)            # shared
    if mode == 'acute':
        return integrate(occupancy, dt=1min,  horizon=72h,  emitEvery=5min)
    if mode == 'chronic':
        ss = integrate(occupancy, dt=5min, horizon=21d, emitEvery=6h, stopOnConverged=true)
        return project5Year(ss, subject)              # closed form
```

The *only* difference is `dt`, `horizon`, and whether Phase 2 runs. Same PK, same
occupancy, same ODE, same guards. **No design decision here forces a choice between
problem 12 and problem 14.**

---

## 7. Inter-individual variability — the virtual population

### 7.1 What varies and how

Sample per virtual subject, log-normal for all strictly-positive PK parameters (standard in
population PK — keeps values positive and gives the right right-skew):

```
P_i = P_pop · exp(η_i),     η_i ~ N(0, ω²),     ω = sqrt(ln(1 + CV²))
```

| Parameter | Distribution | CV (default if `substances.json` says `NOT_FOUND`) | Notes |
|---|---|---|---|
| `CL` | log-normal | 30 % | the dominant driver of exposure spread |
| `V_d` | log-normal | 25 % | |
| `ka` | log-normal | 40 % | absorption is the most variable process |
| `F` | logit-normal on [0,1] | 20 % | must stay bounded |
| `Emax` (PD) | log-normal | 30 % | |
| `ED50` (PD) | log-normal | 35 % | |
| Baseline SBP/DBP | normal | SD 12 / 8 mmHg | from `patient_model.json` |
| Baseline HR | normal | SD 9 bpm | |
| eGFR | log-normal | 20 % | correlated with age — see §7.2 |
| CYP2D6 phenotype | **categorical** | PM 7 %, IM 12 %, NM 75 %, UM 6 % (European reference; `ESTIMATED` — Agent B to supply cited allele frequencies, and Central-Asian frequencies differ) | discrete, not log-normal |
| CYP2C9 phenotype | categorical | NM 65 %, IM 30 %, PM 5 % (`ESTIMATED`, same caveat) | |

**Correlations that must be respected** (otherwise you generate impossible people):
- eGFR ↓ with age: `eGFR_i = eGFR(age, sex, ...) · exp(η)` — draw the *deterministic* value
  from Agent D's equation first, then add residual variability. Do **not** draw eGFR
  independently.
- Weight ↔ `V_d`: `V_d` scaling on weight is already in §3.3; do not also correlate the
  random effect with weight.
- `CL` and `V_d` share a modest positive correlation (ρ ≈ 0.3) in most published models.
  Implement with a 2×2 Cholesky factor; it is 6 lines and it stops the population
  containing subjects with huge `V_d` and tiny `CL` (implausible half-lives of days).
- **Residual unexplained variability on the BP endpoint:** add `ε ~ N(0, 6 mmHg)` to the
  final ΔSBP of each subject. Without it, the population output is unrealistically tight
  and a reviewer will notice that everyone responds.

### 7.2 How many subjects

| N | CPU (est., see §8.4) | Use case |
|---|---|---|
| 1 | 30–120 ms | Problem 12 — the single digital twin. Deterministic, no sampling. |
| **50** | 1.5–6 s | Live UI slider preview; enough for a smooth histogram |
| **200** | 6–24 s | **DEFAULT for a "run trial" action.** SE of the mean ΔSBP with SD ≈ 8 mmHg is 0.57 mmHg — well below the 1.4 mmHg resolution the source meta-analyses themselves have. More subjects buy nothing scientifically. |
| 1 000 | 30–120 s | Only if the user asks for tail percentiles (P1/P99) or a rare-responder analysis. Must run chunked (§8.5). |

**Recommendation: default N = 200, cap the UI at 1 000, and say in the report why 200 is
enough.** "We ran 10 000 virtual patients" is a red flag to anyone who knows sampling
error, not an impressive number.

**Seeding:** every run stores its PRNG seed in the Durable Object. Runs must be exactly
reproducible — a judge asking "run that again" and getting a different answer is fatal.
Use a seeded xorshift128+ or PCG32, not `Math.random()`.

### 7.3 What the output distribution should look like

Emit, per endpoint (ΔSBP, ΔDBP, ΔHR, Δ[K⁺], Cmax, AUC):

```
{
  n: 200, seed: 8471223,
  mean, sd, median,
  quantiles: { p5, p25, p50, p75, p95 },
  histogram: { binWidth, bins: [...] },     // 20 bins, for the violin/density plot
  responders: {                              // fraction meeting a threshold
    sbp_drop_ge_10mmHg: 0.62,
    reached_target_140_90: 0.48,
    reached_target_130_80: 0.29
  },
  adverse: { hypotension: 0.03, hyperkalaemia_gt_5_5: 0.05, bradycardia: 0.01 }
}
```

**Expected shape, so you can tell when it is wrong:**
- ΔSBP should be **approximately normal, SD 8–12 mmHg**, mean matching §4.7. If the SD
  comes out under 4 mmHg you have forgotten the residual error term; over 20 mmHg your CVs
  are too high.
- **A meaningful non-responder tail is correct and should be visible** — roughly 10–20 % of
  subjects with ΔSBP < 3 mmHg. Real antihypertensive trials have exactly this. A
  distribution where everyone responds is the tell-tale sign of a fake simulation.
- `Cmax` and `AUC` should be **right-skewed** (log-normal), unlike ΔSBP. If your AUC
  histogram is symmetric, you sampled normally instead of log-normally.
- With CYP2D6 in the model, metoprolol AUC should be visibly **bimodal/multimodal** — the
  poor-metaboliser subpopulation separates out. **This is the single best visual for
  problem 12's "genetics" requirement. Make sure the histogram is not over-binned into
  hiding it: use 30+ bins for metoprolol AUC.**

---

## 8. The Cloudflare execution plan

All limits below were fetched from the live docs on **2026-08-17**, not from memory.

### 8.1 Documented limits (quoted, with links)

**Workers** — <https://developers.cloudflare.com/workers/platform/limits/> (page states
"Last updated Jul 28, 2026"):

| Limit | Workers Free | Workers Paid |
|---|---|---|
| CPU time per HTTP request | **10 ms** | **5 min (default: 30 seconds)** |
| CPU time per Cron Trigger | 10 ms | 30 s (< 1 h interval) / 15 min (≥ 1 h interval) |
| Memory per isolate | **128 MB** | 128 MB |
| Duration (HTTP request) | **No limit** while the client stays connected | No limit |
| Duration (Cron / Queue consumer / **DO Alarm**) | 15 min | **15 min** |
| Subrequests per invocation | 50 | 10 000 (up to 10 M) |
| Simultaneous outgoing connections | 6 | 6 |
| Worker size | 3 MB gzip / 64 MB uncompressed | 10 MB gzip / 64 MB uncompressed |
| Worker startup time | 1 s | 1 s |
| Daily requests | 100 000 | no limit |
| Response body size | no enforced limit | no enforced limit |

Raising CPU time (Paid only), verbatim from the docs:
```jsonc
{ "limits": { "cpu_ms": 300000 } }   // default is 30000 (30 seconds)
```
Also stated: *"CPU time measures how long the CPU spends executing your Worker code.
Waiting on network requests (such as fetch() calls, KV reads, or database queries) does
not count toward CPU time."* And: *"Each isolate has some built-in flexibility to allow
for cases where your Worker infrequently runs over the configured limit."*
On exceeding it: Error 1102, invocation outcome `exceededCpu`.

**Durable Objects** — <https://developers.cloudflare.com/durable-objects/platform/limits/>
(page states "Last updated Jun 1, 2026"):

| Limit | Value |
|---|---|
| **CPU per request** | **30 seconds default / configurable to 5 minutes** (same `limits.cpu_ms`) |
| Storage per SQLite-backed DO | 10 GB (Workers Paid) |
| Key + value combined | 2 MB |
| WebSocket message size (received) | 32 MiB |
| Max SQL statement length | 100 KB |
| Max bound parameters per query | 100 |
| Max string/BLOB/row size | 2 MB |
| Soft throughput per individual Object | ~1 000 requests/second |
| Number of Objects | unlimited |

Verbatim: *"Durable Objects are Worker scripts, and have the same per invocation CPU
limits as any Workers do."* and *"By default, the maximum CPU time per Durable Objects
invocation (HTTP request, WebSocket message, or Alarm) is set to 30 seconds, but can be
increased … by setting `limits.cpu_ms`."*

**Containers / Sandbox SDK** —
<https://developers.cloudflare.com/containers/platform-details/limits/> ("Last updated
Jul 3, 2026") and <https://developers.cloudflare.com/sandbox/platform/limits/>
("Last updated Aug 6, 2026"):

| Instance type | vCPU | Memory | Disk |
|---|---|---|---|
| lite | 1/16 | 256 MiB | 2 GB |
| basic | 1/4 | 1 GiB | 4 GB |
| standard-1 | 1/2 | 4 GiB | 8 GB |
| standard-2 | 1 | 6 GiB | 12 GB |
| standard-3 | 2 | 8 GiB | 16 GB |
| standard-4 | 4 | 12 GiB | 20 GB |

Sandbox SDK subrequest note, verbatim: *"By default, the SDK uses HTTP transport where each
operation (exec(), readFile(), writeFile(), etc.) counts as one subrequest"* — **Workers
Free: 50, Workers Paid: 1 000** (note: the Sandbox page states 1 000, which is *lower*
than the general Workers Paid figure of 10 000; assume 1 000 for sandbox work). Mitigation
documented: set `SANDBOX_TRANSPORT = "rpc"` to multiplex over one connection.

### 8.2 Architecture — what runs where

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser (React/Svelte SPA served as Static Assets from the Worker)  │
│  ├─ POST /api/runs           → create a run                          │
│  └─ WS   /api/runs/:id/live  → progress frames                       │
└────────────────────────┬────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────────┐
│ WORKER  (stateless, ~2–5 ms CPU)                                     │
│  • serves the SPA and the baked JSON datasets                        │
│  • validates the regimen + subject against a Zod schema              │
│  • runs the SAFETY ENGINE (rules.json) — pure, synchronous, <1 ms    │
│  • runs the FAST RANKER: the §4 algebraic combination rule over all  │
│    candidate dose combinations. Pure arithmetic. ~10 µs per          │
│    combination → all 5-drug pairs × 5 dose levels ≈ 250 evaluations  │
│    ≈ 3 ms. This is the "5 most efficient dosage combinations"        │
│    feature and it NEVER needs the ODE.                               │
│  • routes to the SimulationRun DO by idFromName(runId)               │
└────────────────────────┬────────────────────────────────────────────┘
                         │  (service binding / DO stub, no network hop)
┌────────────────────────▼────────────────────────────────────────────┐
│ DURABLE OBJECT  SimulationRun   (SQLite-backed, one per run)        │
│  • owns the run: seed, regimen, subject, status, cursor              │
│  • runs the ODE integrator (TypeScript, no WASM)                     │
│  • holds the WebSocket(s) via the Hibernation API                    │
│  • persists frames + final results in SQLite                         │
│  • schedules its own continuation via ctx.storage.setAlarm() when a  │
│    chunk approaches the CPU budget (§8.5)                            │
│  • limits.cpu_ms = 300000 in wrangler.jsonc                          │
└─────────────────────────────────────────────────────────────────────┘
```

**Storage:**

| Data | Where | Why |
|---|---|---|
| `substances.json`, `products.json`, `rules.json`, `patient_model.json` | **bundled into the Worker at build time** as ES module imports | zero latency, zero runtime API dependency, versioned with the code. Total size is a few hundred KB — nowhere near the 10 MB gzip Worker limit. This satisfies the mission brief's "no live third-party API in the critical demo path" constraint absolutely. |
| Run state (status, cursor, seed, regimen, subject) | DO SQLite, one row | needs strong consistency and a single writer |
| Frame stream (time series) | DO SQLite, `frames(run_id, t, payload BLOB)` | 864 rows × ~150 bytes for a 72 h run ≈ 130 KB, far under the 10 GB/DO and 2 MB/row limits |
| Final report | DO SQLite + optionally mirrored to KV for shareable read-only links | |
| Saved subjects / saved pills (the sidebar list) | **D1** (one shared database) | relational, queried across users, not per-run |

**Do NOT use:** KV for run state (eventually consistent — a run that appears to go backwards
on refresh is a demo-killer). R2 is unnecessary at this data volume.

### 8.3 Does anything need the Sandbox SDK? — **No.**

Explicit decision, because it is a real fork in the build plan:

- The whole engine is **~400 lines of arithmetic on Float64Array**. No SciPy, no NumPy, no
  RDKit, no linear algebra beyond a 2×2 Cholesky.
- A Sandbox container adds **cold-start latency (seconds), an image build step, container
  concurrency limits, and a subrequest budget of 1 000** — all cost, no benefit.
- **Only reason to reach for Sandbox SDK:** if the team later wants to run an actual
  open-source PK/PD stack (nlmixr2, PKPDsim, PySB, Open Systems Pharmacology) for
  cross-validation of our numbers. Do that **offline, before the demo**, commit the
  results as a fixture file, and cite them in `06-VALIDATION.md`. Do not put it in the
  demo path.
- **Workers AI is used only for narrative generation** — turning the numeric report into
  prose and translating it to Uzbek/Russian. It must be `ctx.waitUntil()`-able and the
  UI must render fully without it. An LLM must never produce, alter, or round a number.

### 8.4 Estimated CPU cost per run

Measured basis: the prototype ODE in this document ran 120 simulated days at Δt = 0.05 h
(57 600 Euler steps × 6 states) in Python in ~0.4 s per steady-state solve. TypeScript on
V8 with typed arrays is conservatively **10–30× faster** than CPython for this arithmetic.

| Workload | Steps | Est. CPU | vs. 30 s default | vs. 300 s max |
|---|---|---|---|---|
| Algebraic rule, one regimen | – | **~10 µs** | 0.00003 % | – |
| Full 5-drug dose grid ranking (250 regimens) | – | **~3 ms** | 0.01 % | – |
| Acute run, 1 subject, 72 h, RK4 Δt=1 min | 4 320 × 4 evals × 8 states | **~30–120 ms** | 0.4 % | – |
| 14-day run, 1 subject, Δt=5 min | 4 032 | ~30–110 ms | 0.4 % | – |
| Chronic Phase 1, 21 d, Δt=5 min | 6 048 | ~45–170 ms | 0.6 % | – |
| Chronic Phase 2 (5-y projection) | closed form | < 1 ms | – | – |
| **Population, N = 200, acute** | 864 000 | **~6–24 s** | **20–80 %** ⚠️ | 2–8 % ✅ |
| Population, N = 1 000, acute | 4.3 M | **~30–120 s** | **EXCEEDS** ❌ | 10–40 % ✅ |

**Decisions that follow:**
1. Set `"limits": { "cpu_ms": 300000 }` on the `SimulationRun` DO in `wrangler.jsonc`.
   Without it, N = 200 sits uncomfortably close to the 30 s default.
2. **Workers Free plan is unusable** for the population feature (10 ms CPU). The team must
   be on Workers Paid before demo day. **Flag this to the lead — it is a hard blocker, not
   a preference.** A single-subject acute run also exceeds 10 ms, so even the digital-twin
   view needs Paid.
3. Profile before demo day with `wrangler dev` + DevTools CPU profiling
   (<https://developers.cloudflare.com/workers/observability/dev-tools/cpu-usage/>) and
   put the real number in the README. The estimates above are estimates.

### 8.5 What to do when a run exceeds a single invocation's budget

This is a designed-in feature, not an error path. **Chunked continuation inside the DO:**

```
POST /api/runs
  → DO.start(): persist {regimen, subject, seed, N, cursor: 0, status: 'running'}
                schedule ctx.storage.setAlarm(Date.now())   // immediate
                return 202 + runId   (Worker CPU used: ~2 ms)

alarm():
  budgetMs = 20_000                          // 2/3 of the 30 s default, well inside 300 s
  t0 = Date.now()
  while (cursor < N && Date.now() - t0 < budgetMs) {
      result = simulateSubject(cursor, seed)
      sql.exec("INSERT INTO subjects VALUES (?,?)", cursor, pack(result))
      cursor++
      if (cursor % 10 === 0) broadcastProgress(cursor / N)
  }
  storage.put('cursor', cursor)
  if (cursor < N) { storage.setAlarm(Date.now() + 10) }    // continue next invocation
  else            { finalise(); broadcastDone() }
```

Why this works and why it is the idiomatic Cloudflare shape:
- **Each alarm is a fresh invocation with a fresh CPU budget.** The 15-minute *duration*
  limit on DO alarms is wall-clock and irrelevant here; the CPU budget is what resets.
- **The DO is single-threaded**, so there is no lock needed — the cursor is safe by
  construction. This is exactly what Durable Objects are for.
- Wall-clock time is measured with `Date.now()`, which is a coarse proxy for CPU time in
  a Worker (timers are intentionally low-resolution). Budget conservatively at 20 s and
  it will not trip the 30 s CPU limit even if the two diverge.
- **The client is never blocked.** The WebSocket is attached separately and receives
  progress frames as they are produced, across as many alarm invocations as it takes.
- If the DO crashes mid-run, the cursor is durable — the next alarm resumes from where it
  stopped. Nothing is lost, nothing is recomputed.

**Alternative considered and rejected:** Cloudflare Workflows would also solve this and is
arguably more idiomatic for long multi-step jobs. Rejected for a 24-hour build because the
DO already has to exist (for the WebSocket and the run state) and adding Workflows means a
second durable primitive, a second mental model, and a second failure mode for no gain at
this scale. Revisit if runs ever need to survive hours or fan out across many machines.

### 8.6 Streaming to the UI

**Use WebSockets with the Hibernation API** (`state.acceptWebSocket(ws)`), not SSE, not
polling.

- Hibernation means the DO can be evicted between frames without dropping the socket — no
  billing for idle wall-clock and no reconnect logic in the client.
- **Message payload is the `EffectFrame` interface defined normatively in
  `04-ORGAN-EFFECT-MAP.md` §2.** Use those exact field names. See §8.6a below for the
  engine's conformance map — which fields are computed, which are derived, and which the
  engine cannot produce honestly.

```jsonc
{ "type": "frame", "frame": { /* EffectFrame, see 04-ORGAN-EFFECT-MAP.md §2 */ } }
```

### 8.6a EffectFrame conformance — engine ⇄ animation contract

Agent F's `EffectFrame` is richer than the engine's 6-state core. **Three tiers, and the
UI must be able to tell them apart** (ship a `provenance` map alongside the frame):

| Tier | Meaning | UI treatment |
|---|---|---|
| **COMPUTED** | a state or direct algebraic output of the engine | render at full confidence |
| **DERIVED** | a monotone transform of a computed quantity through a documented, `ESTIMATED` relationship | render normally, footnote the relationship |
| **PROXY** | an index normalised to 1.00 at baseline with no absolute physiological calibration | **render as a relative index only — never with absolute units next to it** |

| `EffectFrame` field | Tier | Source in this engine |
|---|---|---|
| `t_h` | COMPUTED | loop counter |
| `conc.*` (all six, incl. `exp3174`) | COMPUTED | §3.1 Bateman; `exp3174` from the §3.4 metabolite chain |
| `engagement.at1_blockade` | COMPUTED | §8.6b, driven by **parent + EXP3174** |
| `engagement.urat1_inhibition` | COMPUTED | §8.6b, driven by **parent losartan only** |
| `engagement.beta1_occupancy`, `beta2_occupancy` | COMPUTED | §8.6b, two EC50s, one concentration |
| `engagement.ace_inhibition_plasma` | COMPUTED | §8.6b |
| `engagement.ace_inhibition_pulmonary`, `..._renal` | **PROXY** | the engine has **no tissue compartments** (§2.1). Emit `= ace_inhibition_plasma` and mark PROXY. **Do not fabricate a tissue gradient.** |
| `engagement.cav12_block_vsmc` | COMPUTED | §8.6b |
| `engagement.cav12_block_myocardium` | DERIVED | `= 0.03 × cav12_block_vsmc` (`ESTIMATED`) — amlodipine is vascular-selective; F's own note says "near 0" |
| `engagement.ncc_inhibition` | COMPUTED | §8.6b |
| `mediators.renin_pra_fold` | COMPUTED | §8.6c — **this is the counter-regulation readout F asked for** |
| `mediators.ang_ii_fold` | COMPUTED | the ODE state `A` |
| `mediators.aldosterone_fold` | DERIVED | `= A^0.8` (`ESTIMATED`; aldosterone tracks AngII sub-proportionally) |
| `mediators.sympathetic_tone_fold` | COMPUTED | the ODE state `S` |
| `mediators.bradykinin_fold` | DERIVED | `= 1 + 1.5 × ace_inhibition_plasma` (`ESTIMATED`) — the cough/angioedema channel; ACE degrades bradykinin, so inhibiting ACE raises it. **Zero for all non-ACEi drugs**, which is exactly why cough is a lisinopril-specific channel and not a losartan one. Good demo contrast. |
| `mediators.renin_pra`, `ang_ii`, `aldosterone` (absolute units) | DERIVED | `fold × baseline`, where baseline comes from `patient_model.json`. **If Agent D has not published absolute baselines, emit `null` and only the `_fold` fields.** Do not invent ng/mL values. |
| `haemo.sbp/dbp/map/hr/stroke_volume/cardiac_output/contractility_index` | COMPUTED | §5.2 |
| `haemo.svr` | DERIVED | engine works in mmHg/(L/min); convert `dyn·s·cm⁻⁵ = 80 × mmHg/(L/min)` |
| `haemo.arteriolar_radius_index` | DERIVED | Poiseuille: `R ∝ r⁻⁴` ⇒ `r_index = R_normalised^(−0.25)` |
| `haemo.venous_tone_index` | **PROXY** | `= 1 − 0.4·(S₀−S)` (`ESTIMATED`). No venous compartment exists. |
| `haemo.capillary_hydrostatic_p` | **PROXY** | `= P_cap0 · (1 + 0.6·(1 − arteriolar_radius_index⁻¹))` (`ESTIMATED`) — this is the **amlodipine oedema mechanism**: dihydropyridines dilate the arteriole preferentially, so capillary pressure rises. Directionally right, quantitatively `ESTIMATED`. |
| `renal.gfr` | COMPUTED | from the subject's eGFR, modulated by `p_glomerular` |
| `renal.p_glomerular` | **PROXY** | `= P_g0 · (afferent/efferent radius ratio term)` (`ESTIMATED`). The RAAS-drug efferent-dilation story is the key renal-protection animation, and it is `ESTIMATED` — **label it.** |
| `renal.afferent_radius_index` | DERIVED | `= 1 + 0.10·cav12_block_vsmc` (amlodipine preferentially dilates the afferent arteriole) |
| `renal.efferent_radius_index` | DERIVED | `= 1 + 0.25·at1_blockade + 0.22·ace_inhibition_plasma` (AngII constricts the efferent arteriole; blocking it dilates) — `ESTIMATED` magnitudes, well-established direction |
| `renal.frac_na_reab_dct` | COMPUTED | `= f_DCT0 · (1 − ncc_inhibition)` — **the HCTZ target, and the one renal field that is genuinely mechanistic** |
| `renal.frac_na_reab_pt`, `_tal`, `_cd` | **PROXY** | fixed at baseline except `_cd`, which rises with `aldosterone_fold` (the indirect K⁺ path, see below) |
| `renal.na_excretion_rate`, `k_excretion_rate`, `urate_excretion_rate`, `urine_flow`, `renal_blood_flow`, `filtration_fraction` | DERIVED | from the above; **`urate_excretion_rate` is driven by `urat1_inhibition`** |
| `chem.serum_k/na/urate` | COMPUTED | §5.5 empirical offsets |
| `chem.plasma_volume`, `ecf_volume` | DERIVED | `= baseline × V` (the ODE volume state) |
| `chem.serum_creatinine` | DERIVED | inverse of `renal.gfr` |
| `chem.fasting_glucose` | **PROXY** | thiazide and β-blocker dysglycaemia are real but unmodelled. Emit baseline unchanged, or an `ESTIMATED` offset from `rules.json`. **Do not animate a glucose response the engine did not compute.** |
| `periph.interstitial_volume_index` | DERIVED | from `capillary_hydrostatic_p` |
| `periph.edema_grade` | DERIVED | **must be calibrated to VAL-10** (NORVASC label: 1.8 / 3.0 / **10.8 %** at 2.5 / 5 / 10 mg vs 0.6 % placebo) — a steeply supra-linear dose relationship, not a linear one |
| `liver.*` | see `04-ORGAN-EFFECT-MAP.md` | driven by CYP occupancy and the losartan→EXP3174 conversion flux |

> **On the K⁺ story, answering Agent F's flagged gap:** F is right that no drug in the set
> acts on the collecting duct directly, so potassium moves entirely indirectly. The engine
> models both real paths: (1) **aldosterone** — RAAS blockade lowers `aldosterone_fold`,
> which lowers collecting-duct K⁺ secretion (the hyperkalaemia channel for lisinopril and
> losartan); (2) **distal sodium delivery** — HCTZ blocks the DCT, so more Na⁺ reaches the
> collecting duct, driving Na⁺/K⁺ exchange and K⁺ loss (the hypokalaemia channel). These
> have opposite signs and partly cancel in the lisinopril + HCTZ product. **The `Δ[K⁺]`
> magnitudes in §5.5 are the authoritative numbers** (validated against VAL-05/06/11);
> the two-path decomposition is the *animation narrative*, and the coding agent must make
> the two paths sum to the validated total rather than letting them float independently.

### 8.6b Receptor-occupancy layer — the `engagement.*` fields

One shared concentration per drug, one Hill-1 occupancy per receptor. **Every `EC50_rec`
here is `ESTIMATED` and anchored to the therapeutic concentration range, never to an
in-vitro binding constant (§1).** The anchoring rule: choose `EC50_rec` so that the
occupancy at the standard dose's steady-state average concentration equals the target
below.

| Field | Driven by | Occupancy at standard dose | Provenance of the target |
|---|---|---|---|
| `ace_inhibition_plasma` | lisinopril | **0.80** at 20 mg | `ESTIMATED` — ACE inhibitors achieve high but incomplete plasma ACE inhibition at trough; the incompleteness (plus chymase-mediated AngII generation) is *why* an ARB adds anything at all (§4.3) |
| `at1_blockade` | **losartan + 20 × EXP3174** (§3.4) | **0.85** at 50 mg, **0.90** at 100 mg | `ESTIMATED`, consistent with the §4.4 `C_RAAS` calibration |
| `urat1_inhibition` | **parent losartan ONLY** | **0.30** at 50 mg | `ESTIMATED`, calibrated so `Δurate = −0.29 mg/dL` (VAL-08). **Parent-driven, per Agent F's request — this is what makes it peak at Tmax ≈ 1 h while `at1_blockade` peaks at ≈ 3.5 h.** That 2.5-hour dissociation is real, sourced, and the most scientifically interesting single frame in the losartan animation. |
| `cav12_block_vsmc` | amlodipine | **0.50** at 5 mg, **0.65** at 10 mg | `ESTIMATED`, consistent with the CCB `ED50 ≈ 0.98 × standard` fit (§4.1) — amlodipine at 5 mg genuinely sits near half-maximal, which is why it is the one drug where dose escalation pays |
| `ncc_inhibition` | HCTZ | **0.45** at 25 mg | `ESTIMATED`, consistent with `ED50 ≈ 0.31 × standard` |
| `beta1_occupancy` | metoprolol | **0.54–0.92** at 100 mg b.i.d. — use **0.73** at average steady-state concentration | target range supplied by Agent F (`04-ORGAN-EFFECT-MAP.md` [S12]) |
| `beta2_occupancy` | metoprolol, **same concentration, EC50 × ρ_sel** | **0.06–0.38** at 100 mg b.i.d. — use **0.16** at average concentration | Agent F [S12]. Solve `ρ_sel` from the two targets rather than assuming 75: `ρ_sel = (θ₁(1−θ₂))/(θ₂(1−θ₁))` = (0.73×0.84)/(0.16×0.27) ≈ **14.2**. **Use 14.2 — it is derived from a sourced target pair and supersedes the `ESTIMATED` 75 in §3.5.** |

`selectivity_ratio = beta1_occupancy / beta2_occupancy` → **4.6 at 100 mg b.i.d., falling
towards 1.0 as concentration rises.** That fall is the selectivity-loss animation.

### 8.6c Plasma renin activity — the counter-regulation readout

Agent F is correct that the demo needs a **visible renin rise while blood pressure falls**,
and that its absence would be the first thing a clinician judge notices. The engine emits
PRA as an explicit output equation:

```
renin_pra_fold = (1 + G_r·err + G_s·(S−1)) · (1 − ρ_β1·θ_B1)
                 · (1 + 1.5·at1_blockade + 1.2·ace_inhibition_plasma + 0.8·ncc_inhibition)
```

| Term | Effect | Validation target |
|---|---|---|
| ARB, losartan 100 mg (`at1_blockade` 0.90) | ×2.35 | Agent F [S3]: losartan 100 mg **doubles to triples** PRA ✅ |
| ACE inhibitor, lisinopril 20 mg (`ace_inhibition` 0.80) | ×1.96 | ACE inhibitors raise PRA — direction certain, magnitude `ESTIMATED` |
| HCTZ 25 mg (`ncc_inhibition` 0.45) | ×1.36 | thiazide-induced renin activation — direction certain, magnitude `ESTIMATED` |
| Metoprolol (`θ_B1` 0.73, `ρ_β1` 0.65) | ×0.53 | β-blockers **lower** PRA — the opposite sign, and the mechanistic reason β-blocker + RASi is partly redundant (§4.3) |

The gain constants 1.5 / 1.2 / 0.8 are `ESTIMATED`, calibrated to the one sourced anchor
(the losartan 2–3× figure). **Why PRA is an output equation and not an ODE state feeding
back at full gain:** AT1 blockade *decouples* renin from its downstream effect — PRA rises
2–3× while the vascular AngII *signal* falls. Modelling PRA as a driver of the ODE state
`A` would wrongly propagate that rise into blood pressure. The ODE tracks the **effective
AngII signal at the vasculature**; PRA is the upstream biomarker. This distinction is
physiologically correct and worth saying out loud in the pitch. `τ_PRA = 2 h`.

**Combination signature worth animating:** lisinopril + HCTZ. HCTZ drives PRA up ×1.36;
the ACE inhibitor blocks the pathway that rise would otherwise activate. That is precisely
why the fixed-dose combination product exists, and the engine shows it in two curves.
- Emit **at most ~4 frames/second of wall time** regardless of simulation speed. The
  animation is the point; a flood of frames just drops the browser's frame rate. If the
  integrator outruns that, batch frames into arrays.
- **Also send a `progress` message** every 10 subjects for population runs, and a final
  `done` message carrying the summary object of §7.3.
- **Reconnect path:** on WebSocket open, the client sends `{resumeFrom: lastT}` and the DO
  replays missing frames from SQLite. This makes the demo robust to a flaky venue network,
  which is worth the 20 lines it costs.

### 8.7 wrangler.jsonc essentials

```jsonc
{
  "name": "pilsim",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": "./dist", "binding": "ASSETS" },
  "limits": { "cpu_ms": 300000 },
  "durable_objects": {
    "bindings": [{ "name": "SIM", "class_name": "SimulationRun" }]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["SimulationRun"] }
  ],
  "d1_databases": [
    { "binding": "DB", "database_name": "pilsim", "database_id": "<id>" }
  ],
  "ai": { "binding": "AI" },
  "observability": { "enabled": true }
}
```
Note `new_sqlite_classes` (not `new_classes`) — SQLite-backed DOs are required for the
`ctx.storage.sql` API used above, and are the only DO storage backend available on the
Free plan.

---

## 9. Pseudocode — the core loop

```ts
// ─────────── types ───────────
type Regimen = { drugId: string; doseMg: number; intervalH: number; formulation: string }[];
type Subject = { /* from patient_model.json + user edits + sampled η */ };

// ─────────── entry ───────────
function runSimulation(regimen: Regimen, subject: Subject, opts: RunOptions) {

  // 0. SAFETY GATE — runs first, always. A rejected regimen is still simulated
  //    (the user asked) but the result is labelled REJECTED and never RECOMMENDED.
  const violations = evaluateRules(regimen, subject, RULES);   // rules.json
  if (violations.some(v => v.severity === 'CONTRAINDICATED')) {
    emit({ type: 'safety', violations });
    if (opts.haltOnContraindication) return { status: 'REJECTED', violations };
  }

  // 1. PK PARAMETERS with covariates and sampled random effects
  const pk = regimen.map(r => {
    const s = SUBSTANCES[r.drugId];
    const f = FORMULATIONS[r.drugId][r.formulation];
    return {
      ...r,
      F:  f.F  * lognormal(1, 0.20, rng),
      ka: f.ka * lognormal(1, 0.40, rng),
      lag: f.lag,
      Vd: s.Vd * (subject.weightKg / 70)          * lognormal(1, 0.25, rng),
      CL: s.CL * Math.pow(subject.weightKg/70, 0.75)
               * renalFactor(s.fractionRenal, subject.eGFR)
               * cypFactor(s.enzyme, subject.phenotypes)
               * lognormal(1, 0.30, rng),
    };
  });

  // 2. TIME GRID
  const dt = opts.mode === 'acute' ? 1/60 : 5/60;          // hours
  const T  = opts.mode === 'acute' ? 72   : 21*24;         // hours
  const n  = Math.round(T / dt);

  // 3. INITIAL STATE — at homeostatic baseline by construction
  let st = { S: 1, A: 1, V: 1, R: 1, C: 1, HR: subject.hr0 };
  const p = derivedBaselines(subject);   // SV0, SVR0, MAP_set, C_art
  const frames: Frame[] = [];

  // 4. MAIN LOOP
  for (let i = 0; i < n; i++) {
    const t = i * dt;

    // 4a. PK — CLOSED FORM, not integrated
    const conc: Record<string, number> = {};
    for (const d of pk) conc[d.drugId] = batemanSuperposed(d, t, opts.doseHistory);

    // 4b. concentration → pathway occupancy
    //     ⚠️ EC50 comes from clinical calibration (§5.4), NEVER from ChEMBL IC50 (§1)
    const occ = pathwayOccupancy(conc, pk);   // { RAAS, LTYPE, NCC, B1 }

    // 4c. one RK4 step of the 6-state homeostasis ODE
    st = rk4Step(st, dt, s => cvDerivatives(s, occ, p, PARAMS));

    // 4d. guards — abort loudly rather than emit nonsense
    if (!isFinite(st.HR) || st.HR < 0) throw new IntegratorDiverged(i, st);
    st = applyPhysiologicalClamps(st, p);            // §5.6

    // 4e. algebraic outputs
    const SV  = p.SV0 * Math.pow(st.V, 0.90) * st.C;
    const CO  = st.HR * SV / 1000;
    const MAP = CO * st.R * p.SVR0;
    const PP  = SV / p.Cart;
    const out = { sbp: MAP + 2*PP/3, dbp: MAP - PP/3, map: MAP, hr: st.HR, co: CO,
                  svr: st.R * p.SVR0 };

    // 4f. slow empirical channels (electrolytes, urate) — §5.5
    const labs = updateLabs(occ, dt, subject);

    // 4g. emit, downsampled
    if (i % opts.emitEveryNSteps === 0)
      frames.push({ t: t*60, ...out, conc, occ, labs, flags: st.flags });
  }

  // 5. RECONCILE the ODE trace against the authoritative algebraic rule (§5.4 note)
  const algebraic = combinationRule(regimen, subject);      // §4.4 — AUTHORITATIVE
  const odeSteady = { dsbp: p.sbp0 - last(frames).sbp, ddbp: p.dbp0 - last(frames).dbp };
  const scale = algebraic.dsbp / Math.max(odeSteady.dsbp, 0.1);
  assert(Math.abs(algebraic.dsbp - odeSteady.dsbp) < 2.0, 'VAL-14: engines disagree');
  const reported = rescaleBpTrace(frames, scale);

  // 6. CHRONIC PHASE 2 — closed form, never integrated
  const prognosis = opts.mode === 'chronic'
    ? project5Year(algebraic, subject, opts.adherence)      // §6.2
    : null;

  return { status: violations.length ? 'FLAGGED' : 'OK',
           frames: reported, algebraic, odeSteady, prognosis, violations,
           seed: opts.seed, engineVersion: ENGINE_VERSION };
}

// ─────────── the combination rule, verbatim (§4.4) ───────────
function combinationRule(regimen, subject) {
  const byPathway = new Map<string, number[]>();
  for (const r of regimen) {
    const cls = SUBSTANCES[r.drugId].class;
    const D   = r.doseMg / STANDARD_DOSE[r.drugId];        // multiples of standard dose
    if (D < 0.25 || D > 4.0) flagExtrapolation(r);          // §4.1 validity window
    const Dc  = clamp(D, 0.25, 4.0);
    for (const ep of ['sbp','dbp'] as const) {
      const { Emax, ED50 } = EMAX_FIT[cls][ep];
      let e = Emax * Dc / (ED50 + Dc);                      // Step 1
      e *= baselineScaling(subject, ep);                    // §4.5(a)
      e *= covariateScaling(cls, subject, RULES);           // §4.5(b)
      push(byPathway, `${PATHWAY[cls]}:${ep}`, e);
    }
  }
  const out: any = {};
  for (const ep of ['sbp','dbp'] as const) {
    const perPathway: number[] = [];
    for (const [key, es] of byPathway) {                    // Step 2
      if (!key.endsWith(ep)) continue;
      const Cp = CEILING[key.split(':')[0]][ep];
      perPathway.push(es.length === 1 ? es[0]
                    : Math.max(Math.max(...es), pool(es, Cp)));
    }
    out['d' + ep] = pool(perPathway, GLOBAL_CEILING[ep]);   // Step 3
  }
  return out;
}

const pool = (es: number[], C: number) =>
  C * (1 - es.reduce((acc, e) => acc * (1 - Math.min(e, 0.98*C) / C), 1));
```

---

## 10. Implementation checklist (in build order)

1. `src/engine/constants.ts` — the Emax fit table (§4.1), ceilings (§4.4), ODE params (§5.4).
2. `src/engine/combination.ts` — the rule of §4.4. **Write its tests first** (§4.6 gives
   you every expected value). ~60 lines. **This alone makes the product demoable.**
3. `src/engine/pk.ts` — Bateman + superposition + covariates (§3). ~80 lines.
4. `src/engine/ode.ts` — 6-state derivatives + RK4 + clamps (§5). ~120 lines.
5. `src/engine/population.ts` — sampling, Cholesky, summary stats (§7). ~90 lines.
6. `src/engine/prognosis.ts` — the 5-year projection (§6.2). ~40 lines.
7. `src/do/SimulationRun.ts` — DO, SQLite schema, alarm chunking, WebSocket (§8).
8. `src/index.ts` — Worker routes, safety gate, fast ranker.

**If time runs out, steps 1–2 plus the safety engine are a complete, defensible demo.**
The ODE and the animation are the upgrade, not the product.

---

## 11. Cross-agent notes

**→ Agent B (`substances.json`):**
- Please supply, per drug: `standardDoseMg` (needed to convert user dose → multiples of
  standard dose in §4.4). Suggested per WHO DDD or the modal clinical dose:
  lisinopril 20 mg, losartan 50 mg, amlodipine 5 mg, HCTZ 25 mg, metoprolol tartrate 100 mg.
  **Whatever you choose becomes the `D = 1` anchor for the whole engine — flag it clearly.**
- Per formulation, the engine needs exactly three numbers: `F`, `ka` (h⁻¹), `lag` (h).
  If a label gives only Tmax, invert: `ka ≈ ln(ka/ke)/Tmax` — or just report Tmax and let
  the engine solve for `ka` numerically. Please report Tmax rather than guessing `ka`.
- Please include CV% or a range alongside every PK parameter (§7.1 needs it).
- Fields named `ic50_nM` / `ki_nM` / `kd_nM` are welcome as *display* data but will be
  structurally excluded from the engine (§1). Please keep them in a separate
  `invitro: {...}` sub-object so the exclusion is enforceable by shape, not by grep.

**→ Agent C (`rules.json`):**
- The engine consumes two rule *types* from your file: `contraindication` (blocks/labels)
  and **`pd_modifier`** (a multiplicative factor on `e_i` for a given class × condition,
  §4.5b). Please emit `pd_modifier` rules with the shape
  `{ id, appliesTo: {class|substance}, condition, factor: 0.65, endpoint: 'sbp'|'both', citation }`.
- Dual RAAS blockade (lisinopril + losartan) must be a `CONTRAINDICATED`-severity rule;
  the engine already ranks it last on efficacy (§4.7), and the two agreeing is a demo moment.
- The engine needs numeric `k_K`, `k_Na`, `k_UA` per substance for §5.5 — if those live in
  your file rather than Agent B's, tell the lead so the coding agent knows where to look.

**→ Agent D (`patient_model.json`):**
- The ODE needs these baselines by name: `sbp0`, `dbp0`, `hr0`, `co0`, `weightKg`, `eGFR`.
  Everything else (`SV0`, `SVR0`, `MAP_set`, `C_art`) is derived in §5.2 — please do not
  also publish those, so there is exactly one source of truth.
- §7.1 needs SDs for `sbp0`, `dbp0`, `hr0`, `eGFR` to build the virtual population. Defaults
  I have assumed (12 / 8 mmHg, 9 bpm, 20 % CV) are `ESTIMATED` — please override with cited
  values if you have them.
- **Please state which eGFR equation you used and whether it is the race-free 2021 CKD-EPI
  version.** §3.3 scales lisinopril and HCTZ clearance directly off eGFR, so this choice
  propagates straight into the drug concentrations.

**→ Agent F (`04-ORGAN-EFFECT-MAP.md`, `05-OUTPUT-REPORT-SPEC.md`):**
- The per-frame payload in §8.6 is your binding surface. Available every frame: `sbp`,
  `dbp`, `map`, `hr`, `co`, `svr`, per-drug `conc`, per-pathway `occ`, and `labs`.
- The signature behaviours to animate, from the ODE run in §5.4 (all emergent, not scripted):
  amlodipine ↑HR ↑CO, metoprolol ↓HR ↓CO, HCTZ ↓CO via volume, RAAS drugs ↓SVR with
  minimal HR change. Bind heart-rate animation to `hr`, vessel-calibre to `svr`, kidney
  output to `occ.NCC` and `labs`.
- **The adverse-effect table in §4.7 is your safety term.** Efficacy-only ranking will
  recommend maximum doses, which is clinically wrong and a judge will say so.
- Please surface the `extrapolated` flag (dose outside 0.25–4× standard) and the
  `hypotension_floor_hit` flag visually — the report must never present a clamped result
  as if it were a clean simulation.

**→ the lead (`00-DECISIONS.md`):**
- **Workers Free plan (10 ms CPU) cannot run this engine at all.** Workers Paid is a hard
  prerequisite (§8.4). Confirm the account plan today, not on demo day.
- Recommended one-line framing of the science: *"Effects of different antihypertensive
  classes are additive; escalating one drug's dose is not — combining two classes gives
  about five times the extra blood-pressure reduction that doubling one dose does
  (Wald 2009). PilSim is the engine that computes that trade-off for a specific virtual
  patient."*
- The team's §1.3 draft says "get the 5 most efficient dosage combinations" as if it were
  a lookup. It is not — it is §4.4, and it is the only genuinely novel computational claim
  in the product. Give it top billing in the pitch.
