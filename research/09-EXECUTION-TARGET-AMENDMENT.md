# Amendment — Execution Target: Browser First

**This amends the Cloudflare execution plan in `03-SIMULATION-SPEC.md`. Everything else
in that file — the model, the equations, the combination rule, the numerics, the
constants — is unchanged and remains authoritative.**

Written by the lead 2026-08-17, after the team confirmed a paid Cloudflare plan is not
available.

---

## The problem this solves

Agent E measured a single acute simulation run at 30–120 ms of CPU. The Cloudflare
Workers **Free** plan allows 10 ms per invocation. The engine therefore cannot run on
the free plan at all, and Workers Paid was recorded as a hard prerequisite.

It is not, in fact, a prerequisite. It was an artifact of assuming the simulation must
run server-side.

## The fix

**Run the engine in the browser, inside a Web Worker.**

This works because Agent E deliberately specified the engine as roughly 400 lines of
pure TypeScript with no Cloudflare-specific dependency and no need for the Sandbox SDK.
The 10 ms ceiling is a Workers limit. It does not exist on the user's own machine.

A run that costs 30–120 ms of server CPU costs the same 30–120 ms on a laptop, where
nothing is metering it. The five-year projection is closed-form rather than integrated,
so there is no heavy tail hiding behind the acute run.

## What this changes

| Concern | Durable Object design | Browser Worker design |
|---|---|---|
| CPU budget | 10 ms free / 30 s paid, chunked | Unmetered |
| Chunked continuation via alarms | Required | **Deleted** |
| Streaming to UI | WebSocket Hibernation | `postMessage` per frame |
| Run state | SQLite in the DO | In-memory, plus `localStorage` if wanted |
| Virtual population size | Constrained by invocation budget | Constrained only by patience |
| Hosting | Workers Paid, $5/month | Cloudflare Pages free tier |
| Cost | $5/month | $0 |

**The two most complex pieces of the original execution plan — alarm-based chunked
continuation and WebSocket Hibernation streaming — are removed entirely, not
reimplemented.** That is a meaningful reduction in build risk on a one-day timeline,
independent of the cost question.

Streaming becomes: the worker posts an `EffectFrame` per simulated step interval, the
main thread renders it. Conform to the same `EffectFrame` interface defined in
`04-ORGAN-EFFECT-MAP.md` §2 — the contract between engine and UI is unchanged, only its
transport differs.

## What is given up

Be clear about this rather than discovering it later:

- **No server-side run persistence.** A run exists in the tab that created it.
- **No sharing a run by URL.** Nobody can send a colleague a link to a completed
  simulation.
- **No multi-user or collaborative session.**
- **Cold-start cost moves to the client** — the data files must reach the browser. The
  merged `substances.json` and its siblings total a few hundred kilobytes of JSON; gzip
  them and it is unremarkable. If it matters, strip the provenance blocks into a
  separate lazily-loaded file, since the simulation needs the values and only the
  inspector UI needs the citations.

None of the first three appear in a hackathon demo. All three are straightforward to
add later by moving the same engine into a Durable Object, which is the point of having
kept it dependency-free.

## Recommended stack

- **Cloudflare Pages** (free) for static hosting — keeps the team's existing tooling,
  wrangler workflow, and the Cloudflare skills already installed.
- **Web Worker** for the engine. One worker, `postMessage` in, `EffectFrame` stream out.
- **No backend at all** for the demo path.

Alternatives considered and rejected: Vercel and Netlify free tiers both work but add a
server hop that buys nothing once the engine runs client-side. Fly.io no longer has a
real free tier, only trial credits. Deno Deploy would work but means abandoning the
team's Cloudflare tooling for no gain.

## Migration path back to the server

If persistence or sharing is wanted after the hackathon, the engine moves into the
`SimulationRun` Durable Object exactly as `03-SIMULATION-SPEC.md` originally specified,
because it was written to be portable. The chunked-continuation and hibernation designs
in that file remain correct and should be followed at that point. Treat that section as
"the paid path", not as dead text.

## Consequence for validation

`06-VALIDATION.md` contains Cloudflare-specific tests asserting behaviour against
documented CPU and duration limits. Those tests are **not applicable** to the browser
target and should be marked skipped rather than deleted — they become live again on the
migration path above. Every other test in that file is unaffected, because they test the
model rather than its host.
