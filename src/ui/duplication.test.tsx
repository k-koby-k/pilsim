/**
 * Guards against ONE recurring defect: the same thing rendered twice.
 *
 * Roughly a dozen agents built this interface, each owning a slice, and each could
 * add a heading, a caption or a tab strip that a neighbouring component already
 * drew. Four instances shipped before anyone noticed — a scene tab strip inside
 * another scene tab strip, a disclaimer at both top and foot, an anatomy figure
 * mirrored in the rail and the centre column, and a zone heading repeating the
 * panel heading directly beneath it. Nothing about the type system or the unit
 * tests could see any of them, because each half was locally correct.
 *
 * So the check is mechanical and lives at the render boundary: put a page (or a
 * composite panel) through the server renderer and assert the same words do not
 * come out twice.
 *
 * WHAT THIS CAN AND CANNOT SEE. `renderToString` gets each page in its INITIAL
 * state, so anything behind a click — an open disclosure, the subject editor, the
 * Simulation page's post-run zones — is out of reach here. The panel-level cases
 * below exist to cover the composite views the page test cannot reach.
 */

import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import fs from 'node:fs'

function installStorage() {
  const store = new Map<string, string>([
    ['pilsim.substances.workingset.v1', JSON.stringify(['lisinopril', 'losartan', 'amlodipine'])],
  ])
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
    clear: () => store.clear(),
  }
  const read = (f: string) => JSON.parse(fs.readFileSync(`data/${f}.json`, 'utf8'))
  ;(globalThis as any).fetch = async (u: string) => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => read(String(u).split('/').pop()!.replace('.json', '')),
  })
}

/**
 * Quick-jump lists and the completeness strip deliberately restate the names of
 * the groups they point at — that is what an index IS, and both are named
 * patterns in research/10-LAYOUT-BLUEPRINT.md §7. They are dropped before
 * counting so the check stays pointed at headings that claim to introduce
 * content rather than to navigate to it.
 */
function strip(html: string): string {
  return html
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/g, '')
    .replace(/<div class="completeness[^"]*"[\s\S]*?<\/div><\/div>/g, '')
}

/** Every heading a reader would take as introducing a block of content. */
function headings(html: string): string[] {
  const clean = strip(html)
  const out: string[] = []
  for (const m of clean.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/g)) out.push(text(m[2]))
  for (const m of clean.matchAll(
    /<[a-z]+ class="[^"]*\b(?:card-title|pill-focus-title)\b[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/g,
  )) {
    out.push(text(m[1]))
  }
  return out.filter(Boolean)
}

function text(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function repeated(values: string[]): string[] {
  const seen = new Map<string, number>()
  for (const v of values) seen.set(v.toLowerCase(), (seen.get(v.toLowerCase()) ?? 0) + 1)
  return [...seen.entries()].filter(([, n]) => n > 1).map(([v, n]) => `${v} ×${n}`)
}

const PAGES = [
  ['Home', () => import('./shell/HomePage').then((m) => m.HomePage)],
  ['Substances', () => import('./substances/SubstancesPage').then((m) => m.SubstancesPage)],
  ['Pills', () => import('./pills/PillsPage').then((m) => m.PillsPage)],
  ['Subject', () => import('./subject/SubjectPage').then((m) => m.SubjectPage)],
  ['Simulation', () => import('./simulation/SimulationPage').then((m) => m.SimulationPage)],
] as const

describe('no page renders the same heading twice', () => {
  for (const [name, load] of PAGES) {
    it(String(name), async () => {
      installStorage()
      const Page = (await load()) as any
      const { StaticDataProvider } = await import('../data/DataProvider')
      const { loadPilSimData } = await import('../data/load')
      const data = await loadPilSimData('/data')
      const html = renderToString(
        <StaticDataProvider data={data}>
          <Page onNavigate={() => {}} />
        </StaticDataProvider>,
      )
      expect(repeated(headings(html))).toEqual([])
    })
  }
})

describe('the anatomy panel hosts exactly one of each instrument', () => {
  it('one scene selector, not two', async () => {
    const { ScenePanel } = await import('./simulation/ScenePanel')
    const { loadSceneBinding } = await import('./simulation/scenes')
    const binding = await loadSceneBinding()
    expect(binding.scenes.length).toBeGreaterThan(0)

    const html = renderToString(
      <ScenePanel
        binding={binding}
        sceneId={null}
        onScene={() => {}}
        frame={null}
        history={[]}
        caption="Test regimen"
        substanceIds={['amlodipine']}
        live={false}
      />,
    )

    // <OrganScene> ships its own tab strip and defaults it ON. ScenePanel draws
    // the page's selector, so it must pass showSelector={false}; when it did not,
    // this rendered two tablists, both labelled "Scene", one inside the other.
    expect(html.match(/role="tablist"/g) ?? []).toHaveLength(1)

    // The scene's one-line blurb was likewise printed by the host AND by the
    // figure's own figcaption — the host's copy untranslated into the bargain.
    const blurbs = [...html.matchAll(/<p class="[^"]*scene-blurb[^"]*">([\s\S]*?)<\/p>/g)].map((m) =>
      text(m[1]),
    )
    expect(blurbs).toHaveLength(1)
    expect(repeated(blurbs)).toEqual([])
  })
})

describe('one clock, translated', () => {
  it('the figure does not print a hardcoded English clock', async () => {
    const { OrganFigure } = await import('./organs')
    const { baselineFrame } = await import('./organs/channels')
    const { setLang } = await import('../i18n')

    const frame = baselineFrame({ t_h: 6, conc: { amlodipine: 4.2 } })
    try {
      setLang('ru')
      const html = renderToString(<OrganFigure frame={frame} variant="figure" />)
      // `organ.scene.clockStatus` is the single implementation, shared with the
      // scene view. A literal template here would leave this English in Russian.
      expect(html).not.toContain('since first dose')
      expect(html).toContain('с первой дозы')
    } finally {
      setLang('en')
    }
  })
})
