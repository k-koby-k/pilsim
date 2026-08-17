import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import fs from 'node:fs'

const STALE: Record<string, string> = {
  'pilsim.substances.user': '[{"id":"ghost","name":"Ghost"}]',
  'pilsim.substances.set': '["lisinopril","ghost","deleted-thing"]',
  'pilsim.pills.custom': '[{"id":"p1","name":"Old","components":[{"substanceId":"nope","amountMg":5}]}]',
  'pilsim.subjects': '[{"id":"s1","label":"Old subject"}]',
  'pilsim.lang': '"uz"',
  'pilsim.subject.selected': '"missing-subject"',
}

function installStorage(entries: Record<string, string>) {
  const store = new Map(Object.entries(entries))
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
    clear: () => store.clear(),
  }
  const read = (f: string) => JSON.parse(fs.readFileSync(`data/${f}.json`, 'utf8'))
  ;(globalThis as any).fetch = async (u: string) => ({
    ok: true, status: 200, statusText: 'OK',
    json: async () => read(String(u).split('/').pop()!.replace('.json', '')),
  })
}

// STORAGE INSTALLED BEFORE THE MODULES ARE IMPORTED — the stores hydrate at module
// load, so importing first is what made the previous attempt prove nothing.
const PAGES = [
  ['Home', () => import('@/ui/shell/HomePage').then((m) => m.HomePage)],
  ['Substances', () => import('@/ui/substances/SubstancesPage').then((m) => m.SubstancesPage)],
  ['Pills', () => import('@/ui/pills/PillsPage').then((m) => m.PillsPage)],
  ['Subject', () => import('@/ui/subject/SubjectPage').then((m) => m.SubjectPage)],
  ['Simulation', () => import('@/ui/simulation/SimulationPage').then((m) => m.SimulationPage)],
] as const

describe('pages survive stale localStorage installed BEFORE module load', () => {
  for (const [name, load] of PAGES) {
    it(String(name), async () => {
      installStorage(STALE)
      const Page = (await load()) as any
      const { StaticDataProvider } = await import('@/data/DataProvider')
      const { loadPilSimData } = await import('@/data/load')
      const d = await loadPilSimData('/data')
      expect(() =>
        renderToString(<StaticDataProvider data={d}><Page onNavigate={() => {}} /></StaticDataProvider>),
      ).not.toThrow()
    })
  }
})
