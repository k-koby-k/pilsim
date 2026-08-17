# Salvaged Pharmacology Findings

Recovered from sub-agents that completed their research before their parent agent
stalled. All content below is verified, cited, and ready to merge into
`data/substances_*.json`, `data/rules.json`, and the simulation spec.
Retrieved 2026-08-17.

Four sections: amlodipine CYP3A4 and dose caps · metoprolol CYP2D6 · dual RAAS
blockade · losartan CYP2C9.

---

# 1. Amlodipine — CYP3A4 interactions and dose caps

Source: Norvasc US prescribing information, rev. Jan 2019.
https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=abd6a2ca-40c2-485c-bc53-db1c652505ed
https://www.accessdata.fda.gov/drugsatfda_docs/label/2013/019787s054lbl.pdf

## CYP3A inhibitors — amlodipine as victim

Label, verbatim: "Co-administration with CYP3A inhibitors (moderate and strong) results
in increased systemic exposure to amlodipine and may require dose reduction."

| Interacting drug | Effect on amlodipine exposure | Note |
|---|---|---|
| Diltiazem 180 mg/day + amlodipine 5 mg, elderly hypertensives | **+60% AUC** | FDA figure |
| Erythromycin, healthy volunteers | "did not significantly change" | No number given (FDA) |
| Clarithromycin, itraconazole (strong inhibitors) | "may increase … to a greater extent" | **NOT_FOUND** — qualitative only |
| CYP3A inducers | **NOT_FOUND** | Label explicitly states "No information is available on the quantitative effects of CYP3A inducers on amlodipine" |

**Jurisdictional discrepancy — flagged.** The widely-cited "57%" and "22%" figures are
NOT FDA numbers. They come from the Health Canada Product Monograph
(https://pdf.hres.ca/dpd_pm/00073653.PDF p.14): diltiazem **+57%**, erythromycin
**+22%**. Do not blend the two jurisdictions' numbers — pick one source and label it.

**Elderly intrinsic exposure** (§8.5/§12.3, verbatim): "Elderly patients have decreased
clearance of amlodipine with a resulting increase of AUC of approximately **40–60%**,
and a lower initial dose may be required." Same increase seen in hepatic insufficiency
and in moderate-to-severe heart failure.

## Amlodipine as perpetrator — it is bidirectional

Amlodipine is itself a weak CYP3A inhibitor. This is easy to miss.

| Victim drug | Effect | Source |
|---|---|---|
| Simvastatin | **AUC ×1.77, Cmax ×1.47**; simvastatin acid AUC ×1.58, Cmax ×1.56 | Norvasc §7.7 and Zocor PK table — the two labels agree |
| Cyclosporine | "on an average of **40% increase** in trough cyclosporine levels", renal transplant patients, n=11 | Norvasc label |
| Tacrolimus, mTOR inhibitors (sirolimus/temsirolimus/everolimus) | Interaction noted, no numbers | Norvasc label |

**Hard dose cap, rules-file ready.** Zocor §2.5, verbatim: "Patients taking Amiodarone,
Amlodipine, or Ranolazine — **Do not exceed ZOCOR 20 mg once daily.**" Norvasc §7.7:
"Limit the dose of simvastatin in patients on amlodipine to 20 mg daily."
Contrast in the same Zocor table: diltiazem ×2.69, verapamil SR ×2.3, amiodarone ×1.75.
https://www.organon.com/product/usa/pi_circulars/z/zocor/zocor_pi.pdf

**Explicit non-interactions — useful as negative rules** (the product should be able to
say "this pairing is fine", not only warn): atorvastatin, grapefruit juice (240 mL,
20 healthy volunteers, "no significant effect on the pharmacokinetics of amlodipine"),
cimetidine, digoxin, warfarin, ethanol, Mg/Al antacid — all "no significant effect".

## Amlodipine + clarithromycin — epidemiologic evidence

**Citation correction:** the study is JAMA 2013, not JAMA Intern Med 2016.

Gandhi S, Fleet JL, Bailey DG, McArthur E, Wald R, Rehman F, Garg AX.
"Calcium-Channel Blocker–Clarithromycin Drug Interactions and Acute Kidney Injury."
**JAMA. 2013;310(23):2544-2553.** doi:10.1001/jama.2013.282426
https://pubmed.ncbi.nlm.nih.gov/24346990/

Population-based retrospective cohort, Ontario 2003–2012, mean age 76.
Clarithromycin n=96,226 vs azithromycin n=94,083, both on a CCB. 30-day outcomes.

| 30-day outcome | Clarithro | Azithro | Absolute risk increase | Odds ratio |
|---|---|---|---|---|
| Hospitalization with acute kidney injury | 0.44% | 0.22% | 0.22% (0.16–0.27) | **1.98 (1.68–2.34)** |
| Hospitalization with hypotension | 0.12% | 0.07% | 0.04% (0.02–0.07) | **1.60 (1.18–2.16)** |
| All-cause mortality | 1.02% | 0.59% | 0.43% (0.35–0.51) | **1.74 (1.57–1.93)** |

Number needed to harm for AKI: 464 (374–609). Highest risk with nifedipine
(OR 5.33, 3.39–8.38; NNH 160).

**Amlodipine-specific AKI odds ratio: 1.61 (95% CI 1.29–2.02)** — not printed numerically
in the JAMA text (Figure 1 only), but quoted verbatim in the Health Canada Amlodipine
Product Monograph, p.6. Amlodipine-specific hypotension and mortality ORs: NOT_FOUND.

**Note for the simulation:** no quantified AUC ratio exists in any regulatory label for
amlodipine + clarithromycin or amlodipine + any strong CYP3A inhibitor. The strongest
quantitative evidence for that pair is epidemiologic, not pharmacokinetic. If the model
wants to represent this interaction it must do so as an outcome-risk modifier, not as an
exposure multiplier.

## Amlodipine dose caps — label verbatim

| Population | Dose |
|---|---|
| Adults, hypertension | Start **5 mg once daily**, **maximum 10 mg once daily** |
| Small, fragile, or elderly; or hepatic insufficiency | Start **2.5 mg once daily** |
| Pediatric 6–17 years | 2.5–5 mg once daily; "Doses in excess of 5 mg daily have not been studied" |
| Under 6 years | "Effect on patients less than 6 years old is not known" |
| Angina / coronary artery disease | 5–10 mg; "the majority of patients required 10 mg" |
| **Renal impairment** | **No adjustment.** Verbatim: "The pharmacokinetics of amlodipine are not significantly influenced by renal impairment. Patients with renal failure may therefore receive the usual initial dose." |
| Severe hepatic impairment | Titrate slowly; half-life is **56 hours** in impaired hepatic function |

Titration interval: "In general, wait 7 to 14 days between titration steps."

CPIC guideline for amlodipine: does not exist. NOT_FOUND.

---

# 2. Metoprolol — CYP2D6

## CPIC guideline exists and is recent — published 2024

Duarte JD, et al. *Clinical Pharmacogenetics Implementation Consortium Guideline (CPIC)
for CYP2D6, ADRB1, ADRB2, ADRA2C, GRK4, and GRK5 Genotypes and Beta-Blocker Therapy.*
Clin Pharmacol Ther, online 1 Jul 2024. doi:10.1002/cpt.3351; PMID 38951961.
https://files.cpicpgx.org/data/guideline/publication/beta_blockers/2024/38951961.pdf
Annotation: https://www.clinpgx.org/guidelineAnnotation/PA166341321

Note `cpicpgx.org/guidelines/` now 302-redirects to `clinpgx.org/cpic/guidelines`.

Scope, verbatim: "the guideline writing committee felt sufficient evidence exists to
support clinical recommendations related to CYP2D6 and metoprolol." No therapeutic
recommendation was issued for carvedilol or propranolol.

### Table 2 — dosing by CYP2D6 phenotype (verbatim)

| Phenotype | Activity score | Recommendation | Strength |
|---|---|---|---|
| Ultrarapid metabolizer | >2.25 | "No recommendation for metoprolol therapy due to insufficient evidence regarding diminished metoprolol effectiveness clinically." | No recommendation |
| Normal metabolizer | 1.25–2.25 | "Initiate standard dosing." | **Strong** |
| Intermediate metabolizer | 0 < x < 1.25 | "Initiate standard dosing." — increased concentrations "does not appear to translate into clinically significant changes in heart rate, blood pressure, or clinical outcomes" | **Moderate** |
| **Poor metabolizer** | 0 | "Initiate therapy with lowest recommended starting dose. Carefully titrate dose upward to clinical effect or guideline-recommended dose; monitor more closely for bradycardia. Alternatively, consider selecting another beta-blocker." | **Moderate** |
| Indeterminate | n/a | No recommendation | — |

**Only the poor metabolizer triggers an action.** This is a useful corrective — it would
be easy to build a product that dramatically varies dosing across all four phenotypes,
and the guideline says not to.

**Quantitative effect in poor metabolizers** (CPIC, verbatim): "approximately 3–6 mmHg
systolic; 2–6 mmHg diastolic" and "approximately 3–8 beats/min" additional reduction.
These are directly usable as simulation validation targets.

**Phenoconversion rule, machine-usable** (CPIC, verbatim): "It is recommended to assume a
CYP2D6 activity score of zero (i.e., poor metabolizer) in patients taking adequate doses
of a concomitant strong CYP2D6 inhibitor and to reduce the predicted activity score by
half in patients taking a moderate inhibitor. No activity score adjustment is suggested
for weak inhibitors." So: strong inhibitor → activity score 0; moderate → halve; weak →
no change.

**Already-stable patients** (CPIC, verbatim): "modifying metoprolol therapy in CYP2D6 poor
metabolizers on a well-tolerated regimen solely based on CYP2D6 genotype is probably
unnecessary."

## Exposure magnitude, poor vs normal metabolizer

- **CPIC 2024, verbatim:** "Compared with CYP2D6 normal metabolizers, poor metabolizers
  given the same dose of metoprolol experience more than a **two-fold longer elimination
  half-life**, with a **nearly five-fold increase in area under the plasma
  concentration–time curve (AUC)**."
- **FDA label** (Lopressor, rev. 9/2023): "Poor CYP2D6 metabolizers exhibit
  **several-fold** higher plasma concentrations … thereby decreasing Lopressor's
  cardioselectivity." Half-life "3 to 4 hours; in poor CYP2D6 metabolizers the half-life
  may be **7 to 9 hours**." Unchanged urinary excretion: "less than 5% of an oral dose"
  in extensive metabolizers versus "up to 30% or 40%" in poor metabolizers.
  https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0283bc9d-6998-493a-824a-d4c85f704111
- Prevalence: "CYP2D6 is absent (poor metabolizers) in about **8% of Caucasians** and
  about **2% of most other populations**." Useful for sampling a virtual population.

## Drug-drug interaction fold-changes

| Interacting drug | Effect on metoprolol | Source |
|---|---|---|
| **Quinidine** 100 mg + IR metoprolol 200 mg, extensive metabolizers | "**tripled the concentration of S-metoprolol and doubled the metoprolol elimination half-life**" | FDA label, metoprolol succinate ER §12.3 |
| **Paroxetine** | Label class statement: "**double**". Bahar 2018 systematic review: "**three to five times**" AUC increase. Component studies: Hemeryck ×5 [S], ×7 [R]; Stout +270% [S]-IR; Parker ≈×3; Goryachkina ×4 | https://pubmed.ncbi.nlm.nih.gov/30248178/ |
| **Propafenone** 150 mg t.i.d. + metoprolol 50 mg t.i.d., n=4 | steady-state metoprolol "**2- to 5-fold**" | FDA label |
| **Fluoxetine** | Label class statement "double". No dedicated human PK study — Bahar 2018 assumes comparable to paroxetine on Ki grounds (0.15 µM paroxetine vs 0.60 µM fluoxetine) | FDA label |
| **Diphenhydramine** | Oral and nonrenal clearance decreased **twofold** in extensive metabolizers, not in poor metabolizers (Hamelin 2000). S-metoprolol AUC **+84% in women, +45% in men** (Sharma 2010) | https://pubmed.ncbi.nlm.nih.gov/10824625/ · https://pubmed.ncbi.nlm.nih.gov/19948945/ |
| **Bupropion** | **NOT_FOUND** — no human PK fold-change study. Classed a strong CYP2D6 inhibitor; one case report of severe bradycardia | https://pubmed.ncbi.nlm.nih.gov/15367832/ |
| **Terbinafine** | **NOT_FOUND** — no metoprolol data in the terbinafine label. One case report: 37 bpm sinus bradycardia | https://pubmed.ncbi.nlm.nih.gov/24894748/ |
| **Duloxetine** | **NOT_FOUND** in humans. Rat/in-vitro only. Moderate inhibitor → halve activity score per CPIC | https://pubmed.ncbi.nlm.nih.gov/35510497/ |

FDA label §7.3, verbatim: "Drugs that are strong inhibitors of CYP2D6 such as quinidine,
fluoxetine, paroxetine, and propafenone were shown to double metoprolol concentrations.
While there is no information about moderate or weak inhibitors, these too are likely to
increase metoprolol concentration. Increases in plasma concentration decrease the
cardioselectivity of metoprolol."

**The cardioselectivity point matters for the organ animation.** Higher metoprolol
concentration erodes β1 selectivity, meaning β2 blockade — and therefore bronchial
effects — increases with exposure. That makes the asthma contraindication
dose-dependent rather than binary, which is a much better simulation behavior.

## Other labeled metoprolol rules

- **Negative chronotropes** (§7.4, verbatim): "Digitalis glycosides, clonidine, diltiazem
  and verapamil slow atrioventricular conduction and decrease heart rate. Concomitant use
  with beta-blockers can increase the risk of bradycardia." Labeled hazard is bradycardia
  and slowed AV conduction — AV block and hypotension are NOT named in this section.
- **Abrupt discontinuation** (§5.1, verbatim): "gradually reduce the dosage over a period
  of **1 to 2 weeks**". Abrupt cessation risks angina exacerbation and myocardial
  infarction. Also: "Abrupt withdrawal of beta-blockade may precipitate a thyroid storm."
- **Masking hypoglycemia** (§5.6): "Beta-blockers may prevent early warning signs of
  hypoglycemia, such as tachycardia, and increase the risk for severe or prolonged
  hypoglycemia". Relevant to the diabetes comorbidity preset.

---

# 3. Dual RAAS blockade — lisinopril + losartan

This is the flagship drug-drug reject case. The evidence is strong and the trial names
are recognizable, which makes it a good demo.

## Label language

Both labels carry a §7.4 "Dual Blockade of the Renin-Angiotensin System (RAS)" section.

Lisinopril: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8824e5e5-ed35-4a95-bfd6-98a2e7c4bbce
COZAAR (losartan): https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=9949448f-c3b9-44ee-94ed-c1aca8c90f39

Verbatim, both: "Dual blockade of the RAS with angiotensin receptor blockers, ACE
inhibitors, or aliskiren is associated with increased risks of hypotension, hyperkalemia,
and changes in renal function (including acute renal failure) compared to monotherapy."
(COZAAR adds syncope.)

Verbatim, both: "In general, avoid combined use of RAS inhibitors. Closely monitor blood
pressure, renal function and electrolytes."

**Important precision point.** Neither label contains a "do not co-administer" statement
for ACE inhibitor + ARB. That phrasing is reserved for aliskiren in diabetes. ACEi + ARB
is "avoid", not "contraindicated". Encoding it as an absolute contraindication would be
wrong — it should be a high-severity warning. Likewise **no numeric eGFR threshold exists
in any label for the ACEi + ARB combination** — NOT_FOUND. The <60 mL/min threshold in
these labels is aliskiren-specific.

## Trial evidence

**ONTARGET**, NEJM 2008, n=25,620. PMID 18378520.
Ramipril 10 mg (n=8576) vs telmisartan 80 mg (n=8542) vs both (n=8502). Median 56 months.

Primary outcome, verbatim: ramipril 16.5%, telmisartan 16.7% (RR 1.01, 0.94–1.09),
combination 16.3% (RR 0.99, 0.92–1.07). No benefit.

Harms, combination vs ramipril, verbatim: "there was an increased risk of hypotensive
symptoms (**4.8% vs. 1.7%**, P<0.001), syncope (**0.3% vs. 0.2%**, P=0.03), and renal
dysfunction (**13.5% vs. 10.2%**, P<0.001)."

Conclusion, verbatim: "The combination of the two drugs was associated with more adverse
events without an increase in benefit."

ONTARGET hyperkalemia figures: **NOT_FOUND** — not in the abstract, not in the telmisartan
label, and NEJM full text returns 403 to fetchers.

**VA NEPHRON-D**, NEJM 2013, n=1448. PMID 24206457. Losartan 100 mg + lisinopril 10–40 mg
vs losartan alone, type 2 diabetes with albuminuria, eGFR 30.0–89.9. Median 2.2 years.

Verbatim: "The study was stopped early owing to safety concerns." Primary endpoint hazard
ratio 0.88 (0.70–1.12, P=0.30) — no benefit. Mortality HR 1.04 (0.73–1.49).

Verbatim: "Combination therapy increased the risk of hyperkalemia (**6.3 events per 100
person-years, vs. 2.6** with monotherapy; P<0.001) and acute kidney injury (**12.2 vs.
6.7 events per 100 person-years**, P<0.001)."

These two event rates are the most directly simulation-usable numbers in this section.
Hazard ratios for those two harms: NOT_FOUND (paywalled full text).

**ALTITUDE**, NEJM 2012, n=8561. PMID 23121378. Aliskiren 300 mg added to an ACE
inhibitor or ARB, type 2 diabetes. Stopped prematurely.

Verbatim: primary endpoint 18.3% aliskiren vs 17.1% placebo (HR 1.08, 0.98–1.20, P=0.12).
"The proportion of patients with hyperkalemia (serum potassium level, **≥6 mmol per
liter**) was significantly higher in the aliskiren group than in the placebo group
(**11.2% vs. 7.2%**), as was the proportion with reported hypotension (**12.1% vs.
8.3%**) (P<0.001 for both)."

Verbatim conclusion: "…is not supported by these data and may even be harmful."

Note the explicit hyperkalemia definition — serum potassium ≥6 mmol/L — which gives the
simulation a concrete threshold to test against.

## Rules-ready summary

| Rule | Status | Basis |
|---|---|---|
| Aliskiren + ACEi/ARB in diabetes | **CONTRAINDICATED** | Explicit in all three labels |
| Aliskiren + ACEi/ARB at GFR/CrCl < 60 | **AVOID** | Lisinopril and COZAAR say "GFR <60 mL/min"; Tekturna says "CrCl less than 60 mL/min" — note the labels use different measures |
| ACE inhibitor + ARB together | **AVOID, high severity — not an absolute contraindication** | "In general, avoid combined use of RAS inhibitors"; no numeric threshold given |

---

# 4. Losartan — CYP2C9 and the active metabolite

Source: COZAAR label, DailyMed setid 9949448f-c3b9-44ee-94ed-c1aca8c90f39, SPL v9
published Jan 2026 (label text revised 6/2021).

## Parent-to-metabolite relationship — the core numbers

| Item | Value | Section |
|---|---|---|
| Fraction converted | "About **14%** of an orally-administered dose of losartan is converted to the active metabolite" | 12.3 |
| **Potency ratio** | "The active metabolite is **10 to 40 times more potent by weight** than losartan" | 12.1 |
| Metabolite mechanism | "a reversible, non-competitive inhibitor of the AT1 receptor" | 12.1 |
| Enzymes | "cytochrome P450 **2C9 and 3A4** are involved in the biotransformation" | 12.3 |
| **Dominant enzyme in vivo** | "conversion of losartan to its active metabolite is mediated **primarily by P450 2C9 and not P450 3A4**" | 12.3 |
| Half-lives | losartan "about **2 hours**"; metabolite "about **6-9 hours**" | 12.3 |
| Clearance | losartan **600 mL/min**; metabolite **50 mL/min** | 12.3 |
| Receptor selectivity | "about **1000-fold**" greater affinity for AT1 than AT2 | 12.1 |

**This is the single most important modeling fact for losartan:** a 14% fraction that is
10–40× more potent means the metabolite carries most of the effect, and its 6–9 hour
half-life — not losartan's 2 hours — governs the duration of action. A model that
simulates only the parent will get losartan's dosing interval badly wrong.

**Non-converters:** removed from the current label but present in the 2009 version
(https://www.accessdata.fda.gov/drugsatfda_docs/label/2009/020386s049lbl.pdf), verbatim:
"Minimal conversion of losartan to the active metabolite (**less than 1% of the dose**
compared to 14% of the dose in normal subjects) was seen in about **one percent** of
individuals studied." A rare but dramatic personalization case.

## CYP2C9 genotype — no guideline exists, but PK data does

**CPIC guideline: NOT_FOUND, verified absent.** CPIC API returns `[]` for losartan, and
losartan is absent from the complete CYP2C9 pair list. **DPWG guideline: NOT_FOUND,
verified absent** — zero guideline annotations for PharmGKB accession PA450268 (positive
control warfarin correctly returns 5). No FDA pharmacogenomic label annotation; only a
Swissmedic one. Highest existing evidence is PharmGKB clinical annotation **Level 3**.

So unlike metoprolol, there is no authoritative dosing recommendation to encode — only
pharmacokinetic effect data. Say so in the product rather than implying guideline backing.

**Yasar 2002**, Clin Pharmacol Ther, PMID 11823761. 50 mg single dose. Ratio of
AUC_losartan / AUC_E-3174 versus \*1/\*1:

| Genotype | Fold increase in parent/metabolite AUC ratio |
|---|---|
| \*1/\*3 | **≈2×** |
| \*2/\*3 | **≈3×** |
| \*3/\*3 | **≈30×** (plasma); ≈40× urinary |

**Sekino 2003**, PMID 14504849, 25 mg, Japanese subjects. Verbatim: "Systolic blood
pressure in the CYP2C9\*1/\*1 group, but not that in the CYP2C9\*1/\*3 group, was reduced
from 1 h to 12 h compared with the baseline level. … The single CYP2C9\*3 variant reduces
the metabolism of losartan and its hypotensive effect." No fold numbers.

**Contradicting evidence — Bae 2012**, PMID 22735459, n=43 Korean, verbatim: "AUC0-∞ of
E-3174 was **not different**. … the clinical effects of losartan **may not be reduced** by
CYP2C9\*1/\*3 and CYP2C9\*1/\*13." Report this disagreement rather than resolving it.

**Meta-analysis, J Pers Med 2021**, PMC8303964. Carriers of \*2 or \*3 vs \*1/\*1, mean
differences: losartan AUC +0.17 µg·h/mL (0.04–0.29); E-3174 AUC −0.35 µg·h/mL
(−0.62 to −0.08); E-3174 Cmax −0.13 µg/mL (−0.17 to −0.09); losartan t½ +0.47 h;
E-3174 t½ +0.68 h. Notably the effect was significant in Asian subgroups and **not
significant in Caucasian subgroups** for both AUC endpoints.

Percent reduction in E-3174 AUC stratified by individual genotype: NOT_FOUND — only fold
ratios and mean differences exist.

## Enzyme-directed drug interactions

Label verbatim: "**rifampin has been shown to decrease the AUC of losartan and its active
metabolite by 30% and 40%**, respectively. **Fluconazole**, an inhibitor of cytochrome
P450 2C9, **decreased the AUC of the active metabolite by approximately 40%, but increased
the AUC of losartan by approximately 70%** following multiple doses. Conversion of losartan
to its active metabolite after intravenous administration is not affected by ketoconazole,
an inhibitor of P450 3A4. The AUC of active metabolite following oral losartan was not
affected by erythromycin … but the AUC of losartan was increased by 30%."

Primary sources, with discrepancies flagged:

- **Kazierad 1997**, PMID 9357393, the multiple-dose study the label cites: losartan
  AUC **+66%**, Cmax +30%; E-3174 AUC **−43%**, Cmax −56%.
- **Kaukonen 1998**, PMID 9551703, single dose after fluconazole loading: E-3174 Cmax
  **to 30% of control**, AUC **to 47% of control**, t½ to 167%. Losartan itself only a
  nonsignificant +23–41%. **Itraconazole had no significant effect** — confirming CYP3A4
  is minor. ⚠️ Direction convention differs from Kazierad: "to 47% of control" means −53%,
  not −47%. Easy to encode backwards.
- **Williamson 1998**, PMID 9542475, rifampin: losartan AUC **−35%** (label says 30%),
  E-3174 AUC **−40%**, losartan oral clearance +44%, both half-lives −50%. Erythromycin
  had no significant effect. Verbatim: "CYP3A4 appears to play a **minor role** in the in
  vivo metabolism of losartan to E3174."

FDA drug-interaction table classifications
(https://www.fda.gov/drugs/drug-interactions-labeling/drug-development-and-drug-interactions-table-substrates-inhibitors-and-inducers):
fluconazole is the **moderate** CYP2C9 index inhibitor — **no strong CYP2C9 index
inhibitor exists**. Rifampin is the **moderate** CYP2C9 index inducer. Losartan itself
appears nowhere in the FDA table (grep count 0) — NOT_FOUND as a listed substrate.

## Losartan dosing — label verbatim

| Population | Dose |
|---|---|
| Usual adult start | **50 mg once daily** |
| Maximum, hypertension | **100 mg once daily** |
| Volume-depleted (e.g. on a diuretic) | Start **25 mg** |
| Mild-to-moderate hepatic impairment | Start **25 mg once daily**; not studied in severe |
| **Renal impairment** | **No adjustment necessary** unless also volume depleted |
| Pediatric | 0.7 mg/kg once daily, up to 50 mg; not recommended under 6 years or GFR <30 |

Hepatic impairment PK: plasma concentrations of losartan and metabolite are **5× and
1.7×** those in healthy volunteers; total plasma clearance about **50% lower**, oral
bioavailability about **doubled**.

Renal impairment PK: AUCs **increased 50–90%** at CrCl 30–74 mL/min; renal clearance
**reduced 55–85%** — yet no dose adjustment is required. A good illustration for the
product that altered pharmacokinetics does not automatically mean altered dosing.
"Neither losartan nor its active metabolite can be removed by hemodialysis."

⚠️ Do not encode a numeric renal milligram cap for losartan — the label gives none.
