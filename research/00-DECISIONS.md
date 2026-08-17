# PilSim — Decisions

Lead synthesis over six research agents. Written 2026-08-17, after all agents reported.
This file is the entry point: read it first, then go to the file you need.

**Standing constraint everything below respects:** roughly 24 hours to a demoable
product, one developer, Cloudflare-only runtime.

---

## 1. The pitch

**One engine, two problems.** Human experimentation is legally and ethically
restricted, so simulate it. Run a candidate regimen against a *population* of virtual
patients and you are screening formulations — problem 14. Run it against *one*
patient's twin and you are personalizing a prescription — problem 12. Same
simulation core, same data, one switch.

Open with this, sourced live from the WHO Global Health Observatory and checkable on
stage: Uzbekistan adult hypertension prevalence **45.7%**, **43.5% treated**, but only
**16.5% controlled** — and **11.3% among men** — against a global control rate of
20.8%. Premature non-communicable-disease mortality 24.6% versus 17.8% globally.

The bottleneck is not diagnosis and not drug supply. It is that six in ten treated
patients never reach target. That reframes the problem as **regimen selection and
titration**, which is exactly what this product does.

---

## 2. The drug set, and why

Locked before the agents ran, and nothing they found argues for changing it.

| Drug | Class | Earns its place by |
|---|---|---|
| Lisinopril | ACE inhibitor | Renally cleared, no CYP metabolism — the simple PK baseline. Pregnancy contraindication. Its effect onset precedes its plasma peak, which forces the engine to be built correctly. |
| Losartan | ARB | Converts to EXP3174, which carries most of the effect — forces a parent-metabolite model. Lowers urate, directly opposing hydrochlorothiazide. Pregnancy contraindication. |
| Amlodipine | Dihydropyridine CCB | The only drug in the set where dose escalation genuinely pays (ED50 0.98× standard). Long half-life gives a completely different concentration-time shape. Oedema is its dose-resolved, animatable harm. |
| Hydrochlorothiazide | Thiazide | Distal convoluted tubule target — the one place in the whole set with single-cell evidence. Raises urate (gout gate). Already at 77% of maximal effect at 0.31× standard dose. |
| Metoprolol | β1-selective blocker | The strongest personalization story: CYP2D6, guideline-backed. Selectivity is concentration-gated, making the asthma interaction dose-dependent rather than binary. |

Four mechanistically distinct routes to the same endpoint, three different CYP enzymes,
and — crucially for the animation — each drug reaches the blood-pressure endpoint by
visibly different internal physiology.

---

## 3. Architecture

**Tier-1 mechanistic-lite**, chosen by Agent E over three rejected alternatives:
analytic Bateman pharmacokinetics → effect compartment → pathway occupancy → six-state
cardiovascular homeostasis ODE with baroreflex, RAAS and pressure-natriuresis. RK4,
one-minute steps, 72-hour acute horizon. The five-year projection is computed in
**closed form, not integrated** — 2.6 million steps would only reproduce the steady
state already reached in week three.

Pure TypeScript, about 400 lines. **The Sandbox SDK is not needed.** The run lives in a
SQLite-backed `SimulationRun` Durable Object with alarm-based chunked continuation and
WebSocket Hibernation streaming.

Agent E built and ran the prototype, so the calibration numbers are measured rather
than asserted.

**On writing our own solver:** every mature pharmacokinetic tool is GPL *and* written
in R, C# or Julia. None can run on Cloudflare. npm has six packages for
"pharmacokinetics" and none usable. Writing our own is the correct call, not a
compromise. If a library integrator is wanted: `odex` (BSD-2) or
`@martinjrobins/diffsol-js` (MIT).

---

## 4. The one genuinely novel claim

Everything else in this product is competent assembly. This is the part that is new:

**The combination rule.** Three steps — a per-drug Emax curve fitted to Law 2003, then
bounded pooling within a shared pathway, then the same across pathways. It reproduces
Law 2003 monotherapy to **±0.2 mmHg on every cell**, Wald 2009 cross-class additivity
at 0.969 against a published 1.01, and ONTARGET's dual-RAAS result at +2.57/1.80 mmHg
against an observed 2.4/1.4 — where a naive additive rule predicts +10.31, a fourfold
overstatement. **No fudge factor between the three.**

Two clinically correct answers fall *out of* the model rather than being written into
it: dual RAAS blockade ranks last of all ten pairs, and half-doses of two drugs beat a
double dose of one, 13.80 against 9.94 mmHg.

That distinction — emergent versus hardcoded — is the thing to demonstrate to a judge.
Show the ranking, then show that nothing in the code says "dual RAAS is bad."

---

## 5. Why the product recommends a *best* dose rather than a maximum

Two independent agents found the same asymmetry from two different drugs, and it is
the strongest evidence-backed argument the product has.

- **Amlodipine:** going 5 → 10 mg buys 2.9 mmHg and 7.8 additional points of oedema
  incidence (1.8 / 3.0 / 10.8% at 2.5 / 5 / 10 mg). The label gives **no** dose-resolved
  blood-pressure figures at all. Sex-resolved too: 14.6% in women, 5.6% in men.
- **Hydrochlorothiazide:** systolic −10 mmHg arrives at 26.4 mg, but urate is already
  +36 µmol/L at **12.3 mg**. Harm arrives at half the dose of full benefit.

Efficacy rises sub-linearly; visible harm rises supra-linearly. **If the engine is
linear in dose the optimizer always selects the maximum and the headline output is
trivially wrong** — so saturation is a correctness requirement, not a refinement, and
`06-VALIDATION.md` has a test that fails a linear implementation.

---

## 6. Verdict on the team's draft scope

Consolidated from Agents C, B1, B2, D and E. **Not one of the nine comorbidity claims
survived unamended. Every claim citing a guideline year or a numeric threshold cited it
wrong.** Only pregnancy stands as written.

| # | Draft claim | Verdict |
|---|---|---|
| 1 | T2DM — ACE/ARB preferred; 130/80 "per 2025 AHA/ACC" | **Wrong twice.** 130/80 was set in **2017**, not 2025, and it is general to all adults, not diabetes-specific. ACE/ARB is preferred only with albuminuria ≥30 mg/g, eGFR <60, or coronary disease — the ADA states that without albuminuria they show no superiority over thiazides or CCBs. |
| 2 | CKD — ACE/ARB first-line; thiazide less effective at low kidney function | **Direction right, magnitude outdated.** CLICK gave −10.5 mmHg in stage-4 CKD; a 2023 meta-analysis covers GFR 13–27. Apply no penalty above eGFR 30. And this claim must not license ACEi+ARB together — VA NEPHRON-D used exactly that pair in exactly that population and stopped early for safety. |
| 3 | Heart failure — ACE/ARB/ARNI + β-blocker + MRA | **Incomplete and product-critical.** Omits SGLT2 inhibitors. More importantly: **metoprolol tartrate has no heart failure indication — only succinate ER does.** If the Pills page does not model the salt, the product will make a clinically false recommendation. |
| 4 | Obesity — thiazides weaker, higher CCB response | **Inverted.** ACCOMPLISH shows the hydrochlorothiazide arm performed *best* in obese patients; amlodipine's advantage was confined to non-obese. Obesity is a high-output, low-resistance state (SVR ≈ −20%). |
| 5 | Elderly 65+ — more sensitive to falls | **Contradicted.** SPRINT showed no excess injurious falls, and intensive treatment *reduces* orthostatic hypotension (OR 0.93). |
| 6 | Asthma/COPD — β-blocker contraindicated | **False as written, and the most consequential error.** Asthma appears nowhere in metoprolol's CONTRAINDICATIONS on any current label — it is Warning §5.3, which explicitly permits use. *Propranolol* is contraindicated; the draft collapses that distinction. See §7 for what replaces it. |
| 7 | Gout — thiazide raises urate | **Confirmed and now quantified.** +36 µmol/L at 12.3 mg. |
| 8 | Pregnancy — ACE/ARB contraindicated | **Confirmed.** The only claim standing as written. |
| 9 | CAD / prior stroke — β-blocker or ACE preferred | **Wrong for a large subgroup.** Beta-blockers are not recommended in chronic coronary disease with ejection fraction above 50% (2023 AHA/ACC). Coronary disease alone must not award metoprolol a compelling-indication bonus. |

Drug ranges: losartan 25–100 mg and amlodipine 2.5–10 mg confirmed exactly.
**Lisinopril 5–40 mg is partially wrong** — the label's starting dose is 10 mg (5 mg
only for patients already on a diuretic) and the usual range is 20–40 mg/day.

**This audit is itself a pitch asset.** "We built the safety engine from primary
sources and it rejected two-thirds of our own initial assumptions" is a stronger
statement about method than any accuracy claim.

---

## 7. Cross-agent conflicts, resolved

**The asthma rule — three agents, three numbers, one correct synthesis.** Agent C found
−6.9% FEV₁ in asthma with a confidence interval not crossing zero; Agent D found −2.05%
in COPD with an interval that does cross zero; Agent B2 found the mechanism that
explains both — metoprolol's β1 selectivity is lost above 300 nmol/L, i.e. **80.2
ng/mL**. C correctly kept asthma and COPD as separate rules rather than averaging
genuinely different populations.

The synthesis: this is **not a binary contraindication and not a blanket permission.**
It is a concentration gate. And because a CYP2D6 poor metabolizer crosses 80.2 ng/mL at
a standard dose while a normal metabolizer does not, **genotype converts a usable drug
into an unsafe one.** That is the single best demonstration in the entire product —
it makes the personalization story causal and visible rather than a number in a table.

**The 130/80 guideline year.** C and D appeared to disagree. They do not: the 2017
ACC/AHA guideline set the 130/80 threshold, and the 2025 guideline reaffirms it while
moving risk estimation to PREVENT. The draft's error is attributing the threshold to
2025 *and* treating it as diabetes-specific. Both wrong; the underlying number is right.

**The doubling-versus-adding ratio.** Agent E's fitted value is 0.175; Wald 2009
reports 0.22 with a 0.19–0.25 interval. The two source papers genuinely disagree. E
chose fidelity to Law's per-class table and documented the miss rather than tuning a
constant to split the difference. Endorsed — keep it, keep the disclosure, and treat the
test as advisory rather than blocking.

**Losartan's urate magnitude** was NOT_FOUND across three agents, then Agent E found it:
**−0.29 mg/dL**, from a meta-analysis published 15 July 2026 (PMID 42458015, *Hypertension
Research*). I verified the citation resolves. It was missed earlier because it is one
month old — worth remembering when a model's training data disagrees with a search.

---

## 8. Deliberately not modeled

Naming these protects the demo. Each is a place where a judge could otherwise assume we
tried and failed.

- **Clinical events.** The engine produces blood pressure and laboratory values, not
  strokes, infarctions or deaths. The five-year output must be worded **"projection of
  blood pressure control and organ-relevant markers"**. A projection that appears to
  predict events is the most serious overclaim available to this team.
- **Cell-level detail for nine of ten targets.** There is single-cell evidence for
  exactly one target-to-cell-population claim: NCC/`SLC12A3` in distal convoluted
  tubule cells. Everything else stops at tissue level. The Human Protein Atlas actively
  contradicts the obvious guesses — `ADRB1`'s top single-cell hit is cytotrophoblasts,
  not cardiomyocytes; `ACE` lists intestine and testis, not lung. The UI must not name
  cell populations for those. Being explicit about this beats ten confident labels, and
  it cannot be falsified on stage.
- **Any Central Asian population parameter.** Three agents independently found no
  CYP2D6 or CYP2C9 allele frequency and no response data for Uzbekistan. Plausible
  proxies differ fivefold (1.5% versus 7.4% ultrarapid). **Do not put such a number in
  the deck.** It sounds authoritative and a Ministry of Health judge is exactly the
  person who would know it is wrong.
- **Formulation ranking for three of five drugs.** Only metoprolol has a label-level
  release-profile comparison; hydrochlorothiazide has no extended-release product
  anywhere and with a 10-hour half-life would gain nothing from one. The product
  **refuses** to rank formulations where data is absent, rather than fabricating. The
  refusal lifts automatically if sourced data is added.
- **A quantified exposure ratio for amlodipine with strong CYP3A inhibitors.** No
  regulatory label quantifies it. The only strong evidence is epidemiologic — an acute
  kidney injury odds ratio of 1.61. Modeled as an outcome-risk modifier, never as an
  exposure multiplier.
- **Losartan pharmacogenomics as a headline.** No CPIC or DPWG guideline exists
  (verified absent by API, not merely unfound) and the trial evidence contradicts itself:
  Yasar and Sekino find an effect, Bae finds none, and the 2021 meta-analysis finds
  significance in Asian but not Caucasian subgroups. Marked low confidence. **The
  CYP2D6/metoprolol story is guideline-backed and can carry the pitch; this one cannot.**

---

## 9. Risks

**~~Biggest engineering risk~~ — RESOLVED, and it cost nothing.** The Workers **Free**
plan (10 ms CPU) cannot run this engine; a single acute run costs 30–120 ms. This was
recorded as requiring a paid plan. It does not — the ceiling is a *Workers* limit and
does not exist on the user's own machine. **The engine now runs in the browser in a Web
Worker, hosted on Cloudflare Pages free tier.** See
`09-EXECUTION-TARGET-AMENDMENT.md`. This also deletes the two most complex pieces of the
original execution plan — alarm-based chunked continuation and WebSocket Hibernation
streaming — which is a real reduction in build risk on a one-day timeline, independent
of cost. The Durable Object design is retained as the paid path for post-hackathon
persistence and sharing.

**Biggest scientific risk.** Feeding an in-vitro binding constant into a clinical
effect model. ChEMBL reports lisinopril's ACE IC50 at 1.2–4.7 nM; used as an EC50 for
blood-pressure effect it makes the simulation wildly over-potent at therapeutic doses.
Agent A rated this the single most likely error a clinician judge would catch. The
spec carries an explicit warning and the effect parameters are derived from clinical
dose-response data instead.

**Second-order risks worth knowing:** 44 of Agent C's rule effects are marked
ESTIMATED, which is the honest state — labels state interaction direction without
magnitude. And every PROXY-tier `EffectFrame` field is uncalibrated, especially
intraglomerular pressure, on which the renal-protection animation rests. Agent E added
a provenance tier so the UI physically cannot render a proxy index with absolute units.

---

## 10. Structural findings the build must respect

Each of these is a bug that would look entirely plausible on screen.

1. **Losartan is two species.** EXP3174 carries 60–85% of the effect with a 7.4-hour
   half-life against the parent's 2.1. A single-species model gets once-daily dosing
   wrong. Also: plot EXP3174, not the parent — peak-to-trough for the parent is ~2000
   against amlodipine's 1.30, so a shared axis is unusable.
2. **An effect compartment is required.** Lisinopril's effect onset (~1 h) precedes its
   plasma peak (~7 h). A direct-effect model cannot reproduce that ordering at all.
3. **The printed losartan volumes of distribution are unusable.** The label's 34 L and
   12 L are steady-state values, mutually inconsistent with the same label's clearance
   and half-life; using them makes losartan vanish threefold too fast. Use the derived
   109 L and 32 L, and say why in the spec so a reviewer comparing to the label does not
   think it is an error.
4. **Amlodipine needs 7–8 days to steady state** (2.9× accumulation). A 24-hour run
   understates one drug and not the other four, which would silently bias the
   combination ranking. Agent E defaulted the ODE to steady-state initial conditions and
   made day-1-versus-day-8 an explicit labelled toggle — a demo asset rather than a bug.
5. **Hydrochlorothiazide has no plasma-concentration/effect relationship at all.** Its
   action is tubular. Drive it from dose, not from an Emax link on plasma concentration.
6. **Class pairs are not symmetric.** ACE inhibitor plus thiazide is label-stated
   additive; beta-blocker plus thiazide is *less* than additive because the renin effects
   oppose. This needs a class-pair matrix, not a single global rule.
7. **ACEi + ARB is "avoid", not "contraindicated."** No label says do-not-coadminister
   for that pair — that phrasing is reserved for aliskiren in diabetes. And no label
   gives a numeric eGFR threshold for it; the <60 figure is aliskiren-specific. Encoding
   it as an absolute contraindication would be wrong.

---

## 11. Data acquisition — settled

**No live third-party API sits in the demo path.** Total offline footprint is about
3 MB of genuine bulk files plus roughly 5 MB of snapshotted per-drug responses, with a
runnable `scripts/fetch-data.sh` in `01-DATA-ACQUISITION.md` §7.

Verified dead, by actual request rather than assumption: the NLM RxNav drug-interaction
API (retired ~January 2024, still documented and still ranking in search — a trap), the
PharmGKB API host (no DNS record; PharmGKB has moved to clinpgx.org), DrugCentral's
documented API path, DDInter, and several `accessdata.fda.gov` label URLs. **DailyMed
setids are the durable identifier** and every label citation in the data files carries
its setid inside the source string so it survives a URL move.

Best find: the US EPA `httk` project publishes human organ volumes, blood flows,
cardiac output, GFR, plasma volume, hematocrit and albumin as 58 KB of plain TSV, with
**each row carrying its own literature citation in-band** — which satisfies the
provenance requirement for free and avoids the paywalled ICRP reference.

Two workarounds worth institutionalizing, because four of six agents exhausted their
web-search budget and all four reported the workaround produced *better* primary
sourcing: the **Europe PMC REST API** (keyless, free, not subject to the search budget —
it found both of the highest-value meta-analyses in this project) and **PubMed
E-utilities**. Add both to `01-DATA-ACQUISITION.md`.

---

## 12. Open items for the build

1. ~~Confirm Workers Paid.~~ **Resolved at zero cost** — engine moved to a browser Web
   Worker on Cloudflare Pages free tier. See `09-EXECUTION-TARGET-AMENDMENT.md`. Nothing
   is blocking the build.
2. ~~Merge the substance files.~~ **Done** — `data/substances.json`, 43 records, no
   duplicate ids. The two part files are retained for provenance; build against the
   merged file.
2b. **Re-fit the five ED50 constants** against the 2025 *Lancet* meta-analysis if a
   verifiable copy of its per-class table can be obtained. See
   `08-EXTERNAL-RECONCILIATION.md` §1 — this is the single highest-value change
   surfaced by the external cross-check, and it is a five-constant edit, not a rebuild.
3. **Decide the potassium counter-ion record.** `potassium_content` is referenced as a
   `counter_ion` in the losartan potassium products but has no substance record — it is
   neither active ingredient nor excipient. Recommendation: give it a minimal record.
   It is not cosmetic, because potassium load interacts with the hyperkalemia risk that
   the RAAS rules already model.
4. **Lift the metoprolol formulation refusal.** Agent B2 sourced the release-profile
   data, so that ranking can now be computed. Hydrochlorothiazide's refusal stays, and
   now has a sourced reason.
5. **Expose the scoring weights as UI sliders.** All of `05-OUTPUT-REPORT-SPEC.md`'s
   weights and its eleven adverse-event severity values are ESTIMATED; the ordering is
   defensible but the exact values are not. A judge who can move a slider and watch the
   ranking change will trust the model more than one who is asked to accept a constant.

---

## 13. File index

| File | Owner | What it is |
|---|---|---|
| `research/00-DECISIONS.md` | lead | this file |
| `research/08-EXTERNAL-RECONCILIATION.md` | lead | two independent external deep-research runs reconciled against our agents; one action item that changes engine calibration |
| `data/substances.json` | lead | **merged** part1 + part2, 43 records, no duplicate ids — build against this |
| `research/01-DATA-ACQUISITION.md` | A | ~45 sources probed with real curl; verified-working / dead / moved, with runnable commands and real response samples |
| `data/substances_part1.json` | B1 | lisinopril, losartan, EXP3174, amlodipine — 429 provenance-wrapped values, 0 defects |
| `data/substances_part2.json` | B2 | hydrochlorothiazide, metoprolol, 37 excipients — 391 values, 0 defects |
| `data/products.json` | B2 | 8 products including real fixed-dose combinations |
| `data/rules.json` | C | 48 rules: 30 negative, 13 modifier, 5 positive; 8-level severity ladder, 13 effect ops, 6 demo gates indexed |
| `data/patient_model.json` | D | 51 state variables, 44-step derivation pipeline, 10 comorbidity presets, 2 pharmacogenomic presets |
| `research/02-VIRTUAL-HUMAN.md` | D | the twin explained for a clinician judge, with the equation-version audit |
| `research/03-SIMULATION-SPEC.md` | E | the engine, 1877 lines, prototype-validated |
| `research/06-VALIDATION.md` | E | 128 graded tests with sources and tolerances, plus 18 named failure modes |
| `research/04-ORGAN-EFFECT-MAP.md` | F | organ → visual-variable bindings; the `EffectFrame` interface |
| `research/05-OUTPUT-REPORT-SPEC.md` | F | scoring function and the report the product produces |
| `research/07-PRIOR-ART.md` | F | landscape and honest differentiation |
| `research/physchem-identifiers.md` | salvaged | identifiers and physicochemistry for all actives, salts and ~30 excipients |
| `research/salvaged-pharmacology.md` | salvaged | amlodipine CYP3A4, metoprolol CYP2D6, dual RAAS, losartan CYP2C9 |
| `research/B1-notes.md`, `B2-notes.md`, `C-notes.md` | B1/B2/C | schema specs, audits, cross-agent notes |

Sections 2 of `07-PRIOR-ART.md` (commercial vendors) is explicitly flagged by its author
as unverified and not slide-safe. Do not quote it.
