# B1 Notes — Substances (Lisinopril, Losartan + EXP3174, Amlodipine)

Agent B1. Scope: three active substances only. Agent B2 owns metoprolol,
hydrochlorothiazide, and all excipients, and MUST follow the schema below.

Output file: `data/substances_part1.json`
B2 output file: `data/substances_part2.json`
The lead merges them into `data/substances.json` by concatenating the `substances`
arrays.

---

## 1. SCHEMA (v1) — READ THIS FIRST, B2

### 1.1 Top-level file shape

```jsonc
{
  "schema_version": "1.0",
  "generated_by": "B1",                 // or "B2"
  "generated_on": "2026-08-17",
  "disclaimer": "Research simulator dataset. NOT a clinical decision tool. ...",
  "provenance_legend": { ... },         // copy verbatim from part1
  "substances": [ /* SubstanceRecord */ ]
}
```

### 1.2 The universal provenance wrapper — the single most important convention

**Every numeric value in the file is wrapped in a `Val` object.** Never write a bare
number for a pharmacological quantity. A bare number is a defect.

```jsonc
{
  "value": 6.0,                  // number | null   canonical value in `unit`
  "unit": "L/h",                 // string | null   null for dimensionless
  "range": [4.0, 9.0],           // [lo, hi] | null  observed / reported range
  "cv_percent": 35,              // number | null   inter-individual CV%
  "n": 12,                       // number | null   subjects the value came from
  "distribution": "lognormal",   // "lognormal" | "normal" | "uniform" | null
  "provenance": {
    "status": "CITED",           // "CITED" | "ESTIMATED" | "NOT_FOUND"
    "tier": 1,                   // 1 = regulatory label, 2 = peer-reviewed PK study,
                                 // 3 = curated database (DrugBank/PubChem/DrugCentral),
                                 // 4 = secondary web summary (avoid), null if not cited
    "source": "FDA label, ZESTRIL (lisinopril) tablets, Rev 2022",
    "url": "https://...",
    "quote": "Peak serum concentrations occur within about 7 hours",
    "retrieved": "2026-08-17",
    "note": "one line: estimation justification, unit conversion, or caveat"
  }
}
```

Rules:
- `status: "CITED"` → `source`, `url`, `quote`, `retrieved`, `tier` all required.
  `quote` is the value **as the source states it**, verbatim, before any unit
  conversion. If you converted units, say so in `note`.
- `status: "ESTIMATED"` → `source`/`url` null, `note` carries the one-line
  justification. `tier` null.
- `status: "NOT_FOUND"` → `value` null, `note` says what you looked for and where.
- `cv_percent`: **chase this specifically.** If the paper reports SD and mean,
  compute CV and say so in `note`. If it reports only a range, fill `range` and set
  `cv_percent` to an `ESTIMATED` sibling — see `cv_percent_provenance` below when
  the CV comes from a different source than the mean.
- If mean and CV come from different sources, use the long form:
  `"cv_percent": {...Val...}` is NOT allowed (no nesting). Instead add a sibling key
  `"<field>_variability": { ...Val... }` at the same level, carrying the CV as its
  `value` with `unit: "%"`. Keep `cv_percent` on the main Val only when it comes
  from the same source.

### 1.3 SubstanceRecord

```jsonc
{
  "id": "lisinopril",                    // stable slug, lowercase, [a-z0-9_]
  "name": "Lisinopril",
  "synonyms": ["..."],
  "role": "active",                      // "active" | "active_metabolite" | "excipient"
  "parent_substance_id": null,           // set for active_metabolite records
  "drug_class": "ACE inhibitor",
  "atc_codes": ["C09AA03"],
  "identifiers": {                       // plain strings, no Val wrapper (not numeric)
    "cas": "83915-83-7",
    "pubchem_cid": "5362119",
    "drugbank_id": "DB00722",
    "chembl_id": "CHEMBL1481",
    "unii": "E7199S1YWR",
    "rxnorm_cui": "29046",
    "kegg_drug": "D00362",
    "chebi": "CHEBI:6503",
    "inchikey": "RLAWWYSOJDYHDC-BZSNNMDCSA-N",
    "smiles": "..."
  },
  "physchem": {
    "molecular_formula": "C21H31N3O5",   // string
    "molecular_weight": Val,             // g/mol
    "logp": Val,                         // octanol/water, experimental preferred
    "pka": [ Val, ... ],                 // each with note naming the group
    "water_solubility": Val,             // mg/mL
    "bcs_class": { "value": 3, ... },    // Biopharmaceutics Classification System
    "polar_surface_area": Val,           // A^2
    "hbd": Val, "hba": Val,
    "rule_of_five_violations": Val
  },
  "pk": {
    "bioavailability_fraction": Val,     // 0-1, oral unless route noted
    "tmax_h": Val,
    "cmax": Val,                         // ng/mL, MUST carry `dose_mg` in note
    "auc": Val,                          // ng*h/mL, MUST carry `dose_mg` in note
    "half_life_h": Val,                  // terminal, effective t1/2 in note if different
    "vd_l": Val,                         // absolute L; vd_l_per_kg also allowed
    "vd_l_per_kg": Val,
    "clearance_l_h": Val,
    "renal_clearance_l_h": Val,
    "fraction_excreted_unchanged_urine": Val,   // 0-1
    "protein_binding_fraction": Val,     // 0-1
    "blood_to_plasma_ratio": Val,
    "absorption_rate_ka_per_h": Val,     // first-order ka for the sim
    "lag_time_h": Val,
    "compartments": { "value": 1|2, ... },
    "metabolism": {
      "primary_enzymes": ["CYP2C9", "CYP3A4"],
      "fraction_metabolized": { "CYP2C9": Val, "CYP3A4": Val },
      "active_metabolites": ["exp3174"],
      "transporters": ["..."],
      "notes": "prose"
    },
    "special_populations": {             // each key -> Val whose `value` is a
      "renal_impairment": Val,           //   multiplier on AUC or CL (say which in note)
      "hepatic_impairment": Val,
      "elderly": Val,
      "pediatric": Val,
      "sex": Val,
      "race_ethnicity": Val,
      "genotype": { "CYP2C9*3/*3": Val, ... }
    },
    "food_effect": Val,                  // multiplier on AUC; note gives Cmax/tmax shift
    "model_defaults": {                  // what the simulation should actually use
      "ka_per_h": Val, "f_oral": Val, "vd_l": Val, "cl_l_h": Val,
      "population_cv": { "ka": Val, "f": Val, "vd": Val, "cl": Val }
    }
  },
  "pd": {
    "target": "angiotensin-converting enzyme (ACE, EC 3.4.15.1)",
    "target_uniprot": "P12821",
    "action": "competitive inhibition",
    "potency": {
      "ic50_nm": Val, "ki_nm": Val, "kd_nm": Val, "ec50_ng_ml": Val
    },
    "clinical_effect": {
      "sbp_drop_mmhg": Val,              // placebo-subtracted, note gives dose
      "dbp_drop_mmhg": Val,
      "emax_sbp_mmhg": Val,              // Emax model params for the sim
      "ed50_mg": Val,
      "hill_coefficient": Val,
      "dose_response_slope": "prose + numbers",
      "onset_h": Val, "peak_effect_h": Val, "duration_h": Val,
      "trough_to_peak_ratio": Val
    },
    "other_effects": [                   // each: what moves, direction, magnitude Val
      { "variable": "serum_potassium_mmol_l", "direction": "increase",
        "magnitude": Val, "timescale_h": Val, "mechanism": "..." }
    ],
    "adverse_effects": [
      { "name": "cough", "incidence_fraction": Val, "onset": "...",
        "visible_channel": true, "mechanism": "..." }
    ]
  },
  "formulations": [
    { "form": "immediate-release tablet",
      "route": "oral",
      "strengths_mg": [2.5, 5, 10, 20, 30, 40],
      "exists_real_world": true,
      "f_relative": Val,                 // bioavailability relative to the reference form
      "tmax_h": Val,
      "peak_to_trough_swing": Val,       // (Cmax-Cmin)/Cavg at steady state, dimensionless
      "dosing_interval_h": Val,
      "reference_products": ["Zestril", "Prinivil"],
      "note": "..." }
  ],
  "dosing": {
    "typical_adult_start_mg": Val,
    "typical_adult_range_mg": Val,       // value = midpoint, range = [lo, hi]
    "max_daily_mg": Val,
    "ddd_mg": Val,                       // WHO defined daily dose
    "frequency_per_day": Val
  },
  "simulation_hooks": {                  // free-form, for agents D/E/F
    "state_variables_affected": ["map_mmhg", "serum_k_mmol_l", ...],
    "organs": ["kidney", "lung", "vasculature"],
    "personalization_axes": ["renal_function", "CYP2C9_genotype"]
  },
  "flags": ["pregnancy_contraindicated", "renal_dose_adjustment"],
  "record_notes": "free prose: caveats, what is weakest in this record"
}
```

### 1.4 Conventions B2 must match

- Units: hours (`_h`), mg, ng/mL, L, L/h, mmHg, mmol/L. Fractions 0–1, never
  percentages, except `cv_percent` and any field explicitly named `_percent`.
- `null` for absent, never `0`, never `"N/A"`, never omit the key.
- Every `Val` keeps its `provenance` object even when `status` is `NOT_FOUND`.
- Active metabolites get their **own top-level record** with
  `role: "active_metabolite"` and `parent_substance_id` set.
- Excipient records (B2) may use a reduced set: `identifiers`, `physchem`,
  `role: "excipient"`, `excipient_function` (filler/binder/disintegrant/lubricant/
  glidant/coating/colorant), `typical_amount_mg` (Val), `patient_flags`
  (e.g. `lactose_intolerance`, `tartrazine_sensitivity`, `sodium_content`),
  and `formulation_implications` prose. `pk`/`pd` may be `null` for excipients —
  but say so with a `record_notes` line rather than omitting.
- Citation tier is required on every CITED provenance. Tier 1 = regulatory label
  (FDA/EMA/DailyMed SPL). Tier 2 = peer-reviewed PK/PD study. Tier 3 = curated
  database. Tier 4 = secondary summary — use only when 1–3 fail and mark it.

---

## 2. What was produced

`data/substances_part1.json` — **COMPLETE**. 4 records:
`lisinopril`, `losartan`, `exp3174` (active metabolite, own record), `amlodipine`.

428 provenance-wrapped values: **212 CITED, 104 ESTIMATED, 112 NOT_FOUND**. Zero
provenance defects (validated programmatically: every `CITED` carries url + quote +
tier; every `ESTIMATED` carries a justification note; every `NOT_FOUND` says what was
looked for).

Source tiers actually used: overwhelmingly **tier 1** (FDA SPLs pulled live from the
openFDA `drug/label.json` endpoint), plus tier 2 for the CYP2C9 genotype literature and
the clarithromycin/AKI cohort, plus tier 3 (PubChem/ChEMBL/DrugBank) for
physicochemistry. **No tier 4 secondary web summaries were used anywhere.**

### Labels used (all fetched live 2026-08-17 via openFDA)

| Drug | SPL set id | Effective |
|---|---|---|
| Lisinopril (Solco) | `02c23f9c-f3cf-4366-ae1e-56296f1fedf9` | 2026-05-22 |
| Lisinopril/HCTZ | `00b266d9-ac4a-e931-e063-6294a90a6a0b` | 2026-06-02 |
| Losartan (Cardinal) | `021cd76a-b093-4704-8410-5e7d01e20a54` | 2025-10-22 |
| COZAAR | `9949448f-c3b9-44ee-94ed-c1aca8c90f39` | 2026-01-20 |
| HYZAAR | `4116ccde-2e23-45f4-b12f-6337df877744` | 2025-11-26 |
| Amlodipine (Lupin) | `003dd1ec-16f8-4f96-b6a8-c4689d35892a` | 2026-04-20 |
| NORVASC | `7367289c-b0b0-466a-83e2-558e2985c29f` | 2023-02-15 |
| KATERZIA (suspension) | `df673a4d-acb8-444c-a472-c87ab8cbd366` | 2025-12-16 |
| NORLIQVA (solution) | `614d974f-51c7-4b18-8171-39eb6e8d4c03` | 2026-02-16 |

### Citation liveness — checked, per Agent C's warning

Agent C found that many `accessdata.fda.gov` label URLs 404. **Every non-DailyMed URL in
my file was curled on 2026-08-17 and all are live** (result recorded machine-readably
under `citation_verification` in the JSON):

| URL | Code |
|---|---|
| `accessdata.fda.gov/.../2009/020386s049lbl.pdf` | **200** |
| `organon.com/.../zocor_pi.pdf` | 200 |
| `pdf.hres.ca/dpd_pm/00073653.PDF` | 200 |
| PubMed 11823761 / 22735459 / 24346990 | 203 (non-authoritative success, not an error) |
| PMC8303964 | 200 |
| DailyMed setid URLs | 200 |

Policy applied: **DailyMed SPL set ids are the durable identifier** for every current
product label. The one `accessdata.fda.gov` URL I use is the 2009 COZAAR revision — cited
because the non-converter passage was *removed* from later labels and therefore has no
DailyMed equivalent — and it verified at 200. Every label citation additionally carries
its SPL set id **inside the source string**, so a reader can re-find the document even if
a URL moves.

Reproducible recipe (this is the command that produced the PK text):

```
curl -s 'https://api.fda.gov/drug/label.json?search=openfda.generic_name:"LISINOPRIL"+AND+_exists_:pharmacokinetics&limit=5'
```

No API key needed, no rate limit hit at this volume. `pharmacokinetics`,
`pharmacodynamics`, `clinical_studies` and `adverse_reactions_table` are separate JSON
keys — **that last one is where the dose-resolved numbers live**, and it is easy to miss
because the prose sections do not contain them.

---

## 3. Findings that change other agents' work

### 3.1 Variability — the column that was most at risk of being omitted

The losartan label contains **mean ± SD for AUC, Cmax, t½ and CL_ren, for both parent
and metabolite, N=12** (Table 2). Every CV in those two records is *computed from cited
data*, not assumed:

| Parameter | Parent | EXP3174 |
|---|---|---|
| AUC₀₋₂₄ | 442 ± 173 → **CV 39.1%** | 1685 ± 452 → **CV 26.8%** |
| Cmax | 224 ± 82 → CV 36.6% | 212 ± 73 → CV 34.4% |
| t½ | 2.1 ± 0.70 → CV 33.3% | 7.4 ± 2.4 → CV 32.4% |
| CL_ren | 56 ± 23 → CV 41.1% | 20 ± 3 → **CV 15.0%** |

The metabolite is *less* variable than the parent — mechanistically sensible, since
CYP2C9 variation changes how fast E-3174 forms but not how much ultimately forms.

**The headline variability finding is lisinopril's bioavailability: 25% mean with a
cited 6–60% range.** A 10-fold spread in exposure between individuals on the same dose.
Compare amlodipine at 64–90% (1.4-fold). Two drugs, same virtual population, completely
different exposure spreads — if the population simulation demonstrates one thing, this
is it.

Paediatric variability is much wider than adult: E-3174 AUC CV is 57.7% in children
versus 26.8% in adults.

### 3.2 Peak-to-trough spans four orders of magnitude

All derived from cited half-lives (Cmax/Cmin at steady state, τ=24 h):

| | t½ | Cmax/Cmin |
|---|---|---|
| Amlodipine | 40 h | **1.30** |
| Lisinopril | 12 h | 2.7 |
| EXP3174 | 7.4 h | 6.8 |
| Losartan parent | 2.1 h | **~2000** |

This is the quantitative backbone of the concentration-time animation. Three drugs,
three visually unmistakable shapes. **The UI must plot EXP3174, not the losartan
parent** — plotting the parent makes losartan look like a drug that stops working after
8 hours.

### 3.3 Two label-internal inconsistencies the engine must not inherit

**Losartan and EXP3174 volumes of distribution are unusable in a one-compartment
model.** The label's Vd (34 L parent, 12 L metabolite) is Vss. Check: `t½ = ln2·Vd/CL`
gives 0.65 h for the parent, but the observed t½ is 2.1 h. The label's own three numbers
only cohere under two compartments. Derived Vz values of **109 L and 32 L** are in the
records and reproduce both the AUC and the half-life. Using 34 L makes losartan
disappear three times too fast.

**Lisinopril's PD onset (1 h) precedes its plasma tmax (7 h).** A direct-effect PD model
cannot reproduce this. An effect compartment or turnover model is required.

### 3.4 The best-quantified thing in my scope is an *adverse* dose-response

Amlodipine oedema, from `adverse_reactions_table`:

| Dose | 2.5 mg | 5 mg | 10 mg | Placebo |
|---|---|---|---|---|
| Oedema | 1.8% | 3.0% | **10.8%** | 0.6% |

And by sex: **women 14.6%, men 5.6%** (placebo 5.1% / 1.4%).

The label publishes dose-resolved *adverse* incidence but **no** dose-resolved BP
figures — only "dose-related". So efficacy rises sub-linearly while the visible adverse
effect rises supra-linearly. That asymmetry is the strongest argument for the product's
claim to recommend a *best* dose rather than a maximum one, and it is fully cited.

### 3.5 Formulations — where the "best formulation type" claim is and isn't defensible

Every record carries **deliberate negative entries** (`exists_real_world: false`) so the
recommender cannot silently propose a product that does not exist.

- **Amlodipine has the richest real set**: tablet, suspension (Katerzia, benzoate salt),
  solution (Norliqva), and six marketed FDCs. Best subject for the feature.
- **Lisinopril's honest answer is boring**: IR tablet, oral solution (Qbrelis), FDC with
  HCTZ. No ER exists and none is needed — absorption is already rate-limiting.
- **No ER amlodipine exists anywhere and none ever will** — a 30–50 h half-life makes the
  molecule its own extended-release system (Cmax/Cmin 1.30). **If the report ever
  recommends ER amlodipine, the scoring function is broken.** Best single acceptance test
  for the feature.
- **Adversarial case**: losartan *arguably* has a PK rationale for an ER form (parent t½
  2.1 h, and the label itself says BID dosing gives better troughs) — but none exists,
  because the 7.4 h metabolite already provides duration. A recommender reasoning only
  from the parent's half-life will get this wrong.
- Transdermal is mechanistically impossible for lisinopril (zwitterion, logP −1.01).
  IV losartan would be self-defeating: bypassing first pass bypasses the activation step.

### 3.6 Losartan CYP2C9 — for Agent D specifically

Agent D's linear activity-score mapping predicts 1.14–1.35 fold for heterozygotes where
Yasar 2002 observed 2–3 fold. **Use the observed values as a lookup table instead**
(now in the record as `USE_OBSERVED_NOT_ACTIVITY_SCORE`):

| Genotype | Fold change in parent/metabolite AUC ratio |
|---|---|
| *1/*1 | 1.0 (reference) |
| *1/*3 | 2.0 |
| *2/*3 | 3.0 |
| *3/*3 | **30** (plasma); 40 urinary |
| non-converter (~1% of people) | conversion falls 14% → <1% of dose |

`*1/*2` was not separately reported — **NOT_FOUND, do not interpolate silently.**

Linear activity scores underpredict because activation is a formation-rate-limited step
in a sequential system, and the deficit is partly buffered by reduced metabolite
clearance — which is exactly why Bae 2012 found E-3174 AUC "not different".

#### ⚠️ This whole story is LOW CONFIDENCE and must not be pitched as guideline-backed

Agent C, Agent D and I independently reached the same conclusion. The primary evidence
**actively contradicts itself**:

| Source | Finding |
|---|---|
| Yasar 2002 (PMID 11823761) | Effect present — the fold values in the table above |
| Sekino 2003 (PMID 14504849) | Effect present; BP reduced in *1/*1 but not *1/*3. No fold numbers |
| **Bae 2012** (PMID 22735459, n=43) | **No effect** — E-3174 AUC "not different"; clinical effects "may not be reduced" |
| Meta-analysis 2021 (PMC8303964) | Significant in **Asian** subgroups, **not significant in Caucasian** subgroups |

**No CPIC guideline and no DPWG guideline exists for losartan/CYP2C9** (verified absent
by two agents). Contrast metoprolol/CYP2D6, which has a 2024 CPIC guideline and *can*
legitimately be pitched as guideline-backed personalization.

Every Yasar-cited value in the JSON now carries `provenance.confidence: "LOW"` and a
`provenance.conflicting_sources` array listing all four findings, plus an
`OVERALL_CONFIDENCE` gate at the top of the genotype block. **Display the disagreement;
do not select the finding that tells the better story.** The defensible product behaviour
is to show CYP2C9 as an *exploratory* input, labelled contested, and to reserve the
guideline-backed framing for metoprolol.

**Population frequencies:** no Uzbekistan-specific CYP2C9 data exists. The only
frequencies in my file are explicitly labelled by source population (Turkish, Chinese)
and neither is a substitute for Central Asian data. The honest UI behaviour is to let
the user pick a reference population and show which is in use.

### 3.7 Three "do not invent" rules

1. **No renal mg cap for losartan or amlodipine.** Both labels explicitly say no
   adjustment — losartan despite exposure rising 50–90% in renal impairment. Only
   lisinopril has a real renal rule (halve initial dose at CrCl 10–30; 2.5 mg below 10).
   *Altered PK does not automatically mean altered dosing* — a good teaching case.
2. **No exposure multiplier for amlodipine + strong CYP3A inhibitor.** No numeric AUC
   ratio exists in any regulatory label. The only quantitative evidence is epidemiologic
   (AKI OR 1.61) and must stay an outcome-risk modifier.
3. **No genotype dosing rule for losartan or amlodipine.** Neither has a CPIC guideline.
   Metoprolol (B2's) is the only one in the set that does.

---

## 4. Values I am least confident in

1. **Amlodipine Vd (1470 L / 21 L/kg) and CL (25.5 L/h)** — the weakest numbers in my
   scope. The US label gives *no* volume of distribution. 21 L/kg could not be traced to
   a primary or EMA source in the timebox (medicines.org.uk returned HTTP 404). Marked
   ESTIMATED. They are internally consistent with the label half-life and with commonly
   reported concentrations — corroboration, not citation.
2. **Lisinopril Vd** — two derivations disagree by ~50% (82 L by closing the loop on
   label numbers vs ~124 L commonly quoted). Both are in the record with the arithmetic
   shown. Most in need of a peer-reviewed replacement.
3. **Losartan logP and water solubility** — DrugBank vs HMDB disagree by 5 log units
   (1.19 vs 6.1) and >2 orders of magnitude respectively. **Deliberately not resolved.**
   Any lipophilicity-driven prediction for losartan should be suppressed, not shown.
4. **All ED50 / Hill coefficients** — no label publishes a fitted dose-response curve.
   Every one is ESTIMATED from qualitative label statements about which doses did and
   did not separate from placebo.
5. **The 10–40× EXP3174 potency ratio** — cited, but a **4-fold-wide range**. It sets how
   much of losartan's effect the metabolite carries, so that uncertainty should propagate
   into output intervals rather than being hidden behind the 20× midpoint.

---

## 5. Gaps another agent must close

- **Losartan's uricosuric effect is NOT QUANTIFIED anywhere in my sources.** It is a
  stated reason the drug is in the set (§_SHARED_CONTEXT decision 1) and it anchors the
  contrast with HCTZ's gout reject case. Agent C needs a magnitude before writing that
  rule. Also unverified: my claim that the effect belongs to the *parent* and not
  EXP3174 (marked ESTIMATED). If true it is striking — a CYP2C9 poor metaboliser gets
  *more* urate-lowering and *less* BP effect from the same dose.
- **No placebo-adjusted BP number for lisinopril monotherapy exists in the US label** —
  only comparative statements. Agent E must source it from a meta-analysis.
- Losartan and lisinopril **adverse-effect incidence rates** were not fully extracted
  (amlodipine's were). Lisinopril angioedema rate needs the Warnings section.
- **WHO ATC/DDD values are ESTIMATED, not verified** against atcddd.fhi.no
  (lisinopril 10 mg, losartan 50 mg, amlodipine 5 mg). Re-check before using for any
  dose-equivalence calculation.

---

## 6. Verdict on the team's draft scope (§1.3)

| Draft line | Verdict |
|---|---|
| Lisinopril 5–40 mg | **PARTIALLY CORRECT** — 40 mg ceiling right (>40 "does not appear to give greater effect"), but label start is **10 mg**; 5 mg only with a diuretic; usual range 20–40 mg/day |
| Losartan 25–100 mg | **CONFIRMED** — start 50, max 100, 25 if volume-depleted/hepatic. 150 mg adds nothing, so the cap is an efficacy plateau |
| Amlodipine 2.5–10 mg | **CONFIRMED** exactly |
| Verapamil avoided in HF | **CONFIRMED**, but add the corollary the draft omits: amlodipine is *not* in that category — no negative inotropy, no AV effect even with β-blockers |
| ACE/ARB contraindicated in pregnancy | **CONFIRMED** — both carry BOXED WARNINGS |
| ACE/ARB first-line in CKD | **CONFIRMED in direction**, but flag: labels do **not** support ACEi+ARB together. VA NEPHRON-D (losartan+lisinopril — the exact pair in this set) stopped early for safety, no benefit |

---

## 7. Cross-agent notes

These are also embedded machine-readably in `substances_part1.json` under
`cross_agent_notes`, keyed by agent.

**Agent C** — cleanest DDI numbers in the dataset, one trial, matched units: lisinopril
alone gives mean K⁺ **+0.1** mmol/L with 15% of patients above +0.5; **with HCTZ the mean
flips to −0.1**, only 4% above +0.5 and 12% below −0.5. Also a hard dose cap ready to
encode: amlodipine + simvastatin, "Do not exceed ZOCOR 20 mg once daily" (simvastatin AUC
×1.77). And **positive** rules — amlodipine + β-blocker is explicitly *safe*; amlodipine +
grapefruit has *no* interaction; amlodipine + atorvastatin is fine while simvastatin is
capped, so statin choice is a recommendable action.

**Agent E** — combination anchor, fully cited, matched units: losartan 50 mg alone
= 5.5–10.5/3.5–7.5 mmHg placebo-adjusted; losartan 50 + HCTZ 12.5 = **15.5/9.2**. The
lisinopril/HCTZ label independently calls the combination "approximately additive".
Anchor the composition rule there. Also: amlodipine needs **7–8 days to steady state**
(accumulation ×2.9) while the other two reach it in a day — a 24-h-only simulation
materially understates amlodipine. Amlodipine response scales with baseline BP (×1.5
moderate vs mild) and is **+1/−2 mmHg in normotensive subjects** — use that as a boundary
test. Losartan's maximal effect takes **3–6 weeks**, so a purely concentration-driven
model over-predicts day 1 and under-predicts week 6.

**Agent F** — the three best mechanistic contrasts, all label-cited:
1. Lisinopril **lowers** angiotensin II (blocks synthesis); losartan **raises** it (blocks
   the receptor). Same BP outcome, opposite movement of the intermediate. This is the
   single most persuasive proof that the model is mechanistic and not a lookup table.
2. Bradykinin/cough channel **lit for lisinopril** (2.5% excess cough), **explicitly dark
   for losartan** (label: does not affect the bradykinin response).
3. In the kidney, lisinopril dilates the **efferent** arteriole and transiently *lowers*
   GFR; amlodipine dilates the **afferent** arteriole and *raises* it. Same organ,
   opposite direction, different arteriole.

Highest-impact adverse animation: amlodipine oedema, dose-resolved and sex-resolved
(§3.4). **None of my three drugs changes heart rate** — all three labels say so
explicitly — so the heart animation's motion belongs entirely to metoprolol (B2's).

**Agent B2** — follow §1 exactly. Note that excipient identifiers, CAS/UNII and the
functional-category caveats are already collected in
`research/physchem-identifiers.md` §3; do not re-derive them. That file also carries
salt-to-base conversion factors for metoprolol tartrate and succinate.
