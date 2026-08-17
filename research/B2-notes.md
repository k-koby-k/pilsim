# B2 Notes — Hydrochlorothiazide, Metoprolol, all Excipients, products.json

**Agent:** B2 · **All retrievals: 2026-08-17** · **Status: COMPLETE**

| Deliverable | State | Size |
|---|---|---|
| `data/substances_part2.json` | complete | 39 substance records, 391 provenance-wrapped values |
| `data/products.json` | complete | 8 products, 30 provenance-wrapped values |
| `research/B2-notes.md` | this file | — |

**Provenance audit (run programmatically, script in scratchpad `gen_*.py`):**

| File | Val objects | CITED | ESTIMATED | NOT_FOUND | **defects** |
|---|---|---|---|---|---|
| `substances_part2.json` | 391 | 213 | 89 | 89 | **0** |
| `products.json` | 30 | 26 | 4 | 0 | **0** |

A defect = a `CITED` value missing source/url/quote/retrieved/tier, an `ESTIMATED`
without a justification note, or a `NOT_FOUND` carrying a value. Zero of each.
Every cited URL was curled: all return HTTP 200. **Zero `accessdata.fda.gov` URLs**
were used anywhere (per Agent C's dead-link warning) — every regulatory citation is
either an openFDA API query or a DailyMed setid URL.

---

## 1. Schema compliance

B2 follows **B1-notes §1 schema v1 exactly**: the `Val` wrapper, the unit conventions
(hours, mg, ng/mL, L, L/h, mmHg, mmol/L; fractions 0–1), `null` never `0`/`"N/A"`,
and tier labels on every citation. Two documented adaptations, both permitted by
B1 §1.4:

1. **Excipient reduced schema.** `pk` and `pd` are explicitly `null` (not omitted).
   Replaced by `excipient_function`, `excipient_functions_all`,
   `excipient_function_provenance`, `max_amount_per_day_mg` (FDA IID),
   `typical_amount_mg`, `present_in_products` + per-product SPL provenance,
   `patient_flags` + `patient_flag_definitions`, `patient_relevance`,
   `formulation_implications`.
2. **Metoprolol salt handling.** One *substance* record (the moiety) with a
   `salt_forms` block and per-formulation PK; **two separate *product* records**.
   See §5.

No divergence from B1 requiring merge work. The lead can concatenate `substances[]`.

## 2. Working constraint: WebSearch budget exhausted at call 1

The session quota (200/200) was gone before B2 started — same wall B1 hit. All B2
research therefore ran through **direct HTTP**: `curl` against openFDA `/drug/label`,
DailyMed SPL v2 XML, PubChem PUG-REST, the FDA IID zip, the WHO ATC/DDD index, and
— the workaround that saved the pharmacology — **the Europe PMC REST search API**
(`https://www.ebi.ac.uk/europepmc/webservices/rest/search`), which is a literature
search engine reachable by curl and is not subject to the WebSearch budget.

**Recommend to the lead:** put Europe PMC REST in `01-DATA-ACQUISITION.md`. It is
free, keyless, returns full abstracts in `resultType=core`, and serves open-access
full text at `/{PMCID}/fullTextXML`. It is how B2 found both meta-analyses that carry
the highest-value numbers in this file.

---

## 3. METOPROLOL — the CYP2D6 personalization story, quantified

This was the brief's priority and it came out strong. **Two independent sources agree.**

### 3.1 Exposure ladder (Tier 2, Blake 2013, PMID 23665868, pooled n=264)

| Comparison | Cmax | AUC | t½ | CL/F |
|---|---|---|---|---|
| extensive vs **poor** | 2.3× | **4.9×** | 2.3× | 5.9× |
| ultrarapid vs **poor** | 5.3× | **13×** | 2.6× | 15× |

**AUC multipliers vs normal metabolizer** — the numbers Agent E should implement:

| Phenotype | AUC × | t½ (h) | Status |
|---|---|---|---|
| Ultrarapid | **0.38** | 3.1 | DERIVED (4.9 ÷ 13), arithmetic on cited values |
| Normal | 1.0 | 3.5 | CITED T2 / T1 |
| Intermediate | **1.8** | 4.5 | **ESTIMATED — weakest number in the record** |
| Poor | **4.9** | 8.0 | CITED T2, and T1 label independently says 7–9 h |

The label's independent statement *"in poor CYP2D6 metabolizers the half-life may be
7 to 9 hours"* cross-validates Blake's 2.3× ratio (3.5 × 2.3 = 8.05 h). That
agreement between a regulatory label and a meta-analysis is the strongest
verification in the whole dataset.

### 3.2 The three findings that should change how the engine is built

**(a) The PD curve saturates — do not use a linear PK→effect link.** Exposure differs
4.9-fold between poor and normal metabolizers, but measured effect differs by only
~3 bpm and ~3 mmHg (Tier 2, Meloche 2020, PMID 32090368, 15 studies, n=1146).
CPIC states the mechanism outright: *"beta-blockers exhibit a sigmoid dose–response
relationship. Thus, increasing beta-blocker plasma concentrations beyond a certain
threshold does not result in f[urther effect]"*. **B2 solved the Emax parameters from
the label's own two anchor points** (30 nmol/L → 30% of max; 540 nmol/L → 80% of max):
**EC50 = 24 ng/mL, Hill coefficient = 0.68.** A linear model would overstate the
genotype effect enormously and a clinician judge would spot it in seconds.

**(b) The asthma contraindication is dose-dependent, not binary — and there is a hard
number for it.** *"The relative beta-1 selectivity of metoprolol diminishes and
blockade of beta-2 adrenoceptors increases at plasma concentration above 300 nmol/L"*
(Tier 1) = **80.2 ng/mL**. Combine with (a): **a poor metabolizer on a standard dose
can cross the selectivity threshold while a normal metabolizer does not.** Genotype
converts a drug that is cautiously usable in mild asthma into one that is not, and
the simulator can show the exact crossing point on the concentration trace. This is,
in B2's view, the single best demo in the product. Agents C and F should both build
on it.

**(c) CPIC only acts on the poor metabolizer.** Standard dosing for intermediate;
**"no recommendation"** for ultrarapid. The product may *show* the exposure difference
for all four phenotypes but must not *recommend* dose changes CPIC declines to make.
Full CPIC Table 1 (activity scores) and Table 2 (recommendations) are in the record
verbatim.

Also captured: quinidine phenocopies a poor metabolizer (3× S-metoprolol, 2× t½,
Tier 1) — so the demo does not need a rare genotype to show the effect.

### 3.3 IR vs ER — the formulation data Agent F asked for

**This is the only direct label-level release-profile comparison in the whole PilSim
dataset, and F's refusal machinery can now lift for metoprolol.**

| | IR tartrate (Lopressor) | ER succinate (Toprol-XL) |
|---|---|---|
| Relative bioavailability | 1.0 (absolute ~0.50) | **0.77** (Tier 1) |
| Peak plasma vs IR | 1.0 | **¼ to ½** (Tier 1, midpoint 0.375) |
| Dosing interval | 12 h | 24 h |
| Heart failure indication | **NO** | **YES** |
| Lactose | contains | lactose-free |

Plus a Tier-1 licence to reuse one PD model: *"The relationship between plasma
metoprolol levels and reduction in exercise heart rate is independent of the
pharmaceutical formulation."* Only the input curve changes.

**Honest negatives recorded, not invented:** no marketed transdermal and no marketed
sublingual metoprolol. The report engine should say "no marketed product in this
form" rather than ranking a fiction.

---

## 4. HYDROCHLOROTHIAZIDE

### 4.1 Agent C's "biggest gap" is closed — real per-dose magnitudes exist, open access

C reported that per-dose electrolyte/urate/glucose deltas were unavailable. They are
available, Tier 2, in **Peterzan 2012 (Hypertension 59:1104-09, PMC4930655, free full
text)** — 26 HCTZ trials, 4,683 subjects, >53 arms:

| Endpoint | HCTZ dose required | Source |
|---|---|---|
| SBP −10 mmHg | **26.4 mg** | Peterzan, T2 |
| Serum K⁺ −0.4 mmol/L | **40.5 mg** | Peterzan, T2 |
| Urate **+36 µmol/L** | **12.3 mg** | Peterzan, T2 |
| Near-max SBP (>25 mg) | −10.1 (−13.4 to −6.8) mmHg | Peterzan, T2 |
| Near-max DBP (>25 mg) | −3.7 (−4.1 to −3.2) mmHg | Peterzan, T2 |
| At 25 mg: SBP/DBP, K⁺, urate | −8.8/−4.4 mmHg, −0.38 mmol/L, +48 µmol/L | Law 2003 via Peterzan, T2 |
| Below 6.25 mg | no significant SBP effect | Peterzan, T2 |

**Agent C should replace its ESTIMATED electrolyte deltas with these.**

### 4.2 This reproduces B1's amlodipine asymmetry — and it is the "best dose" argument

B1 flagged that amlodipine's harm is better dose-resolved than its benefit. HCTZ shows
the same shape and it is even sharper: **urate harm appears at 12.3 mg, while the full
BP benefit needs 26.4 mg.** Harm arrives at *half* the dose of full benefit. Meanwhile
potassium loss only becomes material at 40.5 mg. So the benefit/harm optimum sits at
the low end, and — critically — **HCTZ 12.5 mg is not a "safe for gout" dose**, which
is a counter-intuitive, cited conclusion the report engine can defend.

B2 fitted a log-linear model from the two Tier-2 anchors (ESTIMATED, derivation shown
in the record): `SBP_drop = −4.6 × ln(dose/3.0)`, valid 6.25–50 mg. It returns −6.6
at 12.5 mg and −9.7 at 25 mg vs Law's observed −8.8 — 0.9 mmHg high, which Agent E
should use as its validation tolerance.

### 4.3 STRUCTURAL WARNING for Agent E — HCTZ is not like the other four drugs

**There is no published plasma-concentration/effect relationship for HCTZ at all.**
Its effect is a function of *tubular*, not plasma, concentration. **Do not build an
Emax link from plasma concentration to blood pressure for this drug.** Drive HCTZ's
effect from **dose** via the log-linear model; use the PK only to animate the kidney
and time the diuresis. This is a genuine structural difference and it will silently
produce wrong results if missed.

Second structural point: **the BP response is two-phase.** Acute fall is
volume-mediated and partly reverses; the sustained fall is a later vascular effect
(~4 weeks). A model without this will overshoot on day 1.

### 4.4 Other channels captured with magnitudes
Sodium (−2 mmol/L mean, ESTIMATED, modelled as small mean + heavy left tail — the
risk is age/sex-driven and idiosyncratic, not a population mean), glucose (+0.2
mmol/L, ESTIMATED, and **potassium-mediated — so co-prescribing an ACE inhibitor/ARB
blunts it**, making it a *conditional* adverse channel), LDL (+0.15 mmol/L,
ESTIMATED), plasma volume (−8%), renin (↑, Tier 1), calcium (↑ — a rare *beneficial*
channel worth animating), magnesium (↓).

---

## 5. Salt forms as first-class — Agent C's clinical-error risk

C is right, and `products.json` handles it as C asked:
`prod_metoprolol_succinate_er_tablet` and `prod_metoprolol_tartrate_tablet` are
**separate product records**, not one drug with a formulation attribute. Each carries
`approved_indications` (Tier 1), `salt_form_is_first_class: true`, and a
`salt_distinction_note`. The tartrate record carries an explicit safety instruction
for C: if the twin has heart failure and the pill contains metoprolol **tartrate**,
flag it and **redirect positively** to succinate ER rather than bare-rejecting.

The difference runs **both ways**: tartrate has an acute-MI indication the ER product
lacks. It is not simply "ER is better".

**Three different numbers, all called "50 mg", that the code must not confuse:**

| | label strength | salt mass | **metoprolol base** |
|---|---|---|---|
| Toprol-XL "50 mg" | 50 mg (tartrate-equivalent) | 47.5 mg succinate | **38.9 mg** |
| Lopressor 50 mg | 50 mg | 50 mg tartrate | **39.1 mg** |

`composition[].amount_mg` is **always metoprolol base**, with `salt_amount_mg` and
`label_strength_mg` alongside. Conversion factors are Tier 1 from the labels
(tartrate 0.781 — the label's own 12.5 → 9.76 mg; succinate 0.819) and both match the
stoichiometry exactly. **Note the two products are base-matched**, which is why the
label can compare them directly.

---

## 6. EXCIPIENTS — 30 solid-dosage + 7 oral-solution records

Sourced per Agent A's instruction from **DailyMed SPL XML `<ingredient
classCode="IACT">` elements matched on UNII**, across 10 setids, cross-checked against
the label prose. Identifiers reused from `research/physchem-identifiers.md` (not
re-derived); PubChem CIDs are **deliberately omitted for polymers** per that file's
monomer-trap warning. `max_amount_per_day_mg` comes from the **FDA IID** (July 2026,
9,072 rows) per route/dosage-form — recorded as a *regulatory precedent ceiling, not
a toxicity threshold*.

### 6.1 Agent A's advice was right, and here is the proof
**Lopressor's prose label lists 7 excipients; the structured SPL gives 12.** The prose
hides the film coat behind the trade name *"Opadry YS-1-1419 Pink"*; the XML unpacks
it into hypromellose, PEG, propylene glycol, talc, titanium dioxide, D&C Red 30 and
FD&C Blue 2. Prose alone would have lost every colorant flag.

### 6.2 The patient-relevant flags that actually matter

- **FD&C Yellow No. 6 in hydrochlorothiazide — the highest-value flag in the dataset.**
  An azo dye with a recognised allergic-reaction signal *including bronchial asthma*,
  particularly in aspirin-sensitive patients. **It collides with the metoprolol asthma
  case:** an asthmatic can be harmed by the *dye* in one product and by the *active*
  in another. Only possible to express because excipients are first-class substances.
- **Lactose → galactosaemia, not "lactose intolerance".** Tablet lactose is ~100×
  below the usual adult symptom threshold. The real exclusions are congenital
  galactosaemia, congenital lactase deficiency and glucose-galactose malabsorption —
  rare and absolute. **Encode the narrow rule.** A blanket "lactose intolerant →
  reject" makes the product cry wolf, and knowing when *not* to warn is as important
  as warning. Lisinopril/Zestoretic/Norvasc/Toprol-XL are lactose-free (mannitol);
  Cozaar/Hyzaar/Lopressor/generic HCTZ are not.
- **Titanium dioxide** — banned as an EU *food* additive since 2022, retained in
  *medicines* under transition, permitted in the US. The same tablet can be legal in
  one jurisdiction and under review in another purely because of an excipient — a
  good point for a Ministry-of-Health audience and for Uzbek local manufacturing.
  **B2 could not re-verify the current EU transition deadline: do not state a date.**
- Sodium flags (sodium starch glycolate, sodium stearyl fumarate, SLS) are recorded
  but quantitatively negligible — **<1 mg per tablet against a 2000 mg/day limit.**
  Recorded so the engine can say "present but immaterial", which is a better answer
  than silence.

### 6.3 Excipients that determine formulation feasibility
- **Paraffin** is the rate-controlling coat on Toprol-XL's pellets — it is what turns
  a 3–4 h half-life drug into a 24 h product. The IID data shows this by itself: its
  only plain-tablet entry is 0.7 mg vs a 321 mg/day ER ceiling.
- **Sodium stearyl fumarate** replaces magnesium stearate in Toprol-XL specifically
  because it is far less hydrophobic and does not retard pellet dissolution.
- **Hypromellose** is a thin cosmetic film coat in Cozaar/Lopressor and a
  rate-controlling gel matrix at higher load — *same molecule, two jobs,
  distinguishable only by amount*.
- **Sodium lauryl sulfate** appears in HCTZ tablets precisely because HCTZ is poorly
  soluble; its presence is direct evidence of the active's physicochemistry.

### 6.4 Honest, systemic gaps
- **`typical_amount_mg` is NOT_FOUND for every single excipient.** Quantities are
  trade secret — absent from label prose *and* from structured SPL (verified: the
  `<quantity>` element is populated only for `ACTIB`/`ACTIM` actives across all 10
  SPLs parsed). This is an industry disclosure gap, not missing research.
- **Functional categories are ESTIMATED for all but magnesium stearate and talc**,
  because the Handbook of Pharmaceutical Excipients and USP-NF <1059> are both
  paywalled. Reliable formulation science, no free citable source.
- **Pregelatinized starch has no retrievable UNII or CAS** (GSRS concept record,
  `approvalID: null`). Genuine identifier gap.
- Sodium starch glycolate type-A-potato (SPL UNII) returns **no ORAL rows in the
  IID**, which indexes the generic UNIIs. Verified empirically, not assumed.

---

## 7. products.json — 8 products, and why not 5

Five monotherapy (one per locked drug) + metoprolol tartrate IR (needed for the
formulation comparison) + **the two real fixed-dose combinations**. Full rationale is
in the file's `scope_note`. If the Pills page must show five cards, show all eight and
let the FDCs carry the pitch.

### 7.1 The FDCs are the proof the brief asked for — with the label saying it

**Zestoretic (lisinopril/HCTZ)** carries three Tier-1 statements that are each
independently valuable:

1. *"The combination tablet is bioequivalent to concomitant administration of the
   separate entities."* → **a regulatory licence to superpose PK.** Cite it.
2. *"the extent of blood pressure reduction ... was approximately additive."* →
   **multiplier 1.0** for ACE-inhibitor + thiazide. Agent E: this is class-pair
   specific, not global — beta-blocker + thiazide is *less* than additive because
   metoprolol suppresses renin while HCTZ raises it.
3. *"patients treated with lisinopril plus a thiazide diuretic showed essentially no
   change in serum potassium."* → **the set-piece demo.** HCTZ alone drops K⁺ ~0.4
   mmol/L; lisinopril alone raises it; the FDC nets to zero, *and the label says so*.
   Two red bars cancel on screen.

Plus a **label-stated "best dose" conclusion** the report engine should independently
rediscover: 20/12.5 and 20/25 give *similar* mean BP effect, so the extra 12.5 mg of
HCTZ buys no blood pressure and adds hypokalaemia and hyperuricaemia.

**Hyzaar (losartan/HCTZ)** is the answer to the gout reject case: HCTZ raises urate,
losartan is uricosuric (URAT1 inhibition — class-unique among ARBs), so the
combination is **partly self-correcting**. Direction well established; **magnitude NOT
SOURCED** — flag as directional in the UI. Agent C: this should be a *positive
compelling-indication* rule, not merely the absence of a contraindication. Note also
that Hyzaar's label carries **no** explicit bioequivalence sentence — B2 marked
superposition ESTIMATED there. **Do not misattribute Zestoretic's quote to Hyzaar.**

### 7.2 The strongest empirical argument for the Pills page existing
B2 pulled **five different HCTZ SPLs and got five different excipient lists.** Same
molecule; four contain an azo dye or a lactose flag, one (ScieGen) contains neither.
And **three strengths of one brand have three different excipient sets** — Hyzaar
100/12.5 has no D&C Yellow No. 10 while 50/12.5 and 100/25 do. For a dye-sensitive
patient, **the simulator can name the specific strength that is safe.** A
molecule-level tool structurally cannot reach that.

Also: **Zestoretic is lactose-free while generic HCTZ monotherapy is not** — so for a
galactosaemic patient needing both drugs, the *combination pill is the safer choice*.
Non-obvious, sourced, product-level.

---

## 8. Verdicts on the team's draft scope (§1.3) — from B2's scope only

| Draft claim | Verdict | Correction |
|---|---|---|
| "CKD — **thiazide less effective at low kidney function**" | **WRONG (outdated)** | Meta-analysis of 5 trials, n=214, mean GFR 13.0–26.8: *"Thiazide and thiazide-like diuretics seem to maintain their effectiveness in lowering blood pressure in patients with advanced [CKD]"* (PMID 36637019/PMC9848247). CLICK (n=160, stage 4 CKD) found −10.5 mmHg 24-h systolic vs placebo (PMC10157782). **Apply no efficacy penalty above eGFR 30.** Adverse effects *do* amplify. Caveat: CLICK used chlorthalidone, ~3× more potent per mg — do not transfer the number to HCTZ. |
| "Gout — thiazide raises uric acid — reject-test case" | **CONFIRMED, and sharper than drafted** | +48 µmol/L at 25 mg; only **12.3 mg** needed for +36 µmol/L. So 12.5 mg is *not* a safe gout dose, which the draft implies. Losartan/HCTZ is the correct workaround. |
| "Asthma/COPD — beta-blocker contraindicated (bronchospasm)" | **PARTIALLY CORRECT** | Not binary. Metoprolol is β1-selective; selectivity is lost above **300 nmol/L (80.2 ng/mL)**, Tier 1. Contraindication is **concentration-dependent, and therefore genotype-dependent**. Modelling it as a flat ban discards the best demo in the product. |
| "Metoprolol 25–200 mg" | **CONFIRMED as practical range** | Licensed ceiling is higher: Toprol-XL to 400 mg/day, IR tartrate to 450 mg/day for hypertension. |
| "HCTZ 12.5–25 mg" | **CONFIRMED, and well chosen** | 26.4 mg gives −10 mmHg; above 25 mg adds toxicity without much BP. |
| Elderly "more sensitive to dizziness/falls" | **CONFIRMED, mechanism added** | Two channels: orthostatic hypotension (volume) and **hyponatraemia**, whose incidence is almost entirely age-driven — low single digits under 65, well into double digits over 75. |

## 9. The five values B2 is least confident in

1. **Metoprolol intermediate-metabolizer AUC ×1.8** — interpolated. Blake reports no
   IM arm; CPIC explicitly declines to quantify it. Show as uncertain in the UI.
2. **Metoprolol blood-pressure effect (−10/−7 mmHg)** — ESTIMATED, and the label
   itself warns *"antihypertensive activity does not appear to be related to plasma
   levels."* **Drive the metoprolol story from heart rate, which is well
   characterised.** Do not let the demo claim a precise BP number for it.
3. **HCTZ Cmax, Vd and blood:plasma ratio** — Tier 4. US labeling publishes no Cmax,
   no AUC and no Vd for HCTZ. Replace if a better source appears.
4. **fm(CYP2D6) = 0.70 for metoprolol** — B2's back-calculation from Blake's CL/F
   ratio; the label is qualitative. Most consequential estimate in that record.
5. **Toprol-XL Tmax ≈ 6.5 h and ka ≈ 0.20/h** — inferred to reproduce the Tier-1 Cmax
   ratio, not cited. Agent E should validate against `cmax_relative` (0.25–0.50),
   which *is* Tier 1.

Runners-up: HCTZ hyponatraemia/glucose/lipid magnitudes (direction Tier 1, magnitude
ESTIMATED); the Hyzaar net-urate magnitude (NOT SOURCED).

---

## Cross-agent notes

**Agent E (simulation).**
- HCTZ **must not** get a plasma-concentration→BP Emax link. Drive from dose
  (log-linear, constants in the record). Structural, not cosmetic. §4.3.
- Metoprolol **must** get a saturating Emax with **Hill 0.68, EC50 24 ng/mL**. A
  linear link overstates the CYP2D6 effect and a clinician judge will see it. §3.2a.
- Class-pair interaction matrix, not a global rule: ACE-inhibitor + thiazide =
  **additive (Tier 1, ×1.0)**; beta-blocker + thiazide = **less than additive**
  (opposing renin effects). §7.1.
- HCTZ BP response is two-phase (volume, then vascular over ~4 weeks). Without it the
  model overshoots on day 1.
- Metoprolol abrupt-withdrawal rebound is a boxed warning and is animatable — model
  as receptor upregulation over 1–2 weeks, unmasked on stopping. No competitor demo
  will show that.

**Agent C (rules).**
- Replace ESTIMATED HCTZ electrolyte/urate deltas with the Tier-2 table in §4.1.
- Make the asthma/metoprolol rule **concentration-gated at 80.2 ng/mL** and therefore
  genotype-aware, not binary. §3.2b.
- Heart-failure + metoprolol *tartrate* → **positive redirect** to succinate ER, not
  bare rejection. §5.
- Losartan/HCTZ in gout/hyperuricaemia should be a **positive compelling-indication**
  rule. §7.1.
- Lactose rule must be narrow (galactosaemia/congenital lactase deficiency/GGM), not
  "lactose intolerance". §6.2.
- New excipient-level rule class available: azo-dye sensitivity, and it is
  **product-and-strength-specific**, not molecule-level. §7.2.

**Agent F (report).** The metoprolol IR-vs-ER refusal can lift — §3.3 gives Tier-1
per-formulation PK. HCTZ's refusal should **stay**, and the record now gives a
*sourced* reason: no ER hydrochlorothiazide product exists anywhere, and with a 10 h
half-life and a flat dose-response top, one would buy nothing. That is a better
output than silence. Best-dose scoring should use the harm/benefit dose asymmetry in
§4.2 and the label-stated 20/12.5-over-20/25 conclusion in §7.1.

**Agent D (virtual human).** Needs on the twin: `CYP2D6_phenotype` (4 levels + freq),
`eGFR`, `serum_K`, `serum_urate`, `serum_Na`, weight (metoprolol CL and Vd both scale
with it, Tier 1), age and sex (hyponatraemia risk), asthma/COPD flag, heart-failure
flag, galactosaemia and azo-dye-sensitivity flags.

**Lead.**
- `potassium_content` is referenced as a `counter_ion` composition role in Cozaar and
  Hyzaar but has **no substance record** in either part file — it is neither active
  nor excipient. Add a minimal record or teach the loader to treat `counter_ion` rows
  as annotation. B2 flagged rather than inventing a record outside its scope.
- **Salt-basis warning:** metoprolol composition amounts are *base*; losartan amounts
  are *losartan potassium* as labelled. B1 must confirm the losartan substance record
  uses the same basis or doses are ~8% off.
- Add **Europe PMC REST** to `01-DATA-ACQUISITION.md`. §2.
- Do not state an EU titanium-dioxide transition date anywhere. §6.2.
