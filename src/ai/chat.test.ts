import { describe, it, expect } from 'vitest'
import { buildChatPrompt, renderChatContext, CHAT_SYSTEM_PROMPT, HISTORY_TURNS, type ChatTurn } from './chat'
import { chatSections, coverageSection, groundedIn, type ChatContext } from './chatContext'
import { checkNumbers, summarize } from './numbers'

const CTX: ChatContext = {
  page: 'simulation',
  patient: {
    label: 'Test subject A',
    ageYears: 64,
    sex: 'female',
    weightKg: 78,
    sbpMmHg: 162,
    dbpMmHg: 94,
    creatinineMgDl: 1.4,
    comorbidities: ['ckd_stage_3'],
  },
  regimen: { label: 'Lisinopril 10 mg', doses: [{ substanceId: 'lisinopril', mg: 10, perDay: 1 }] },
  run: { horizonHours: 720, deltaSbpMmHg: -13.4, finalSerumK: 4.9, hazards: { hyperkalaemia: 0.072 } },
  rules: [
    {
      id: 'HTN-014',
      title: 'ACE inhibitor in CKD',
      severity: 'preferred',
      mechanism: 'Efferent arteriolar dilatation lowers intraglomerular pressure.',
      citation: 'KDIGO 2021',
    },
  ],
  catalogue: { substances: ['lisinopril', 'losartan', 'amlodipine', 'hydrochlorothiazide', 'metoprolol'] },
}

function factSet(ctx: ChatContext, history: ChatTurn[], question: string) {
  return buildChatPrompt(ctx, history, question).facts
}

describe('chat context sections', () => {
  it('renders what is on screen with its numbers as quotable facts', () => {
    const sections = chatSections(CTX)
    const ids = sections.map((s) => s.id)
    expect(ids).toContain('screen')
    expect(ids).toContain('patient')
    expect(ids).toContain('regimen')
    expect(ids).toContain('run')
    expect(ids).toContain('rules')

    const facts = sections.flatMap((s) => s.facts)
    expect(facts.some((f) => f.value === 162 && f.unit === 'mmHg')).toBe(true)
    expect(facts.some((f) => f.value === 10 && f.unit === 'mg')).toBe(true)
    expect(facts.some((f) => Math.abs(f.value) === 13.4 && f.unit === 'mmHg')).toBe(true)
  })

  it('always states the edge of the product, even on an empty page', () => {
    const s = coverageSection({ page: 'home' })
    expect(s.lines.length).toBeGreaterThan(0)
    expect(s.lines.join(' ')).toMatch(/does not model/i)
  })

  it('names the modelled substances so a drug outside them can be refused', () => {
    const text = coverageSection(CTX).lines.join('\n')
    expect(text).toContain('lisinopril')
    expect(text).toMatch(/NOT modelled/)
  })

  it('does not claim a catalogue it was never given', () => {
    const text = coverageSection({ page: 'substances' }).lines.join('\n')
    expect(text).toMatch(/was not supplied/)
  })

  it('reports what it is grounded in, and nothing it is not', () => {
    expect(groundedIn(CTX)).toEqual(['patient', 'regimen', 'run', 'rules'])
    expect(groundedIn({ page: 'home' })).toEqual([])
  })

  it('says plainly when nothing is open and nothing has been run', () => {
    const text = chatSections({ page: 'substances' })
      .map((s) => s.lines.join('\n'))
      .join('\n')
    expect(text).toMatch(/nothing is open/)
    expect(text).toMatch(/no simulation has been run/)
  })
})

describe('buildChatPrompt', () => {
  it('puts the context in the system message and the question last', () => {
    const { messages } = buildChatPrompt(CTX, [], 'why lisinopril?')
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain(CHAT_SYSTEM_PROMPT)
    expect(messages[0].content).toContain('Test subject A')
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'why lisinopril?' })
  })

  it('supplies every number the app rendered', () => {
    const facts = factSet(CTX, [], 'what happened?')
    const checked = checkNumbers('The engine computed a 13.4 mmHg fall at 162 mmHg baseline.', facts)
    expect(summarize(checked).clean).toBe(true)
  })

  it('DOES NOT treat a number the user typed as a supplied fact', () => {
    // The whole point: "80 mg" is in the prompt because the user wrote it, and
    // must still be flagged if the model repeats it as though PilSim knew it.
    const facts = factSet(CTX, [], 'what about 80 mg instead?')
    const checked = checkNumbers('An 80 mg dose would be stronger.', facts)
    expect(summarize(checked).unsupported).toBe(1)
    expect(summarize(checked).offenders).toEqual(['80 mg'])
  })

  it('does not treat a number from a previous answer as a supplied fact', () => {
    const history: ChatTurn[] = [
      { id: '1', role: 'user', text: 'and?' },
      { id: '2', role: 'assistant', text: 'It fell by 47.5 mmHg.' },
    ]
    const facts = factSet(CTX, history, 'are you sure?')
    const checked = checkNumbers('Yes, 47.5 mmHg.', facts)
    expect(summarize(checked).clean).toBe(false)
  })

  it('carries recent conversation but caps it', () => {
    const history: ChatTurn[] = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      text: `turn ${i}`,
    }))
    const { messages } = buildChatPrompt(CTX, history, 'next')
    // system + capped history + the new question
    expect(messages.length).toBe(1 + HISTORY_TURNS + 1)
  })

  it('drops failed turns from the history it replays', () => {
    const history: ChatTurn[] = [
      { id: '1', role: 'user', text: 'hello' },
      { id: '2', role: 'assistant', text: '', failure: { kind: 'network', message: 'offline' } },
    ]
    const { messages } = buildChatPrompt(CTX, history, 'again?')
    expect(messages.map((m) => m.content)).not.toContain('')
    expect(messages.length).toBe(3)
  })

  it('tells the model in words that the user’s numbers are not facts', () => {
    expect(CHAT_SYSTEM_PROMPT).toMatch(/number the USER typed is not a fact/)
  })

  it('makes refusing an explicit, correct answer', () => {
    expect(CHAT_SYSTEM_PROMPT).toMatch(/WHEN THE ANSWER IS NOT IN THE CONTEXT, SAY SO/)
    expect(CHAT_SYSTEM_PROMPT).toMatch(/does not model it/)
  })

  it('asks for the user’s own language back', () => {
    expect(CHAT_SYSTEM_PROMPT).toMatch(/language the user wrote in/)
  })
})

describe('renderChatContext', () => {
  it('skips empty sections and titles the rest', () => {
    const text = renderChatContext([
      { id: 'a', title: 'Kept', lines: ['x: 1'], facts: [] },
      { id: 'b', title: 'Dropped', lines: [], facts: [] },
    ])
    expect(text).toContain('## Kept')
    expect(text).not.toContain('## Dropped')
  })
})
