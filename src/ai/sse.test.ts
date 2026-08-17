/**
 * Wire-shape handling. The provider is switchable at runtime, and on the
 * Gemini-direct path there is no Worker in between to normalise anything, so
 * the parser has to accept all three shapes or "switch provider" becomes
 * "switch provider and the panel goes blank".
 */

import { describe as suite, expect, it } from 'vitest'
import { createSseParser, deltaFromPayload, consumeSse, SSE_DONE } from './sse'

suite('payload shapes', () => {
  it('reads Workers AI', () => {
    expect(deltaFromPayload('{"response":"hello"}')).toBe('hello')
  })

  it('reads Gemini', () => {
    expect(deltaFromPayload('{"candidates":[{"content":{"parts":[{"text":"hi"},{"text":" there"}]}}]}')).toBe(
      'hi there',
    )
  })

  it('reads the OpenAI-compatible shape', () => {
    expect(deltaFromPayload('{"choices":[{"delta":{"content":"x"}}]}')).toBe('x')
  })

  it('treats the terminator and any junk as no delta, never as text', () => {
    expect(deltaFromPayload(SSE_DONE)).toBeNull()
    expect(deltaFromPayload('not json at all')).toBeNull()
    expect(deltaFromPayload('{"unexpected":1}')).toBeNull()
    expect(deltaFromPayload('')).toBeNull()
  })
})

suite('incremental parsing', () => {
  it('holds a frame split across chunk boundaries until it is complete', () => {
    const p = createSseParser()
    expect(p.push('data: {"resp')).toEqual([])
    expect(p.push('onse":"ab"}\n')).toEqual(['{"response":"ab"}'])
  })

  it('accepts frames with and without the blank separator line', () => {
    const p = createSseParser()
    expect(p.push('data: {"response":"a"}\n\ndata: {"response":"b"}\n')).toEqual([
      '{"response":"a"}',
      '{"response":"b"}',
    ])
  })

  it('flushes a trailing frame that never got its newline', () => {
    const p = createSseParser()
    p.push('data: {"response":"z"}')
    expect(p.flush()).toEqual(['{"response":"z"}'])
  })
})

suite('consuming a body', () => {
  it('concatenates deltas and reports each one as it lands', async () => {
    const enc = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"response":"Amlo"}\n\ndata: {"response":"dipine"}\n\n'))
        c.enqueue(enc.encode(`data: ${SSE_DONE}\n\n`))
        c.close()
      },
    })
    const deltas: string[] = []
    const text = await consumeSse(body, (d) => deltas.push(d))
    expect(text).toBe('Amlodipine')
    expect(deltas).toEqual(['Amlo', 'dipine'])
  })
})
