# PilSim — Build Brief

You are a coding agent building PilSim for a hackathon demo. One developer, roughly a
day, Cloudflare-only runtime.

**The research is already done.** Six agents produced the specs and data files listed
below. Your job is to implement them, not to re-derive them. Do not go looking for
pharmacology on the web — every number you need is already in the repo with a citation
attached, and anything not there was deliberately left out.

---

## 0. Read these first, in this order

1. `research/00-DECISIONS.md` — start here. The pitch, the architecture decision, what
   is deliberately not modeled, the resolved cross-agent conflicts, and seven structural
   findings that are each a bug that would look entirely plausible on screen.
2. `research/03-SIMULATION-SPEC.md` — the engine, written to be implemented without
   further research. Full ODE with constants, the combination rule, the Cloudflare
   execution plan, and core-loop pseudocode.
3. `research/04-ORGAN-EFFECT-MAP.md` §2 — the `EffectFrame` interface. This is the
   contract between engine and UI. Conform to it exactly; both sides were written
   against it.
4. `research/05-OUTPUT-REPORT-SPEC.md` — what the product concludes and how it scores.
5. `research/06-VALIDATION.md` — 128 graded tests. These become your test suite.
6. `research/08-EXTERNAL-RECONCILIATION.md` — two independent external research runs
   reconciled against the agents. Carries four CI-bounded calibration anchors from a
   2025 *Lancet* meta-analysis (484 trials, 104,176 participants) that must pass as
   blocker-grade tests, and a list of numbers the external runs got wrong that you must
   not "correct" the data files toward.
7. `research/09-EXECUTION-TARGET-AMENDMENT.md` — where the code actually runs.

Data files: `data/substances_part1.json`, `data/substances_part2.json` (merge on the
`substances` key — same schema), `data/products.json`, `data/rules.json`,
`data/patient_model.json`.

Supporting: `research/01-DATA-ACQUISITION.md`, `research/02-VIRTUAL-HUMAN.md`,
`research/07-PRIOR-ART.md`, and the notes files.

---

## 1. Execution target — read this before the simulation spec

**The engine runs in the browser, in a Web Worker. There is no backend.**

`research/09-EXECUTION-TARGET-AMENDMENT.md` amends the Cloudflare execution section of
`03-SIMULATION-SPEC.md`. Read the amendment first; it supersedes that one section only.
Everything else in the simulation spec — model, equations, combination rule, numerics,
constants — is unchanged and authoritative.

Why: a single run costs 30–120 ms of CPU, and the Cloudflare Workers free plan allows
10 ms. But that ceiling is a Workers limit and does not exist on the user's own machine.
The engine was specified as ~400 lines of pure TypeScript with no Cloudflare dependency
precisely so it could move.

Practical consequences for you:

- Host on **Cloudflare Pages** (free tier). Static only.
- The engine lives in a **Web Worker**; stream `EffectFrame` objects to the main thread
  with `postMessage`. The `EffectFrame` interface in `04-ORGAN-EFFECT-MAP.md` §2 is
  unchanged — only its transport differs.
- **Do not build** the Durable Object, the alarm-based chunked continuation, or the
  WebSocket Hibernation streaming described in the simulation spec. Those are the paid
  path, kept for later.
- Mark the Cloudflare-specific tests in `06-VALIDATION.md` as skipped rather than
  deleting them. Every other test is unaffected, because they test the model rather
  than its host.
- No CPU budget to manage means you can run a larger virtual population than the
  original spec allowed. Take advantage of it.

---

## 2. What to build

A web application with the sidebar layout the team sketched: **Substances**, **Pills**,
**Test Subjects**, and a simulation view.

**Substances** — search, pick a substance, its properties load into an editable table,
override any value, add it. The data is already in the substance files; the
provenance wrapper on every value is not decoration, so surface it. A researcher
seeing which numbers are cited and which are estimated is a feature, not clutter.

**Pills** — compose a pill from multiple substances with amounts. Composition must be
checked against `data/rules.json` for incompatibilities, blockers, and interactions.
Real fixed-dose combination products are already in `products.json` — seed from those
rather than starting empty.

**Test subjects** — a human figure with an editable parameter panel. The state vector,
its derivation pipeline, and the comorbidity presets are all in `patient_model.json`.
Adding an illness must actually shift state variables, not just attach a label.

**Simulation** — run a pill against a subject, stream results as they compute, animate
per-organ effects bound to the `EffectFrame` fields, and produce the end-of-run report
per `05-OUTPUT-REPORT-SPEC.md`.

---

## 3. Rules that are not negotiable

These come from the research and each one is load-bearing. Violating any of them
produces output that looks plausible and is wrong.

1. **Losartan is two species.** Model parent and EXP3174 separately; the metabolite
   carries 60–85% of the effect. Plot EXP3174, never the parent — the parent's
   peak-to-trough ratio is ~2000 against amlodipine's 1.30, so a shared axis is unusable.
2. **Use an effect compartment.** Lisinopril's effect onset precedes its plasma peak; a
   direct-effect model cannot reproduce that ordering.
3. **Use the derived volumes of distribution**, not the ones printed on the losartan
   label — those are steady-state values inconsistent with the same label's clearance.
   The spec explains why; keep that explanation in a code comment.
4. **Efficacy must saturate with dose.** If the dose-response is linear the optimizer
   always picks the maximum and the headline "best dose" output is trivially wrong.
   There is a validation test that fails a linear implementation.
5. **Default to steady-state initial conditions.** Amlodipine needs 7–8 days to reach
   steady state; a truncated run biases the combination ranking against it. Day-1
   versus day-8 is an explicit labelled toggle and a demo asset.
6. **Drive hydrochlorothiazide from dose, not plasma concentration.** Its action is
   tubular; no plasma concentration-effect relationship exists.
7. **Class pairs are asymmetric.** ACE inhibitor plus thiazide is additive;
   beta-blocker plus thiazide is less than additive. Use the class-pair matrix.
8. **Never feed an in-vitro binding constant into the clinical effect model.** This is
   the single most likely error a clinician judge would catch. Effect parameters come
   from clinical dose-response data only.
9. **The safety engine recommends as well as rejects.** There are five positive rules
   alongside the thirty negative ones. A product that only says no cannot produce the
   "best use case" output it promises.

---

## 4. Honesty requirements in the UI

The research was built to survive a clinician judge. Do not undo that in the interface.

- The five-year output is a **projection of blood-pressure control and organ-relevant
  markers**, never a prediction of strokes, infarctions or deaths.
- **Do not name cell populations** except for NCC/`SLC12A3` in distal convoluted tubule
  cells — it is the only target with single-cell evidence. Everything else stops at
  tissue level, and the research file explains why.
- **Where the product refuses to rank, show the refusal and its reason.** Formulation
  ranking is unavailable for three of five drugs because the data does not exist. A
  sourced refusal is a better product behavior than an invented ranking, and it is more
  impressive to a knowledgeable judge.
- **Proxy-tier `EffectFrame` fields must never render with absolute units.** The
  provenance tier exists to make that impossible; respect it.
- Carry the "simulation, not medical advice" disclaimer in the exact wording from
  `05-OUTPUT-REPORT-SPEC.md`.
- **Expose the scoring weights as sliders.** They are estimates; the ordering is
  defensible but the values are not. A judge who can move a slider and watch the
  ranking change will trust the model more than one asked to accept a constant.

---

## 5. Demo priorities

If you run short on time, these are what the demo actually needs, in order:

1. **The combination ranking**, showing that dual RAAS blockade ranks last and that
   half-doses of two drugs beat a double dose of one — and that nothing in the code
   says so. That emergence is the only genuinely novel claim in the product.
2. **The CYP2D6 metoprolol case.** A poor metabolizer crosses the 80.2 ng/mL
   selectivity threshold at a standard dose while a normal metabolizer does not, so
   genotype converts a usable drug into an unsafe one. It makes personalization causal
   and visible rather than a number in a table.
3. **The efficacy/harm asymmetry**, using amlodipine's own label: 5→10 mg buys 2.9 mmHg
   and 7.8 points of oedema. This is why the product recommends a best dose.
4. The organ animation with real per-organ divergence — each drug reaching the same
   blood pressure by a visibly different internal route.
5. Everything else.

---

## 6. How to work

Implement against `06-VALIDATION.md` from the start rather than at the end — the tests
carry numeric values, sources and tolerances, and they are graded blocker / major /
advisory. Get the blockers passing first.

Keep the citation strings from the data files intact through to the UI. They are the
product's credibility, they were verified live, and every label citation carries its
DailyMed setid so it survives a URL move.

When something in the data is marked ESTIMATED or NOT_FOUND, that is a deliberate,
audited state — not a gap for you to fill from memory. Surface it as uncertainty; do
not silently substitute a number.
