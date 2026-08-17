/**
 * A tiny, total expression evaluator for the `expr` strings in
 * `data/patient_model.json`.
 *
 * The file documents its expressions as "pure JavaScript expressions over the symbol
 * table ... Math.* is in scope". The obvious implementation is `new Function`. This
 * isn't that, on purpose:
 *
 *   - `new Function` is blocked under any strict Content-Security-Policy, and a
 *     physiology model that stops working behind a CSP is a bad dependency to take.
 *   - The grammar the data actually uses is small (arithmetic, comparison, `===`,
 *     ternary, calls into a whitelist of Math functions, string and null literals).
 *     Parsing it outright is a couple of hundred lines and is verifiable.
 *   - An evaluator that cannot reach globals cannot become an injection vector if the
 *     data files ever become user-editable.
 *
 * Parsing produces an AST and evaluation short-circuits, which matters: pipeline step
 * 35 reads `cyp2d6_activity_score === null ? 'Indeterminate' : cyp2d6_activity_score >
 * 2.25 ? ...`, and an eager evaluator would run `null > 2.25` on the untaken branch.
 *
 * Owned by Agent RUL.
 */

export type ExprValue = number | string | boolean | null

export interface ExprScope {
  /** Symbol table: bare identifiers resolve here. */
  vars: Record<string, ExprValue>
  /** Callable helpers, e.g. `comorbidity_multiplier` plus the `Math.*` whitelist. */
  fns: Record<string, (...args: ExprValue[]) => ExprValue>
}

export class ExprError extends Error {
  constructor(
    message: string,
    readonly source: string,
  ) {
    super(`${message}  [in: ${source}]`)
    this.name = 'ExprError'
  }
}

// --- tokenizer -------------------------------------------------------------

type TokKind = 'num' | 'str' | 'ident' | 'punct' | 'eof'
interface Tok {
  kind: TokKind
  text: string
  pos: number
}

const PUNCT = [
  '===',
  '!==',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '<',
  '>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '?',
  ':',
  '(',
  ')',
  ',',
  '!',
]

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1)
      if (end < 0) throw new ExprError(`Unterminated string at ${i}`, src)
      out.push({ kind: 'str', text: src.slice(i + 1, end), pos: i })
      i = end + 1
      continue
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?/i.exec(src.slice(i))
      if (!m) throw new ExprError(`Bad number at ${i}`, src)
      out.push({ kind: 'num', text: m[0], pos: i })
      i += m[0].length
      continue
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*/.exec(src.slice(i))!
      out.push({ kind: 'ident', text: m[0], pos: i })
      i += m[0].length
      continue
    }
    const p = PUNCT.find((s) => src.startsWith(s, i))
    if (!p) throw new ExprError(`Unexpected character ${JSON.stringify(c)} at ${i}`, src)
    out.push({ kind: 'punct', text: p, pos: i })
    i += p.length
  }
  out.push({ kind: 'eof', text: '', pos: src.length })
  return out
}

// --- AST -------------------------------------------------------------------

export type Node =
  | { t: 'lit'; v: ExprValue }
  | { t: 'sym'; name: string }
  | { t: 'call'; name: string; args: Node[] }
  | { t: 'un'; op: '-' | '+' | '!'; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'cond'; c: Node; a: Node; b: Node }

class Parser {
  private i = 0
  constructor(
    private readonly toks: Tok[],
    private readonly src: string,
  ) {}

  private peek(): Tok {
    return this.toks[this.i]
  }
  private eat(text: string): boolean {
    const t = this.peek()
    if (t.kind === 'punct' && t.text === text) {
      this.i++
      return true
    }
    return false
  }
  private expect(text: string): void {
    if (!this.eat(text)) {
      throw new ExprError(`Expected ${JSON.stringify(text)} at ${this.peek().pos}`, this.src)
    }
  }

  parse(): Node {
    const n = this.ternary()
    if (this.peek().kind !== 'eof') {
      throw new ExprError(`Unexpected trailing input at ${this.peek().pos}`, this.src)
    }
    return n
  }

  private ternary(): Node {
    const c = this.binary(0)
    if (this.eat('?')) {
      const a = this.ternary()
      this.expect(':')
      const b = this.ternary()
      return { t: 'cond', c, a, b }
    }
    return c
  }

  /** Precedence climbing. Lowest level first. */
  private static readonly LEVELS: string[][] = [
    ['||'],
    ['&&'],
    ['===', '!==', '==', '!='],
    ['<=', '>=', '<', '>'],
    ['+', '-'],
    ['*', '/', '%'],
  ]

  private binary(level: number): Node {
    if (level >= Parser.LEVELS.length) return this.unary()
    let left = this.binary(level + 1)
    for (;;) {
      const op = Parser.LEVELS[level].find((o) => this.eat(o))
      if (!op) return left
      left = { t: 'bin', op, a: left, b: this.binary(level + 1) }
    }
  }

  private unary(): Node {
    if (this.eat('-')) return { t: 'un', op: '-', a: this.unary() }
    if (this.eat('+')) return { t: 'un', op: '+', a: this.unary() }
    if (this.eat('!')) return { t: 'un', op: '!', a: this.unary() }
    return this.primary()
  }

  private primary(): Node {
    const t = this.peek()
    if (this.eat('(')) {
      const n = this.ternary()
      this.expect(')')
      return n
    }
    if (t.kind === 'num') {
      this.i++
      return { t: 'lit', v: Number(t.text) }
    }
    if (t.kind === 'str') {
      this.i++
      return { t: 'lit', v: t.text }
    }
    if (t.kind === 'ident') {
      this.i++
      if (t.text === 'true') return { t: 'lit', v: true }
      if (t.text === 'false') return { t: 'lit', v: false }
      if (t.text === 'null' || t.text === 'undefined') return { t: 'lit', v: null }
      if (this.eat('(')) {
        const args: Node[] = []
        if (!this.eat(')')) {
          do {
            args.push(this.ternary())
          } while (this.eat(','))
          this.expect(')')
        }
        return { t: 'call', name: t.text, args }
      }
      return { t: 'sym', name: t.text }
    }
    throw new ExprError(`Unexpected token ${JSON.stringify(t.text)} at ${t.pos}`, this.src)
  }
}

// --- evaluation ------------------------------------------------------------

function truthy(v: ExprValue): boolean {
  return !(v === null || v === false || v === 0 || v === '' || (typeof v === 'number' && Number.isNaN(v)))
}

function num(v: ExprValue, src: string): number {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v === null) throw new ExprError('null used in arithmetic', src)
  const n = Number(v)
  if (Number.isNaN(n)) throw new ExprError(`Cannot use ${JSON.stringify(v)} as a number`, src)
  return n
}

function evalNode(n: Node, scope: ExprScope, src: string): ExprValue {
  switch (n.t) {
    case 'lit':
      return n.v
    case 'sym': {
      if (!(n.name in scope.vars)) throw new ExprError(`Unknown symbol ${n.name}`, src)
      return scope.vars[n.name]
    }
    case 'call': {
      const fn = scope.fns[n.name]
      if (!fn) throw new ExprError(`Unknown function ${n.name}()`, src)
      return fn(...n.args.map((a) => evalNode(a, scope, src)))
    }
    case 'un': {
      if (n.op === '!') return !truthy(evalNode(n.a, scope, src))
      const v = num(evalNode(n.a, scope, src), src)
      return n.op === '-' ? -v : v
    }
    case 'cond':
      return truthy(evalNode(n.c, scope, src))
        ? evalNode(n.a, scope, src)
        : evalNode(n.b, scope, src)
    case 'bin': {
      // Short-circuit first; the untaken side is never evaluated.
      if (n.op === '||') {
        const a = evalNode(n.a, scope, src)
        return truthy(a) ? a : evalNode(n.b, scope, src)
      }
      if (n.op === '&&') {
        const a = evalNode(n.a, scope, src)
        return truthy(a) ? evalNode(n.b, scope, src) : a
      }
      const a = evalNode(n.a, scope, src)
      const b = evalNode(n.b, scope, src)
      switch (n.op) {
        case '===':
        case '==':
          return a === b
        case '!==':
        case '!=':
          return a !== b
        case '<':
          return num(a, src) < num(b, src)
        case '<=':
          return num(a, src) <= num(b, src)
        case '>':
          return num(a, src) > num(b, src)
        case '>=':
          return num(a, src) >= num(b, src)
        case '+':
          return typeof a === 'string' || typeof b === 'string'
            ? String(a) + String(b)
            : num(a, src) + num(b, src)
        case '-':
          return num(a, src) - num(b, src)
        case '*':
          return num(a, src) * num(b, src)
        case '/':
          return num(a, src) / num(b, src)
        case '%':
          return num(a, src) % num(b, src)
        default:
          throw new ExprError(`Unsupported operator ${n.op}`, src)
      }
    }
  }
}

/** The `Math.*` surface the data files use, plus close neighbours. */
export const MATH_FNS: Record<string, (...args: ExprValue[]) => ExprValue> = {
  'Math.pow': (a, b) => Math.pow(Number(a), Number(b)),
  'Math.min': (...a) => Math.min(...a.map(Number)),
  'Math.max': (...a) => Math.max(...a.map(Number)),
  'Math.sqrt': (a) => Math.sqrt(Number(a)),
  'Math.abs': (a) => Math.abs(Number(a)),
  'Math.exp': (a) => Math.exp(Number(a)),
  'Math.log': (a) => Math.log(Number(a)),
  'Math.round': (a) => Math.round(Number(a)),
  'Math.floor': (a) => Math.floor(Number(a)),
  'Math.ceil': (a) => Math.ceil(Number(a)),
}

const cache = new Map<string, Node>()

export function compileExpr(src: string): Node {
  let n = cache.get(src)
  if (!n) {
    n = new Parser(tokenize(src), src).parse()
    cache.set(src, n)
  }
  return n
}

export function evaluateExpr(src: string, scope: ExprScope): ExprValue {
  return evalNode(compileExpr(src), scope, src)
}
