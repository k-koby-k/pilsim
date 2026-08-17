# External Deep-Research Reconciliation

Two external deep-research runs (a Google/Gemini run and a GPT run) were commissioned
independently, against the narrow pharmacology slice in
`EXTERNAL_DEEP_RESEARCH_SLICE.md`, with no access to our agents' findings. This file
reconciles all three bodies of work.

The point of the exercise was disagreement. Agreement between independent sources
raises confidence cheaply; disagreement is where the errors live. Both were found.

Reconciled 2026-08-17.

---

## 1. The one finding that should change the build

**Our engine is calibrated on 2003 and 2009 evidence. A 2025 *Lancet* meta-analysis
covering exactly this question exists, and the GPT run found it.**

PMID **40885583**, *Lancet*, 30 August 2025: "Blood pressure-lowering efficacy of
antihypertensive drugs **and their combinations**: a systematic review and
meta-analysis of randomised, double-blind trials" — **484 trials, 104,176
participants**. I verified the citation resolves.

Compare what Agent E calibrated the combination rule against:

| Source | Year | Trials | Participants |
|---|---|---|---|
| Law et al., BMJ | 2003 | 354 | — |
| Wald et al., Am J Med | 2009 | 42 | ~11,000 |
| **Zhang et al. (or successor), Lancet** | **2025** | **484** | **104,176** |

### Verified figures, retrieved directly from the paper's abstract

The paper is **not open access** (no PMC copy, no full text available), but its
structured abstract carries the headline quantities with confidence intervals. These
were retrieved from Europe PMC on 2026-08-17 and are quoted, not inferred. DOI
`10.1016/s0140-6736(25)00991-2`.

Study characteristics: 484 trials, 104,176 participants, mean age 54, mean baseline
blood pressure **154/100 mmHg**, mean follow-up 8.6 weeks. Placebo-controlled,
double-blind, placebo-corrected systolic reduction as the primary outcome.

| Quantity | Value | 95% CI |
|---|---|---|
| Monotherapy at standard dose | **−8.7 mmHg** | 8.2–9.2 |
| Each doubling of a monotherapy dose | **−1.5 mmHg** | 1.2–1.7 |
| **Dual combination at one standard dose** | **−14.9 mmHg** | 13.1–16.8 |
| Each doubling of both drugs in a dual combination | **−2.5 mmHg** | 1.4–3.7 |
| Efficacy loss per 10 mmHg lower baseline systolic (monotherapy) | **−1.3 mmHg** | 1.0–1.5 |

Also reported: of 57 standard-dose monotherapies, 45 (79%) were low intensity; of 189
drug-dose dual combinations, 110 (58%) were moderate and 21 (11%) high intensity.

**Three things follow, and they are directly usable.**

First, **the combination is sub-additive at standard dose, and now precisely so.** Two
standard-dose drugs give 14.9 mmHg where strict additivity predicts 17.4 — a ratio of
**0.856**. Our engine's bounded pooling already produces sub-additivity; this is the
number to calibrate it against. Note this does not contradict Wald's 1.01, which
measured the *incremental* effect of adding a second drug against its expected
incremental effect, a different quantity.

Second, **the add-versus-double comparison sharpens.** Adding a second class buys
14.9 − 8.7 = **6.2 mmHg**; doubling the existing drug buys **1.5 mmHg**. That is
**4.1×**, not the "approximately 5×" that both external runs quoted from Wald 2009.
Same conclusion, better-bounded number, ten times the participants.

Third, and this one is a **feature we do not have**: efficacy depends on baseline blood
pressure, losing 1.3 mmHg for every 10 mmHg lower the patient starts. Agent D's
calibrate-then-run design makes baseline blood pressure an explicit input, so this term
drops straight in. Without it the twin will overstate benefit in mildly hypertensive
patients — which is precisely the population where a clinician would question the
output.

**What the abstract does not give** is the per-class breakdown. The abstract notes
"considerable differences" across drug classes but the table lives in the full text or
appendix, which is paywalled. So the per-class figures quoted by the GPT run — ACE
inhibitor −1.6, ARB −1.1, CCB −2.6, thiazide −2.0, beta-blocker −0.5 — remain
**unverified**, sourced only to a Scribd copy.

### Where it actually contradicts us

The 2025 paper reports per-class incremental systolic effect from each dose doubling.
Set that against Agent E's fitted ED50 values (in multiples of standard dose, where a
lower ED50 means closer to saturation and therefore *less* to gain from doubling):

| Class | E's fitted ED50 | E's implied rank for gain-from-doubling | 2025 observed gain | 2025 rank |
|---|---|---|---|---|
| CCB | 0.98 | 1st (most to gain) | −2.6 mmHg | **1st** ✅ |
| ARB | 0.48 | 2nd | −1.1 mmHg | 4th ❌ |
| Beta-blocker | 0.41 | 3rd | −0.5 mmHg | **5th** ❌ |
| ACE inhibitor | 0.36 | 4th | −1.6 mmHg | 3rd ⚠️ |
| Thiazide | 0.31 | 5th (least to gain) | −2.0 mmHg | **2nd** ❌ |

**Amlodipine is right and it is the demo case, which is lucky.** But thiazide is
predicted to be the flattest class and is observed to be the second steepest — an
inversion, not a rounding error. Beta-blocker is predicted mid-pack and observed
flattest.

### Settled recommendation

The full text could not be obtained — it is paywalled, and the two Lancet folders
checked locally turned out to be the August **2026** issue, a year later than this
paper. Rather than leave the question open, split it:

**Adopt the four verified global anchors** from the abstract table above. They are
CI-bounded, drawn from ten times Wald's participant count, and they calibrate exactly
the quantities the product's headline output depends on — monotherapy magnitude,
dose-doubling gain, dual-combination magnitude, and the baseline-dependence term. Add
them to `06-VALIDATION.md` as blocker-grade tests. The engine should reproduce 8.7 and
14.9 mmHg at standard doses against a 154/100 baseline.

**Keep Law 2003's per-class ED50 shape** — thiazide 0.31, ACEi 0.36, beta-blocker 0.41,
ARB 0.48, CCB 0.98 — because the 2025 per-class table is unverified and Law 2003 is a
real, citable, peer-reviewed source that our engine already reproduces to ±0.2 mmHg.

**Record the known discrepancy** rather than papering over it: if the GPT-reported
per-class values are correct, our thiazide and beta-blocker constants are wrong in
rank order. That is an honest, disclosed limitation with a named resolution path
(obtain the Lancet appendix), which is a better position than a silent re-fit against
a Scribd document.

This is the right trade. The global anchors are what the demo actually shows; the
per-class ED50 ordering only affects the relative ranking of dose-escalation
recommendations *within* the five drugs, and amlodipine — the drug the demo escalates —
is the one class both sources agree on.

---

## 2. Where the external runs found things we missed

**Class-specific adverse-effect curves — genuinely new, and it refines our headline
argument.** From Law 2003, attributable symptom rates at half / standard / double dose:

| Class | ½ dose | Standard | Double |
|---|---|---|---|
| Thiazide | 2.0% | 9.9% | 17.8% |
| CCB | 1.6% | 8.3% | 14.9% |
| Beta-blocker | 5.5% | 7.5% | 9.4% |
| ACE inhibitor | 3.9% | 3.9% | **3.9%** |
| ARB | −1.8% | 0% | 1.9% |

This **sharpens** our "efficacy saturates while harm accelerates" story rather than
undermining it — but it makes it class-specific. Harm accelerates steeply for thiazide
and calcium channel blockers. It is essentially **flat for ACE inhibitors** and
negligible for ARBs. So the product's best-dose recommendation should be aggressive
about capping amlodipine and hydrochlorothiazide, and comparatively relaxed about
lisinopril and losartan. Our two independently-found anchors — amlodipine oedema and
hydrochlorothiazide urate — happen to be the two classes where the effect is real.

Note also that ACE-inhibitor cough being **dose-independent** is a concrete, citable
fact worth surfacing in the UI: it means the product should never suggest dose
reduction as a remedy for cough. That is a clinically correct behaviour that would be
easy to get wrong.

**Ancestry — a gap none of our six agents covered.** Black and African-ancestry
patients show approximately **4.6 mmHg less systolic** and 2.8 mmHg less diastolic
reduction on ACE inhibitor therapy than non-Black patients. In ALLHAT, Black
participants on lisinopril ran about **4 mmHg higher systolic** than on chlorthalidone,
with a stroke relative risk of about **1.40**.

This is a real, quantified response modifier that our patient model does not have. It
is also ethically delicate: the correct framing is that ancestry is a weak proxy for
renin status, and that a compelling indication such as albuminuric chronic kidney
disease or heart failure is not overridden by it. If it is added to
`patient_model.json`, add it with that framing, and treat it as a modifier of expected
response, never as a prescribing rule.

**Amlodipine volume of distribution — closes Agent B1's single weakest number.** B1
published 21 L/kg as ESTIMATED because it could not trace the value to a primary source
within its timebox (medicines.org.uk 404'd). Both external runs cite 21 L/kg to
DailyMed. That value can be upgraded from ESTIMATED to CITED.

**Metoprolol pharmacogenomics, richer than ours.** Our research had poor versus normal
metabolizer at roughly 4.9× area under the curve. The GPT run adds the ultrarapid
comparison: poor versus **ultrarapid is ~13×**, with apparent oral clearance differing
about 15-fold. That widens the personalization story usefully — though note CPIC still
issues no recommendation for ultrarapid metabolizers, so this informs the simulation
rather than the advice.

---

## 3. Where our research was right and the external runs were wrong

These matter because they are exactly the errors our agents were built to catch, and
the external runs — working from the same public literature — reproduced them.

**The Google run repeats the hydrochlorothiazide renal error.** It states thiazides
"lose efficacy at eGFR <30 mL/min (switch to loop diuretic required)". Three of our
agents independently refuted this: the CLICK trial gave **−10.5 mmHg in stage 4 chronic
kidney disease**, and a 2023 meta-analysis covers GFR 13–27. Our rule applies no
penalty above eGFR 30. This is the textbook teaching, it is outdated, and it is exactly
what your original draft also said.

**The Google run over-generalizes dose-dependent harm.** It states "doubling the dose
roughly doubles the incidence rate of side effects" as a general rule. The class table
in §2 — which the GPT run supplied — shows this is false for ACE inhibitors (flat
3.9% across all doses) and near-false for ARBs. Encoding the general rule would produce
a product that wrongly penalizes lisinopril and losartan at higher doses.

**The Google run overstates the losartan CYP2C9 effect.** It claims poor metabolizers
show "E-3174 AUC reduced by approximately 50-80%". Our Agents C, B1 and D all
independently concluded that no universal fold multiplier exists — the meta-analysis
reports only absolute mean differences, Bae 2012 found no clinical difference at all,
and the effect was significant in Asian but not Caucasian subgroups. **The GPT run
independently reached our conclusion**, explicitly warning that a fixed "0.5× E-3174"
rule would be a stronger claim than the evidence supports. Two of three sources agree
with our agents; the Google figure should not be used.

**The Google run walks into the volume-of-distribution trap.** It reports losartan and
E-3174 volumes as 34 L and 12 L — the label values that Agent B1 identified as
steady-state figures mutually inconsistent with the same label's clearance and
half-life, which make losartan disappear threefold too fast in a one-compartment model.
The GPT run reports the same numbers. Both reproduced the label faithfully; neither
noticed the internal contradiction. **Keep B1's derived 109 L and 32 L.**

This one is worth remembering: it is the clearest case in the whole exercise of the
difference between retrieving a number and checking whether it is self-consistent.

---

## 4. Where all three agree — treat as settled

- **Cross-class combination is approximately additive**, observed/expected ratio **1.01
  (95% CI 0.90–1.12)**. Our engine reproduces 0.969.
- **Adding a second class beats doubling one drug by roughly 5×.**
- **Two half-dose drugs beat one standard-dose drug**: −13.3/−7.3 against −6.7/−3.7
  mmHg. Our engine produces 13.80 against 9.94 on its own scale.
- **Adverse effects are sub-additive in combination**: 7.5% observed for two drugs
  against 10.4% expected by simple addition (P=0.03). Neither our research nor the
  product currently models this, and it strengthens the low-dose-combination
  recommendation. Worth adding.
- **Dual RAAS blockade is actively discouraged** — no additional benefit, increased
  hyperkalemia, hypotension and renal dysfunction.
- **Losartan converts to E-3174, which is 10–40× more potent and must be modeled
  separately.** All three sources independently.
- **Metoprolol poor metabolizers: ~5× AUC, half-life extending to 7–9 hours.**
- **Asthma is not an absolute contraindication to cardioselective beta-blockade.** The
  GPT run adds GINA 2026, which states the decision is case-by-case and that asthma is
  not an absolute contraindication where there is a strong cardiac indication. That is
  now four independent sources against your draft's claim.
- **Amlodipine oedema: 3.0% at 5 mg, 10.8% at 10 mg.** Identical across all three.

**A satisfying cross-validation on hydrochlorothiazide urate.** Our Agent B2 found
**+36 µmol/L at 12.3 mg** (Peterzan 2012). The GPT run found **+0.76 mg/dL at 25 mg**
(Mayo Clinic Proceedings). Converting: 36 µmol/L is **0.61 mg/dL**. Two different
studies, two different doses, two different units, consistent dose-response. This
number can be trusted.

The GPT run adds that genotype-dependent variation reaches **+1.8 mg/dL** in some
risk-genotype subjects — a threefold spread that is directly useful for the virtual
population sampling.

---

## 5. Unresolved

**The doubling-versus-adding ratio.** Agent E fitted 0.175; Wald 2009 reports 0.22
(CI 0.19–0.25); the GPT run independently confirms Wald's 0.22. E chose fidelity to
Law's per-class table and documented the deviation rather than tuning a constant.
Independent confirmation of Wald strengthens the case that E's value is genuinely low —
which the §1 re-fit against the 2025 Lancet data would likely resolve. Until then, keep
it disclosed and advisory.

**Diastolic dose-response per drug.** The GPT run explicitly declined to interpolate
diastolic values from the systolic table, marking them NOT FOUND. That is the correct
behaviour and it leaves a real gap: our validation anchors are stronger on systolic
than diastolic pressure.

**Obesity.** The GPT run found no validated per-drug obesity multiplier and declined to
invent one. Our Agent C found ACCOMPLISH evidence that the hydrochlorothiazide arm
performed *best* in obese patients — which is stronger than what the external run
surfaced, and directly inverts your original draft. Ours stands.

---

## 6. What to do

In priority order:

1. **Obtain the per-class dose-doubling table from the 2025 Lancet paper (PMID
   40885583) directly.** Not from a Scribd copy. If obtained, re-fit the five ED50
   constants and re-run validation. If not, keep the current constants and document the
   discrepancy.
2. **Add the class-specific adverse-effect curves** from §2 to the scoring function.
   They make the best-dose recommendation class-aware, which is more correct and more
   interesting than a single global harm curve.
3. **Upgrade amlodipine's volume of distribution** from ESTIMATED to CITED.
4. **Add sub-additive adverse effects in combination** (7.5% against 10.4% expected).
   It strengthens the product's central recommendation and no one had it.
5. **Consider the ancestry modifier**, with the framing in §2 — as a response modifier
   that never overrides a compelling indication.
6. **Change nothing** about the losartan volumes of distribution, the
   hydrochlorothiazide renal rule, the CYP2C9 confidence gating, or the asthma rule.
   The external runs are wrong on the first two, and confirm us on the others.

Nothing here invalidates the architecture, the data files, or the demo plan. The
highest-value item is a five-constant re-fit, and even that is contingent on getting a
verifiable copy of one table.
