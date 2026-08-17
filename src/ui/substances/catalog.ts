/**
 * Searching the substance CATALOGUE. Owned by Agent UI-A.
 *
 * Written for the catalogue this is meant to become — every substance in existence —
 * not for the 43 records of the demo slice. That means:
 *
 *   · the searchable text of each record is flattened ONCE into an index, not rebuilt
 *     on every keystroke;
 *   · matching walks the index and STOPS: it collects at most `limit` results and
 *     stops counting after `COUNT_CAP`, so a three-letter query against a hundred
 *     thousand records never renders — or even counts — a hundred thousand rows;
 *   · results are ranked, so the thing a scientist typed the start of comes first.
 *
 * Nothing here renders. The page decides how many of the returned rows to show.
 */

import type { SubstanceRecord } from '../../data/load'

export interface CatalogEntry {
  id: string
  name: string
  role: string
  /** Short class or excipient function, for the result line. */
  kind: string | null
  /** Lower-cased searchable text: name, id, synonyms, ATC codes, class. */
  haystack: string
  /** Lower-cased name, for prefix ranking. */
  lowerName: string
}

export interface SearchResult {
  items: CatalogEntry[]
  /** Matches counted. `capped` means "at least this many". */
  total: number
  capped: boolean
}

/** Stop counting past this many matches — a count is not worth a full scan. */
const COUNT_CAP = 500

export function buildIndex(records: SubstanceRecord[]): CatalogEntry[] {
  return records.map((r) => {
    const kind =
      typeof r.drug_class === 'string' && r.drug_class
        ? r.drug_class
        : typeof r.excipient_function === 'string'
          ? r.excipient_function
          : null
    const haystack = [
      r.name,
      r.id,
      kind ?? '',
      ...(r.synonyms ?? []),
      ...(r.atc_codes ?? []),
    ]
      .join(' ')
      .toLowerCase()
    return {
      id: r.id,
      name: r.name,
      role: r.role,
      kind,
      haystack,
      lowerName: r.name.toLowerCase(),
    }
  })
}

export function searchCatalog(
  index: CatalogEntry[],
  query: string,
  { limit = 24, role = 'all' }: { limit?: number; role?: 'all' | 'active' | 'excipient' } = {},
): SearchResult {
  const q = query.trim().toLowerCase()
  if (!q) return { items: [], total: 0, capped: false }

  const hits: { entry: CatalogEntry; score: number }[] = []
  let total = 0

  for (const entry of index) {
    if (role === 'active' && entry.role === 'excipient') continue
    if (role === 'excipient' && entry.role !== 'excipient') continue
    if (!entry.haystack.includes(q)) continue

    total += 1
    if (hits.length < limit * 4) {
      hits.push({ entry, score: rank(entry, q) })
    }
    if (total >= COUNT_CAP) break
  }

  hits.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
  return {
    items: hits.slice(0, limit).map((h) => h.entry),
    total,
    capped: total >= COUNT_CAP,
  }
}

/** Name prefix beats name substring beats a hit anywhere else; actives beat excipients. */
function rank(entry: CatalogEntry, q: string): number {
  let score = 0
  if (entry.lowerName.startsWith(q)) score += 100
  else if (entry.lowerName.includes(q)) score += 60
  else if (entry.id.startsWith(q)) score += 40
  if (entry.role !== 'excipient') score += 10
  return score
}
