# 05 — Output Report Specification

**Owner:** Agent F · **Written:** 2026-08-17 · **Status:** COMPLETE
**Consumers:** the end-of-run report renderer, the ranking engine, the PDF/share export.

> **This is a research simulator, not a clinical decision tool.** The exact disclaimer
> wording that must appear in the UI is in **§8**. It is not optional and not paraphrasable.

---

## 1. What the product actually claims

The team's stated goal is that after a run, the product knows the element's **best use
case**, **best dose**, and **best formulation type**. Those three phrases are vague as
written, so this section pins them to computable definitions. If the definition below is
not what the team meant, that is a scope conversation to have *before* the build, not
after.

| Claim | Computable definition | What is actually varied |
|-------|------------------------|--------------------------|
| **Best use case** | The **patient archetype** (comorbidity profile + demographics) at which this product scores highest, out of a fixed panel of archetypes run identically. | Patient, held drug and dose fixed. |
| **Best dose** | The **dose on the licensed ladder** that maximises the composite objective **for a stated patient or population** — explicitly *not* the dose with the largest blood-pressure drop. | Dose, held patient and formulation fixed. |
| **Best formulation type** | The **route/release profile** that maximises the formulation sub-objective (§5) for that drug at that dose. | Formulation, held patient and total daily dose fixed. |

**Three honesty constraints that must be enforced in code, not just documented:**

1. **"Best" is always relative to a stated comparison set.** The report must print the set
   it searched ("5 doses × 6 archetypes × 3 formulations = 90 simulated arms"). A "best"
   with no denominator is marketing, not analysis.
2. **A recommendation with no runner-up is suppressed.** If only one arm was feasible, the
   report says "only one feasible option was evaluated" and does not rank.
3. **Best formulation is only claimed where formulation data exists.** Of the five drugs,
   only metoprolol has a direct, label-level comparison between two marketed release
   profiles (succinate ER Cmax is "one-fourth to one-half the peak plasma levels obtained
   following a corresponding dose of conventional metoprolol" [P4]). For the other four,
   the report must say **"formulation comparison not supported by available data"** rather
   than produce a ranking from invented numbers. See §5.4.

---

## 2. The three objectives — interface contract with `data/rules.json`

Agent C's rules emit `score_delta` effects with `objective ∈ {efficacy, safety, appropriateness}`
(`C-notes.md` §1.5), and their `severity_levels` ladder is documented as "used for the
report's safety penalty term (Agent F consumes this)". So the objective set here is
**fixed by that contract** — three objectives, those exact names.

| Objective | Range | Meaning | Fed by |
|-----------|-------|---------|--------|
| **E — efficacy** | 0–100 | Does it work, for how many of this population, and for how much of the day? | Simulation output + `score_delta{objective:"efficacy"}` |
| **S — safety** | 0–100 | How much harm, at what probability, of what severity? Starts at 100 and is penalised down. | `risk_set` effects, rule severities, lab excursions, `score_delta{objective:"safety"}` |
| **A — appropriateness** | 0–100 | Guideline and context fit — is this the *right kind* of drug for this patient, independent of how well it happens to work in the sim? | Agent C's positive rules (`preferred`, `compelling`) + `score_delta{objective:"appropriateness"}` |

**Why three and not two.** Efficacy and safety alone cannot express "this drug lowered the
blood pressure beautifully but a guideline says a different class is first-line for this
patient". That is the entire substance of problem 12. Appropriateness carries it, and it
is the objective that lets the product *recommend* rather than only *reject* — which the
mission brief explicitly asks for.

---

## 3. Efficacy score E

### 3.1 Terms

Computed over a virtual population of `N` sampled subjects (Agent E owns sampling; `N`
must be reported).

| Term | Symbol | Definition | Weight |
|------|--------|------------|--------|
| Goal attainment | `P_goal` | Fraction of the virtual population reaching the BP target at steady state. Target comes from Agent C/D per patient (e.g. tighter in diabetes/CKD), **not hard-coded here.** | **0.55** |
| Effect magnitude | `M` | `norm(median ΔSBP, 0, 25)` mmHg | **0.25** |
| Daily coverage | `C` | Trough-to-peak ratio of the effect, `norm(TPR, 0.3, 1.0)` | **0.20** |

```
E_raw = 100 * (0.55 * P_goal + 0.25 * M + 0.20 * C)
E     = clamp(E_raw + Σ score_delta(objective="efficacy"), 0, 100)
```

**Weight provenance: all three are `ESTIMATED`.** Justification, stated plainly because a
judge may ask: goal attainment dominates because it is the endpoint that trials and
guidelines are written around, and because it is a *population* quantity — which is what
distinguishes this product from a calculator. Magnitude is kept as a separate, smaller
term so that a drug which overshoots (drops pressure too far in the sensitive tail of the
population) does not score higher than one that lands more patients in range. Coverage is
included at 0.20 because it is the term that makes formulation choice meaningful at all;
without it, an immediate-release and an extended-release arm with the same AUC score
identically, and the "best formulation type" claim collapses.

**The 25 mmHg ceiling on `M` is `ESTIMATED`** and chosen so that the whole class range is
on-scale: monotherapy at licensed doses in this set lands roughly −4 to −13 mmHg systolic
(HCTZ 6.25→50 mg gives −4/−2 to −11/−5 mmHg [P7]; ARBs give −10.3/−6.7 to −13.0/−8.3 mmHg
across 25 %→max dose [P8]). A 25 mmHg ceiling leaves headroom for combination arms without
saturating.

### 3.2 The anti-saturation requirement

Efficacy must **saturate with dose** or the optimiser will always pick the maximum dose and
the "best dose" output becomes trivial and wrong. The dose-response data in this set is
explicitly shallow and Agent E must reproduce it:

- HCTZ: **−4/−2, −6/−3, −8/−3, −11/−5 mmHg** at 6.25/12.5/25/50 mg [P7]. Quadrupling
  6.25 → 25 mg buys 4 mmHg systolic.
- ARBs: **−10.3/−6.7 → −11.7/−7.6 → −13.0/−8.3 mmHg** at 25 % → 50 % → max dose [P8].
  Quadrupling the dose buys **2.7 mmHg systolic.**

If the engine produces a linear dose-response, this whole report is invalid. That is a
test case for `06-VALIDATION.md`, and it is the single assumption most likely to break the
"best dose" claim.

---

## 4. Safety score S

Safety starts at 100 and is penalised. It is **not** symmetric with efficacy, and that
asymmetry is deliberate.

### 4.1 Feasibility tier — computed before any score

```
if any fired rule has severity rank 7 (contraindicated_absolute) and effect op "block":
        tier = DISQUALIFIED        // no scores are computed or displayed at all
else if any fired rule has rank 6 (contraindicated_relative) / op "require_override":
        tier = OVERRIDE_REQUIRED   // scored, but ranked below every ALLOWED arm
else:   tier = ALLOWED
```

**A `DISQUALIFIED` arm shows no numbers.** It shows the rule, the mechanism sentence, the
warning text, and the citation from `rules.json`. Printing "safety 12/100" next to an
absolute contraindication invites someone to read it as a tradeoff. It is not one.

### 4.2 Penalty terms

**(a) Rule severity penalty.** From Agent C's rank ladder (0–7):

| rank | id | penalty |
|------|-----|---------|
| 0 | `info` | 0 |
| 1 | `preferred` | 0 (positive rule — feeds A, not S) |
| 2 | `compelling` | 0 (feeds A) |
| 3 | `minor` | 3 |
| 4 | `moderate` | 9 |
| 5 | `major` | 25 |
| 6 | `contraindicated_relative` | 45 + tier demotion |
| 7 | `contraindicated_absolute` | n/a — `DISQUALIFIED` |

Penalties are `ESTIMATED`, chosen **super-linearly** (3 → 9 → 25 → 45) so that one major
rule outweighs several minor ones. A linear ladder would let a pile of trivia equal a
serious warning, which is the wrong behaviour for a safety term.

**(b) Adverse-event risk penalty.** For each `risk.*` target set by a `risk_set` effect,
or derived from the label incidences in `04-ORGAN-EFFECT-MAP.md` §12:

```
excess_p = max(0, p_event - p_baseline)          // p_baseline = placebo arm where known
pen_risk = Σ_over_risks ( 100 * excess_p * severity_weight[risk] )
```

| Risk | `severity_weight` | Anchor incidence used | Source |
|------|-------------------|------------------------|--------|
| `angioedema` | 1.00 | rare; label carries a dedicated warning | [P2] |
| `bronchospasm` | 0.80 | label: wheezing, dyspnoea | [P4] |
| `hyperkalemia` | 0.70 | ATLAS **6 % high dose vs 4 % low dose** | [P2] |
| `acute_gfr_drop` | 0.60 | ATLAS creatinine increased **10 % vs 7 %** | [P2] |
| `bradycardia` | 0.55 | label: among most common reactions | [P4] |
| `hyponatremia` | 0.50 | direction sourced, magnitude `NOT_FOUND` | [P10] |
| `hypokalemia` | 0.45 | ΔK **−0.35 mmol/L** at 25–50 mg `SECONDARY` | [P10] |
| `dizziness_orthostatic` | 0.35 | ATLAS **19 % vs 12 %**; amlodipine **1.1/3.4/3.4 %** vs placebo 1.5 % | [P2][P1] |
| `hyperuricemia_gout` | 0.30 | ≈ **+90 µmol/L** at ≥50 mg `SECONDARY` | [P10] |
| `peripheral_edema` | 0.25 | **1.8 / 3.0 / 10.8 %** at 2.5/5/10 mg vs **0.6 %** placebo | [P1] |
| `cough` | 0.20 | **3.9 %** label; **5–35 %** literature | [P5][P11] |

**All eleven `severity_weight` values are `ESTIMATED`.** They encode clinical seriousness,
not frequency — frequency is already in `excess_p`. The ordering is the defensible part:
airway compromise and potassium disturbance outrank cough and ankle swelling, because the
first two can kill and the last two cannot. Anyone is free to disagree with 0.25 vs 0.30;
nobody should disagree with angioedema > oedema. **Expose these as a tunable panel in the
UI.** A judge who can move the sliders and watch the ranking change will trust the model
more than one who is handed a fixed number.

**(c) Lab excursion penalty.** Probability, across the virtual population, that a lab
leaves its reference range at any point in the run:

```
pen_lab = Σ_over_labs ( 100 * P(excursion) * lab_weight )
```
Labs: `serum_k`, `serum_na`, `serum_urate`, `serum_creatinine`, `fasting_glucose`.
Reference ranges are **read from Agent D's `patient_model.json`**, not hard-coded here.
`lab_weight` `ESTIMATED`: K 0.5, Na 0.4, creatinine 0.4, urate 0.2, glucose 0.2.

### 4.3 Composition

```
S = clamp(100 - pen_rule - pen_risk - pen_lab + Σ score_delta(objective="safety"), 0, 100)
```

### 4.4 Why the safety term must be able to beat efficacy — the amlodipine worked example

This is the example to put on the slide, because it is entirely label-sourced and it shows
the product concluding something non-obvious.

Going from amlodipine **5 mg → 10 mg**:

- Efficacy gain: modest. Class dose-response in this set is shallow [P8].
- Oedema incidence: **3.0 % → 10.8 %**, against a placebo rate of 0.6 % [P1] — a **3.6×**
  increase in the drug-attributable rate.
- Corroborated independently: meta-analysis of 22 trials / 7226 patients gives RR **2.01**
  at low/medium dose vs **3.08** at 10 mg [P9].
- Dizziness and palpitation rise too: palpitation **1.4 % → 4.5 %** [P1].

So the correct output for many archetypes is **"best dose = 5 mg, not the maximum"**, with
the reason line *"doubling the dose raises oedema risk 3.6-fold for a small additional
blood-pressure effect"*. A product that can say that, with a label citation attached, is
doing something a dosing table cannot. **If the engine's scoring never returns a
sub-maximal dose for any archetype, the scoring is broken** — treat that as a smoke test.

---

## 5. Formulation sub-objective F

Used to answer "best formulation type". Computed per candidate formulation at fixed total
daily dose.

### 5.1 Terms

| Term | Definition | Weight |
|------|------------|--------|
| Trough-to-peak ratio | `TPR = effect_at_trough / effect_at_peak`, scored `norm(TPR, 0.3, 1.0)` | 0.30 |
| Fluctuation | `PTF = (Cmax − Cmin) / Cavg`; scored `1 − norm(PTF, 0.2, 2.0)` | 0.25 |
| Forgiveness | Hours of maintained effect beyond the dosing interval after a **missed dose** | 0.25 |
| Adherence burden | Once-daily 1.0, twice-daily 0.6, three-times-daily 0.3 | 0.20 |

```
F = 100 * (0.30*TPR_s + 0.25*PTF_s + 0.25*Forgive_s + 0.20*Adherence_s)
```
All four weights `ESTIMATED`. Rationale: TPR and forgiveness are the two properties that
actually differ between release profiles of the same molecule, so they carry half the
weight between them; adherence burden is real but is a behavioural assumption, not a
pharmacokinetic one, so it is capped at 0.20.

### 5.2 Where formulation genuinely changes the answer — metoprolol

The one case in this set with a direct label-level comparison. Metoprolol succinate ER
peak plasma levels average **one-fourth to one-half** those of a corresponding dose of
conventional (IR) metoprolol [P4]. Consequences the report can state:

- Lower Cmax → lower peak β-blockade → **less peak bradycardia** for the same daily dose.
  Corroborating clinical direction: IR 50 mg b.i.d. lowered heart rate **19.1 %** while
  ER 100 mg o.d. lowered it **13.4 %** [P12b] `SECONDARY`.
- Higher trough → **less β2 spillover at peak**, which matters because β1-selectivity is
  dose-dependent (β1 occupancy 54–92 % vs β2 occupancy 6–38 % at 100 mg b.i.d. [P12]).
  For an asthma/COPD archetype this is a real, mechanistically-grounded reason the ER form
  scores better — and it ties straight back to `04-ORGAN-EFFECT-MAP.md` §9.
- Once-daily → adherence term.

**This is the only "best formulation type" recommendation in the product that rests on a
direct source.** Lead the demo with it.

### 5.3 The defensible *negative* result — amlodipine

Amlodipine's terminal half-life is **30–50 hours**, with steady state at **7–8 days** [P1].
The molecule is already its own extended-release system. An extended-release amlodipine
formulation would change TPR and PTF negligibly.

The report should therefore output: **"extended-release formulation not indicated — the
drug's 30–50 h half-life already produces a flat concentration profile"**, with the label
citation. A simulator that declines to recommend a formulation change, and explains why in
one sentence with a citation, is more convincing than one that always has a suggestion.

### 5.4 Where the product must refuse to answer

For **lisinopril, losartan, and hydrochlorothiazide**, I did not source marketed
alternative release profiles or route-specific PK sufficient to rank formulations. The
report must render:

> **Best formulation type: not determined.** Only immediate-release oral solid forms were
> modelled for this substance. A formulation comparison requires route-specific
> bioavailability and time-to-peak data that is not present in this build's dataset.

**Agent B owns `substances.json` and its per-formulation PK.** If Agent B publishes
sourced route/formulation PK for these three, this refusal is lifted and F is computed
normally. Until then, **fabricating a formulation ranking would be the single most
detectable invention in the whole product** — routes and their PK are exactly what a
pharmacist judge knows by heart.

---

## 6. Ranking and the composite

### 6.1 Ranking is tiered first, scored second

```
1. Partition candidates into ALLOWED | OVERRIDE_REQUIRED | DISQUALIFIED  (§4.1)
2. DISQUALIFIED never ranks. It is listed separately, with reasons.
3. Within a tier, apply the safety floor:
       any candidate with S < 40 is demoted below every candidate with S >= 40
4. Within a floor band, sort by Composite descending.
```

The safety floor (`S < 40`, `ESTIMATED`) exists so that a very effective, quite unsafe arm
cannot outrank a slightly less effective, clearly safe one through weighted-sum
arithmetic. Pure weighted sums permit exactly that trade, and it is not a trade this
product should silently make.

### 6.2 The composite

```
Composite = 0.40 * E + 0.35 * S + 0.25 * A
```

Weights `ESTIMATED`. Safety is deliberately close to efficacy in weight, and the floor in
§6.1 does the rest of the work. **The composite is never displayed alone.** Wherever it
appears it is accompanied by its three components, as a stacked bar or three dials. The
mission brief asks for "a defensible ranked recommendation with reasons, not one
unexplained number" — the enforcement of that is: *the renderer has no code path that
draws Composite without E, S and A beside it.*

### 6.3 Reasons — required, generated, not free text

Every ranked row carries 2–4 **reason chips**. Each chip is generated from a template and
carries a source. Free-text LLM prose is not acceptable here; it is where fabricated
pharmacology enters a product.

| Chip type | Template | Example |
|-----------|----------|---------|
| Goal | `{pct}% of simulated patients reached {target}` | "68 % of simulated patients reached <130/80" |
| Dose tradeoff | `{effect} at {dose_hi} vs {dose_lo}: +{d_eff} mmHg, {risk} {p_lo}%→{p_hi}%` | "10 mg vs 5 mg: +2 mmHg, oedema 3.0 %→10.8 %" |
| Rule (negative) | `{rule.warning.short}` + severity chip | "Never in pregnancy — fetal injury and death" |
| Rule (positive) | `{rule.warning.short}` + green chip | "ACE inhibitor preferred in diabetic kidney disease" |
| Formulation | `{form} chosen: {term} {value}` | "ER chosen: peak concentration ¼–½ of immediate-release" |
| Refusal | fixed string from §5.4 | "Formulation comparison not supported by available data" |

Every chip renders its citation on hover, pulled from `rules.json` `evidence[]` or from
the source table in `04-ORGAN-EFFECT-MAP.md` §17. **The citation trail is the product's
strongest asset** — it is what separates this from a language model guessing about drugs,
and it costs the coding agent almost nothing because the data files already carry it.

---

## 7. Uncertainty — three separate kinds, reported separately

Conflating these is the most common way a simulation output misleads. Report all three.

### 7.1 Population spread (inter-individual variability)

Report **P10 / P50 / P90** across the virtual population for every headline number, never
a bare mean.

> ΔSBP: **−11 mmHg** (P10 −19, P90 −4), N = 500 virtual subjects

Rendered as a horizontal violin or a dot-with-whiskers. Agent E owns `N` and the sampling
distributions; the report must print `N`.

### 7.2 Parameter uncertainty (how good are our inputs)

This is where locked decision 4 pays off, and it is a genuine differentiator: **the
product can grade its own evidence, because every input carries provenance.**

```
cited     = count of inputs on this run's dependency path with a citation
estimated = count marked ESTIMATED
missing   = count marked NOT_FOUND
evidence_score = cited / (cited + estimated + missing)
```

| Grade | `evidence_score` | Label shown |
|-------|------------------|-------------|
| **A** | ≥ 0.90 | "Well-sourced — nearly all parameters from regulatory labelling or peer-reviewed literature" |
| **B** | 0.75–0.89 | "Mostly sourced — some parameters are documented estimates" |
| **C** | 0.50–0.74 | "Mixed — a substantial fraction of parameters are estimates" |
| **D** | < 0.50 | "Weakly sourced — treat this output as illustrative only" |

Band boundaries `ESTIMATED`. The report must render the grade **and** an expandable list
of exactly which inputs were estimated or missing. Being able to say on stage *"this
recommendation rests on 23 cited values and 4 documented estimates, and here they are"* is
worth more than a tighter confidence interval.

### 7.3 Structural uncertainty (what the model does not represent)

A fixed, honest list rendered at the foot of every report. From this build's known
omissions:

- No aldosterone escape / breakthrough over weeks.
- No baroreflex adaptation beyond the modelled counter-regulation.
- No pharmacodynamic tolerance.
- No adherence behaviour — every dose is assumed taken.
- No hard cardiovascular outcomes (stroke, MI, mortality). **The product models blood
  pressure and laboratory values, not events.** This one is critical: a 5-year prognosis
  (problem 12) that appears to predict strokes would be a serious overclaim. If a
  long-horizon view is shown, it must be labelled as a projection of a *surrogate marker*,
  not of outcomes.
- Cell-level resolution is claimed for exactly one target; see `04-ORGAN-EFFECT-MAP.md`
  §14.

### 7.4 Precision discipline

The report must never display more precision than the inputs support.

| Quantity | Displayed as |
|----------|--------------|
| Blood pressure change | whole mmHg |
| Probabilities / incidences | whole % (one decimal only when quoting a label verbatim, e.g. 10.8 %) |
| Serum potassium | 1 decimal, mmol/L |
| Heart rate | whole bpm |
| Scores E / S / A / Composite | whole number, 0–100 |
| Half-lives, Tmax | as the source states them, including ranges ("30–50 h", not "40 h") |

**Ranges stay ranges.** Where the source gives 5–35 % for ACE-inhibitor cough [P11], the
report shows 5–35 %. Collapsing a sourced range to a midpoint invents precision and is
the easiest thing for a knowledgeable judge to catch.

---

## 8. The disclaimer — exact wording

This text is **normative**. Do not paraphrase, shorten, or move it below the fold.

### 8.1 Full disclaimer

Rendered in a bordered panel at the head of every report, and on the export/PDF.

> **This is a simulation, not medical advice.**
>
> PilSim is a research and educational simulator. It estimates how a modelled drug might
> behave in a mathematical model of a human body. It has not been clinically validated, it
> is not a medical device, and it has not been reviewed or approved by any regulatory
> authority.
>
> The outputs on this page are the results of equations, not observations of a patient.
> They may be wrong. They must not be used to diagnose a condition, to choose, start,
> change, or stop any treatment, or to inform the care of any real person.
>
> Only a qualified clinician who has examined the patient can make prescribing decisions.
> If you are a patient, do not change anything about your medication because of this page.
>
> Every number here carries a source or is marked as an estimate. Where we could not find
> a value, we say so rather than guess.

### 8.2 Short form

For the persistent header bar, the animation footer, and every shared/exported image:

> **Simulation only — not medical advice. Not a validated medical device.**

### 8.3 Uzbek and Russian

The hackathon is in Qashqadaryo, Uzbekistan, and judges may include clinicians reading in
Uzbek or Russian. Short form in all three languages:

| Lang | Text |
|------|------|
| **EN** | **Simulation only — not medical advice. Not a validated medical device.** |
| **UZ** | **Faqat simulyatsiya — tibbiy maslahat emas. Tasdiqlangan tibbiy vosita emas.** |
| **RU** | **Только симуляция — не медицинская рекомендация. Не является сертифицированным медицинским изделием.** |

**Translation provenance: `ESTIMATED`.** These are my translations of the English short
form, not professionally reviewed. Have a native Uzbek speaker on the team check the UZ
line before the pitch — it is on screen for the entire demo, and a clumsy safety notice in
the judges' own language undercuts exactly the credibility it is there to protect.

### 8.4 Placement rules

1. Full disclaimer at the top of every report, above the scores. Never collapsed by default.
2. Short form persistently visible during the animation.
3. Short form burned into any exported image or PDF, not added as metadata.
4. When an arm is `DISQUALIFIED`, the safety reason appears **above** the disclaimer, so
   the specific warning is read before the generic one.

---

## 9. Output JSON schema

What the engine hands the renderer. One object per run.

```jsonc
{
  "run_id": "uuid",
  "generated_at": "2026-08-17T00:00:00Z",
  "engine_version": "0.1.0",
  "dataset_version": "2026-08-17",

  "disclaimer": { "full": "<§8.1 verbatim>", "short_en": "...", "short_uz": "...", "short_ru": "..." },

  "search_space": {
    "doses_evaluated": [2.5, 5, 10],
    "archetypes_evaluated": ["t2dm", "ckd_stage3", "elderly_75", "asthma", "gout", "healthy_55"],
    "formulations_evaluated": ["ir_tablet"],
    "total_arms": 18,
    "n_virtual_subjects_per_arm": 500
  },

  "ranked": [
    {
      "rank": 1,
      "tier": "ALLOWED",
      "arm": { "product_id": "amlodipine_5mg", "dose_mg_per_day": 5,
               "formulation": "ir_tablet", "archetype": "t2dm" },
      "scores": { "efficacy": 71, "safety": 88, "appropriateness": 64, "composite": 75 },
      "score_breakdown": {
        "efficacy":  { "p_goal": 0.62, "magnitude_mmhg_median": -11, "tpr": 0.78,
                       "score_deltas": [] },
        "safety":    { "pen_rule": 0, "pen_risk": 4.2, "pen_lab": 1.1, "score_deltas": [] },
        "appropriateness": { "positive_rules": ["RX-..."], "score_deltas": [] }
      },
      "outcomes": {
        "delta_sbp_mmhg": { "p10": -19, "p50": -11, "p90": -4 },
        "delta_dbp_mmhg": { "p10": -11, "p50": -6,  "p90": -2 },
        "serum_k_mmol_l": { "p10": 3.8, "p50": 4.2, "p90": 4.7 },
        "hr_bpm":         { "p10": 66,  "p50": 74,  "p90": 82 }
      },
      "adverse_probabilities": [
        { "risk": "peripheral_edema", "p_event": 0.030, "p_baseline": 0.006,
          "source_id": "P1",
          "value_as_stated": "Edema 1.8 (2.5 mg) 3.0 (5 mg) 10.8 (10 mg) 0.6 (placebo)" }
      ],
      "reasons": [
        { "type": "dose_tradeoff",
          "text": "10 mg vs 5 mg: +2 mmHg systolic, oedema 3.0% -> 10.8%",
          "source_id": "P1" }
      ],
      "fired_rules": []
    }
  ],

  "disqualified": [
    { "arm": { "product_id": "lisinopril_10mg", "archetype": "pregnancy" },
      "rule_id": "RX-PREG-ACEI",
      "severity": "contraindicated_absolute",
      "mechanism": "<verbatim from rules.json>",
      "warning": "<verbatim from rules.json>",
      "evidence": [ { "source": "FDA label, Zestril", "url": "...", "quote": "...",
                      "retrieved": "2026-08-17" } ] }
  ],

  "conclusions": {
    "best_use_case":   { "archetype": "t2dm", "composite": 75,
                         "runner_up": "healthy_55", "margin": 6 },
    "best_dose":       { "dose_mg_per_day": 5, "of_evaluated": [2.5, 5, 10],
                         "reason_id": "dose_tradeoff" },
    "best_formulation":{ "status": "not_determined",
                         "message": "<§5.4 verbatim>" }
  },

  "uncertainty": {
    "evidence_grade": "B",
    "evidence_score": 0.82,
    "cited": 23, "estimated": 4, "not_found": 1,
    "estimated_inputs": ["cyp2d6_capacity_fold", "severity_weight.*", "objective weights"],
    "not_found_inputs": ["losartan serum urate reduction magnitude (mg/dL)"],
    "structural_limitations": [ "<§7.3 list verbatim>" ]
  }
}
```

### 9.1 Renderer invariants (enforce in code)

- `composite` may not be rendered without `scores.efficacy`, `scores.safety`,
  `scores.appropriateness` in the same view.
- `ranked[]` entries with `tier != "ALLOWED"` render below all `ALLOWED` entries.
- `disqualified[]` entries render **no scores**.
- `conclusions.best_formulation.status == "not_determined"` renders the §5.4 message
  verbatim and no ranking.
- If `uncertainty.evidence_grade` is `D`, the report header switches to a muted style and
  gains the line "treat this output as illustrative only".
- Every `reasons[]` entry with a `source_id` must resolve to a real source record. A
  dangling `source_id` is a build failure, not a warning.

---

## 10. How this serves both hackathon problems from one report

| | Problem 14 (drug development / screening) | Problem 12 (digital twin / personalised prescribing) |
|---|---|---|
| What varies | one candidate across **many** virtual patients | many candidates against **one** patient's twin |
| Which conclusion leads | `best_use_case` — which population this molecule suits | `best_dose` + ranked arms for this individual |
| Which uncertainty matters | §7.1 population spread | §7.2 evidence grade for *this* patient's parameters |
| Same code path? | **Yes.** Both are `for arm in arms: simulate(arm); score(arm)`. The only difference is whether the archetype axis or the dose axis is the one being searched. | |

**No design decision in this spec forces a choice between the two problem statements.**
The one thing that would is hard-coding a single patient into the scoring; §3–§6 take
`archetype` as a parameter throughout, which keeps both readings alive. This was an
explicit ask in the mission brief (§1.1) and it is satisfied here.

---

## 11. Sources

All retrieved **2026-08-17**. Ids `P#` correspond to the `S#` ids in
`04-ORGAN-EFFECT-MAP.md` §17, which carries the full citation detail; repeated here in
short form only.

| id | Source | Value used here |
|----|--------|-----------------|
| **P1** | FDA label, amlodipine besylate (openFDA) | Oedema 1.8/3.0/10.8 % at 2.5/5/10 mg vs placebo 0.6 %; palpitation 0.7/1.4/4.5 vs 0.6; dizziness 1.1/3.4/3.4 vs 1.5; t½ 30–50 h; steady state 7–8 days |
| **P2** | FDA label, Zestril (lisinopril) (openFDA) | ATLAS: dizziness 19 %/12 %, hypotension 11 %/7 %, creatinine increased 10 %/7 %, hyperkalemia 6 %/4 %, syncope 7 %/5 %; angioedema warning; fetal toxicity warning |
| **P4** | FDA label, metoprolol succinate ER (openFDA) | ER peak plasma levels "one-fourth to one-half" of IR at corresponding dose; bradycardia, wheezing (bronchospasm), dyspnoea |
| **P5** | FDA label, lisinopril and hydrochlorothiazide tablets (openFDA) | Cough 3.9 %, dizziness 7.5 %, orthostatic effects 3.2 % |
| **P7** | Musini VM et al., Cochrane 2014, thiazide monotherapy. PMID 24869750 | HCTZ −4/−2, −6/−3, −8/−3, −11/−5 mmHg at 6.25/12.5/25/50 mg `SECONDARY` |
| **P8** | ARB monotherapy ABPM meta-analysis, *Eur Heart J* 2014;35:1732 | −10.3/−6.7, −11.7/−7.6, −13.0/−8.3 mmHg at 25 %/50 %/max dose `SECONDARY` |
| **P9** | Amlodipine oedema/headache meta-analysis, *J Hypertens* 2019. PMID 31107359 | Oedema 16.6 % vs 6.2 %, RR 2.9; RR 2.01 low/medium dose vs 3.08 at 10 mg; 22 trials, 7226 patients `SECONDARY` |
| **P10** | Thiazide electrolyte/metabolic meta-analyses | ΔK −0.35 mmol/L at 25–50 mg; urate ≈ +90 µmol/L at ≥50 mg `SECONDARY` |
| **P11** | ACCP guideline / Annals review on ACE-inhibitor cough | Incidence 5–35 % `SECONDARY` |
| **P12** | β1/β2 receptor occupancy study, *Cardiovasc Drugs Ther* | β1 54–92 %, β2 6–38 % at metoprolol 100 mg b.i.d. `SECONDARY` |
| **P12b** | Metoprolol dose-response HR data | IR 50 mg b.i.d. −19.1 %; ER 100 mg o.d. −13.4 % `SECONDARY` |

**No incidence figure in this document comes from FAERS.** Spontaneous-report data has no
denominator and cannot produce a probability; see `04-ORGAN-EFFECT-MAP.md` §0.1.

---

## 12. Cross-agent notes

- **To Agent C:** I have adopted your three objective names (`efficacy`, `safety`,
  `appropriateness`) and your severity ranks verbatim as the report's interface — §2 and
  §4.2. The penalty values attached to ranks 3–6 (3/9/25/45) are mine and `ESTIMATED`; if
  you have a view on the ladder shape, it belongs in your file and I will follow it.
  Also: §4.1 assumes `block` appears only at rank 7 and `require_override` only at rank 6,
  which matches your `severity_levels` table.
- **To Agent B:** §5.4 is a live dependency. The product currently **refuses** to rank
  formulations for lisinopril, losartan and HCTZ because I could not source
  route/formulation PK for them. If `substances.json` carries sourced per-formulation
  bioavailability, Tmax and peak-to-trough data, the refusal is lifted automatically. This
  is the single highest-value gap for the "best formulation type" headline claim.
- **To Agent E:** two hard requirements. (1) **Efficacy must saturate with dose** (§3.2) —
  the ARB and thiazide dose-response data [P7][P8] are shallow, and a linear dose-response
  makes the entire "best dose" output trivial and wrong. Please make that a validation
  test. (2) The report needs P10/P50/P90 across the virtual population for every headline
  outcome, plus `N` — not means. §7.1.
- **To Agent D:** §4.2(c) reads laboratory reference ranges from `patient_model.json`
  rather than hard-coding them. Please make sure every lab in that list (`serum_k`,
  `serum_na`, `serum_urate`, `serum_creatinine`, `fasting_glucose`) has a reference range
  with provenance. Also, the BP target must be a per-archetype field, since the diabetes
  and CKD archetypes use a tighter threshold and §3.1 takes it as a parameter.
- **To the lead — a scope warning worth deciding early.** §7.3 says the product models
  blood pressure and laboratory values, **not clinical events**. Problem 12 asks for a
  "5-year prognosis". A 5-year projection of *surrogate markers* is defensible and
  buildable; a 5-year projection of *strokes and deaths* is not, from this model, and
  claiming one would be the most serious overclaim available to this team. Recommend the
  pitch says "5-year projection of blood pressure control and organ-relevant markers" and
  never implies event prediction.
