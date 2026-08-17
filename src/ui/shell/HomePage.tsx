/**
 * Overview — the first screen. Owned by Agent UI-A.
 *
 * Deliberately short. A first-time viewer should be able to take the whole page in
 * at a glance: what this is in one sentence, the action, the four steps. Everything
 * else — including the full disclaimer text — is one click away rather than on
 * arrival. The disclaimer strings come from src/report/disclaimer.ts, which the
 * report spec marks NORMATIVE; they are never retyped or paraphrased here.
 */

import { useState } from 'react'
import { useData } from '../../data/DataProvider'
import {
  DISCLAIMER_PARAGRAPHS,
  DISCLAIMER_SHORT_I18N,
  DISCLAIMER_TITLE,
} from '../../report/disclaimer'
import { useLang, useT, type DictKey } from '../../i18n'
import { Disclosure } from './primitives'
import type { PageId } from './Sidebar'

const STEPS: { page: PageId; titleKey: DictKey; textKey: DictKey }[] = [
  { page: 'pills', titleKey: 'home.step1.title', textKey: 'home.step1.text' },
  { page: 'subject', titleKey: 'home.step2.title', textKey: 'home.step2.text' },
  { page: 'simulation', titleKey: 'home.step3.title', textKey: 'home.step3.text' },
  { page: 'simulation', titleKey: 'home.step4.title', textKey: 'home.step4.text' },
]

export function HomePage({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  const { substances, products, rules } = useData()
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const t = useT()
  const lang = useLang()

  return (
    <div className="home">
      <h1 className="home-title">{t('home.title')}</h1>
      <p className="home-lede">{t('home.lede')}</p>

      <div className="home-actions">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={() => onNavigate('pills')}
        >
          {t('home.start')}
        </button>
        <button type="button" className="btn btn--lg" onClick={() => onNavigate('subject')}>
          {t('home.pickPatient')}
        </button>
      </div>

      <p className="home-facts">
        {t('home.facts', {
          substances: substances?.substances.length ?? 0,
          products: products?.products.length ?? 0,
          rules: rules?.rules.length ?? 0,
        })}
      </p>

      <div className="home-steps">
        {STEPS.map((step, i) => (
          <button
            key={step.titleKey}
            type="button"
            className="home-step"
            onClick={() => onNavigate(step.page)}
          >
            <span className="home-step-n">{i + 1}</span>
            <span className="home-step-title">{t(step.titleKey)}</span>
            <span className="home-step-text">{t(step.textKey)}</span>
          </button>
        ))}
      </div>

      <div className="home-foot">
        <Disclosure
          summary={DISCLAIMER_SHORT_I18N[lang]}
          open={showDisclaimer}
          onToggle={() => setShowDisclaimer((v) => !v)}
        >
          <p className="home-foot-line">
            <b>{DISCLAIMER_TITLE}</b>
          </p>
          {DISCLAIMER_PARAGRAPHS.map((paragraph) => (
            <p key={paragraph} className="prose">
              {paragraph}
            </p>
          ))}
        </Disclosure>
      </div>
    </div>
  )
}
