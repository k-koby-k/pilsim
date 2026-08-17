# External Deep Research Slice — Pharmacology Cross-Check

Paste this into ChatGPT Deep Research, Gemini Deep Research, or similar. Its only
purpose is to produce an *independent* set of numbers that will be reconciled against
a separately-produced set. Disagreements between the two are the signal we want, so do
not try to match any expected answer — report what the literature actually says.

---

You are doing a focused pharmacology literature review. The output is a set of
numbers with citations, not an essay. Prefer peer-reviewed pharmacokinetic studies,
meta-analyses, and current regulatory product labeling over secondary web summaries;
label each citation with which tier it is. Where sources disagree, report the
disagreement and the range rather than picking one.

## The five drugs in scope

Lisinopril, losartan (including its active metabolite), amlodipine,
hydrochlorothiazide, metoprolol.

## Deliverable 1 — Pharmacokinetic parameters

For each of the five, in a table, with a citation and retrieval date per value:

- Oral bioavailability, and what causes the losses
- Time to peak plasma concentration
- Elimination half-life (note where a drug has a markedly different effective vs.
  terminal half-life, and which one matters for once-daily dosing)
- Apparent volume of distribution, and how it is normally scaled to body size
- Clearance, and the split between renal and hepatic routes
- Plasma protein binding
- Which metabolizing enzymes are involved and whether any produce active metabolites
- Reported inter-individual variability for each of the above — coefficient of
  variation or the observed range, not just a mean. This is the most important
  column and the one most often omitted; chase it specifically.

Flag every value you could not find rather than interpolating it.

## Deliverable 2 — Metabolizer phenotype effects

Quantitatively, how does CYP2D6 metabolizer phenotype (poor / intermediate /
extensive / ultrarapid) change metoprolol exposure and effect? Give fold-differences
in area under the curve and in half-life with citations, and say what the clinical
consequence is in terms of dose adjustment.

Do the same for CYP2C9 and losartan's conversion to its active metabolite, if the
literature supports quantification.

## Deliverable 3 — Dose-response, within drug

For each drug: the blood-pressure lowering achieved at each commonly used dose in the
approved range, systolic and diastolic, as placebo-subtracted change. Then answer
explicitly: **what is the shape of the dose-response curve?** Specifically, how much
additional blood-pressure reduction does doubling the dose actually buy, and how does
the adverse-effect rate scale with dose over the same interval? Quantify both. Cite
the meta-analyses that established this.

## Deliverable 4 — Combination effect (highest priority)

When two antihypertensive drugs from *different* classes are combined, how do their
blood-pressure effects combine — additively, sub-additively, or otherwise? Give the
quantitative rule with citations, including the specific numbers from whichever
meta-analyses established it.

Then contrast: combining two classes at low dose versus escalating a single class to
high dose — which achieves more blood-pressure reduction, by how much, and with what
difference in adverse-effect rate?

Cover specifically these pairings among our five: ACE inhibitor + thiazide,
ARB + thiazide, ACE inhibitor or ARB + calcium channel blocker, beta-blocker +
thiazide, calcium channel blocker + thiazide. Note any pairing where the evidence
shows a *worse* than expected result, and any pairing that is actively discouraged.

## Deliverable 5 — Comorbidity modifiers, quantified

For each of these patient conditions, how does it change the response to each of the
five drugs — in numbers where possible, not just "preferred" or "avoid":

Type 2 diabetes; chronic kidney disease at reduced filtration rates; heart failure
with reduced ejection fraction; obesity; age over 65; asthma or COPD; gout or
hyperuricemia; pregnancy; coronary artery disease or prior stroke; and Black or
African-ancestry patients (where the guideline recommendation differs and there is a
quantified response difference).

For each condition also state: which of the five are contraindicated, which are
first-line, and what the current major clinical guidelines say — naming the guideline
and its version year, and noting anything that changed in a recent revision.

## Deliverable 6 — Validation anchors

A table we can turn into automated tests: for each drug at its standard starting dose
in an average adult with uncomplicated hypertension, the expected systolic and
diastolic reduction, expected time to peak concentration, expected peak and trough
plasma concentrations, and expected time to full antihypertensive effect (which for
some of these is considerably longer than the pharmacokinetic steady state — say
which and why). Each with a citation and a plausible tolerance band.

## Deliverable 7 — Adverse effects, with incidence

For each drug, the adverse effects with reported incidence rates, focusing on those
that are (a) common enough to matter in a simulation and (b) physiologically visible —
things like edema, cough, bradycardia, electrolyte disturbance, urate change, glucose
and lipid change. Numbers, not adjectives. Note dose-dependence where it exists.

## Format

Tables. Every number carries a citation with a URL and a retrieval date. Where you
could not find a value, write NOT FOUND — do not estimate silently. Where you are
estimating or interpolating, mark it clearly as such. Where two good sources
disagree, show both.

At the end, list the five values you are least confident in and why.
