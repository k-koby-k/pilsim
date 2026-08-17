# PilSim

**Test a blood-pressure regimen on a virtual patient before prescribing it.**

A doctor describes a patient — age, weight, blood pressure, kidney function,
comorbidities, CYP2D6 genotype — and PilSim builds a digital twin of them. Candidate
regimens are simulated against that twin, and the product returns a treatment plan:
what to start, at what dose, how to titrate, what to monitor and when, what to avoid
and why, and a five-year projection of blood-pressure control.

Built for the Umummilliy AI Xakaton, Qashqadaryo 2026, against problems **12** (digital
twin for chronic patients) and **14** (accelerating drug development).

**Live: https://pilsim.vercel.app** · English · Oʻzbekcha · Русский

---

## Why this problem

Uzbekistan's adult hypertension prevalence is **45.7%**. **43.5%** are treated. Only
**16.5%** are controlled — and **11.3%** among men, against a global control rate of
20.8% (WHO Global Health Observatory).

The gap is not diagnosis, and it is not drug supply. Six in ten treated patients never
reach target. That makes it a problem of **regimen selection and titration**, which is
what this tool does.

---

## What makes it defensible

**The combination rule is derived, not asserted.** It reproduces Law 2003 monotherapy
to ±0.2 mmHg across every cell, Wald 2009's cross-class additivity at 0.969 against a
published 1.01, and ONTARGET's dual-RAAS result at +2.57/1.80 mmHg against an observed
2.4/1.4 — with no fudge factor between the three.

Two clinically correct answers therefore *emerge* rather than being coded in:

- **Dual RAAS blockade ranks last** of 192 enumerated candidates. Nothing in the code
  says it is bad.
- **Half-doses of two drugs beat a double dose of one**, 13.8 against 9.9 mmHg.

**Every number carries its provenance.** A citation with the source's own wording, or
an explicit `ESTIMATED` marker with its justification, or `NOT_FOUND`. Lisinopril has
two NOT_FOUND values among its ten headline parameters, and the interface shows those
blanks rather than filling them.

**The product tells you when it disagrees with itself.** The ranker prefers amlodipine
10 mg; the titration logic says hold at 5 mg. Both are defensible, they charge the same
harm for the step, and they differ only in what a mmHg is worth against a percentage
point of oedema — 6.9 versus 1, neither of which is a sourced number. The product shows
both and declines to resolve it, because that is a prescriber's judgement.

**It refuses rather than guesses.** Formulations that do not exist are shown and
disabled. Where the data cannot support a ranking, it says so. And on the widely
publicised claim that taking antihypertensives at bedtime prevents cardiovascular
events, it states plainly that the evidence does not support this — the TIME trial
(n=21,104) found no difference, and the trial claiming a large benefit carries two
Expressions of Concern.

---

## Architecture

The simulation engine runs **in the browser**, in a Web Worker. The app is fully
static — no server, nothing to keep alive, and it deploys free to any static host.

```
Web app (static)          Cloudflare Worker (optional)
├── engine/   PK/PD + ODE  └── thin proxy → Workers AI / Gemini
├── rules/    48 rules
├── report/   plan, scoring, dose timing
└── ui/       three-zone layout + animated anatomy
```

**The engine**: analytic Bateman absorption with an effect compartment, feeding a
six-state cardiovascular ODE with baroreflex, RAAS and pressure-natriuresis. RK4 at
one-minute steps. Losartan is modelled as two species because its metabolite carries
most of the effect; lisinopril needs an effect compartment because its onset precedes
its plasma peak.

**The AI explains and suggests; the engine decides.** Every number the model emits is
checked against the numbers it was given, and anything unsupported is stripped or
flagged. Suggestions return an id from a supplied catalogue, never a free-text dose.

---

## Running it

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # 502 tests
pnpm build
```

Optional AI layer:

```bash
cd worker && npm install && npx wrangler deploy
```

Then paste the Worker URL into Settings. The app is fully usable without it.

See `DEPLOY.md` for hosting, and `research/` for the full evidence trail — data
acquisition with verified endpoints, the virtual human, the simulation spec, the
validation suite, and the layout blueprint.

---

## Scope, stated plainly

PilSim models **five antihypertensives** — lisinopril, losartan, amlodipine,
hydrochlorothiazide and metoprolol — and the comorbidities that change how they are
used. Anything outside that set is not simulated, and the product says so rather than
answering from general knowledge.

**This is a research simulator. It is not medical advice and not a validated medical
device.** The five-year output is a projection of blood-pressure control and
organ-relevant markers — never a prediction of strokes, infarctions or deaths.
