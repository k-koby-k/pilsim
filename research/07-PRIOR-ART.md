# 07 — Prior Art and Differentiation

**Owner:** Agent F · **Written:** 2026-08-17 · **Status:** COMPLETE
All licences verified live via the GitHub API and the npm registry on **2026-08-17**.

---

## 1. Open-source PK/PD and PBPK tooling

Verified by querying `api.github.com/repos/{org}/{repo}` and, where the SPDX id was
`NOASSERTION`, reading the actual `LICENSE` blob.

| Tool | What it is | Language | Licence (verified) | Stars | Last push |
|------|------------|----------|--------------------|-------|-----------|
| **PK-Sim** (Open Systems Pharmacology) | The reference open-source whole-body PBPK platform | C# / .NET | **GPL-2.0 + clarifying addendum** (LICENSE blob reads "GNU GENERAL PUBLIC LICENSE plus CLARIFYING ADDENDUM") | 174 | 2026-08-14 |
| **MoBi** (Open Systems Pharmacology) | Multiscale physiological modelling companion to PK-Sim | C# / .NET | GPL-2.0 + addendum | 44 | 2026-08-16 |
| **mrgsolve** | ODE-based population PK/PD and QSP simulation | R + C++ | **GPL-2.0** | 169 | 2026-06-26 |
| **nlmixr2** | Nonlinear mixed-effects population PK modelling | R | **GPL-3.0** | 97 | 2026-08-15 |
| **rxode2** | ODE engine underneath nlmixr2 | R + C | **GPL-3.0** | 65 | 2026-08-15 |
| **Pharmpy** | Pharmacometrics library and toolkit | Python | **GPL-3.0** | 70 | 2026-08-14 |
| **PKPDsim** (InsightRX) | Simulate PK-PD models defined as ODE systems | R | **MIT** (LICENSE blob: `YEAR: 2021 / COPYRIGHT HOLDER: InsightRX`, GitHub reports NOASSERTION only because of the templated file) | 50 | 2026-07-31 |
| **httk** (US EPA) | Free open-source toxicokinetic models and data | R | **No LICENSE file in repo** — US government work, licence status unclear from the repository | 33 | 2026-04-28 |
| **DifferentialEquations.jl** (SciML) | General high-performance ODE/SDE solver suite | Julia | **MIT** | 3142 | 2026-08-15 |

### 1.1 The finding that actually matters

**Every mature PK/PD tool in this space is (a) GPL-licensed and (b) written in R, C#, or
Julia. Not one of them can run inside a Cloudflare Worker.**

That is two independent blockers, and either alone is decisive:

- **Runtime.** The Cloudflare-only constraint means TypeScript in a Worker/Durable Object,
  or short Python jobs in a Sandbox container. R and .NET are not options. Julia is not an
  option. So even the MIT-licensed `DifferentialEquations.jl` is unreachable.
- **Licence.** PK-Sim, mrgsolve, nlmixr2, rxode2 and Pharmpy are GPL-2 or GPL-3. Linking
  any of them into a product the team may later want to license commercially imports
  copyleft. `PKPDsim` (MIT) is the one clean-licensed R package, and it is still R.

**Conclusion: the team writes its own solver, in TypeScript.** This is not a compromise
forced by ignorance of the alternatives — it is the correct call given the runtime, and it
is affordable because the model class in `03-SIMULATION-SPEC.md` is a small ODE system,
not a full PBPK model. Say this in the pitch if a technical judge asks why you did not
reuse an existing engine; "we checked the licences and the runtimes" is a much better
answer than "we didn't know they existed".

### 1.2 What *is* genuinely reusable

| Asset | How it is reused | Licence risk |
|-------|------------------|--------------|
| **The published model structures** — one/two-compartment PK, Emax and sigmoid-Emax PD, turnover/indirect-response models | Reimplemented from the literature. Mathematics is not copyrightable. | None |
| **PK-Sim / OSP physiological reference database** (organ volumes, blood flows) | Read the values, cite the source. Do not vendor the code. | Data values with citation are fine; copying the codebase is not |
| **`odex`** (npm) — Hairer's ODEX non-stiff ODE solver ported to JavaScript | Drop-in numerical integrator, runs in a Worker | **BSD-2-Clause** — clean |
| **`@martinjrobins/diffsol-js`** — WASM bindings to the diffsol ODE solver | Alternative integrator, stiff-capable | **MIT** — clean |
| **openFDA / DailyMed / HPA / WHO GHO** data | Already the backbone of the data files | See `01-DATA-ACQUISITION.md` |

Given the model size, a hand-written fixed-step RK4 in TypeScript is very likely enough
and avoids a dependency entirely — Agent E owns that call.

### 1.3 The JavaScript/TypeScript ecosystem gap — measured, not asserted

npm registry search totals, retrieved 2026-08-17:

| Query | Total packages |
|-------|----------------|
| `pharmacokinetics` | **6** |
| `pharmacometrics` | **1** |
| `nonmem` | **0** |
| `pharmacokinetic` | **0** |
| `pbpk` | **1** (unrelated — an installer package) |

For comparison, a generic query like `compartment model` returns 147,272 — so the search
index is not the problem. **There is effectively no pharmacokinetic modelling library in
the JavaScript ecosystem.** This is a defensible, checkable, one-line claim for the pitch,
and it explains the whole architecture: an edge-native mechanistic simulator has to be
built, because it cannot be assembled.

---

## 2. Digital-twin platforms and commercial vendors

**Confidence note:** the open-source table above was verified programmatically. This
section was **not** — my web-search budget was exhausted before I could verify current
product scope or pricing for any commercial vendor. I am listing what I am confident
exists and its general category, and explicitly marking what I could not check. Do not put
a price or a feature claim from this section on a slide without checking it first.

| Category | Players | Position relative to PilSim |
|----------|---------|------------------------------|
| **PBPK / clinical-trial simulation vendors** | Certara (Simcyp), Simulations Plus (GastroPlus) | The serious incumbents. Regulatory-grade PBPK used in real drug submissions. Enterprise-licensed, desktop, expert-operated. Pricing: **`NOT_FOUND`** — not verified. |
| **Physiology / organ simulation** | Dassault Systèmes "Living Heart" and the Living Brain/Living Lung line | High-fidelity finite-element organ models, used for device design. Beautiful, and far heavier than anything in this scope. |
| **Clinical-trial digital twins** | Unlearn.AI and similar | Statistical twins that forecast a trial participant's control-arm trajectory to shrink required sample size. **Statistical, not mechanistic** — a genuinely different technique from what PilSim does. |
| **Metabolic / chronic-disease consumer twins** | Twin Health and similar | Consumer-facing metabolic digital twins for diabetes. Closest in *framing* to problem 12, distant in method. |
| **Whole-body physiology models (academic)** | HumMod / the Guyton lineage; Physiome and CellML model repositories | Whole-body integrative physiology, thousands of variables. Directly relevant intellectual ancestry for the counter-regulation modelling. **Licence: `NOT_FOUND`** — I could not verify HumMod's current licence or download location. |

**The honest read:** everything in this table is either far heavier than a 24-hour build,
statistically rather than mechanistically grounded, or aimed at a different user. None of
them is a hackathon competitor. But none of them should be described as something PilSim
"beats" either — Simcyp is regulatory-grade software with two decades behind it, and a
judge who works in pharma will know that. The differentiation is about *access and
audience*, not fidelity, and §3 states it that way.

---

## 3. Honest differentiation

### 3.1 What PilSim does that the prior art does not

1. **It runs at the edge, in a browser, with no install and no licence.** Simcyp and
   GastroPlus are desktop software behind enterprise agreements. The open-source
   alternatives require an R or .NET toolchain and a pharmacometrician to drive them.
   PilSim is a URL. For a health system where the constraint is access to expertise, that
   is the whole product.
2. **Every number carries its provenance, and the product grades its own evidence.** The
   `cited / estimated / NOT_FOUND` accounting in `05-OUTPUT-REPORT-SPEC.md` §7.2 produces
   an evidence grade on every run. No tool in §1 or §2 surfaces its own uncertainty about
   its *inputs* to the end user this way. It falls out for free from locked decision 4,
   and it is the most credible thing in the product.
3. **Mechanism is visible, not inferred from a curve.** The organ animation binds
   simulation variables to anatomy at named nephron segments and named molecular targets
   (`04-ORGAN-EFFECT-MAP.md`). PBPK tools output concentration-time curves; this outputs a
   body you can watch. That is a teaching and communication capability, and it is what
   makes the tool usable by someone who is not a pharmacometrician.
4. **One engine serves screening and personalisation.** The same loop runs one molecule
   against many virtual patients (problem 14) or many candidate regimens against one twin
   (problem 12). `05-OUTPUT-REPORT-SPEC.md` §10 shows no design decision forces a choice.

### 3.2 What PilSim does **not** do — say this before a judge says it

Volunteering the limits is worth more than being caught at them.

- **Not regulatory-grade, not validated, not a medical device.** Simcyp has been used in
  FDA submissions. This has been used in a hackathon.
- **Five drugs, one therapeutic area.** Depth over breadth was a deliberate choice, but it
  is a narrow product today.
- **Blood pressure and laboratory values, not clinical events.** No strokes, no
  infarctions, no mortality. A "5-year prognosis" here is a projection of surrogate
  markers. See `05-OUTPUT-REPORT-SPEC.md` §7.3.
- **Cell-level resolution is claimed for exactly one target** (NCC in distal convoluted
  tubule cells). Everything else renders at tissue level, and the UI says so
  (`04-ORGAN-EFFECT-MAP.md` §14).
- **No molecular novelty.** Problem 14 mentions identifying new molecules; PilSim does not
  do generative chemistry. It addresses the *evaluation and repurposing* half of that
  problem — screening and formulation/dose selection — and the pitch should claim exactly
  that and not more.

---

## 4. The Uzbekistan framing — sourced

Retrieved from the **WHO Global Health Observatory API** (`ghoapi.azureedge.net`) on
2026-08-17. These are real numbers, queried live, and they make the case better than any
rhetoric.

### 4.1 Uzbekistan's hypertension cascade

Adults aged 30–79, age-standardised, 2019 (WHO GHO indicators `NCD_HYP_*`):

| Stage | Uzbekistan | Men | Women |
|-------|------------|-----|-------|
| **Prevalence** of hypertension | **45.7 %** (40.3–51.3) | 46.7 % | 44.6 % |
| **Diagnosed** among those with it | **53.6 %** (45.7–61.4) | 44.0 % | 62.9 % |
| **Treated** among those with it | **43.5 %** (35.3–51.6) | 33.6 % | 53.0 % |
| **Controlled** (effective treatment coverage) | **16.5 %** (11.0–23.1) | **11.3 %** | 21.7 % |

Global comparison, same indicator and year: treatment coverage **42.4 %**, control
**20.8 %**. So Uzbekistan treats at roughly the global rate but **controls below it**, and
control among men (11.3 %) is about half the global figure.

**Probability of dying between 30 and 70 from the four main NCDs** (`NCDMORT3070`, 2021):
**Uzbekistan 24.6 %** (20.1–29.4) vs **global 17.8 %** (13.5–22.9).

### 4.2 What those numbers license the team to say

The gap in Uzbekistan is **not** primarily a diagnosis gap or a drug-availability gap —
half the people with hypertension are diagnosed and 43.5 % are on treatment, close to the
global average. The gap is **between being treated and being controlled**: 43.5 % treated,
16.5 % controlled. Roughly **six in ten treated patients are not at target.**

That is a *regimen selection and titration* problem, and it is precisely the problem a
dose- and combination-optimising simulator addresses. It is also a problem that scales
with access to specialist judgement — which is exactly what is scarce outside Tashkent and
the regional centres, and why a browser-based tool matters more here than it would in a
health system with a cardiologist in every district.

**One-line pitch anchor, fully sourced:**
> In Uzbekistan, 45.7 % of adults aged 30–79 have hypertension. 43.5 % of them are on
> treatment. Only 16.5 % are controlled — and only 11.3 % of men. The gap is not
> diagnosis, and it is not drug supply. It is choosing the right drug, at the right dose,
> for the right patient. (WHO Global Health Observatory, 2019 estimates, retrieved
> 2026-08-17.)

### 4.3 What I could not source — deliberately omitted

The brief asked for local manufacturing, referent pricing, specialist access, and
regulatory posture on clinical trials **only if I could source them**. My web-search budget
was exhausted before I reached them, and every one of these is the kind of claim a local
judge can immediately falsify. **They are omitted rather than invented.** If the team wants
them in the pitch, they are quick to check locally:

- Uzbek pharmaceutical manufacturing capacity and whether these five molecules are
  produced domestically (relevant: all five are old, off-patent, and generically
  manufactured worldwide, so domestic production is plausible — but I did not verify it).
- The national essential-medicines list and reference pricing for these five.
- Physician-to-population and cardiologist-to-population ratios by viloyat.
- Regulatory posture on clinical trials and on software as a medical device.

**`NOT_FOUND`: CYP2D6 metabolizer-phenotype frequencies in Uzbek or Central Asian
populations.** This one is worth flagging loudly. The metoprolol pharmacogenomic story is
the strongest personalisation hook in the drug set (`04-ORGAN-EFFECT-MAP.md` §8.3), and
population-specific allele frequencies would make it a *local* story rather than a generic
one. I could not source them. **Do not state a frequency for the Uzbek population** — a
fabricated genetics statistic, in Uzbekistan, in front of Ministry of Health judges, is
the worst available failure mode in this entire project.

---

## 5. Framing against the two problem statements

| | Problem 14 (primary) — AI drug discovery | Problem 12 (secondary) — digital twin for chronic patients |
|---|---|---|
| **What the statement asks** | Screen molecules, predict combinations, repurpose existing drugs, plan clinical research | Build a per-patient model from labs, history, lifestyle, genetics; test the drug on the twin before prescribing; produce a prognosis |
| **What PilSim delivers** | Screens a candidate formulation against a *population* of virtual patients; ranks doses and formulations; identifies the best-fit indication — the evaluation half of drug development, which is where the 10–15 years and the billions actually go | Runs candidate regimens against *one* patient's parameterised twin, with CYP2D6 metabolizer status as a live genetic input; returns a ranked recommendation with reasons and cited evidence |
| **What it does not deliver** | Generative chemistry. No new molecules. | Clinical event prediction. Surrogate markers only. |
| **Same engine?** | Yes — the only difference is which axis is searched. `05-OUTPUT-REPORT-SPEC.md` §10. | |

**The unifying line:** *human experimentation is legally and ethically restricted, so
simulate it first* — one mechanistic virtual human, pointed either at a population to
screen a candidate, or at an individual to personalise a prescription.

**The credibility line to pair with it,** because the first line alone sounds like every
other pitch: *every number in this simulator carries a citation or is marked as an
estimate, and the report tells you which — on every run.*

---

## 6. Cross-agent notes

- **To Agent E:** §1.1 is a build-relevant conclusion — there is no reusable engine that
  runs on Cloudflare, so the solver is hand-written. If you want an integrator dependency
  rather than a hand-rolled RK4, `odex` (BSD-2-Clause, pure JS) and
  `@martinjrobins/diffsol-js` (MIT, WASM) are the two clean-licensed options I verified.
  Everything else in the space is GPL and/or not JavaScript.
- **To the lead:** §2 is my least-verified section — my web-search budget ran out before I
  could check any commercial vendor's current scope or pricing, so nothing there should go
  on a slide unchecked. §1 and §4 are verified live and are safe to use.
- **To the lead — the strongest pitch asset I found** is the WHO cascade in §4.1. It is
  live-queried, checkable by a judge on the spot, and it reframes the problem from
  "Uzbekistan needs more medicine" to "Uzbekistan needs better regimen selection", which
  is the exact thing the product does. Recommend it opens the pitch.
- **To the lead — the sharpest risk** is §4.3: do not let anyone add a CYP2D6 allele
  frequency for the Uzbek population to the deck. It is unsourced, it is the kind of
  number that sounds authoritative, and a Ministry of Health judge is exactly the person
  who might know it is wrong.
