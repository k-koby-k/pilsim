# C-notes — Safety Rules Engine

**Agent C.** Owns `data/rules.json` and this file.
Retrieval dates: all web sources fetched **2026-08-17** unless stated otherwise.

> **Framing (must be carried into the UI):** PilSim is a *research simulator*, not a
> clinical decision support tool. `data/rules.json` encodes published contraindications,
> interactions and guideline preferences so the simulator can behave plausibly. It is
> not a prescribing aid and has not been validated against any patient population.

---

## 1. `data/rules.json` schema

### 1.1 Top-level

```jsonc
{
  "schema_version": "1.0.0",
  "generated": "2026-08-17",
  "disclaimer": "...",
  "severity_levels": [ ... ],   // ordered ladder, see 1.4
  "effect_ops":     [ ... ],    // the closed set of simulation effects, see 1.5
  "trigger_vocab":  { ... },    // legal atom types/keys, see 1.3
  "rules":          [ ... ]
}
```

### 1.2 Rule record

```jsonc
{
  "id": "RX-PREG-ACEI",          // stable, unique, uppercase, never renumbered
  "kind": "contraindication",     // see 1.4
  "direction": "negative",        // negative | positive | modifier
  "title": "ACE inhibitor in pregnancy",
  "trigger": { ... },             // boolean tree, see 1.3
  "severity": "contraindicated_absolute",
  "mechanism": "One sentence. Why, physiologically.",
  "effects": [ { "op": "...", ... } ],   // see 1.5 — quantitative where possible
  "warning": {
    "short": "≤ 60 chars, for a badge",
    "full":  "1–3 sentences, patient/researcher readable"
  },
  "evidence": [ {
      "source": "FDA label, Zestril (lisinopril)",
      "url":    "https://...",
      "quote":  "value/wording exactly as the source states it",
      "type":   "regulatory_label",   // see 1.6
      "retrieved": "2026-08-17"
  } ],
  "tags": ["pregnancy", "raas"],
  "confidence": "high"            // high | medium | low — see 1.7
}
```

### 1.3 Trigger DSL

A trigger is a **boolean tree** over **atoms**. Combinators: `all`, `any`, `not`
(each takes an array; `not` takes an array of length 1). An atom is:

```jsonc
{ "type": "<atom type>", "key": "<identifier>", "op": "<operator>", "value": <scalar|array> }
```

| `type` | `key` namespace | Meaning |
|---|---|---|
| `substance` | substance id from `data/substances.json` | a specific molecule is in the regimen |
| `drug_class` | `ace_inhibitor`, `arb`, `dhp_ccb`, `non_dhp_ccb`, `thiazide`, `beta_blocker_b1_selective`, `beta_blocker_nonselective`, `k_sparing_diuretic`, `nsaid`, `lithium`, `statin`, `cyp2d6_inhibitor_strong`, `cyp3a4_inhibitor_strong`, `cyp3a4_inducer_strong`, `cyp2c9_inhibitor`, `direct_renin_inhibitor`, `arni`, `mra`, `digoxin`, `sulfonylurea`, `insulin` | any member of a class is present |
| `condition` | comorbidity id (see §3) | patient has the condition |
| `lab` | `egfr_ml_min_1_73`, `serum_k_mmol_l`, `serum_na_mmol_l`, `serum_urate_mg_dl`, `uacr_mg_g`, `lvef_pct`, `hr_bpm`, `sbp_mmhg`, `dbp_mmhg`, `alt_u_l` | numeric patient state |
| `demographic` | `age_years`, `sex`, `pregnant`, `lactating`, `weight_kg`, `bmi` | |
| `phenotype` | `cyp2d6`, `cyp2c9`, `cyp3a4` | metabolizer status (`PM`,`IM`,`NM`,`UM`) |
| `excipient` | excipient id from `data/substances.json` | excipient present in the product |
| `dose` | substance id | `mg_per_day` of that substance |
| `route` | product route | `oral`, `oral_er`, `sublingual`, … |

Operators: `present`, `absent`, `eq`, `neq`, `in`, `not_in`, `lt`, `lte`, `gt`, `gte`,
`between` (value = `[lo, hi]`).

`dose` atoms carry the numeric under `value` and are compared against
`regimen[key].mg_per_day`. All other numeric atoms read the patient state vector
(Agent D's `data/patient_model.json`).

**Evaluation contract for the coding agent**

```ts
type Atom = { type: string; key: string; op: string; value?: number|string|(number|string)[] }
type Node = Atom | { all: Node[] } | { any: Node[] } | { not: [Node] }
function evaluate(node: Node, ctx: { regimen, patient, product }): boolean
```

Rules are evaluated independently; **all** matching rules fire. Resolution order for
the UI is by `severity_levels` index descending, then `id` ascending, so the output is
deterministic.

### 1.4 `kind` and `severity`

`kind` (what the rule *is*):

| kind | direction |
|---|---|
| `contraindication` | negative |
| `interaction_drug_drug` | negative |
| `interaction_drug_disease` | negative |
| `excipient_contraindication` | negative |
| `dose_cap` | modifier |
| `dose_adjustment` | modifier |
| `efficacy_modifier` | modifier |
| `adverse_effect_channel` | negative |
| `monitoring` | modifier |
| `compelling_indication` | positive |
| `preference` | positive |

`severity_levels`, ordered low → high. The integer is `rank`, used for sorting and for
the report's safety penalty term (Agent F consumes this):

| rank | id | UI treatment |
|---|---|---|
| 0 | `info` | grey note |
| 1 | `preferred` | green — a positive rule |
| 2 | `compelling` | green, stronger — a guideline-level positive indication |
| 3 | `minor` | yellow |
| 4 | `moderate` | orange |
| 5 | `major` | red, does not block |
| 6 | `contraindicated_relative` | red, blocks unless the user explicitly overrides |
| 7 | `contraindicated_absolute` | red, **blocks the run**; the simulator refuses |

Only rank 7 hard-blocks. Rank 6 requires an explicit override toggle so the demo can
still show "here is what would happen" — which is the whole point of a simulator.

### 1.5 `effects` — the closed set of operations

Every effect is an object with `op` plus op-specific keys. **Numeric effects carry
their own `provenance`** (a citation object, or the string `"ESTIMATED"` plus
`estimate_basis`). This is the per-field provenance shape required by shared decision 4.

| `op` | keys | meaning |
|---|---|---|
| `block` | `reason` | refuse to run; only legal at `contraindicated_absolute` |
| `require_override` | `reason` | run only if the user overrides |
| `pk_multiply` | `target` (e.g. `pk.metoprolol.auc`), `factor`, `factor_range` | scale a PK parameter |
| `pd_multiply` | `target` (e.g. `pd.hctz.sbp_drop_mmhg`), `factor` | scale a PD effect |
| `state_shift` | `target` (a patient state variable), `delta`, `delta_range`, `time_constant_days` | move a lab/vital |
| `risk_set` | `target` (e.g. `risk.peripheral_edema`), `absolute_pct` or `relative_risk`, `baseline_pct` | set/raise an adverse-event probability |
| `dose_cap` | `substance`, `max_mg_per_day` | hard cap the titration search |
| `dose_start` | `substance`, `start_mg_per_day` | override the starting dose |
| `score_delta` | `objective` (`efficacy`\|`safety`\|`appropriateness`), `delta` | push the Agent F ranking |
| `monitor` | `labs`, `at_days` | schedule a lab check in the timeline |
| `annotate_organ` | `organ`, `channel`, `direction` | drive Agent F's organ animation |

`target` paths are namespaced: `pk.<substance>.<param>`, `pd.<substance>.<param>`,
`labs.<name>`, `vitals.<name>`, `risk.<name>`. `<substance>` may be `*` to apply to
every member of the triggering class.

### 1.6 `evidence.type` — source grade

`regulatory_label` (FDA/EMA product labeling) > `guideline` (society clinical practice
guideline) > `rct` > `meta_analysis` > `observational` > `regulatory_guidance`
(e.g. EMA excipients annex, 21 CFR) > `secondary` (review/tertiary — used only where
flagged).

### 1.7 `confidence`

`high` = regulatory label or current guideline states it directly.
`medium` = derived from trial/meta-analysis, or the number is a reasonable central
estimate from a range.
`low` = plausible mechanism, weak or indirect numeric support. Anything `low` is also
flagged in §5 below.

Where a number could not be sourced, the field carries the literal string `"NOT_FOUND"`
rather than a guess.

### 1.8 Provenance contract and its one deliberate exception

Every effect carrying a **pharmacological** number has a `provenance` field. The single
exception is `score_delta.delta`: those are **design weights** for Agent F's ranking
objective, not scientific claims, and carry no citation by design. At generation:
**59 effects with a citation, 44 marked `ESTIMATED`, 32 unprovenanced `score_delta`
weights.**

The `ESTIMATED` count is high, and that is the honest state of this domain. Regulatory
labels overwhelmingly state interaction **direction** without magnitude — "may increase",
"may be attenuated", "several-fold". Everything I could not source is listed in §4.

### 1.8a Substance gating — mandatory for consumers

Any effect carrying a `substance` key applies **only when that substance is in the
regimen**. A rule firing is not authority to apply every effect it contains. Several
rules are deliberately multi-substance: `AE-CHANNELS-VISIBLE` triggers on lisinopril
**or** amlodipine **or** HCTZ but carries per-drug figures. Ungated, an HCTZ-only arm
inherits lisinopril's cough and angioedema numbers *with FDA citations attached*,
pointing at a drug the patient is not taking — a citation-integrity failure, not just a
scoring bug. Also gate on `applies_to`, `applies_to_partner`, `applies_to_phenotype`,
`requires_salt` and `when`. Full contract in the JSON header
(`substance_gating_contract`).

**One legitimate exception:** rules triggered by `all` over two substances are
*combination* rules — the harm is in the pairing. `DDI-BB-THIAZIDE-DYSGLYCEMIA` is the
only one; its effects are regimen-level and correctly carry no `substance` key.

### 1.9 File statistics

48 rules. By severity: 9 `contraindicated_absolute`, 5 `contraindicated_relative`,
12 `major`, 11 `moderate`, 2 `minor`, 4 `info`, 1 `preferred`, 4 `compelling`.
By direction: 30 negative, 13 modifier, **5 positive**. The five locked demo gates plus
the drug–drug reject are indexed by stable id under `demo_gate_rule_ids` in the JSON
header so Agents E and F can bind to them without string-matching titles.

---

## 2. AUDIT of the team's 9-comorbidity draft (mission brief §1.3, step 3)

**Headline finding: not one of the nine claims survives unamended. Two are outright
wrong, four are misleading, three are partially correct.** Every claim that cited a
guideline year or a numeric threshold cited it incorrectly.

| # | Draft claim | Verdict | Corrected statement | Citation |
|---|---|---|---|---|
| 1 | "Type 2 diabetes — ACE/ARB preferred, renal-protective; earlier BP treatment threshold (130/80) per **2025 AHA/ACC** guideline" | **MISLEADING** (two distinct errors) | The 2025 guideline exists (Circulation 2025;152:e114–e218, pub. 2025-08-14) but **130/80 is not new to it** — that threshold was set by the **2017** guideline and merely reaffirmed. What *is* new in 2025: PREVENT replaces the Pooled Cohort Equations, and the target adds "encouragement to achieve <120". Separately, ACEi/ARB is **not** preferred in diabetes generally — only with **albuminuria (UACR ≥30 mg/g), eGFR <60, or CAD**. | [2025 AHA/ACC guideline](https://www.ahajournals.org/doi/10.1161/HYP.0000000000000249); [ADA Standards of Care 2026 §10.8](https://pmc.ncbi.nlm.nih.gov/articles/PMC12690187/): *"ACE inhibitors or ARBs are recommended first-line therapy for hypertension in people with diabetes **and albuminuria or coronary artery disease**. A"* — and, decisively, *"**In the absence of albuminuria** … ACE inhibitors and ARBs **have not been found to afford superior cardioprotection** compared with thiazide-like diuretics or dihydropyridine calcium channel blockers."* |
| 2 | "CKD — ACE/ARB first-line; **thiazide less effective at low kidney function**; **dose caps differ**" | **PARTIALLY CORRECT**; the thiazide half is **WRONG/outdated**; "dose caps differ" is **unsupported** | ACEi/ARB is first-line for **albuminuric** CKD (KDIGO 1B for A3 non-diabetic, A2–A3 diabetic; 2C for A2 non-diabetic); the 2025 AHA/ACC extends it to eGFR <60 regardless of albuminuria. **Thiazides remain effective to at least eGFR 15** — CLICK gave a placebo-subtracted −10.5 mmHg 24-h SBP in stage 4 CKD. There is **no renal dose cap for HCTZ in FDA labeling**; the CrCl-30 figure comes only from combination-product labels. Real caveats: hypokalemia, reversible creatinine rise, loop diuretics preferred for volume. | [KDIGO 2024 CKD Guideline](https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf) Rec 3.4.1 (*SBP target **<120** by standardized office measurement, 2B*), 3.6.1–3.6.4, PP 3.6.7; [CLICK, NEJM 2021;385:2507](https://pmc.ncbi.nlm.nih.gov/articles/PMC9119310/) |
| 3 | "Heart failure — ACE/ARB/ARNI + beta-blocker + MRA; non-DHP CCB (verapamil) often avoided" | **PARTIALLY CORRECT / INCOMPLETE** (three errors) | (a) **SGLT2 inhibitors are the missing fourth pillar** — COR 1, LOE A, irrespective of diabetes. (b) "beta-blocker" is too loose: only **bisoprolol, carvedilol, metoprolol succinate ER** qualify; **metoprolol tartrate has no HF indication** and does not substitute. (c) verapamil is not "often avoided" — it is **COR 3: Harm, LOE A**; DHP CCBs incl. amlodipine are **COR 3: No Benefit, LOE A**. Guideline is still the **2022** AHA/ACC/HFSA — no 2025/2026 revision exists. | [2022 AHA/ACC/HFSA HF Guideline](https://professional.heart.org/en/science-news/-/media/832EA0F4E73948848612F228F7FA2D35.ashx); metoprolol tartrate label indications = hypertension, angina, MI only |
| 4 | "Obesity / metabolic syndrome — **thiazides weaker; higher CCB response typical**" | **WRONG — backwards** | Obesity hypertension is sodium-retentive and volume-expanded with RAAS/MR and sympathetic activation, so diuretics work **well**. In the ACCOMPLISH BMI subanalysis the **HCTZ arm performed best in obese patients** (primary endpoint 18.2 vs 30.7 per 1000 patient-years in normal weight), and amlodipine's advantage was confined to **non-obese** patients (overweight HR 0.76; normal weight HR 0.57). No guideline recommends a class by BMI. Legitimate caveats: thiazide dysglycemia, amlodipine edema, and ≥5% weight loss (incl. GLP-1 RAs, new in 2025) as itself a BP intervention. | [Weber MA et al., ACCOMPLISH BMI subanalysis, Lancet 2013;381:537](https://pubmed.ncbi.nlm.nih.gov/23219284/); [Hall JE, Circ Res 2015;116:991](https://pmc.ncbi.nlm.nih.gov/articles/PMC4363087/) |
| 5 | "Elderly 65+ — **low-dose thiazide first-line**; more sensitive to **dizziness/falls**" | **MISLEADING** (both halves) | There is **no age-specific first-line class** — all four are co-equal at any age; the thiazide-for-elderly idea is a JNC-era holdover. And intensive BP treatment **does not increase injurious falls** (SPRINT) and actually **reduces** measured orthostatic hypotension (OR 0.93, 95% CI 0.86–0.99). The 2023 Beers Criteria flags **none of the five drugs**; the agents it flags for orthostasis are alpha-1 blockers, central alpha-agonists, IR nifedipine and CNS-active drugs. The genuine elderly-specific caution for HCTZ is **hyponatremia/SIADH**, and for ACEi/ARB, **hyperkalemia + avoid dual RAS blockade in CKD ≥3a**. | [SPRINT, NEJM 2015;373:2103](https://www.nejm.org/doi/full/10.1056/NEJMoa1511939); [Juraschek SP et al., Ann Intern Med 2021;174:58](https://pubmed.ncbi.nlm.nih.gov/32909814/); [AGS 2023 Beers Criteria](https://pmc.ncbi.nlm.nih.gov/articles/PMC12478568/) — **2023 is the current edition; there is no 2024/2025/2026 update** |
| 6 | "Asthma / COPD — **beta-blocker contraindicated** (bronchospasm)" | **MISLEADING — the most consequential error in the list** | Asthma is **NOT** in the metoprolol CONTRAINDICATIONS section on any current label (verified on TOPROL-XL rev. Feb 2025, Lopressor rev. Nov 2025, and four generics). It is a **Warning (§5.3)**, which explicitly permits use. The contraindications are purely cardiac. **Non-selective** beta-blockers (propranolol) *are* absolutely contraindicated in asthma — the draft collapses that distinction. Quantitatively, and the asthma/COPD split is sharp: in **asthma**, acute cardioselective blockade drops FEV1 by **−6.9% (95% CI −8.5 to −5.2)**, with a ≥20% fall in ~1 in 8 — an interval that does **not** cross zero. In **COPD** the same class changes FEV1 by only **−2.05% (95% CI −6.05 to +1.96)** — an interval that **does** cross zero, i.e. not distinguishable from no effect, and it does not worsen with continued use. So the honest rule is **dose-dependent caution, not a binary contraindication**, which is a better product behaviour anyway: it composes with the fact that β1-selectivity *erodes as concentration rises*, so `DDI-METOPROLOL-CYP2D6-INHIBITOR` and `PGX-CYP2D6-PM-METOPROLOL` feed the bronchospasm channel. Without a cardiac indication, BLOCK-COPD found more exacerbation hospitalisation (HR 1.91, 1.29–2.83). | [Metoprolol succinate ER label §4 and §5.3](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=99ecc717-38ab-4d00-8bf2-86a41b1c7977); [Inderal LA label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=35d28979-36b1-4630-b85e-a44e0a443734); [Morales DR, Chest 2014;145:779](https://pubmed.ncbi.nlm.nih.gov/24202435/); [BLOCK-COPD, NEJM 2019;381:2304](https://pubmed.ncbi.nlm.nih.gov/31633896/) |
| 7 | "Gout — thiazide raises uric acid — reject-test case" | **CONFIRMED in direction, MISLEADING in strength** | The pharmacology is right, but **gout and hyperuricemia are not contraindications on the HCTZ label** — its only contraindications are **anuria and sulfonamide hypersensitivity**. The reject strength comes from gout-guideline literature (conditional recommendations), not regulatory labeling. Encoded as `contraindicated_relative` with an override, and paired with a **positive** rule preferring losartan. | [HCTZ label CONTRAINDICATIONS, full text](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=01f1f478-5493-439f-9b99-f4f82023781c): *"Anuria. Hypersensitivity to this product or other sulfonamide-derived drugs."*; [Cochrane PMID 24869750](https://pubmed.ncbi.nlm.nih.gov/24869750/) |
| 8 | "Pregnancy — ACE/ARB contraindicated (fetal harm)" | **CONFIRMED** — the only claim that stands essentially as written | Both drugs carry an **FDA boxed warning** for fetal toxicity. One addition the draft omits: the old teaching that **first-trimester exposure is safe is not current** — the label says discontinue as soon as pregnancy is detected, full stop. Also worth encoding: HCTZ in pregnancy is *avoid*, not contraindicated (rule `RX-PREG-HCTZ`, relative); the 2025 guideline's contraindicated list is atenolol, ACEi, ARBs, direct renin inhibitors, nitroprusside, MRAs; chronic-hypertension target in pregnancy is **<140/90**. | [Lisinopril label BOXED WARNING](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0e6364a4-6d66-4151-8197-d45e2a762895); [2025 AHA/ACC guideline pregnancy section](https://www.ahajournals.org/doi/10.1161/HYP.0000000000000249) |
| 9 | "CAD / prior stroke — **beta-blocker or ACE preferred**" | **WRONG for stroke; OUTDATED for CAD** | These are two different conditions and the draft merges them. **Stroke:** a beta-blocker is *not* preferred — LIFE showed losartan beat atenolol for stroke and ASCOT-BPLA favoured amlodipine±perindopril over atenolol±thiazide; the post-stroke evidence base is **ACEi + thiazide** (PROGRESS). **CAD:** the 2023 AHA/ACC Chronic Coronary Disease guideline does **not** recommend a beta-blocker when **LVEF > 50%**, and the universal post-MI beta-blocker is under active revision — **REDUCE-AMI (NEJM 2024)** found no benefit in preserved-EF post-MI, with **ABYSS (2024)** and **REBOOT (2025)** pointing the same way. The durable indication is **reduced EF or angina**, not CAD as such. **Consequence for the rules file: CAD alone must NOT award metoprolol a compelling-indication bonus** — and it does not; `CI-HFREF-METOPROLOL-SUCCINATE` gates on `lvef_pct ≤ 40`, not on a CAD flag. Amlodipine has CAD evidence in its own right (CAMELOT, HR 0.691, 95% CI 0.540–0.884). | Amlodipine label §14.4 (CAMELOT); see §4 gap list — the stroke and CAD trial numbers are the least-verified part of this audit |

### 2.1 What this audit changes for the build

1. **Do not let the demo say "beta-blockers are contraindicated in asthma."** A clinician judge will catch it. Say "relative contraindication — cardioselectivity is not absolute," and show the −6.9% FEV1 number. The corrected framing is *more* impressive than the wrong one, because it demonstrates the engine encodes label nuance.
2. **Model the metoprolol salt.** Succinate ER vs tartrate is a real clinical distinction the product will get wrong otherwise (claim 3).
3. **Do not gate ACEi/ARB preference on "diabetes."** Gate it on **albuminuria** (claim 1). This is a one-line change with real clinical content.
4. **Do not zero out thiazide efficacy at low eGFR** (claim 2) — the rule `EFF-HCTZ-ADVANCED-CKD` applies a conservative 0.75 multiplier, not 0.
5. **Drop or invert the obesity claim** (claim 4). If the team wants an obesity beat, the defensible one is "thiazides work *better* here than the folklore says."

### 2.2 Comorbidities to ADD or SPLIT

The nine-condition list is under-specified for what these five drugs actually interact with:

| Add / change | Why | Rule id |
|---|---|---|
| **Split asthma from COPD** | Different verdicts entirely (claim 6) | `RX-ASTHMA-METOPROLOL`, `RX-COPD-METOPROLOL-NO-CARDIAC-INDICATION` |
| **Split CAD from prior stroke** | Different preferred classes (claim 9) | — |
| **Albuminuria as its own axis**, not folded into diabetes/CKD | It is the actual gate for ACEi/ARB preference | `CI-ALBUMINURIA-RAASI` |
| **Hyperkalemia / baseline serum K** | The dominant RAAS-limiting factor | `DDI-RAAS-POTASSIUM` |
| **Prior ACE-inhibitor angioedema** | Absolute contraindication, and a great visual | `RX-ANGIOEDEMA-ACEI` |
| **Sulfonamide hypersensitivity** | One of only two HCTZ contraindications | `RX-HCTZ-SULFA` |
| **Conduction disease / bradycardia** | The *actual* metoprolol contraindications | `RX-METO-CARDIAC-CI` |
| **Hepatic impairment** | Drives amlodipine and losartan dosing; the 9-list has no liver axis at all | `DOSE-HEPATIC-AMLODIPINE-LOSARTAN` |
| **CYP2D6 / CYP2C9 metabolizer status** | Problem 12 explicitly asks for genetics | `PGX-CYP2D6-PM-METOPROLOL`, `PGX-CYP2C9-PM-LOSARTAN` |
| **Concomitant NSAID use** | Extremely common, and completes the triple whammy | `DDI-TRIPLE-WHAMMY` |
| **Galactosaemia / azo-dye sensitivity / low-sodium diet** | Makes locked decision 2 (excipients) do real work | `EXC-*` |

---

## 3. Rule inventory by function

**Absolute contraindications (9):** pregnancy ×2, prior ACE angioedema, HCTZ anuria,
HCTZ sulfonamide, metoprolol cardiac, metoprolol pheochromocytoma, aliskiren+RAASi in
diabetes, ARNI 36-hour washout.

**Relative contraindications (5):** dual RAAS, metoprolol+asthma, HCTZ+gout,
HCTZ+pregnancy, lactose in hereditary sugar disorders.

**Drug–drug interactions (12):** triple whammy, RAASi+NSAID efficacy loss,
RAASi+potassium, RAASi+lithium, HCTZ+lithium, HCTZ+digoxin, metoprolol+CYP2D6 inhibitor,
metoprolol+rate-slowing agents, metoprolol+insulin, amlodipine+CYP3A inhibitor,
amlodipine+simvastatin, losartan+CYP2C9 inhibitor, losartan+rifampin, β-blocker+thiazide.

**Pharmacogenomic (3):** CYP2D6 PM, CYP2D6 IM/NM/UM guard, CYP2C9 PM.

**Dose caps and adjustments (4):** all-substance caps, lisinopril renal,
amlodipine/losartan hepatic, HF-specific metoprolol titration.

**Positive / compelling (5):** four co-equal first-line classes, albuminuria→RAASi,
gout→losartan, HFrEF→metoprolol succinate, stage 2→initial two-drug combination.

**Excipient (4):** lactose hereditary, lactose false-positive guard, azo dye, sodium ×2.

**False-positive guards (3):** `EXC-LACTOSE-INTOLERANCE-INFO`,
`PGX-CYP2D6-IM-NM-METOPROLOL`, and the `not[]` clause in
`RX-COPD-METOPROLOL-NO-CARDIAC-INDICATION`. These exist because a safety engine that
fires on everything is as useless as one that fires on nothing.

---

## 4. What I could NOT source — read before quoting any of this

These are the values in `rules.json` marked `ESTIMATED` where I actively looked and
failed. They are the file's soft spots, in descending order of how much they matter.

1. **HCTZ dose–response on serum potassium, sodium, urate, glucose and lipids in
   mmol/L or mg/dL per 12.5 / 25 / 50 mg.** Genuinely not available at label or
   open-access level. Cochrane (PMID 24869750) gives direction only and warns of "high
   risk of bias in the metabolic data". Peterzan 2012 (Hypertension 2012;59:1104) has the
   potency series but is paywalled. **This is the single biggest gap** — HCTZ's
   electrolyte channel is a headline animation and its magnitudes are estimates.
   *One real anchor exists:* the lisinopril/HCTZ label reports a **mean serum potassium
   decrease of 0.1 mEq/L** over 24 weeks for the combination (lisinopril offsets the loss).
2. **Losartan's urate-lowering magnitude.** Direction and URAT1 mechanism are solid;
   I could not retrieve a cited mg/dL figure. `CI-GOUT-PREFER-LOSARTAN` uses −0.7 mg/dL
   as a flagged estimate chosen to visibly offset the HCTZ rise. **Do not quote it.**
3. **HCTZ's urate rise magnitude** (`RX-GOUT-HCTZ`, +0.8 mg/dL) — same problem, same
   caveat. The gout reject case *works* regardless, because it is a categorical gate.
4. **Amlodipine + strong CYP3A4 inhibitor AUC ratio.** The FDA label explicitly declines
   to quantify it. There is **no labeled clarithromycin or itraconazole ratio anywhere.**
   The 2.0× is mine. What *is* sourced: diltiazem +60%, and the clarithromycin AKI
   odds ratio of 1.61 (1.29–2.02) from JAMA 2013.
5. **CYP2C9 → losartan effect size.** There is **no CPIC and no DPWG guideline** for this
   pair (verified against both registries with positive controls). The trial evidence is
   *contradictory* — Sekino 2003 found reduced BP effect in \*1/\*3, Bae 2012 found none,
   and a 2021 meta-analysis found significance in Asians but not Caucasians. Rule is
   marked `confidence: low`. **Do not present it to a judge as guideline-backed
   personalization the way CYP2D6/metoprolol can be.**

Lesser gaps: ONTARGET hyperkalemia rate (not published in the abstract); a numeric
lithium-level rise from HCTZ; carbamazepine and SSRI hyponatremia interactions are
**not on the US HCTZ label** despite being well known — if encoded, they must be flagged
as non-label; ACOG's current chronic-hypertension-in-pregnancy document status
(acog.org returned HTTP 402); ASCOT-BPLA and REDUCE-AMI/REBOOT numerics for audit claim 9.

### 4.1 Two methodological warnings for the team

- **Two FDA `accessdata.fda.gov` PDF URLs I initially cited returned 404.** I caught this
  by curling every citation before publishing and replaced them with DailyMed sources.
  **Any agent citing `accessdata.fda.gov/drugsatfda_docs/label/...` should verify the URL
  resolves** — a large fraction are dead. DailyMed is the reliable route.
- **Jurisdiction conflict on amlodipine PK.** FDA says diltiazem +60% and erythromycin
  "no significant change"; Health Canada says +57% and +22%. `rules.json` uses **FDA
  throughout**. Do not blend the two.

---

## 5. Cross-agent notes

**To Agent B (substances/products):**
- A real generic HCTZ label lists inactive ingredients *"dibasic calcium phosphate,
  **lactose monohydrate**, pregelatinized starch, **FD&C yellow No.6 lake**, corn starch,
  colloidal silicon dioxide, and magnesium stearate"*
  ([DailyMed](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=01f1f478-5493-439f-9b99-f4f82023781c)).
  That single product triggers **both** `EXC-LACTOSE-GALACTOSEMIA` and `EXC-AZO-DYE`
  (FD&C Yellow No. 6 is an azo colourant). It is the cleanest excipient demo beat in the set.
- For excipient rules to evaluate, records need: `lactose_monohydrate` (boolean),
  the azo-dye excipient ids, and a computed `sodium_total_mg_per_max_daily_dose`.
- **Metoprolol must carry its salt** (`succinate_er` vs `tartrate`) — `CI-HFREF-METOPROLOL-SUCCINATE` gates on it and the clinical distinction is real.

**To Agent D (virtual human):** reconciled 2026-08-17 — our field names already agree.
The trigger DSL reads `labs.*`, `vitals.*` and `phenotype.*` paths listed in §1.3.
`phenotype.cyp2d6` needs values `PM|IM|NM|UM`; a plausible baseline distribution is
**PM ≈ 8% in Caucasians, ≈ 2% in most other populations** (metoprolol label §12.5).
`vitals.fev1_pct_predicted` is needed for both airway rules. Your eGFR guidance is
encoded verbatim as `renal_function_contract` in the JSON header: rules key on the
**indexed** `labs.egfr_ml_min_1_73` (2021 race-free CKD-EPI) for guideline thresholds,
Agent E **de-indexes by BSA/1.73** for drug clearance, and Cockcroft-Gault is
display-only — noting that FDA labels still express renal dose bands in CrCl, which is
why `DOSE-RENAL-LISINOPRIL` quotes CrCl bands while triggering on eGFR. Your finding
that **type 2 diabetes does not expand plasma volume (2628 vs 2597 mL, p = 0.716)** is
useful negative evidence: no rule in this file shifts plasma volume for diabetes, and
none should be added.

**To Agent E (simulation):** `DDI-DUAL-RAAS` applies `pd_multiply` factor **1.1** to the
combined BP effect — dual RAAS blockade is deliberately modeled as nearly redundant, which
is the pharmacological point. `DDI-TRIPLE-WHAMMY` is time-varying: RR **1.82** for
simulated days 0–30, **1.31** thereafter.

**To Agent F (organ map / report):** organ vocabulary is now aligned to your element ids
(`organ_binding` in the JSON header). **Your catch on the airway conflation was correct
and is fixed** — `face_throat`/`angioedema_swelling` and `lung.airway`/`bronchoconstriction`
are now separate and must never share an animation. All three rule ids you were waiting on
now exist and are indexed under `demo_gate_rule_ids`. Dual RAAS is encoded
`contraindicated_relative`, not absolute, exactly as you advised — the labels say *"in
general, avoid combined use of RAS inhibitors"*, while *"do not co-administer"* is reserved
for aliskiren in diabetes. `score_delta` weights are yours to retune; they carry no
provenance by design.

---
