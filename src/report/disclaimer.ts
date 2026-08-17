/**
 * The disclaimer, verbatim.
 *
 * research/05-OUTPUT-REPORT-SPEC.md section 8 marks this text NORMATIVE: "Do not
 * paraphrase, shorten, or move it below the fold." It is exported as data so there is
 * exactly one copy in the codebase and no component can quietly rewrite it.
 *
 * Placement rules (section 8.4), which the renderer must honour:
 *   1. Full disclaimer at the top of every report, above the scores. Never collapsed by default.
 *   2. Short form persistently visible during the animation.
 *   3. Short form burned into any exported image or PDF, not added as metadata.
 *   4. When an arm is DISQUALIFIED, the safety reason appears ABOVE the disclaimer, so
 *      the specific warning is read before the generic one.
 *
 * Owned by Agent RUL.
 */

/** Heading of the bordered panel at the head of every report. */
export const DISCLAIMER_TITLE = 'This is a simulation, not medical advice.'

/** The four paragraphs, in order. Render each as its own paragraph. */
export const DISCLAIMER_PARAGRAPHS: readonly string[] = [
  'PilSim is a research and educational simulator. It estimates how a modelled drug might behave in a mathematical model of a human body. It has not been clinically validated, it is not a medical device, and it has not been reviewed or approved by any regulatory authority.',
  'The outputs on this page are the results of equations, not observations of a patient. They may be wrong. They must not be used to diagnose a condition, to choose, start, change, or stop any treatment, or to inform the care of any real person.',
  'Only a qualified clinician who has examined the patient can make prescribing decisions. If you are a patient, do not change anything about your medication because of this page.',
  'Every number here carries a source or is marked as an estimate. Where we could not find a value, we say so rather than guess.',
] as const

/** The full disclaimer as one string, for exports and plain-text contexts. */
export const DISCLAIMER_FULL = [DISCLAIMER_TITLE, ...DISCLAIMER_PARAGRAPHS].join('\n\n')

/** Persistent header bar, animation footer, and every shared/exported image. */
export const DISCLAIMER_SHORT = 'Simulation only — not medical advice. Not a validated medical device.'

/**
 * The hackathon is in Qashqadaryo, Uzbekistan, and judges may read in Uzbek or Russian.
 * Translation provenance: ESTIMATED — these are the spec author's translations of the
 * English short form, not professionally reviewed. Have a native Uzbek speaker check
 * the UZ line before the pitch.
 */
export const DISCLAIMER_SHORT_I18N: Readonly<Record<'en' | 'uz' | 'ru', string>> = {
  en: 'Simulation only — not medical advice. Not a validated medical device.',
  uz: 'Faqat simulyatsiya — tibbiy maslahat emas. Tasdiqlangan tibbiy vosita emas.',
  ru: 'Только симуляция — не медицинская рекомендация. Не является сертифицированным медицинским изделием.',
} as const

/** The twin's own scope limit, from patient_model.json validity_limits.disclaimer. */
export const TWIN_DISCLAIMER =
  'PilSim is a research and education simulator. Its virtual human is a lumped-parameter approximation calibrated to population reference values, not to any individual. It cannot predict what a drug will do in a real patient, it has not been validated against clinical outcomes, and it must not be used to prescribe, withhold, or adjust therapy.'

/** The rules file's own scope limit, from rules.json `disclaimer`. */
export const RULES_DISCLAIMER =
  'PilSim is a research simulator, not a clinical decision support tool. These rules encode published contraindications, interactions and guideline preferences so that a virtual-patient simulation behaves plausibly. They are incomplete by construction, have not been validated against any patient population, and must never be used to make or withhold a prescribing decision for a real person.'

/**
 * Section 5.4, verbatim. Rendered where a formulation ranking is asked for and the
 * dataset cannot support one.
 */
export const FORMULATION_REFUSAL_TEXT =
  'Best formulation type: not determined. Only immediate-release oral solid forms were modelled for this substance. A formulation comparison requires route-specific bioavailability and time-to-peak data that is not present in this build’s dataset.'

/** The short reason chip for the same refusal (section 6.3). */
export const FORMULATION_REFUSAL_CHIP = 'Formulation comparison not supported by available data'
