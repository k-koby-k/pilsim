# Deploying PilSim

The app is a **fully static site**. The simulation engine runs in the browser in a Web
Worker, so there is no server to pay for and no backend to keep alive. `pnpm build`
produces a `dist/` directory of about 2 MB — HTML, hashed JS/CSS bundles, and the four
JSON datasets — and any static host will serve it.

The AI layer is **optional and separate**. The app is fully usable without it; the AI
panel simply reports that no provider is configured. See §5.

---

## 1. Which host

All of these have a genuine free tier that fits this project.

| Host | Command | Notes |
|---|---|---|
| **Cloudflare Pages** | `npx wrangler pages deploy dist` | Recommended. Same account as the AI Worker, so one dashboard. |
| **Vercel** | `npx vercel --prod` | `vercel.json` is committed; it will detect Vite. |
| **Netlify** | `npx netlify deploy --prod --dir=dist` | `netlify.toml` is committed. |
| **GitHub Pages** | see §4 | Free, but needs a git repo and a base path. |

**Fly.io is not recommended.** It no longer has a meaningful free tier — only trial
credits — and it is designed for long-running containers, which is the opposite of what
this is. Paying for a VM to serve static files would be a waste.

Any of the first three take about a minute. Pick whichever account you already have.

---

## 2. Cloudflare Pages

```bash
pnpm build
npx wrangler pages deploy dist --project-name pilsim
```

First run creates the project and prints a `https://pilsim.pages.dev` URL. Subsequent
runs update it. This is the recommendation if you are also deploying the AI Worker,
because both then live in one account.

## 3. Vercel or Netlify

```bash
pnpm build

npx vercel --prod          # Vercel
# or
npx netlify deploy --prod --dir=dist    # Netlify
```

Both config files are already committed, including the single-page-app fallback and
cache headers — hashed asset bundles are marked immutable, the datasets are not, so a
data correction reaches users without a rebuild of everything.

## 4. GitHub Pages

Pages serves from a sub-path (`https://<user>.github.io/<repo>/`), which needs a build
base. The data loader already derives its path from `import.meta.env.BASE_URL`, so this
works with no code change:

```bash
git init && git add -A && git commit -m "PilSim"   # not currently a git repo
gh repo create pilsim --public --source=. --push

pnpm build --base=/pilsim/
npx gh-pages -d dist        # or push dist/ to a gh-pages branch
```

Then enable Pages in the repository settings. If you deploy to a root domain instead,
drop the `--base` flag.

---

## 5. The AI layer (optional)

The AI explanation panel needs a provider. The app works without one.

**Option A — Cloudflare Worker (recommended).** Keeps the API key server-side.

```bash
cd worker
npm install
npx wrangler login
npx wrangler deploy                        # prints the Worker URL
npx wrangler secret put GEMINI_API_KEY     # only if routing Gemini through the Worker
```

Paste the printed URL into **AI settings** inside the simulation view. It is stored in
`localStorage`. Or bake it in at build time:

```bash
VITE_AI_WORKER_ENDPOINT=https://pilsim-ai.<subdomain>.workers.dev pnpm build
```

The Worker is independent of where the static site is hosted — the site can live on
Vercel and still call a Cloudflare Worker. CORS is already handled.

**Option B — Gemini direct from the browser.** No deploy needed; paste an API key into
AI settings. Be aware that a key held in the browser is readable by anyone who opens
devtools. That is acceptable for a demo on your own machine with a throwaway key, and
not acceptable for anything real.

**Free-tier limits, verified 2026-08-17.** Workers AI gives 10,000 Neurons per day at no
charge, resetting at 00:00 UTC, with a 300 requests/minute rate limit on text
generation. At this app's prompt size that is roughly 40–50 explanations per day on the
default model, or several hundred on the fp8 variant. Enough for a demo; not enough to
leave a tab open all morning. The panel reports a 429 by name rather than failing
silently.

---

## 6. Before you demo

```bash
pnpm test          # 421 tests
pnpm build
```

Then check the deployed URL loads and the four datasets fetch — the app fails loudly
and names the missing file if they do not, so a blank screen is not a failure mode you
will have to guess at.

Worth clicking through: the pregnant patient, the gout patient, and the CYP2D6 poor
metaboliser. Between them they exercise every safety gate and the personalisation path.
