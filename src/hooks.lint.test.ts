/**
 * Source-level guards for React mistakes that typecheck cleanly, pass every render
 * test, and then crash in a browser. Owned by the lead.
 *
 * These exist because the bug they describe actually shipped to production twice and
 * cost a tester an afternoon.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(p, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p)
  }
  return out
}

const FILES = sourceFiles('src')

/** Strip comments so a doc-comment describing the bad pattern is not read as the
 *  bad pattern. This test caught its own explanatory comment on the first run. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')
}

describe('useState must not be handed a bare function', () => {
  /**
   * `useState(fn)` treats `fn` as a LAZY INITIALISER and calls it with no arguments.
   * When the value being stored is itself a function — a component, a callback, a
   * cached module export — React invokes it instead of storing it.
   *
   * That is what produced "(destructured parameter) is undefined" in production: a
   * lazily-imported component was cached at module level and passed straight to
   * useState, so React called `AffectedAnatomy()` with no props and the component
   * threw while destructuring them. It only failed on the SECOND mount, once the
   * cache was warm, which is why it looked intermittent and survived a page-render
   * test suite.
   *
   * The fix is always `useState(() => value)`.
   */
  it('no useState(<identifier>) where the identifier may hold a function', () => {
    // Names that plausibly hold a function or component rather than a plain value.
    // PascalCase (a component) or an explicitly function-ish name. SCREAMING_SNAKE
    // is excluded deliberately: by convention those are constant objects, numbers
    // and arrays — EMPTY_BINDING, PAGE_SIZE — and flagging them is noise that would
    // get this guard disabled rather than obeyed.
    const SUSPECT = /^(cached|component|[A-Z][a-z]\w*|.*Component|.*Fn|.*Callback|.*Handler)$/
    const offenders: string[] = []

    for (const file of FILES) {
      const src = code(fs.readFileSync(file, 'utf8'))
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return
        // useState(ident) — a bare identifier, not a literal, call, or arrow.
        const m = line.match(/useState(?:<[^>]*>)?\(\s*([A-Za-z_$][\w$]*)\s*\)/)
        if (m && SUSPECT.test(m[1])) {
          offenders.push(`${file}:${i + 1}  useState(${m[1]}) — use useState(() => ${m[1]})`)
        }
      })
    }

    expect(offenders, offenders.join('\n')).toEqual([])
  })
})

describe('lazily-imported components are stored, not called', () => {
  it('AnatomyRail keeps its lazy initialiser', () => {
    const src = code(fs.readFileSync('src/ui/shell/AnatomyRail.tsx', 'utf8'))
    // The exact regression: this file cached a component and must never hand it to
    // useState directly.
    expect(src).not.toMatch(/useState(<[^>]*>)?\(\s*cached\s*\)/)
    expect(src).toMatch(/useState(<[^>]*>)?\(\s*\(\)\s*=>\s*cached\s*\)/)
  })
})
