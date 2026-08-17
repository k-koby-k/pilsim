import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ChatAssistant } from './ChatDock'
import type { ChatContext } from '../../ai/chatContext'

const CTX: ChatContext = {
  page: 'simulation',
  patient: { label: 'Test subject A', ageYears: 64, sbpMmHg: 162 },
  regimen: { label: 'Lisinopril 10 mg', doses: [{ substanceId: 'lisinopril', mg: 10, perDay: 1 }] },
  catalogue: { substances: ['lisinopril', 'losartan'] },
}

describe('the chat assistant renders on any page', () => {
  it('is a button until it is opened', () => {
    const html = renderToString(<ChatAssistant context={CTX} />)
    expect(html).toContain('chatdock-fab')
    expect(html).not.toContain('chatdock-log')
  })

  it('opens into a panel with a composer and a way out', () => {
    const html = renderToString(<ChatAssistant context={CTX} defaultOpen />)
    expect(html).toContain('chatdock-log')
    expect(html).toContain('chatdock-input')
    expect(html).toContain('chatdock-close')
  })

  it('never draws a scrim or a blur over the page', () => {
    const html = renderToString(<ChatAssistant context={CTX} defaultOpen />)
    expect(html).not.toMatch(/scrim|backdrop|overlay/i)
  })

  it('survives a page with nothing selected', () => {
    expect(() => renderToString(<ChatAssistant context={{ page: 'home' }} defaultOpen />)).not.toThrow()
  })

  it('resolves every chrome string it uses — no raw dictionary keys on screen', () => {
    const html = renderToString(<ChatAssistant context={CTX} defaultOpen />)
    expect(html).not.toMatch(/chat\.[a-zA-Z.]+</)
    expect(html).not.toMatch(/>chat\.[a-zA-Z.]+/)
  })
})
