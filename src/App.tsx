import { useMemo, useState } from 'react'
import { Sidebar, type PageId } from './ui/shell/Sidebar'
import { HomePage } from './ui/shell/HomePage'
import { SubstancesPage } from './ui/substances/SubstancesPage'
import { PillsPage } from './ui/pills/PillsPage'
import { SubjectPage } from './ui/subject/SubjectPage'
import { SimulationPage } from './ui/simulation/SimulationPage'
import { DataProvider, useData } from './data/DataProvider'
import { ErrorBoundary } from './ErrorBoundary'
import { ChatAssistant } from './ui/chat'

/**
 * App shell and routing. Owned by the lead.
 * Page components are owned by their respective agents — see src/ui/<page>/.
 *
 * `navigate` is passed down so a page can hand the user to the next step in the
 * flow (choose subject -> choose pill -> run -> read result). Pages should offer
 * that next step explicitly rather than leaving the user to find the sidebar.
 */
export function App() {
  const [page, setPage] = useState<PageId>('home')

  return (
    <DataProvider>
      <div className="app">
        <Sidebar current={page} onNavigate={setPage} />
        <main className="app-main">
          {/*
            Keyed per page so a crash on one page does not poison the next: React
            remounts the boundary when the key changes, which resets its error state.
            Without the key a user who hits a fault on Pills would see the error
            screen on every page afterwards.
          */}
          <ErrorBoundary key={page}>
            {page === 'home' && <HomePage onNavigate={setPage} />}
            {page === 'substances' && <SubstancesPage onNavigate={setPage} />}
            {page === 'pills' && <PillsPage onNavigate={setPage} />}
            {page === 'subject' && <SubjectPage onNavigate={setPage} />}
            {page === 'simulation' && <SimulationPage onNavigate={setPage} />}
          </ErrorBoundary>
        </main>
      </div>

      {/*
        Sibling of `.app` and OUTSIDE the keyed ErrorBoundary, so the conversation
        survives navigation rather than being thrown away every time the page
        changes. It is position:fixed, so its DOM position is otherwise free.
      */}
      <ChatContext page={page} />
    </DataProvider>
  )
}

/**
 * Supplies the assistant with what the app knows.
 *
 * `catalogue` is the important field: it is what lets the assistant answer "PilSim
 * does not model that" instead of reasoning from the model's own training about a
 * drug we never simulated. The product's scope is deliberately five molecules, and
 * a confident answer about a sixth is the failure the whole architecture exists to
 * prevent — so the boundary of the dataset has to be part of the context, not an
 * afterthought.
 */
function ChatContext({ page }: { page: PageId }) {
  const { substances, patientModel } = useData()

  const catalogue = useMemo(() => {
    // `substances` is the loaded FILE; its records live under `.substances`.
    const records = substances?.substances ?? []
    const names = records
      .filter((s) => (s as { role?: string }).role !== 'excipient')
      .map((s) => (s as { name?: string }).name)
      .filter((n): n is string => typeof n === 'string')
    const presets = (patientModel as unknown as {
      comorbidity_presets?: Record<string, unknown>
    } | null)?.comorbidity_presets
    const comorbidities = presets ? Object.keys(presets) : []
    return {
      substances: names,
      comorbidities,
      scopeNote:
        'PilSim models only these molecules and comorbidities. Anything outside ' +
        'this list is not simulated and must not be answered from general knowledge.',
    }
  }, [substances, patientModel])

  return <ChatAssistant context={{ page, catalogue }} />
}
