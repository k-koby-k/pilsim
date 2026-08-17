# PilSim — Deep Research Mission Brief

You are a research agent with web access (WebSearch/WebFetch), a shell, and file-write
tools. Your job is **not** to write an essay. Your job is to produce a small set of
**immediately usable artifacts** — filled data files with real, cited numbers, plus
short specs — that a coding agent can consume tomorrow morning to build a working
product with zero further research.

Treat "I found a good source" as a failure. Treat "here is the file, populated, with
a citation on every number, and here is the exact command that produced it" as success.

---

## 0. Hard constraints (read before planning)

- **Deadline: ~24 hours to a demoable product.** The team is one vibecoder. Scope
  everything to what ships in a day. If a scientifically better approach cannot be
  built in a day, name it in a "Tier 2 / future" section and move on — do not make it
  the main recommendation.
- **Runtime is Cloudflare only**: Workers, Durable Objects, Workers AI, and the
  Cloudflare Sandbox SDK (containers). There is no separate Python server, no GPU, no
  long-running VM. Any numeric model you recommend must run either (a) as TypeScript
  inside a Worker/DO within Cloudflare's CPU-time limits, or (b) as short Python jobs
  inside a Sandbox SDK container. **Verify Cloudflare's current CPU/memory/duration
  limits from the live docs and quote them with a link** — do not rely on memory.
- **Data licensing**: prefer free/open sources. Where a paid source (DrugBank
  commercial, Certara/Simcyp, Micromedex, Lexicomp) unlocks something materially
  better, note it in one line with price ballpark, then give the open workaround.
- **No live third-party API call may sit in the critical demo path.** Every runtime
  API dependency is a demo-day failure risk. Default architecture: bake a curated,
  version-controlled JSON dataset into the repo at build time; use live APIs only for
  optional enrichment. Your data files ARE the product's database.
- **Safety framing**: this is a research simulator, not a clinical decision tool.
  Every artifact you produce must carry that framing, and the report spec you design
  must surface it in the UI.

---

## 1. Context: what is being built and why

### 1.1 The hackathon problems

This is the Umummilliy AI Xakaton, Qashqadaryo viloyati 2026 (Uzbekistan). The team
has picked two problem statements from the Ministry of Health / pharmaceutical
industry track. **Problem 14 is the primary; problem 12 is the secondary framing that
must be visibly satisfied by the same product** (the team wants to keep 12 in the
pitch, not drop it).

**Problem 12 (secondary framing) — original Uzbek:**
> Surunkali kasalliklar (diabet, yurak yetishmovchiligi) bilan ogʻrigan bemorlar uchun
> individuallashtirilgan davolash rejimi yoʻq: haqiqiy bemorga dori belgilashdan oldin
> uning tanasida qanday taʼsir koʻrsatishini virtual muhitda tekshirish imkoniyati
> mavjud emas.
>
> Proposed solution: Raqamli egizak texnologiyasi (Digital Twin for Chronic Patients):
> Har bir surunkali kasallik bemoriga tegishli biologik koʻrsatkichlar (kasallik
> tarixi, tahlillar, turmush tarzi, genetika) asosida individual SI-modeli yaratish.
> Shifokor dori belgilashdan avval "raqamli egizak"da sinovdan oʻtkazadi, 5 yillik
> prognoz oladi.

English: chronic patients (diabetes, heart failure) have no individualized treatment
regimen; there is no way to test, in a virtual environment, how a drug will act in a
specific patient's body before prescribing. Solution: a **digital twin** built from
that patient's biomarkers, history, labs, lifestyle, genetics — the doctor tests the
drug on the twin first and gets a 5-year prognosis.

**Problem 14 (primary) — original Uzbek:**
> Yangi dori vositasini yaratish eng murakkab va uzoq jarayonlardan biri: yangi
> molekulani aniqlash, samaradorlik va xavfsizlikni baholash hamda tadqiqotlarni
> yakunlash 10–15 yil va milliardlab dollar talab qiladi. Natijada koʻplab istiqbolli
> gʻoyalar amaliyotga yetib bormaydi.
>
> Proposed solution: AI yordamida dori yaratishni tezlashtirish (AI Drug Discovery):
> molekulalarni saralash, yangi birikmalarni prognoz qilish, mavjud dorilarni qayta
> qoʻllash (drug repurposing), klinik tadqiqotlarni rejalashtirish va ilmiy
> maʼlumotlarni tahlil qilish.

English: creating a new drug takes 10–15 years and billions of dollars; promising
ideas never reach practice. Solution: accelerate drug creation/improvement via
molecule screening, predicting new combinations, drug repurposing, planning clinical
research, and analyzing scientific data.

**The unifying pitch the team is making:** human experimentation is legally and
ethically restricted, so simulate it. One engine — a mechanistic virtual human —
serves both: run a *candidate formulation* against a *population of virtual patients*
(problem 14: preclinical/formulation screening), or against *one patient's twin*
(problem 12: personalized prescribing). Your recommendations should keep both
readings alive from a single simulation core. Explicitly flag any design decision that
would force a choice between them.

### 1.2 The product as sketched (from the team's wireframes)

Left sidebar navigation with sections: **SUBSTANCES**, **PILLS**, **TEST SUBJECTS**,
plus an expandable section, and a list of saved items below.

- **Substances page**: the researcher types a search query, matching substances
  appear, they pick one; the substance's variables load into an editable table (all
  properties of that substance); they can override any value, then press Add.
- **Pills page**: a pill is composed of multiple substances. The system must check
  whether those substances can coexist — blockers, active vs. inactive ingredients,
  antagonism, chemical/pharmacological incompatibility. Card-grid layout of composed
  pills; a form dialog for composition.
- **Test subject page**: a human figure rendered on the left, a checklist/parameter
  panel on the right. Humans only. The scientist can change any physiological variable,
  add illnesses, and impose conditions.
- **Simulation**: run a pill against a test subject and watch, over time, how each
  element affects each organ / tissue / (ideally) cell type, at each dose. The team
  wants this **animated** — visible per-organ effect, not just a chart.
- **End-of-run report**: for the pill/element, output its best use case, best dose,
  and best formulation type (tablet, extended-release, oral solution, spray,
  transdermal, sublingual, etc.).

### 1.3 The team's own draft scope (verify it — do not assume it is correct)

The team drafted this with an AI and does not trust it. **Independently derive your
own recommended scope first. Then compare against this draft and produce a
line-by-line verdict table (CONFIRMED / PARTIALLY CORRECT / WRONG / MISLEADING) with
a citation for each verdict.** Where the draft is wrong, say what the correct
statement is.

> **Step 1 — drug choice**
> 1. ACE inhibitors: Perindopril 2.5–10 mg, Enalapril 5–20 mg, Lisinopril 5–40 mg, Benazepril 5–40 mg
> 2. ARBs: Losartan 25–100 mg, Valsartan 80–320 mg, Irbesartan 75–300 mg, Olmesartan 10–40 mg, Telmisartan 20–80 mg
> 3. Calcium channel blockers: Amlodipine 2.5–10 mg, Nitrendipine 10–20 mg, Verapamil 120–480 mg
> 4. Thiazide / thiazide-like diuretics: Hydrochlorothiazide 12.5–25 mg, Indapamide 1.25–2.5 mg
> 5. Beta-blockers: Atenolol 25–100 mg, Metoprolol 25–200 mg
>
> **Step 2** — get the 5 most efficient dosage combinations
>
> **Step 3** — test on human model; choose age range, BMI range, and comorbidities:
> 1. Type 2 diabetes — ACE/ARB preferred, renal-protective; earlier BP treatment threshold (130/80) per 2025 AHA/ACC guideline
> 2. Chronic kidney disease — ACE/ARB first-line; thiazide less effective at low kidney function, dose caps differ
> 3. Heart failure — needs ACE/ARB/ARNI + beta-blocker + MRA; non-dihydropyridine CCB (verapamil) often avoided
> 4. Obesity / metabolic syndrome — thiazides weaker; higher CCB response typical
> 5. Elderly 65+ — low-dose thiazide first-line; more sensitive to dizziness/falls
> 6. Asthma / COPD — beta-blocker contraindicated (bronchospasm) — forces AI to reject wrong combo
> 7. Gout — thiazide raises uric acid — reject-test case
> 8. Pregnancy — ACE/ARB contraindicated (fetal harm) — high-value reject-test case
> 9. Coronary artery disease / prior stroke — beta-blocker or ACE preferred
>
> **Step 4** — simulation with animations

**Scope guidance from the team:** the demo dataset should be small — on the order of
**5 drugs deeply modeled**, plus the substances that make up those 5 products
(active ingredients AND excipients). Depth over breadth. You choose which 5 (or
propose a different count with reasoning), from the antihypertensive space above
unless you have a strong argument otherwise. Pick a set that (a) spans different
mechanisms so the organ animation shows visibly different behavior, (b) includes at
least two hard contraindication test cases so the safety engine has something to
reject, and (c) has abundant public PK/PD data.

---

## 2. What you must deliver

Write each of these as a file. Order matters — files 1–4 must be complete and usable
even if you run out of time before file 9. State at the top of your final message
which files are complete and which are partial.

### `research/00-DECISIONS.md`
The executive brief. Max 2 pages. Contains: your recommended 5-drug set and why; the
recommended simulation model class and why it fits a Cloudflare runtime and a 24-hour
build; the single biggest scientific risk and the single biggest engineering risk; the
one-sentence pitch line that satisfies both problem 12 and problem 14; and a "what we
are deliberately NOT modeling" list (this is what keeps the build honest and the demo
finishable). Include the verdict table on the team's draft scope (§1.3).

### `research/01-DATA-ACQUISITION.md` — *the file the team cares most about*
For **every** data source you actually use, give a complete, reproducible acquisition
recipe. Not a name. Not a homepage link. A recipe:

- Source name, maintaining organization, license, and whether attribution is required.
- Base URL and the **exact endpoint or download URL**.
- A **runnable `curl` command** (or download link) that you have actually executed.
- The **first ~15 lines of the real response** you received, pasted in.
- The exact JSON path / column name for each field the product needs.
- Rate limits, API key requirements (and where to register, free or not), CORS
  behavior, and response size.
- **Verification status**: `VERIFIED WORKING <date>` / `DEAD` / `MOVED — new URL` /
  `REQUIRES KEY`. You must actually hit each endpoint. Endpoints in this domain
  churn — several well-known ones have been retired in recent years. Any source you
  could not verify goes in a separate "unverified / do not depend on" section.

Cover at minimum, and report honestly which survived verification:
chemical/structural identity, drug product labeling, pharmacokinetic parameters,
pharmacodynamic/dose-response data, adverse effects, drug–drug interactions,
drug–disease contraindications, ATC classification and defined daily doses, excipient
data, formulation/route availability, and human physiological reference values
(organ volumes, blood flows, GFR, cardiac output) for the virtual human. Investigate
what is actually available among sources such as PubChem, ChEMBL, openFDA, DailyMed,
DrugCentral, RxNorm/RxNav, WHO ATC/DDD, SIDER, PK-DB, ICD-11, LOINC, Human Protein
Atlas, and the ICRP/IT'IS physiological parameter references — but do not treat that
list as exhaustive or as pre-approved. Find what works.

Also answer: **is there a bulk download that removes runtime API dependency entirely?**
Give its URL, size, and format. That is the preferred answer.

### `data/substances.json`
The actual, populated substance database for your chosen set. One record per
substance, covering both active ingredients and the excipients present in the real
products. Design the schema yourself, but every record must carry the identifiers
needed to join to external sources, the physicochemical properties, the PK
parameters, and the PD parameters the simulation needs.

**Non-negotiable rule: every numeric value carries a provenance field** — either a
citation (URL + what the source is + the specific value as stated there) or the
literal string `"ESTIMATED"` with a one-line justification. A number with neither is
a defect. Do not silently invent pharmacology; an explicitly-flagged estimate is
fine, a fabricated citation is not. Where a source gives a range or population
variability, capture the range and the coefficient of variation, not just a midpoint —
the simulation needs inter-individual variability to be interesting.

Also record, per substance, which real-world **formulations and routes** exist and how
each changes the PK (bioavailability, time to peak, peak-to-trough swing). The
product's final report claims to recommend a "best formulation type" — that claim is
only defensible if this data exists.

### `data/products.json`
The 5 modeled products (pills), each composed of substances from `substances.json`
with amounts, plus real-world reference brand/generic names and available strengths.
This is what the "Pills" page composes and what the simulation consumes.

### `data/rules.json`
The machine-readable safety engine. Every contraindication, interaction, blocker, and
dose-cap rule that your chosen set can trigger. Each rule needs: a stable id, the
trigger condition expressed in evaluable terms (substance/class + patient condition or
second substance), a severity level, the mechanism in one sentence, the effect the
simulation should apply, the human-readable warning text, and a citation. Include the
positive rules too (compelling indications — "prefer X in condition Y"), not only the
prohibitions; the product must be able to recommend, not only reject.

Cover the team's 9 comorbidities, but correct and extend that list based on what your
chosen drug set actually interacts with. Include CYP-mediated and renal-clearance
interactions, and electrolyte/metabolic effects, where they apply.

### `data/patient_model.json` + `research/02-VIRTUAL-HUMAN.md`
The digital twin's state vector and its baseline physiology. Define every state
variable the simulation tracks, its units, its physiological range, and how its
baseline is computed from the user-editable inputs (age, sex, weight/BMI, ethnicity,
comorbidities, labs, and any genetic/metabolizer status you judge worth including).
Give the actual equations for baseline derivation with citations — renal function
estimation, body composition, cardiac output, and so on, using current recommended
formulas (be careful: some widely-taught equations have been officially revised in
recent years — verify which version is current and say so).

Then define the comorbidity presets: for each condition, exactly which state variables
shift and by how much, cited. These presets are what makes the "add an illness"
interaction in the UI actually mean something.

`02-VIRTUAL-HUMAN.md` explains the model, its assumptions, and its validity limits in
prose a judge can follow.

### `research/03-SIMULATION-SPEC.md`
The engine specification, at a level of detail a coding agent can implement without
further research. This must include:

- The full model as **explicit equations**: absorption, distribution, elimination, and
  the pharmacodynamic link from concentration to physiological effect, plus whatever
  homeostatic feedback is needed for the response to look biologically plausible over
  time (a model with no counter-regulation will produce absurd results and a judge
  will notice).
- Justification of model class and complexity against the 24-hour constraint. Compare
  the candidate approaches honestly and pick one. Say what fidelity is lost.
- How **combination therapy** is composed — this is the crux. Two drugs' effects are
  not simply additive, and dose escalation within one drug is not linear either. Find
  the actual quantitative literature on combining antihypertensive classes and on
  within-class dose-response slope, and give the team a defensible composition rule
  with numbers and citations. If the team's "5 most efficient dosage combinations"
  step is to mean anything, it rests entirely on this rule.
- Numerical method, time step, and stability notes; the simulated time horizon(s) —
  including how a short acute simulation and a long-horizon prognosis (problem 12
  asks for a 5-year outlook) can share one engine, and what the long horizon must
  approximate rather than integrate.
- Inter-individual variability: how to sample a virtual population from the parameter
  distributions, how many virtual subjects are worth running, and what the output
  distribution should look like.
- The concrete Cloudflare execution plan: what lives in a Durable Object, what runs in
  a Worker, what (if anything) needs the Sandbox SDK, where the state is stored, how a
  run is streamed to the UI as it progresses, and measured/estimated CPU cost per run
  against the documented limits. Include what to do when a run exceeds a single
  invocation's budget.
- A short pseudocode listing of the core loop.

### `research/04-ORGAN-EFFECT-MAP.md`
The animation layer's source of truth, and the file that makes the demo memorable.
For each organ and tissue the UI will render, specify: which modeled substances act
on it, through which receptor/transporter/enzyme, in which direction, over what
timescale, how strongly at a given dose, and — critically — **what visual variable
should encode it** and over what numeric range. The coding agent must be able to bind
a simulation output directly to a visual property without inventing a mapping.

Push down to tissue and, where the evidence supports it, cell-type level: name the
specific cell populations involved, since the team wants the animation to be
scientifically defensible rather than decorative. Where cell-level detail would be
fabrication, say so and stop at tissue level.

Include the visible adverse/side-effect channels too — the ones a viewer will
recognize — since a simulation that only shows benefit is not convincing.

### `research/05-OUTPUT-REPORT-SPEC.md`
What the product concludes at the end of a run, and how it computes it. The team's
stated goal: after simulation, know the element's best use case, best dose, and best
formulation type. Specify the scoring/objective function that produces those claims,
with its efficacy and safety terms and their weights, and how uncertainty is reported.
Design it so the output is a defensible ranked recommendation with reasons, not a
single unexplained number. Include the exact wording of the "this is a simulation, not
medical advice" disclaimer.

### `research/06-VALIDATION.md`
The sanity-check suite. A table of published, cited real-world results — expected
blood-pressure reduction per drug at standard dose, expected time to peak
concentration, expected effect of a known contraindicated pairing, expected
comorbidity-driven differences — each with the numeric value, the source, and an
acceptance tolerance. The coding agent turns these into tests. If the engine cannot
reproduce these within tolerance, it is wrong, and the team needs to know before the
judges do.

Also list the known failure modes of the model: inputs for which it will produce
nonsense, and what the UI should do at those boundaries.

### `research/07-PRIOR-ART.md`
Short. What already exists in this space (open-source PK/PD and PBPK tooling, existing
digital-twin platforms, commercial simulation vendors), what is reusable under what
license, and — for the pitch — the honest differentiation: what this product does that
those do not, framed for Uzbekistan's health system and the two problem statements.
Include any Uzbekistan- or Central Asia-specific angle worth citing (local
pharmaceutical manufacturing, referent pricing, access to specialists, regulatory
posture on clinical trials) if you can source it; skip it rather than invent it.

---

## 3. How to work

- **Verify, don't recall.** Pharmacological values, guideline thresholds, API
  endpoints, and Cloudflare platform limits all change. Fetch the current source. Note
  the date you retrieved it. Where a guideline was recently updated, cite the current
  version and note what changed if it affects the model.
- **Prefer primary and regulatory sources** (regulatory product labeling, guideline
  documents, peer-reviewed pharmacokinetic studies) over secondary summaries and
  tertiary web content. Where you must use a secondary source, say so.
- **Run the commands you publish.** Any `curl` in `01-DATA-ACQUISITION.md` that you
  did not execute is a liability, not a deliverable.
- **Timebox.** Roughly: a third of your effort on data acquisition and populating the
  data files, a third on the simulation and virtual-human specs, the remainder on the
  organ map, report spec, and validation. If time runs short, ship files 1–4 complete
  rather than all files half-done.
- **Flag uncertainty loudly and specifically.** "Unclear whether X" is useful. Confident
  wrong numbers in a medical simulator are the worst possible failure, both
  scientifically and in front of judges who may be clinicians. Assume at least one
  judge can check your pharmacology.
- **Write for a vibecoder.** The consumer of these files is an AI coding agent driven
  by one person under time pressure. Concrete schemas, concrete numbers, concrete
  equations, concrete file paths. No "consider exploring". Decide, and say why.

## 4. Final message

End with: which files are complete vs. partial; the five things you are least
confident about; anything in §1.3 that turned out to be materially wrong; and the
three highest-value follow-up questions that, if the team answered them, would most
improve the build. Keep it under one page.
