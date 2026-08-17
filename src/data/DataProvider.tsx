/**
 * React context for the four loaded data files.
 *
 * API surface is deliberately tiny — the UI pages only ever need:
 *
 *     const { substances, products, rules, patientModel, loading, error } = useData()
 *
 * Before the fetch resolves the four files are `null`, so guard on `loading`/`error`
 * first. `useDataOrThrow()` is the convenience for components that render only inside
 * an already-loaded subtree.
 *
 * Owned by Agent RUL.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  loadPilSimData,
  type PatientModelFile,
  type PilSimData,
  type ProductsFile,
  type RulesFile,
  type SubstancesFile,
} from './load'

export interface DataContextValue {
  substances: SubstancesFile | null
  products: ProductsFile | null
  rules: RulesFile | null
  patientModel: PatientModelFile | null
  /** All four at once, or null until every file has loaded. */
  data: PilSimData | null
  loading: boolean
  error: Error | null
  /** Re-run the fetch. Useful after a dev-server restart. */
  reload: () => void
}

const EMPTY: DataContextValue = {
  substances: null,
  products: null,
  rules: null,
  patientModel: null,
  data: null,
  loading: true,
  error: null,
  reload: () => {},
}

const DataContext = createContext<DataContextValue>(EMPTY)

export function DataProvider({
  children,
  base = '/data',
}: {
  children: ReactNode
  base?: string
}) {
  const [data, setData] = useState<PilSimData | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loadPilSimData(base)
      .then((d) => {
        if (cancelled) return
        setData(d)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // Loud, not silent. A partially-loaded dataset must never look like a working one.
        // eslint-disable-next-line no-console
        console.error('[PilSim] data load failed', e)
        setData(null)
        setError(e instanceof Error ? e : new Error(String(e)))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [base, nonce])

  const value = useMemo<DataContextValue>(
    () => ({
      substances: data?.substances ?? null,
      products: data?.products ?? null,
      rules: data?.rules ?? null,
      patientModel: data?.patientModel ?? null,
      data,
      loading,
      error,
      reload: () => setNonce((n) => n + 1),
    }),
    [data, loading, error],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  return useContext(DataContext)
}

/**
 * For components that are only mounted once loading has succeeded. Throws rather than
 * returning a plausible-looking empty dataset.
 */
export function useDataOrThrow(): PilSimData {
  const { data, loading, error } = useContext(DataContext)
  if (error) throw error
  if (!data) throw new Error(loading ? 'PilSim data is still loading.' : 'PilSim data is not available.')
  return data
}

/**
 * Test/storybook seam: wrap children with an already-loaded dataset, no fetch.
 */
export function StaticDataProvider({ data, children }: { data: PilSimData; children: ReactNode }) {
  const value = useMemo<DataContextValue>(
    () => ({
      substances: data.substances,
      products: data.products,
      rules: data.rules,
      patientModel: data.patientModel,
      data,
      loading: false,
      error: null,
      reload: () => {},
    }),
    [data],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
