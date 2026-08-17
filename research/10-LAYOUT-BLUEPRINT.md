# Layout Blueprint

Written by the lead after the product owner's critique: *"everything is so messed up.
They come up anywhere on the screen — important or unimportant, they just come up.
It's not organised at all. There is no blueprint or template. Data is just popping up
everywhere and making users confused."*

He is right, and the cause is structural rather than aesthetic. Eight agents each
decided where their own output belonged, and no document said otherwise. Every panel
is individually defensible and the whole is incoherent.

**This file is now the authority. A component does not choose where it appears; this
document does.** If something needs a home that is not described here, the answer is
to amend this file first, not to place it somewhere plausible.

---

## 1. The frame — never changes, on any page

```
┌──────────┬────────────────────────────────────┬──────────────┐
│          │                                    │              │
│   NAV    │           CENTRE                   │    RAIL      │
│  (fixed) │        (one column, scrolls)       │  (sticky)    │
│          │                                    │              │
└──────────┴────────────────────────────────────┴──────────────┘
     248px            max 940px                    360–420px
```

- **Nav** — where you are and where you can go. Nothing else, ever.
- **Centre** — the work. One column. Cards stack one per row, never side by side.
- **Rail** — the body. It is the product's signature and stays visible while the
  centre scrolls.

The user learns this once and it holds everywhere. Below 1100px of viewport the rail
moves beneath the centre column rather than compressing.

---

## 2. The four zones of the centre column

Every page's centre column is these four zones, in this order, always. A card belongs
to exactly one zone. If you cannot name a card's zone, it does not belong on the page.

| Zone | Purpose | Rule |
|---|---|---|
| **1. Act** | The thing the user came to do. | Always at the top. Always contains the primary action. Fits on one screen without scrolling. |
| **2. Answer** | What the product concluded. | Appears only after the action has been taken. First thing visible after acting. |
| **3. Evidence** | Why it concluded that. | Below the answer. Always available, never above it. |
| **4. Detail** | Everything else. | Collapsed by default. Opened deliberately. |

**The ordering rule that fixes the complaint:** a user scrolling down moves from *what
they did* → *what they got* → *why* → *the fine print*. Nothing from zone 3 or 4 may
appear above zone 2. Nothing may appear before the user has acted except zone 1.

---

## 3. Per page

### Simulation
- **Act** — pick pills (checkboxes), pick patient, Run. That is the whole screen
  before a run. Nothing else.
- **Answer** — the recommended regimen and its dose; the treatment plan; the top 5
  alternatives evaluated for this patient.
- **Evidence** — charts, target engagement, the ranking with its reasons, the AI
  explanation, the fired rules with citations.
- **Detail** — run settings, scoring weights, validation notes, raw parameters.

### Substances
- **Act** — search the catalogue; the shelf of what you are working from.
- **Answer** — the opened substance: identity, class, plain description, key parameters.
- **Evidence** — provenance for each value; the sourcing ledger.
- **Detail** — the full parameter table, registry identifiers, source quotes.

### Pills
- **Act** — the library, and composing a new one.
- **Answer** — the composition and its safety verdict.
- **Evidence** — the fired rules with mechanisms and citations.
- **Detail** — excipients, deferred rules, engine output.

### Test subjects
- **Act** — the library of patients; add or edit one.
- **Answer** — the derived twin: the headline physiology this patient implies.
- **Evidence** — which comorbidity moved which variable, and by how much.
- **Detail** — the full 51-variable state, the derivation audit trail.

---

## 4. What the rail shows

The rail always shows the body, and what it shows follows the centre column's subject:

| Page | Rail content |
|---|---|
| Substances | Where the selected substance acts |
| Pills | Where the composed pill's actives act |
| Subjects | The selected patient's twin |
| Simulation, before a run | Where the ticked pills act |
| Simulation, during and after | The live scene, driven by the frame stream |

**The rail is a headline result, not a decoration.** It gets real width — 360 to 420px,
not a strip — and the figure scales to fill it. On the simulation page the scene view
continues in the centre column's Evidence zone at full width, because a reader who
scrolls to study the organs wants them large.

---

## 5. Rules that apply everywhere

1. **One primary action per screen.** It is visually the strongest thing in zone 1.
   Everything else is secondary or quieter.
2. **Nothing appears before it is meaningful.** No empty panels, no "run a simulation
   to see this" placeholders sitting in the layout. If there is no result, the zone
   is absent, not empty.
3. **Colour means severity or drug identity. Never decoration.** A calm screen means
   nothing is wrong; that has to stay true to be useful.
4. **Numbers are mono and right-aligned** so columns compare at a glance.
5. **Provenance is quiet by default.** Present on every value, never shouting.
6. **Prose is capped at `--measure`.** Long lines do not run the full width.
7. **Spacing comes from the four gap steps.** Choose by naming the relationship, never
   by eye. The steps are documented at the top of `styles.css`.
8. **A card carries one idea.** Two ideas means two cards, stacked.

---

## 6. How to use this

When adding anything to the interface, answer in order:

1. Which page?
2. Which zone — Act, Answer, Evidence, or Detail?
3. Is there already a card in that zone this belongs inside?
4. Does it need to exist before the user has acted? If not, it must not render then.

If a change cannot answer all four, it is not ready to build.

---

## 7. Patterns taken from TeNa

The product owner pointed at his own earlier project, https://tena-uz.pages.dev, as
the standard to meet. I read its bundle rather than guessing. Six patterns it has and
PilSim does not, each of which is a direct instruction:

**1. Fields live in NAMED GROUPS, never in a flat wall.** TeNa groups inputs under
headings that name an idea: *Site facts*, *Collateral & guarantor*, *Capital structure
& use of funds*, *Operating economics*. Every field belongs to a named concept. PilSim
currently presents rows of inputs with no grouping concept above them.

**2. Every group says WHY it is being asked.** *"The bank asks for the items
themselves, not only percentages."* *"Each asset valued separately by an independent
appraiser."* This is the single biggest difference. PilSim asks for serum creatinine
and says nothing about what it is for. Every input group must carry one plain line
explaining what the product does with it — for creatinine, that it sets kidney
function, which decides whether a drug is dosed down or avoided.

**3. Empty states state the CONSEQUENCE, not the absence.** *"No items yet — optional,
but strengthens the application."* *"No collateral pledged — the loan will be assessed
as unsecured."* Never "nothing here". Always what follows from it. For PilSim: "No
comorbidities — the twin will be a healthy adult of this age and weight."

**4. Completeness is explicit.** *"Profile complete" / "Profile incomplete"*, *"Step 1
of 4"*. The user always knows what is done and what remains.

**5. Forward motion is always visible.** *"Continue to…"*, *"Back to…"*, and a *"Quick
jump"* within long content. The user never has to hunt the sidebar to proceed.

**6. Four semantic colour names, used consistently** — navy, petrol, emerald, line.
Not a palette of twenty. PilSim's tokens are already close to this; the discipline to
copy is the small number.

### The correction this forced on me

TeNa **is** a four-step wizard, and it works. So the wizard I built and the owner
rejected was not wrong in form — it was wrong in PLACE. A wizard suits DATA ENTRY,
where order genuinely matters and each step gates the next. It does not suit a RESULTS
page, where it put the answer before the question and made the page long.

The rule that follows: **wizard for input, zones for output.** Building a patient or
composing a pill may be stepped. Running a simulation and reading its results must be
Act → Answer → Evidence → Detail, as in §2.
