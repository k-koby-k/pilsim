# PilSim — Shared Context for All Research Agents

**Read `/home/acyu/code/startups/pilsim/RESEARCH_PROMPT.md` in full before starting.**
That file is the mission brief: product vision, hackathon problems 12 and 14, the
wireframes, the team's draft scope, constraints, and working rules. This file records
the decisions already locked by the lead so that parallel agents do not diverge.

## Locked decision 1 — the 5 modeled drugs

Do not substitute. If you find a strong reason one of these is a bad choice, note it
in your output as a flagged concern; do not swap it.

| # | Drug | Class | Why it is in the set |
|---|------|-------|----------------------|
| 1 | **Lisinopril** | ACE inhibitor | Renally cleared, no CYP metabolism (simplest PK baseline). Pregnancy = absolute contraindication (reject case). Renal-protective in diabetes/CKD (positive/compelling-indication case). Hyperkalemia + cough as visible adverse channels. |
| 2 | **Losartan** | ARB (AT1 blocker) | CYP2C9/3A4 conversion to a more potent active metabolite — gives the liver a real role in the animation and a pharmacogenomic personalization hook. Pregnancy contraindication. Notably *lowers* serum urate, which directly contrasts with hydrochlorothiazide. |
| 3 | **Amlodipine** | Dihydropyridine CCB | CYP3A4 substrate. Very long half-life, so the concentration-time animation looks completely different from the others. Peripheral edema is a visually obvious adverse effect. Acts on vascular smooth muscle — a different organ target from the RAAS drugs. |
| 4 | **Hydrochlorothiazide** | Thiazide diuretic | Distal convoluted tubule target — makes the kidney animation meaningful. Raises serum urate (gout reject case). Hypokalemia / hyponatremia adverse channels. Efficacy falls at reduced kidney function — a dose-modifier case. Acts through plasma volume, a different mechanism axis. |
| 5 | **Metoprolol** | β1-selective blocker | CYP2D6 polymorphism (poor / intermediate / extensive / ultrarapid metabolizers) — the strongest personalization story in the set, directly serving problem 12's "genetics" requirement. Asthma/COPD caution-to-contraindication (reject case). Heart rate and contractility give the heart animation its motion. |

**Coverage this set buys us:** RAAS blockade (two different points in the cascade),
arteriolar vasodilation, renal volume handling, and cardiac chronotropy/inotropy — four
mechanistically distinct paths to the same endpoint. Three different CYP enzymes.
Four hard safety-reject cases (pregnancy ×2, gout, asthma) plus at least one
drug–drug reject (dual RAAS blockade: lisinopril + losartan together).

Real-world fixed-dose combination products exist for lisinopril/HCTZ and
losartan/HCTZ — use these as the reference for the "a pill is composed of multiple
substances" model rather than inventing combinations.

## Locked decision 2 — excipients are in scope

The "Substances" page must contain excipients, not only active ingredients. Source
the *actual* excipient lists from the real product labeling for the five drugs.
Expect fillers, binders, disintegrants, lubricants, glidants, and coating agents.
Excipients matter to the product for three reasons: they are what makes a "pill"
a composition rather than a single molecule; some carry genuine patient-level
contraindications (lactose intolerance, dye sensitivity, sodium content); and they
determine which formulation types are feasible.

## Locked decision 3 — file ownership

Each agent owns specific output paths and writes **only** those. Do not edit another
agent's file; if you have a finding that belongs in someone else's file, put it in a
clearly-marked `## Cross-agent notes` section at the end of your own file.

All paths are relative to `/home/acyu/code/startups/pilsim/`.

| Agent | Owns |
|-------|------|
| A — Data acquisition | `research/01-DATA-ACQUISITION.md` |
| B — Substances & products | `data/substances.json`, `data/products.json`, `research/B-notes.md` |
| C — Safety rules & guidelines | `data/rules.json`, `research/C-notes.md` |
| D — Virtual human | `data/patient_model.json`, `research/02-VIRTUAL-HUMAN.md` |
| E — Simulation engine | `research/03-SIMULATION-SPEC.md`, `research/06-VALIDATION.md` |
| F — Organ map, report, prior art | `research/04-ORGAN-EFFECT-MAP.md`, `research/05-OUTPUT-REPORT-SPEC.md`, `research/07-PRIOR-ART.md` |

The lead writes `research/00-DECISIONS.md` after all agents report.

## Locked decision 4 — provenance is mandatory

Every numeric value you publish carries either a citation (URL + source name + the
value as that source states it + retrieval date) or the literal marker `ESTIMATED`
with a one-line justification. In JSON, use a per-field or per-record provenance
structure — pick a consistent shape and document it at the top of your file.

A number with no provenance marker is a defect and will be treated as one. A
fabricated citation is worse than an admitted estimate. If you cannot find a value,
say `NOT_FOUND` and move on — the team can fill gaps, but only if it knows where the
gaps are.

## Locked decision 5 — verify, do not recall

Drug data, clinical guideline thresholds, API endpoints, and Cloudflare platform
limits all change. Fetch the live source. Record the date. Where a guideline or a
standard equation has been revised in recent years, cite the current version and note
what changed if it affects the model. Assume a clinician may audit your output.

## Reporting back

Your final message to the lead is a **compressed report**, not a file dump. Include:
what you wrote and whether it is complete or partial; your top findings that change
other agents' work; the values you are least confident in; anything in the team's
draft scope (section 1.3 of the mission brief) that your area proves wrong; and any
blocker you hit. Keep it short — the lead is aggregating six of these.
