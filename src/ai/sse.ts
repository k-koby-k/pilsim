/**
 * Server-sent event plumbing, kept pure so it can be tested without a network.
 *
 * Three wire shapes reach this parser — Workers AI's `{response}`, Gemini's
 * `{candidates[].content.parts[].text}`, and the OpenAI-compatible
 * `{choices[].delta.content}` — because the provider can be switched at runtime
 * and, on the Gemini-direct path, the browser talks to Google without the
 * Worker in between to normalise anything. Accepting all three costs a dozen
 * lines and removes a whole class of "works on one provider" failure.
 */

/** Incremental SSE reader. Feed it decoded text; get back complete `data:` payloads. */
export function createSseParser() {
  let buffer = ''
  return {
    push(chunk: string): string[] {
      buffer += chunk
      const out: string[] = []
      // Events are separated by a blank line, but small proxies emit one
      // `data:` per line without the blank, so split on newlines and treat each
      // `data:` line as complete. Multi-line data payloads are concatenated.
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trimEnd()
        if (!trimmed.startsWith('data:')) continue
        out.push(trimmed.slice(5).trim())
      }
      return out
    },
    flush(): string[] {
      const rest = buffer.trimEnd()
      buffer = ''
      return rest.startsWith('data:') ? [rest.slice(5).trim()] : []
    },
  }
}

export const SSE_DONE = '[DONE]'

/** Extract the text delta from one payload, or null if there is none. */
export function deltaFromPayload(payload: string): string | null {
  if (!payload || payload === SSE_DONE) return null
  let json: unknown
  try {
    json = JSON.parse(payload)
  } catch {
    return null
  }
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>

  if (typeof o.response === 'string') return o.response

  const choices = o.choices as { delta?: { content?: string }; text?: string }[] | undefined
  if (Array.isArray(choices) && choices.length) {
    const c = choices[0]
    if (typeof c?.delta?.content === 'string') return c.delta.content
    if (typeof c?.text === 'string') return c.text
  }

  const candidates = o.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined
  if (Array.isArray(candidates) && candidates.length) {
    const parts = candidates[0]?.content?.parts
    if (Array.isArray(parts)) return parts.map((p) => p?.text ?? '').join('')
  }
  return null
}

/**
 * Read a streaming Response body, calling `onDelta` for each fragment.
 * Returns the full concatenated text.
 */
export async function consumeSse(
  body: ReadableStream<Uint8Array>,
  onDelta: (delta: string) => void,
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const parser = createSseParser()
  let full = ''
  const handle = (payloads: string[]) => {
    for (const p of payloads) {
      const delta = deltaFromPayload(p)
      if (delta) {
        full += delta
        onDelta(delta)
      }
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      handle(parser.push(decoder.decode(value, { stream: true })))
    }
    handle(parser.flush())
  } finally {
    reader.releaseLock()
  }
  return full
}
