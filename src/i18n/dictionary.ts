/**
 * The dictionary. Owned by Agent UI-A (src/i18n/**).
 *
 * `en` is the source of truth: every key the product uses must be defined here, in
 * English, in full. `uz` is deliberately a *partial* record of the same keys — Uzbek
 * has translations for the pages this agent owns (shell, substances, pills, subject).
 * `t()` (see useT.ts) looks up the current language and falls back to English when a
 * key has no Uzbek entry yet, so a missing translation degrades to readable English
 * rather than ever printing a raw key like `nav.substances`.
 *
 * A value is either a plain string, or a function of `vars` for anything that needs a
 * count or an interpolated word (pluralisation, "{n} of {total}", and so on) — see the
 * `count.*` and `line.*` keys below for the pattern. Uzbek nouns do not inflect for
 * number after a numeral ("3 modda", not "3 moddalar"), so the Uzbek functions are
 * usually simpler than their English counterparts.
 *
 * WHAT NEVER GOES IN HERE: drug/substance names, units (mg, mL, mmHg, ng/mL...),
 * dataset numbers, citations/quotes, or rule mechanism text that carries a citation.
 * Those are rendered verbatim from the data layer in both languages — see the HARD
 * RULES in the task brief this module was built against.
 */

import { FORMULATION_REFUSAL_CHIP, FORMULATION_REFUSAL_TEXT } from '../report/disclaimer'

export type Lang = 'en' | 'uz' | 'ru'

type Vars = Record<string, string | number>
type DictValue = string | ((vars: Vars) => string)

const en = {
  // ---------------------------------------------------------------- sidebar / shell
  'app.tagline': 'Virtual patient drug simulator',
  'nav.home': 'Overview',
  'nav.substances': 'Substances',
  'nav.pills': 'Pills',
  'nav.subject': 'Test subjects',
  'nav.simulation': 'Simulation',
  'sidebar.saved': 'Saved',
  'sidebar.savedEmpty': 'Nothing saved yet. Anything you compose or build appears here.',
  'sidebar.loading': 'Loading dataset…',
  'sidebar.error': 'Dataset failed to load',
  'sidebar.researchSimulator': 'Research simulator',
  'lang.toggle.label': 'Language',
  'lang.en': 'English',
  'lang.uz': 'Oʻzbekcha',
  'lang.ru': 'Русский',

  // ------------------------------------------------------------------------- common
  'common.retry': 'Retry',
  'common.cancel': 'Cancel',
  'common.clear': 'Clear',
  'common.edited': 'Edited',
  'common.revert': 'Revert',
  'common.userEntered': 'User-entered',
  'common.yours': 'Yours',
  'common.was': (v: Vars) => `was ${v.value}`,
  'common.selectDetail': 'Select',
  'common.selectedDetail': 'Selected',
  'common.openDetails': 'Open details ›',
  'common.allParameters': 'All parameters',
  'common.identifiersAndSynonyms': 'Identifiers and synonyms',
  'common.synonyms': 'Synonyms',
  'common.name': 'Name',
  'common.role': 'Role',
  'common.class': 'Class',
  'common.active': 'Active',
  'common.excipient': 'Excipient',
  'common.metabolite': 'Active metabolite',
  'common.na': 'Not applicable.',

  // ---------------------------------------------------------------- status / errors
  'status.loading.title': 'Loading dataset',
  'status.loading.message': 'Fetching substances, products and rules…',
  'status.error.title': 'Data failed to load',
  'status.error.message': 'The dataset could not be read.',
  'status.empty.title': 'Nothing to show',

  // ---------------------------------------------------------------------- severity
  'severity.info': 'Info',
  'severity.preferred': 'Preferred',
  'severity.compelling': 'Compelling',
  'severity.minor': 'Minor',
  'severity.moderate': 'Moderate',
  'severity.major': 'Major',
  'severity.contraindicated_relative': 'Relative contra',
  'severity.contraindicated_absolute': 'Absolute contra',

  // -------------------------------------------------------------------- provenance
  'prov.status.CITED': 'Cited',
  'prov.status.ESTIMATED': 'Estimated',
  'prov.status.NOT_FOUND': 'Not found',
  'prov.detail.status': 'Status',
  'prov.detail.source': 'Source',
  'prov.detail.url': 'URL',
  'prov.detail.quote': 'Quote',
  'prov.detail.basis': 'Basis',
  'prov.detail.searched': 'Searched',
  'prov.detail.note': 'Note',
  'prov.detail.noSourceRecorded': 'No source, quote or justification recorded on this field.',
  'prov.detail.noneOnField': 'No provenance object on this field.',
  'prov.retrieved': (v: Vars) => `retrieved ${v.date}`,
  'prov.tier': (v: Vars) => `tier ${v.tier} — ${v.label}`,
  'prov.confidence': (v: Vars) => `confidence ${v.value}`,
  'prov.legend.cited': 'cited',
  'prov.legend.estimated': 'estimated',
  'prov.legend.notFound': 'not found',
  'prov.legend.ofValues': (v: Vars) => `of ${v.total} values`,

  // -------------------------------------------------------------------------- home
  'home.title': 'See what a pill does before anyone takes it.',
  'home.lede':
    'PilSim gives a modelled pill to a virtual patient, simulates the effect, and ranks the options — with a source, or an honest “estimated”, behind every number.',
  'home.start': 'Start — pick a pill',
  'home.pickPatient': 'Pick a patient',
  'home.facts': (v: Vars) =>
    `${v.substances} substances · ${v.products} products · ${v.rules} sourced safety rules`,
  'home.step1.title': 'Pick a pill',
  'home.step1.text': 'A real product, or compose your own.',
  'home.step2.title': 'Pick a patient',
  'home.step2.text': 'Age, kidneys, conditions, genotype.',
  'home.step3.title': 'Run it',
  'home.step3.text': 'The model integrates hour by hour.',
  'home.step4.title': 'Read the result',
  'home.step4.text': 'Options ranked, benefit against harm.',

  // -------------------------------------------------------------------- substances
  'substances.pageTitle': 'Substances',
  'substances.pageSub': 'Search the catalogue. Your shelf is what pills are built from.',
  'substances.searchPlaceholder': 'Search the catalogue…',
  'substances.newSubstance': '+ New substance',
  'substances.filter.all': 'All',
  'substances.filter.active': 'Actives',
  'substances.filter.excipient': 'Excipients',
  'substances.status.cited': 'Cited',
  'substances.status.estimated': 'Estimated',
  'substances.status.notFound': 'Not found',
  'substances.noMatch': (v: Vars) => `Nothing in the catalogue matches “${v.query}”.`,
  'substances.catalogue': 'Catalogue',
  'substances.matchCount': (v: Vars) =>
    `${v.total}${v.capped ? '+' : ''} match${v.total === 1 ? '' : 'es'}`,
  'substances.noMatchShort': 'no match',
  'substances.showMore': (v: Vars) => `Show ${v.n} more`,
  'substances.yourShelf': 'Your shelf',
  'substances.yoursCount': (v: Vars) => `${v.n} yours`,
  'substances.shelfEmptyTitle': 'Nothing on the shelf',
  'substances.shelfEmptyMessage': 'Search the catalogue, or create a substance of your own.',
  'substances.next.putInPill': 'Put it in a pill',
  'substances.next.compose': 'Next: compose these into a pill',
  'substances.goToPills': 'Go to pills',
  'substances.readingLibrary': 'Reading the substance library.',
  'substances.loadError': 'Substance data failed to load',
  'substances.addToShelf': '+ Add to shelf',
  'substances.removeFromShelf': 'Remove from shelf',
  'substances.backToShelf': '← Shelf',
  'substances.identity': 'Identity',
  'substances.classPlaceholder': 'e.g. ACE inhibitor',
  'substances.everyValueEstimated': 'Every value you enter is marked estimated, never cited.',
  'substances.delete': 'Delete',
  'substances.keyParameters': 'Key parameters',
  'substances.resetEdits': (v: Vars) => `Reset ${v.n} edit${v.n === 1 ? '' : 's'}`,
  'substances.noMeasuredValues': 'No measured values yet.',
  'substances.filterByStatus': 'Filter by how the value was sourced',
  'substances.noFilterMatch': 'Nothing matches that filter.',
  'substances.field': 'Field',
  'substances.value': 'Value',
  'substances.rangeSpread': 'Range / spread',
  'substances.source': 'Source',
  'substances.showSource': 'Show source',
  'substances.hideSource': 'Hide source',
  'substances.substancesSelected': (v: Vars) =>
    `${v.n} substance${v.n === 1 ? '' : 's'} selected`,
  'substances.removeFromSelection': (v: Vars) => `Remove ${v.name} from selection`,
  'substances.createPillFrom': (v: Vars) => `Create pill from ${v.n} substance${v.n === 1 ? '' : 's'}`,
  'substances.noConflictYet': 'No composition-level conflict among these picks yet.',
  'substances.onShelf': 'on shelf',
  'substances.deselect': (v: Vars) => `Deselect ${v.name}`,
  'substances.select': (v: Vars) => `Select ${v.name}`,
  'substances.userEnteredValues': (v: Vars) => `${v.n} value${v.n === 1 ? '' : 's'}, user-entered`,
  'substances.citedOfTotal': (v: Vars) => `${v.cited} of ${v.total} cited`,

  // ---------------------------------------------------------------------- section labels
  'section.general': 'Record-level values',
  'section.physchem': 'Physicochemistry',
  'section.pk': 'Pharmacokinetics',
  'section.pd': 'Pharmacodynamics',
  'section.dosing': 'Dosing',
  'section.formulations': 'Formulations',
  'section.simulation_hooks': 'Simulation hooks',
  'section.flags': 'Flags',
  'section.identifiers': 'Identifiers',

  // ------------------------------------------------------------------------- pills
  'pills.pageTitle': 'Pills',
  'pills.pageSub': 'Eight real products. Compose your own; the same rules check it.',
  'pills.searchPlaceholder': 'Filter pills and ingredients…',
  'pills.compose': '+ New pill',
  'pills.composeTitle': 'Compose a pill',
  'pills.composeEmptyHint': 'Not just the eight shown here — compose your own from any substance.',
  'pills.allPills': '← All pills',
  'pills.safetyCheck': 'Safety check',
  'pills.runsOnFirst': 'runs on the first substance',
  'pills.activeExcipientCount': (v: Vars) =>
    `${v.active} active · ${v.excipient} excipient`,
  'pills.twoActivesHint': 'Two actives from different classes is the interesting case.',
  'pills.duplicateSubstance': 'The same substance is listed twice. Merge the amounts.',
  'pills.doseEdited': (v: Vars) => `${v.n} dose edited`,
  'pills.compositionOnly': 'composition only, no patient yet',
  'pills.noPillMatch': (v: Vars) => `No pill matches “${v.query}”.`,
  'pills.next.choosePatient': 'Next: choose who takes it',
  'pills.next.pickPatient': 'Next: pick a patient',
  'pills.pickPatient': 'Pick a patient',
  'pills.readingLibrary': 'Reading the product library.',
  'pills.loadError': 'Product data failed to load',
  'pills.checkScope.summary': 'What this check covers',
  'pills.checkScope.body':
    'The same 48-rule engine the simulation uses. Without a patient it settles class-level interactions, ingredient pairings, dose ceilings and excipients. Rules that need a condition, lab, phenotype or demographic are listed as pending. Rank 7 blocks; rank 6 needs a recorded override.',

  // -------------------------------------------------------------------- composer
  'composer.newComposition': 'New composition',
  'composer.name': 'Name',
  'composer.namePlaceholder': 'e.g. Lisinopril + amlodipine 10/5',
  'composer.selectSubstance': '— select a substance —',
  'composer.yoursGroup': (v: Vars) => `Yours (${v.n})`,
  'composer.activeGroup': (v: Vars) => `Active ingredients (${v.n})`,
  'composer.excipientGroup': (v: Vars) => `Excipients (${v.n})`,
  'composer.dose': 'Dose',
  'composer.form': 'Form',
  'composer.addAnother': '+ Add another substance',
  'composer.singleSubstanceHint': 'A single substance runs fine — add a second to see how they interact.',
  'composer.saveToLibrary': 'Save to library',
  'composer.clear': 'Clear',
  'composer.duplicateHint': 'The same substance appears twice',
  'composer.addAtLeastOne': 'Add at least one substance',
  'composer.giveItName': 'Give it a name',
  'composer.removeComponent': 'Remove component',
  'composer.formStandard': (v: Vars) => `${v.form} — standard`,
  'composer.formNotReal': (v: Vars) => `${v.form} — not a real product`,
  'composer.formPkEquivalent': (v: Vars) =>
    `${v.form} — real, but no measured PK difference from standard`,
  'composer.formDifferent': (v: Vars) => `${v.form} — different absorption profile`,

  // -------------------------------------------------------------------- findings
  'findings.verdict.blocked': 'Blocked',
  'findings.verdict.override': 'Override required',
  'findings.verdict.warn': 'Warnings',
  'findings.verdict.clear': 'No conflicts',
  'findings.verdictText.blocked': 'An absolute contraindication applies. No override is offered.',
  'findings.verdictText.override':
    'Rank 6 — avoid, not contraindicated. It proceeds on a recorded override and ranks below every allowed option.',
  'findings.verdictText.warn': 'Permitted, with warnings to read before dosing.',
  'findings.verdictText.clear': 'No composition-level conflict among the rules that can be judged without a subject.',
  'findings.group.blockers': 'Blockers',
  'findings.group.overrides': 'Requires override',
  'findings.group.warnings': 'Warnings',
  'findings.group.positives': 'Positive indications',
  'findings.group.info': 'Information',
  'findings.noRuleFired': 'No rule fired on this composition.',
  'findings.hideEvidence': 'Hide evidence',
  'findings.evidenceAndEffects': 'Evidence & effects',
  'findings.effectCount': (v: Vars) => `${v.direction} · ${v.n} effect${v.n === 1 ? '' : 's'}`,
  'findings.effects': 'Effects',
  'findings.deferred.noneRemain': (v: Vars) =>
    `Composition only, by ${v.engine}. Patient-dependent rules fire once a test subject exists.`,
  'findings.deferred.some': (v: Vars) =>
    `Composition only, by ${v.engine}.`,
  'findings.deferred.moreRules': (v: Vars) => `${v.n} more rule${v.n === 1 ? '' : 's'}`,
  'findings.deferred.matchNeedSubject': 'match an ingredient here but need a subject.',
  'findings.deferred.hide': 'hide',
  'findings.deferred.list': 'list them',
  'findings.deferred.needs': (v: Vars) => `needs ${v.needs}`,
  'findings.engine.tier': 'Tier',
  'findings.engine.doseCaps': 'Dose caps',
  'findings.engine.risks': 'Risks',
  'findings.engine.monitor': 'Monitor',

  // -------------------------------------------------------------------- pill card
  'pillcard.activeIngredients': (v: Vars) => `Active ingredients · ${v.n}`,
  'pillcard.identity': 'Identity',
  'pillcard.productClass': 'Product class',
  'pillcard.generic': 'Generic',
  'pillcard.dosageForm': 'Dosage form',
  'pillcard.route': 'Route',
  'pillcard.dosingInterval': 'Dosing interval',
  'pillcard.every': (v: Vars) => `every ${v.h} h`,
  'pillcard.strengths': 'Strengths',
  'pillcard.asMarketed': 'as marketed',
  'pillcard.modelledStrength': 'Modelled strength',
  'pillcard.referenceBrands': 'Reference brands',
  'pillcard.lactose': 'Lactose',
  'pillcard.excipients': 'Excipients',
  'pillcard.noneInComposition': 'none in this composition',
  'pillcard.tradeSecret': (v: Vars) => `${v.n} · quantities are trade secret`,
  'pillcard.noExcipients': 'No excipients in this composition.',
  'pillcard.substance': 'Substance',
  'pillcard.amount': 'Amount',
  'pillcard.notDisclosed': 'not disclosed',
  'pillcard.userEntered': 'user entered',
  'pillcard.notes': 'Notes',
  'pillcard.label': (v: Vars) => `label ${v.amount}`,
  'pillcard.containsLactose': 'Contains lactose',
  'pillcard.excipientCount': (v: Vars) =>
    `${v.n} excipient${v.n === 1 ? '' : 's'}${v.interval ? ` · every ${v.interval} h` : ''}`,
  'pillcard.formNote': (v: Vars) => `Form: ${v.form}`,
  'pillcard.formNotePkEquivalent': ' — real, but no measured PK difference from the standard tablet',
  'pillcard.dose': 'dose',
  'pillcard.baseContent': (v: Vars) => `Labelled ${v.salt} — ${v.base} mg base content`,

  // ----------------------------------------------------------------------- subject
  'subject.pageTitle': 'Test subjects',
  'subject.pageSub': 'Pick the subject to simulate. Each one changes the answer.',
  'subject.addSubject': '+ Add subject',
  'subject.restoreScenarios': (v: Vars) => `Restore ${v.n} scenario${v.n === 1 ? '' : 's'}`,
  'subject.isSelected': (v: Vars) => `${v.label} is selected`,
  'subject.runRegimen': ' — run a regimen against this twin.',
  'subject.runSimulation': 'Run a simulation',
  'subject.loadingModel': 'Loading patient model',
  'subject.modelLoadError': (v: Vars) =>
    `patient_model.json could not be loaded (${v.error}). No condition preset can be applied, so this page is showing the bare derivation pipeline only.`,
  'subject.library': '← Library',
  'subject.subjectName': 'Subject name',
  'subject.hepaticGate': 'Hepatic gate',
  'subject.hepaticGateNote':
    'Nothing is on board, so every flux is zero. The aperture is genotype alone — and it decides whether a standard metoprolol dose stays below 80.2 ng/mL, where the drug is still β1-selective, or crosses it, where it is not.',
  'subject.footer':
    'Research simulator, not a clinical decision tool. Uncalibrated proxy signals are shown as relative indices, never in absolute units.',
  'subject.untreatedBaseline': 'Untreated baseline',
  'subject.pregnancyGate': 'Pregnancy flag is set. An ACE inhibitor or ARB will not be simulated.',
  'subject.affectedAnatomyAria': 'Untreated baseline anatomy',
  // parameter panel
  'subject.group.who': 'Who',
  'subject.group.body': 'Body',
  'subject.group.circulation': 'Circulation',
  'subject.group.kidney': 'Kidney',
  'subject.group.genotype': 'Genotype',
  'subject.group.genotypeNote': 'sets the hepatic gate every metoprolol dose has to pass',
  'subject.group.conditions': 'Conditions',
  'subject.group.conditionsOn': (v: Vars) => `${v.n} on — each moves named state variables`,
  'subject.group.conditionsOff': 'each one moves named state variables',
  'subject.sexAtBirth': 'Sex at birth',
  'subject.sexCovariate': 'biological covariate',
  'subject.sexTitle':
    'A covariate in CKD-EPI, Watson, Janmahasatian and Nadler. Not gender identity.',
  'subject.male': 'Male',
  'subject.female': 'Female',
  'subject.pregnant': 'Pregnant',
  'subject.pregnantGateHint': 'hard gate on any ACE inhibitor or ARB',
  'subject.yes': 'Yes',
  'subject.no': 'No',
  'subject.age': 'Age',
  'subject.ageHint': 'adults only — paediatric maturation is not modelled',
  'subject.weight': 'Weight',
  'subject.height': 'Height',
  'subject.systolic': 'Systolic pressure',
  'subject.diastolic': 'Diastolic pressure',
  'subject.heartRate': 'Heart rate',
  'subject.reference': (v: Vars) => `reference ${v.lo}–${v.hi}`,
  'subject.serumCreatinine': 'Serum creatinine',
  'subject.cyp2d6': 'CYP2D6',
  'subject.cyp2d6Hint': 'gate aperture',
  'subject.cyp2d6GateTitle': (v: Vars) => `Gate opens to ${v.gate}× normal capacity`,
  'subject.cyp2c9': 'CYP2C9',
  'subject.cyp2c9Hint': 'losartan → EXP3174',
  'subject.phenotype.poor': 'Poor',
  'subject.phenotype.intermediate': 'Intermediate',
  'subject.phenotype.normal': 'Normal',
  'subject.phenotype.ultrarapid': 'Ultrarapid',
  'subject.modelNotLoaded': 'patient_model.json has not loaded, so no preset can be applied.',
  'subject.modifierCount': (v: Vars) => `${v.n} modifiers`,
  'subject.derived.bsa': 'BSA',
  'subject.derived.bmi': 'BMI',
  'subject.derived.bodyWater': 'Body water',
  'subject.derived.meanPressure': 'Mean pressure',
  'subject.derived.cardiacOutput': 'Cardiac output',
  'subject.derived.vascularResistance': 'Vascular resistance',
  'subject.derived.egfr': 'eGFR',
  'subject.derived.renalBloodFlow': 'Renal blood flow',
  'subject.derived.ckdStage': 'CKD stage',
  'subject.derived.hepaticGate': 'Hepatic gate',
  'subject.derived.cyp2d6Phenotype': 'CYP2D6 phenotype',
  // derived panel
  'subject.derivedPanel.title': 'What the twin derives',
  'subject.derivedPanel.source.engine': 'rules/twin.ts',
  'subject.derivedPanel.source.fallback': 'page fallback — rules/twin.ts not loaded',
  'subject.derivedPanel.whatMoved': 'What the conditions moved',
  'subject.derivedPanel.stateVarCount': (v: Vars) => `${v.n} state variable${v.n === 1 ? '' : 's'}`,
  'subject.derivedPanel.nothingMoved':
    'A condition is selected but nothing moved — that preset carries rules-engine flags only.',
  'subject.derivedPanel.moreShifted': 'More shifted variables',
  'subject.derivedPanel.allDerived': 'All derived variables',
  'subject.derivedPanel.auditTrail': 'Modifier audit trail',
  'subject.derivedPanel.warnings': 'Derivation warnings',
  'subject.derivedPanel.was': (v: Vars) => `was ${v.value}`,
  // subject card
  'subject.card.pregnant': 'Pregnant',
  'subject.card.noComorbidity': 'No comorbidity',
  'subject.card.bloodPressure': 'Blood pressure',
  'subject.card.egfr': 'eGFR',
  'subject.card.selected': 'Selected',
  'subject.card.edit': 'Edit',
  'subject.card.duplicate': 'Duplicate',
  'subject.card.delete': 'Delete',
  'subject.card.confirm': 'Confirm',
  'subject.card.confirmDelete': (v: Vars) => `Confirm delete ${v.label}`,
  'subject.card.deleteLabel': (v: Vars) => `Delete ${v.label}`,
  'subject.card.meta': (v: Vars) => `${v.age} y · ${v.sex} · ${v.weight} kg`,
  'subject.card.male': 'male',
  'subject.card.female': 'female',
  'subject.card.moreCount': (v: Vars) => `+${v.n}`,

  // ------------------------------------------------------------------ anatomy rail
  'rail.affectedAnatomy': 'Affected anatomy',
  'rail.pickSubstance': 'Pick a substance to see where it acts.',

  // ---------------------------------------------------- UI-A batch 2: rail captions
  'substances.rail.whereActs': (v: Vars) => `Where ${v.name} acts`,
  'substances.rail.shelfCaption': 'Everything on your shelf',
  'substances.rail.shelfEmpty': 'Add an active to your shelf to see where it acts.',
  'substances.addShort': '+ Shelf',
  'substances.editedCount': (v: Vars) => `${v.n} edited`,
  'common.amountAria': (v: Vars) => `${v.name} amount in milligrams`,
  'pills.rail.composeCaption': 'What this composition would act on',
  'pills.rail.composeEmpty': 'Pick an active and the body will show what it reaches.',
  'pills.rail.actsOn': (v: Vars) => `What ${v.name} acts on`,
  'pills.rail.libraryCaption': 'Everything in the library',
  'pills.rail.libraryEmpty': 'Compose a pill to see what it reaches.',

  // ------------------------------------------------ UI-A batch 2: field/card copy
  'field.typicalStartingDose': 'Typical starting dose',
  'field.maxDailyDose': 'Maximum daily dose',
  'field.halfLife': 'Half-life',
  'field.timeToPeak': 'Time to peak',
  'field.oralBioavailability': 'Oral bioavailability',
  'field.systolicBpChange': 'Systolic BP change',
  'field.ed50': 'ED50',
  'field.onsetOfEffect': 'Onset of effect',
  'field.durationOfEffect': 'Duration of effect',
  'field.clearance': 'Clearance',
  'field.volumeOfDistribution': 'Volume of distribution',
  'field.proteinBinding': 'Protein binding',
  'field.excretedUnchangedUrine': 'Excreted unchanged in urine',
  'field.typicalAmountPerTablet': 'Typical amount per tablet',
  'field.maximumPerDay': 'Maximum per day',
  'field.molecularWeight': 'Molecular weight',
  'field.startDose': 'Start dose',
  'field.maxPerDayShort': 'Max / day',
  'field.bioavailability': 'Bioavailability',
  'field.typicalAmount': 'Typical amount',

  'field.class.aceInhibitor': 'ACE inhibitor',
  'field.plain.aceInhibitor': 'Relaxes blood vessels by blocking ACE.',
  'field.class.arb': 'ARB',
  'field.plain.arb': 'Blocks the angiotensin II receptor that tightens vessels.',
  'field.class.ccb': 'Calcium channel blocker',
  'field.plain.ccb': 'Widens arteries by blocking calcium entry.',
  'field.class.thiazide': 'Thiazide diuretic',
  'field.plain.thiazide': 'Makes the kidney clear salt and water.',
  'field.class.betaBlocker': 'Beta blocker',
  'field.plain.betaBlocker': 'Slows the heart and lowers its output.',

  'field.fn.filler': 'Bulks the tablet out to a handleable size.',
  'field.fn.disintegrant': 'Makes the tablet break up after swallowing.',
  'field.fn.binder': 'Holds the tablet together.',
  'field.fn.lubricant': 'Stops the powder sticking to the press.',
  'field.fn.glidant': 'Helps the powder flow during manufacture.',
  'field.fn.coating': 'Forms the outer coat of the tablet.',
  'field.fn.colorant': 'Colours the tablet.',
  'field.fn.colorant_substrate': 'Carries the colour pigment.',
  'field.fn.surfactant': 'Helps the drug wet and dissolve.',
  'field.fn.preservative': 'Prevents microbial growth in liquids.',
  'field.fn.sweetener': 'Sweetens a liquid form.',
  'field.fn.vehicle': 'The liquid the drug is carried in.',
  'field.fn.buffer': 'Holds the pH steady.',
  'field.fn.chelator': 'Binds trace metals that would degrade the drug.',
  'field.fn.viscosity_modifier': 'Thickens a liquid form.',

  // ------------------------------------------------- simulation: run controls
  // The pill selector is a MULTI-SELECT checklist: several pills can be ticked
  // and run together as comparison arms.
  'sim.pill.label': 'Pills to test',
  'sim.pill.selectedCount': ({ n }) => (n === 1 ? '1 selected' : `${n} selected`),
  'sim.pill.editPills': 'Edit pills',
  'sim.pill.composeOwn': 'Compose your own',
  'sim.pill.composedNote': 'Tick one to run it, or several to compare them.',
  'sim.pill.eightProducts': 'Tick one to run it, or several to compare them side by side.',
  'sim.pill.formLabel': 'Dosage form',
  'sim.pill.formNotePkEquivalent': 'This form exists but behaves the same.',
  'sim.pill.formNoteDifferent': 'This form has a different absorption profile.',

  // ===== APPENDED BLOCK — simulation arm builder (RunControls PillPicker) =====
  // The pill control is now an ARM BUILDER: add an arm from the grouped,
  // searchable library, then configure it on its own row, where its dosage
  // forms live. Prefixes sim.pill.* / sim.form.* only, per the concurrent-edit
  // convention for this batch. Nothing above this marker was changed.
  'sim.pill.armsLabel': 'Arms to compare',
  'sim.pill.armCount': ({ n }) => (n === 1 ? '1 arm' : `${n} arms`),
  'sim.pill.rolePrimary': 'Primary',
  'sim.pill.roleComparison': 'Comparison',
  'sim.pill.removeArm': ({ name }) => `Remove ${name}`,
  'sim.pill.singleArmNote':
    'This is the arm the charts and the body follow. A run needs at least one, so add another before removing it.',
  'sim.pill.primaryNote':
    'The first arm is the primary one — the charts and the body follow it. The rest run alongside it and are ranked against it.',
  'sim.pill.noneConsequence':
    'No arm chosen, so there is nothing to run. Add one below and it appears here with its dosage forms.',
  'sim.pill.addArm': 'Add an arm',
  'sim.pill.libraryCount': ({ n }) => `${n} in the library`,
  'sim.pill.searchPlaceholder': 'Search the library',
  'sim.pill.groupMono': 'Monotherapy',
  'sim.pill.groupCombo': 'Fixed-dose combination',
  'sim.pill.added': 'Added',
  'sim.pill.noMatch': ({ q }) =>
    `Nothing in the library matches “${q}”, so there is nothing to add. Clear the search to see all of it.`,
  'sim.form.aria': ({ drug }) => `Dosage form for ${drug}`,
  'sim.form.primaryOnly': 'Dosage form can be set on the primary arm only.',
  // ===== end appended block =====

  'sim.subject.label': 'Patient',
  'sim.subject.build': 'Build a patient',

  'sim.run.run': 'Run simulation',
  'sim.run.stop': 'Stop',
  'sim.run.settings': 'Run settings',
  'sim.run.horizon': 'Time simulated',
  'sim.run.initialConditions': 'Starting point',
  'sim.run.steadyState': 'Steady state',
  'sim.run.firstDose': 'First dose',
  'sim.run.steadyStateNote': 'Chronic dosing — the fair basis for comparing regimens.',
  'sim.run.firstDoseNote':
    'First dose only. Amlodipine needs 7–8 days to reach steady state, so comparisons are not valid here.',
  'sim.run.population': 'Virtual patients',
  'sim.run.populationN': ({ n }) => `${n}`,
  'sim.run.singleTwin': 'This patient only',
  'sim.run.populationNote': 'More than one samples the variability between people.',
  'sim.run.frameInterval': 'Detail',
  'sim.run.frameMinutes': ({ n }) => `every ${n} min`,

  // ============================================================ pills/subject wiring
  // Added while wiring Composer/Findings/PillCard/DerivedPanel/ParameterPanel/
  // SubjectCard to useT(). Most strings in those six files reuse keys already
  // above (composer.*, findings.*, pillcard.*, subject.*, common.*); these are
  // only the ones that had no existing equivalent. Prefixed pill.*/subj.* per
  // the concurrent-edit convention for this batch.
  'pill.compose.nameAria': 'Composition name',
  'subj.cyp2c9Activity': 'CYP2C9 activity',
  'subj.condition.gradeAria': (v: Vars) => `${v.label} grade`,
  'subj.readout.bsa': 'Body surface area',
  'subj.readout.bmi': 'BMI',
  'subj.readout.lbw': 'Lean body weight',
  'subj.readout.tbw': 'Total body water',
  'subj.readout.plasmaVolume': 'Plasma volume',
  'subj.readout.map': 'Mean arterial pressure',
  'subj.readout.cardiacOutput': 'Cardiac output',
  'subj.readout.strokeVolume': 'Stroke volume',
  'subj.readout.svr': 'Vascular resistance',
  'subj.readout.arterialCompliance': 'Arterial compliance',
  'subj.readout.egfr': 'eGFR',
  'subj.readout.absoluteGfr': 'Absolute GFR',
  'subj.readout.crcl': 'Creatinine clearance',
  'subj.readout.renalBloodFlow': 'Renal blood flow',
  'subj.readout.filtrationFraction': 'Filtration fraction',
  'subj.readout.hepaticBloodFlow': 'Hepatic blood flow',
  'subj.readout.plasmaReninActivity': 'Plasma renin activity',
  'subj.readout.sympatheticTone': 'Sympathetic tone',
  'subj.readout.allometricClScalar': 'Allometric clearance scalar',

  // ======================================================================
  // sim.* — UI-SIM wiring: AiPanel, BenchPanel, charts.tsx, LiveCharts.tsx,
  // OrganPanel, RankedList, ReportPanel, ScenePanel, TopCombinationsPanel,
  // WeightsPanel. Interface chrome only — headings, buttons, empty states,
  // chart axis labels/captions, status messages. Never the AI panel's
  // generated prose, never drug/substance names, units, citations or
  // rule-mechanism text that carries one. Appended at the end of this block
  // per the concurrent-edit convention; do not reorder.
  // ======================================================================
  'sim.ai.title': 'Clinical reasoning, generated',
  'sim.ai.sub':
    "A language model reading the engine's output. It explains and proposes; it decides nothing, and every number it writes is checked against the data it was given.",
  'sim.ai.askAgain': 'Ask again',
  'sim.ai.explainThis': 'Explain this',
  'sim.ai.stop': 'Stop',
  'sim.ai.hideSettings': 'Hide settings',
  'sim.ai.showSettings': 'AI settings',
  'sim.ai.notConfigured': 'no provider configured — the panel is off',
  'sim.ai.explainingLabel': 'explaining:',
  'sim.ai.generatedMark': 'generated text — not a source',
  'sim.ai.waitingFirstToken': 'waiting for the first token…',
  'sim.ai.verdictCleanStrong': (v: Vars) => `${v.n} numbers checked, all traceable.`,
  'sim.ai.verdictCleanRest': (v: Vars) =>
    `Every figure above was present in the ${v.facts} values handed to the model. Hover one to see what it traces to.`,
  'sim.ai.verdictDirtyStrong': (v: Vars) =>
    `${v.unsupported} of ${v.total} numbers do not trace to the supplied data`,
  'sim.ai.verdictDirtyRest':
    'They are struck through above and must not be read as sourced. This is the boundary doing its job, not a rendering fault: the model produced a figure the engine never computed.',
  'sim.ai.worthWatching': 'Worth watching:',
  'sim.ai.sceneNote':
    'A scene is a view of the run that already happened. Switching to it re-frames the anatomy and changes no number.',
  'sim.ai.watchIt': 'Watch it',
  'sim.ai.proposedNext': 'Proposed next simulations',
  'sim.ai.suggestsNote':
    "The model proposes; the engine adjudicates. Each of these is a regimen this product already defines — the model chose from that list by id and could not name a dose of its own. Pressing one runs the deterministic simulation and the result comes from the engine, not from here.",
  'sim.ai.simulateThis': 'Simulate this',
  'sim.ai.discarded': (v: Vars) =>
    `Discarded ${v.n === 1 ? 'a proposal' : `${v.n} proposals`} naming ${v.ids} — no such regimen exists in this product, so there is nothing to run and nothing was invented to fill the gap.`,
  'sim.ai.failureTitleNoProvider': 'No AI provider configured',
  'sim.ai.failureTitleNetwork': 'The model could not be reached',
  'sim.ai.failureTitleRateLimit': 'The provider is rate limiting',
  'sim.ai.failureTitleServer': 'The provider returned an error',
  'sim.ai.failureTitleMalformed': 'The reply could not be read',
  'sim.ai.failureTitleAborted': 'Cancelled',
  'sim.ai.failureTitleTimeout': 'The model did not answer in time',
  'sim.ai.failureNote':
    'Nothing else on this page depends on the model. The simulation, the rules, the ranking and the report are unaffected — and no canned paragraph is being shown in its place.',
  'sim.ai.openSettings': 'Open AI settings',
  'sim.ai.settingsHeading': 'AI provider',
  'sim.ai.close': 'Close',
  'sim.ai.settingsIntro':
    'Which model answers is a setting, not a code change. If one provider throttles during the demo, switch here and ask again.',
  'sim.ai.provider': 'Provider',
  'sim.ai.automatic': 'Automatic — first one configured',
  'sim.ai.workerEndpoint': 'Worker endpoint',
  'sim.ai.workerShouldCall': 'The Worker should call',
  'sim.ai.geminiKeyLabel': 'Gemini key, for the browser-direct path',
  'sim.ai.geminiKeyPlaceholder': 'paste a throwaway key',
  'sim.ai.keyWarning':
    'A key pasted here lives in this browser and is visible to anyone who opens devtools or reads the network tab. That is fine for a demo on your own machine with a throwaway key. It is not an arrangement to ship — route Gemini through the Worker instead, where the key stays server-side.',

  'sim.bench.orderingSays': 'What the ordering says',
  'sim.bench.failed': (v: Vars) => `Bench failed: ${v.error}`,
  'sim.bench.syntheticWarning':
    'These arms were produced by the placeholder engine, not by src/engine. The ordering below is a property of a stand-in model and carries no pharmacological claim.',
  'sim.bench.singleArmWarning':
    'Only one feasible option was evaluated. No ranking is shown — a recommendation with no runner-up is suppressed by design.',
  'sim.bench.bpEffectOnly': 'Blood-pressure effect only',
  'sim.bench.effectOnlyNote':
    "This is not the product's ranking. It is ΔSBP alone, with no safety term, no appropriateness term, no safety floor and no rule tiering. It is shown so the run is not wasted, and it must not be read as a recommendation.",

  'sim.chart.noSamplesYet': 'No samples yet.',
  'sim.chart.nothingToRankYet': 'Nothing to rank yet.',
  'sim.chart.efficacy': 'Efficacy',
  'sim.chart.safety': 'Safety',
  'sim.chart.appropriateness': 'Appropriateness',
  'sim.chart.composite': 'composite',
  'sim.chart.systolicReductionLabel': 'systolic reduction, mmHg',
  'sim.chart.plasmaConcentration': 'Plasma concentration',
  'sim.chart.concSubtitle':
    "EXP3174 — losartan's active metabolite — is what is plotted here. Losartan parent has its own axis.",
  'sim.chart.hoursSinceFirstDose': 'Hours since first dose',
  'sim.chart.emptyConcentration': 'Run a simulation to stream concentrations.',
  'sim.chart.losartanParentTitle': 'Losartan parent — separate axis',
  'sim.chart.losartanParentSubtitle': 'Shown alone because its peak-to-trough ratio is ≈ 2000.',
  'sim.chart.noLosartanInRegimen': 'No losartan in this regimen.',
  'sim.chart.concParentFootnote':
    'Never place this curve on the shared axis. EXP3174 is the moiety carrying 60–85 % of the effect.',
  'sim.chart.haemodynamicResponse': 'Haemodynamic response',
  'sim.chart.haemoSubtitle': 'Blood pressure in mmHg and heart rate in bpm, on one axis.',
  'sim.chart.systolicBp': 'Systolic blood pressure',
  'sim.chart.systolicShort': 'Systolic',
  'sim.chart.diastolicBp': 'Diastolic blood pressure',
  'sim.chart.diastolicShort': 'Diastolic',
  'sim.chart.meanArterialPressure': 'Mean arterial pressure',
  'sim.chart.meanArterialShort': 'Mean arterial',
  'sim.chart.heartRate': 'Heart rate',
  'sim.chart.thisRunSuffix': ' · this run',
  'sim.chart.emptyHaemodynamic': 'Run a simulation to stream the haemodynamic response.',
  'sim.chart.untreatedBaselineSystolic': (v: Vars) => `Untreated baseline systolic — ${v.value} mmHg`,
  'sim.chart.targetEngagement': 'Target engagement',
  'sim.chart.engagementSubtitle': 'Fraction of each target engaged, 0–1.',
  'sim.chart.fractionEngaged': 'Fraction engaged',
  'sim.chart.emptyEngagement': 'Run a simulation to stream target engagement.',
  'sim.chart.engagementFootnote':
    'β2 occupancy is the selectivity-loss channel. NCC / SLC12A3 in distal convoluted tubule cells is the only target this model claims at cell level.',
  'sim.chart.engAceInhibitionPlasma': 'ACE inhibition (plasma)',
  'sim.chart.engAt1Blockade': 'AT1 blockade',
  'sim.chart.engCav12Vessel': 'Cav1.2 block, vascular smooth muscle',
  'sim.chart.engCav12Heart': 'Cav1.2 block, myocardium',
  'sim.chart.engNccInhibition': 'NCC inhibition, distal convoluted tubule',
  'sim.chart.engBeta1Occupancy': 'β1 occupancy',
  'sim.chart.engBeta2Occupancy': 'β2 occupancy, the selectivity-loss channel',
  'sim.chart.engShortAce': 'ACE inhibition',
  'sim.chart.engShortAt1': 'AT1 blockade',
  'sim.chart.engShortCav12Vessel': 'Cav1.2 — vessel',
  'sim.chart.engShortCav12Heart': 'Cav1.2 — heart',
  'sim.chart.engShortNcc': 'NCC inhibition',
  'sim.chart.engShortBeta1': 'β1 occupancy',
  'sim.chart.engShortBeta2': 'β2 occupancy',

  'sim.ranked.declinedToRank': 'Declined to rank',
  'sim.ranked.refusalNote':
    'The refusal is the output. Fabricating a ranking here would be the single most detectable invention in the product — routes and their PK are what a pharmacist judge knows by heart.',
  'sim.ranked.tooCloseToCall': 'too close to call',
  'sim.ranked.disqualifiedNoRule': 'Disqualified, but the scorer reported no rule to show.',
  'sim.ranked.systolicChange': 'Systolic change',
  'sim.ranked.reached': (v: Vars) => `Reached ${v.target}`,
  'sim.ranked.safetyPenalties': 'Safety penalties',
  'sim.ranked.penaltyBreakdown': (v: Vars) => `${v.rule} rule · ${v.risk} risk · ${v.lab} lab`,
  'sim.ranked.disqualifiedSectionHeading': 'Disqualified — not ranked, no scores shown',
  'sim.ranked.rankingUnavailable': 'Ranking unavailable',
  'sim.ranked.noRankingDefault': 'The scorer returned no ranking for this comparison set.',
  'sim.ranked.simOutputRealNote':
    'The simulation output is real; the ranking is not being invented to fill the gap.',
  'sim.ranked.tieBannerStrong': (v: Vars) => `${v.n} arms are too close to call.`,
  'sim.ranked.tieBannerRest':
    "They fall inside the model's tie threshold, so the order between them is arithmetic rather than a recommendation — choose on the efficacy, safety and appropriateness components shown beside each score.",

  'sim.report.steadyStateExposure': 'Steady-state exposure',
  'sim.report.adverseEventProbability': 'Adverse-event probability over the horizon',
  'sim.report.bestFormulationType': 'Best formulation type',
  'sim.report.whatModelDoesNotRepresent': 'What this model does not represent',
  'sim.report.twinDerivationWarnings': 'Twin derivation warnings',
  'sim.report.whyThisResult': 'Why this result',
  'sim.report.modellingAssumptions': 'Modelling assumptions behind these numbers',
  'sim.report.eyebrow': 'Simulation report',
  'sim.report.tableMoiety': 'Moiety',
  'sim.report.tablePeak': 'Peak',
  'sim.report.tableTrough': 'Trough',
  'sim.report.tablePeakTrough': 'Peak:trough',
  'sim.report.concentrationsUnitNote': 'Concentrations in ng/mL.',
  'sim.report.noAdverseEvents': 'No adverse-event probability above the reporting threshold.',
  'sim.report.declinedNoData': 'Declined to rank — data does not exist',
  'sim.report.riskAngioedema': 'Angioedema',
  'sim.report.riskBronchospasm': 'Bronchospasm',
  'sim.report.riskHyperkalemia': 'Hyperkalaemia',
  'sim.report.riskAcuteGfrDrop': 'Acute GFR drop',
  'sim.report.riskBradycardia': 'Bradycardia',
  'sim.report.riskHyponatremia': 'Hyponatraemia',
  'sim.report.riskHypokalemia': 'Hypokalaemia',
  'sim.report.riskDizzinessOrthostatic': 'Dizziness / orthostatic',
  'sim.report.riskHyperuricemiaGout': 'Hyperuricaemia / gout',
  'sim.report.riskPeripheralEdema': 'Peripheral oedema',
  'sim.report.riskCough': 'Cough',

  // ---------------------------------------------------------------- evidence
  // Chrome for the provenance layer (src/ui/simulation/ReportPanel.tsx). What
  // is translated here is only the FRAME — what a parameter is called, what a
  // tier means, how many values are cited. The source names, the verbatim
  // quotes, the PMIDs, the trial names, the drug names and the units are never
  // translated and never pass through this file: a translated quote can no
  // longer be checked against the document it came from, which is the entire
  // reason it is on screen. CITED / ESTIMATED / NOT FOUND are likewise printed
  // as the dataset words them, in every language.
  'sim.evidence.aria': 'Evidence behind this result',
  'sim.evidence.heading': 'What this result rests on',
  'sim.evidence.restsOn': (v: Vars) =>
    `This recommendation rests on ${v.cited} cited values and ${v.estimated} estimates.`,
  'sim.evidence.notFoundClause': (v: Vars) =>
    `${v.n} more could not be sourced at all, and are shown blank rather than filled in.`,
  'sim.evidence.rulesClause': (v: Vars) =>
    `${v.n} safety rule${v.n === 1 ? '' : 's'} fired, each with its own citation.`,
  'sim.evidence.doseAgainstLabel': 'Dose, against the label',
  'sim.evidence.bpHeading': 'Where the projected pressure change comes from',
  'sim.evidence.showAll': 'Every parameter behind these drugs',
  'sim.evidence.openSource': 'Open the source',
  'sim.evidence.noQuote': 'No verbatim text recorded for this value.',
  'sim.evidence.notSourced': 'Searched; no source located. Left blank rather than filled in.',
  'sim.evidence.sourceLabel': 'Source',
  'sim.evidence.tier1': 'Regulatory labeling',
  'sim.evidence.tier2': 'Peer-reviewed study',
  'sim.evidence.tier3': 'Chemical / drug database',
  'sim.evidence.tier4': 'Secondary summary',
  'sim.evidence.doseStart': 'Label starting dose',
  'sim.evidence.doseUsual': 'Label usual range',
  'sim.evidence.doseMax': 'Label maximum per day',
  'sim.evidence.paramF': 'Oral bioavailability',
  'sim.evidence.paramTmax': 'Time to peak plasma level',
  'sim.evidence.paramHalfLife': 'Elimination half-life',
  'sim.evidence.paramVd': 'Volume of distribution',
  'sim.evidence.paramClearance': 'Clearance',
  'sim.evidence.paramRenal': 'Excreted unchanged by the kidney',
  'sim.evidence.paramSbpDrop': 'Systolic reduction stated by the source',
  'sim.evidence.paramDbpDrop': 'Diastolic reduction stated by the source',
  'sim.evidence.paramOnset': 'Onset of effect',
  'sim.evidence.paramDuration': 'Duration of effect',
  'sim.evidence.modelDoseResponse': 'Dose–response curve',
  'sim.evidence.modelBaseline': 'Effect of pre-treatment pressure',
  'sim.evidence.modelPooling': 'Ceiling on combining two drugs',
  'sim.evidence.modelHomeostasis': 'Cardiovascular model gains',
  'sim.evidence.armBasis': 'Doses in this arm, against the label',
  'sim.evidence.rankingBasis': 'What every row in this list rests on',
  'sim.evidence.rankingBasisNote':
    'Every strength listed is a licensed strength from the label. The pressure change on each row is ' +
    'estimated with the same dose–response model a full simulation uses.',

  'sim.scene.anatomy': 'Anatomy',
  'sim.scene.everySceneNote':
    'Every scene reads the same run. Switching one changes the view, never the simulation.',
  'sim.scene.tablistAria': 'Scene',
  'sim.scene.staticCaption': 'Where this regimen acts. Nothing is animated until a run produces frames.',

  'sim.topcombos.title': 'Top 5 combinations',
  'sim.topcombos.pickSubject': 'Pick a subject to see the ranking.',
  'sim.topcombos.allBlocked': 'Every candidate combination is hard-blocked for this patient.',
  'sim.topcombos.runThroughSimulation': 'Run this through the simulation',
  'sim.topcombos.diastolicChange': 'Diastolic change',
  'sim.topcombos.adverseBurden': 'Adverse burden',

  'sim.common.comparisonSet': 'Comparison set',
  'sim.common.excluded': 'Excluded',

  'sim.weights.ariaLabel': 'Scoring weights',
  'sim.weights.estimatedTag': 'ESTIMATED',
  'sim.weights.explainerPre': 'Every value on this panel is',
  'sim.weights.explainerPost':
    '. The ordering is the defensible part; the exact numbers are not. Move one and the ranking re-computes from the runs already simulated — no re-run needed.',
  'sim.weights.movedWarning': (v: Vars) =>
    `${v.n} weight${v.n === 1 ? '' : 's'} moved away from the spec default. The ranking below is yours, not the spec's.`,
  'sim.weights.resetDefaults': 'Reset to spec defaults',
  'sim.weights.rescoring': 'Re-scoring…',
  'sim.weights.rescoreRanking': 'Re-score ranking',
  'sim.weights.compositeSumWarning': (v: Vars) =>
    `Composite weights sum to ${v.sum}, not 1.00. The ranking still computes, but the composite is no longer on the spec's 0–100 scale — read the E, S and A bars, not the total.`,
  'sim.weights.specDefault': (v: Vars) => `(spec default ${v.def})`,

  'sim.ai.numberFlagNotInContext': 'not in context',
  'sim.ai.numberFlagUnsourcedSr':
    '— this number was not in the data supplied to the model and is not sourced',
  'sim.ai.numberTracePresent': 'present in the supplied context',
  'sim.ai.configured': 'Configured.',

  // ------------------------------------------------------------ layout zones
  // research/10-LAYOUT-BLUEPRINT.md §2. Every centre column is Act → Answer →
  // Evidence → Detail, in that order, on every page. These are the four
  // headings a reader sees; the zone NAMES are for the blueprint, not the user,
  // so each page words its own.
  'zone.quickJump': 'Quick jump',
  'zone.complete': 'Complete',
  'zone.incomplete': 'Not finished yet',
  'zone.doneOfTotal': (v: Vars) => `${v.done} of ${v.total} done`,

  'sim.zone.act': 'Set up the run',
  'sim.zone.actLead':
    'Pick the pill, pick the patient, press Run. Nothing else is on this page until you do — a dose recommendation is a finding of the simulation, not an input to it.',
  'sim.zone.answer': 'What the simulation found',
  'sim.zone.answerLead':
    'The regimen that was run and what it did, then the best-scoring alternatives for this same patient.',
  'sim.zone.evidence': 'Why it found that',
  'sim.zone.evidenceLead':
    'The curves, the body, the rankings and the rules the answer above was built from.',
  'sim.zone.detail': 'Fine print',
  'sim.zone.detailLead':
    'Scoring weights, engine settings, and what the model does not represent. Open what you need.',

  'sim.pill.why':
    'The substances and milligrams of the ticked pill are exactly what the engine is given. Tick more than one to run them as comparison arms.',
  'sim.subject.why':
    'The patient sets kidney function, liver genotype and the conditions the rules read — which is what decides whether a drug is dose-reduced, preferred, or refused outright.',
  'sim.run.why':
    'The run streams plasma concentration, target engagement and blood pressure across the chosen horizon. Everything below this card is read off those frames.',
  'sim.run.groupTitle': 'Run it',

  'sim.act.checkPill': 'Pill ticked',
  'sim.act.checkPatient': 'Patient chosen',
  'sim.act.checkRun': 'Simulation run',
  'sim.act.noPillConsequence':
    'No pill is loaded, so the engine has nothing to give the patient. Compose one and it appears in this list.',

  'sim.demos.title': 'Guided demonstrations',
  'sim.demos.why':
    'Each one sets up a pill, a patient and a horizon that make one behaviour of the model visible, and runs it for you.',

  'sim.section.curves': 'Curves over time',
  'sim.section.body': 'The body, full width',
  'sim.section.alternatives': 'Alternatives ranked',
  'sim.section.bestDose': 'Best dose',
  'sim.section.rulesTables': 'Rules and exposure tables',
  'sim.section.compare': 'Compare runs',

  'sim.detail.weights': 'Scoring weights',
  'sim.detail.engine': 'Engine, data and run settings',
  'sim.detail.limits': 'What this model does not represent',

  'sim.next.title': 'Where to next',
  'sim.next.desc':
    'Change the pill or the patient and run it again, or take this result to another page.',

  // -------------------------------------------------------- subject page zones
  'subject.zone.act': 'Choose or build a patient',
  'subject.zone.actLead':
    'A subject is a set of inputs. Everything the product shows about them is derived from these, so this is the only place a patient changes.',
  'subject.zone.answer': 'The twin this patient implies',
  'subject.zone.answerLead':
    'The physiology every simulation on this patient starts from, before any drug is given.',
  'subject.zone.evidence': 'What the conditions moved',
  'subject.zone.evidenceLead':
    'Switching a condition on moves named state variables by visible amounts. These are the ones it moved.',
  'subject.zone.detail': 'Fine print',
  'subject.zone.detailLead':
    'The full derived state, the modifier audit trail, and any derivation warning.',
  'subject.editor.zoneAct': 'Edit this patient',
  'subject.editor.zoneActLead':
    'Every group below says what the product does with it. Change a value and the twin under it moves as you watch.',
  'subject.editor.continue': 'Continue to the simulation',

  'subject.group.whoWhy':
    'Age and sex scale clearance and enter the eGFR equation. The pregnancy flag is a hard gate: an ACE inhibitor or an ARB is not simulated for a pregnant subject at all.',
  'subject.group.bodyWhy':
    'Weight and height set body surface area, total body water and the allometric clearance scalar — together, the volume a dose is distributed into and the rate it leaves at.',
  'subject.group.circulationWhy':
    'The untreated pressures and heart rate are the baseline every simulated change is measured against, and they derive mean pressure, cardiac output and vascular resistance.',
  'subject.group.kidneyWhy':
    'Serum creatinine sets kidney function (eGFR), which is what decides whether a renally cleared drug is dose-reduced or avoided for this patient.',
  'subject.group.genotypeWhy':
    'CYP2D6 sets the hepatic gate every metoprolol dose has to pass. A poor metaboliser reaches the concentration where the drug stops being β1-selective on a standard dose; a normal metaboliser does not.',
  'subject.group.conditionsWhy':
    'A condition applies a set of modifiers that move named state variables. Those moved variables are what the rules and the engine read — the label on its own changes nothing.',
  'subject.group.conditionsNoneConsequence':
    'No conditions — the twin will be a healthy adult of this age and weight.',
  'subject.emptyLibrary':
    'No subjects — there is nobody to simulate. Add one, or restore the shipped scenarios.',

  'subject.headline.title': 'Derived twin',
  'subject.headline.untreated':
    'Untreated. Every drug concentration and every target engagement in this state is zero, so this is the body before the first dose.',
  'subject.headline.noneSelected':
    'No subject is selected, so nothing is derived. Pick one above and its twin appears here.',
  'subject.form.quickJumpAria': 'Jump to a group in this form',
  'subject.completeness': (v: Vars) => `${v.n} of 6 groups reviewed`,

  // -------------------------------------------------- UI-C: hardcoded-string pass
  'sim.alert.syntheticTitle': 'Placeholder engine.',
  'sim.alert.syntheticBody': 'Every curve, score and probability on this screen is a shape, not a measurement.',
  'sim.alert.dataErrorTitle': 'Data files failed to load.',
  'sim.alert.dataErrorBody': (v: Vars) =>
    `${v.message} — the twin cannot be derived and no rule can fire. Nothing on this page should be read until this is fixed.`,
  'sim.chart.logAxis': 'Log concentration axis',
  'sim.chart.showParent': 'Show losartan parent (separate axis)',
  'sim.chart.framesStreamed': (v: Vars) => `${v.n} frames${v.streaming ? ' · streaming' : ''}`,
  'sim.bench.comboTitle': 'Combination ranking — all ten pairs',
  'sim.bench.doseTitle': 'Best dose — amlodipine ladder',
  'sim.bench.labelAsStated': 'Label, as stated:',
  'sim.tray.tickToOverlay': 'Tick a finished run to overlay it, dashed, on the charts.',
  'sim.tray.day': (v: Vars) => (v.steadyState ? 'day 8' : 'day 1'),
  'sim.weights.rerankNote': 'Re-ranks the arms already simulated. The ranking above moves as you drag.',
  'sim.weights.runBenchFirst': 'Run a bench first — there is nothing to re-rank yet.',
  'sim.detail.engineLabel': (v: Vars) => `Engine: ${v.source}${v.worker ? ' (Web Worker)' : ''}`,
  'sim.detail.engineNotProbed': 'Engine: not yet probed',
  'sim.detail.loadingData': ' · loading data files…',
  'sim.detail.dataLoaded': ' · data files loaded',
  'sim.next.buildSubject': 'Build a subject',

  'sim.report.disclaimerAria': 'Disclaimer',
  'sim.report.endOfRunAria': 'End of run report',
  'sim.report.hHorizon': (v: Vars) => `${v.h} h horizon`,
  'sim.report.steadyStateInitial': 'steady-state initial conditions',
  'sim.report.firstDoseInitial': 'first-dose initial conditions',
  'sim.report.singleTwin': 'single twin',
  'sim.report.virtualSubjects': (v: Vars) => `${v.n} virtual subjects`,
  'sim.report.framesEmittedCount': (v: Vars) => `${v.n} frames`,
  'sim.report.effectTroughPeak': (v: Vars) => ` · effect trough:peak ${v.value}`,
  'sim.report.periodDays': (v: Vars) => `${v.days} days`,
  'sim.report.periodHours': (v: Vars) => `${v.h} hours`,
  'sim.report.singleVirtualTwin': 'a single virtual twin',
  'sim.report.fromSteadyState': 'from steady state',
  'sim.report.fromFirstDose': 'from the first dose',
  'sim.report.ledeSentence': (v: Vars) =>
    `Over ${v.period} ${v.basis}, ${v.regimen} changed systolic pressure by ${v.dsbp} mmHg and diastolic by ${v.ddbp} mmHg in ${v.who}. Serum potassium finished at ${v.k} mmol/L and creatinine at ${v.cr} mg/dL.`,
  'sim.report.unitSystolic': 'mmHg systolic',
  'sim.report.unitDiastolic': 'mmHg diastolic',
  'sim.report.unitSerumK': 'mmol/L serum K',
  'sim.report.unitCreatinine': 'mg/dL creatinine',
  'sim.report.spreadP': (v: Vars) => `P05 ${v.p05} · P95 ${v.p95}`,

  'sim.topcombos.ariaLabel': 'Top 5 dose combinations',
  'sim.topcombos.noPatientPre': 'No patient has been picked yet, so this is ranked for',
  'sim.topcombos.typicalAdultFallback': 'a typical adult with untreated hypertension',
  'sim.topcombos.noPatientPost':
    '— the default reference subject. Pick a patient in the set-up above and this list re-ranks for them.',
  'sim.topcombos.rankedFor': (v: Vars) => `Ranked for ${v.subject}.`,
  'sim.topcombos.everyDrugNote': (v: Vars) =>
    ` Every dosable drug at every licensed strength, alone and as unordered pairs — ${v.total} candidates, scored analytically (not simulated) in milliseconds and re-ranked whenever the subject changes. Ranked by projected blood-pressure reduction weighed against adverse burden, not by raw efficacy.`,
  'sim.topcombos.excludedNote': (v: Vars) =>
    `${v.excluded} of ${v.total} candidates hard-blocked outright for this subject (rank 7 — e.g. an ACE inhibitor or ARB in pregnancy). Everything else, dual RAAS blockade included, is ranked on its merits below.`,
  'sim.topcombos.rerankedFor': (v: Vars) => `Reranked for ${v.subject}`,
  'sim.topcombos.rerankedAgainst': 'against the default reference adult.',
  'sim.topcombos.moreBlocked': (v: Vars) =>
    `${v.n} more candidate${v.n === 1 ? '' : 's'} ${v.n === 1 ? 'is' : 'are'} hard-blocked for this patient than for the reference adult. `,
  'sim.topcombos.droppedTop5': (v: Vars) => `Dropped out of the top 5: ${v.list}. `,
  'sim.topcombos.newTop5': (v: Vars) => `Newly in the top 5: ${v.list}.`,
  'sim.topcombos.tagDualRaas': 'dual RAAS blockade',
  'sim.topcombos.tagBetaRas': 'beta + RAS crossover',
  'sim.topcombos.tagDoseExtrapolated': 'dose extrapolated',
  'sim.topcombos.reasonPrimary': (v: Vars) =>
    `${v.dsbp} mmHg systolic, ${v.ddbp} mmHg diastolic projected, weighed against an adverse-burden penalty of ${v.burden} points — the largest blood-pressure drop is not automatically the top pick.`,
  'sim.topcombos.reasonDualRaas':
    'Dual RAAS blockade — an ACE inhibitor and an ARB act on the same saturating pathway, so the second drug buys little extra reduction while adding its own risk. Ranked here, not hidden: discovering this is the point.',
  'sim.topcombos.reasonBetaRas':
    "Beta-blocker plus a RAS inhibitor: part of the beta-blocker's effect competes with the RAS inhibitor for the same renin-suppression room.",
  'sim.topcombos.reasonExtrapolated': (v: Vars) =>
    `Dose outside the validated 0.25×–4× window for ${v.drugs} — the effect is clamped at the edge of the fit, not extrapolated past it.`,

  'sim.ai.panelAria': 'AI reasoning',
  'sim.ai.mark': 'AI',

  'sidebar.primaryNav': 'Primary',

  'substances.metaboliteTag': 'Metabolite',
  'substances.valuePlaceholderNone': 'none',
  'substances.editedTitle': 'You changed this value; it is not the sourced one.',

  // ---------------------------------------------------------- organ illustrations (Agent ORGANS)
  'organ.common.notModelledInBuild': (v: Vars) => `${v.what} — not modelled in this build`,

  'organ.badges.header': 'Adverse-effect channels',
  'organ.badges.firingCount': (v: Vars) => `${v.n} firing`,
  'organ.badges.noneFiring': 'No adverse-effect channel is above its firing threshold.',
  'organ.badges.noRun': 'No run in progress.',
  'organ.badges.rare': 'rare',
  'organ.badges.drivenBy': 'Driven by:',
  'organ.badges.reportedIncidence': 'Reported incidence:',
  'organ.badges.thresholdNote': (v: Vars) =>
    `Firing thresholds θ_on ${v.on} / θ_off ${v.off} are visual tuning constants, not clinical thresholds.`,

  'organ.selectivity.title': 'β1 / β2 selectivity',
  'organ.selectivity.ariaLabel': 'Metoprolol selectivity',
  'organ.selectivity.svgTitle': 'Metoprolol plasma concentration against the beta-1 selectivity crossover',
  'organ.selectivity.beta1Cardiac': 'β1 cardiac',
  'organ.selectivity.beta2Airway': 'β2 airway',
  'organ.selectivity.measuredAnchor': 'measured anchor at 100 mg b.i.d.:',
  'organ.selectivity.cyp2d6NotModelled': 'CYP2D6 capacity not modelled',
  'organ.selectivity.cyp2d6Value': (v: Vars) => `CYP2D6 capacity ${v.value} × normal`,
  'organ.selectivity.concNotModelled': 'Metoprolol concentration not modelled in this build.',
  'organ.selectivity.aboveCrossover': (v: Vars) =>
    `Above the crossover. β1 selectivity is diminishing and β2 blockade is increasing — the airway channel is live${v.suffix}.`,
  'organ.selectivity.bradycardicSuffix': ' and the heart rate is in the bradycardic range',
  'organ.selectivity.belowCrossover':
    'Below the crossover. The drug is behaving as β1-selective in this patient at this concentration.',
  'organ.selectivity.sourceSummary': 'Where 80.2 ng/mL comes from',
  'organ.selectivity.sourceNote':
    'The crossover is a concentration gate, not a property of the dose — which is why it is genotype-dependent. A CYP2D6 poor metaboliser can cross it on a standard dose that leaves a normal metaboliser well below it.',

  'organ.adrenal.title':
    'Adrenal gland — outer cortex (zona glomerulosa). Cortex colour bound to mediators.aldosterone_fold. Aldosterone breakthrough over weeks is not modelled in this build.',
  'organ.adrenal.cortexLabel': 'outer cortex (zona glomerulosa)',
  'organ.adrenal.aldosteroneNotModelled': 'aldosterone not modelled',
  'organ.adrenal.aldosteroneValue': (v: Vars) => `aldosterone ${v.value} × baseline`,
  'organ.adrenal.cortexTitle':
    'Tissue level (T3). Lisinopril blocks production of the signal; losartan blocks reception of it. Same downstream result, two different steps on one cascade.',
  'organ.adrenal.raasAndThiazide': 'RAAS blockade and thiazide push in opposite directions',
  'organ.adrenal.raasOnly': 'stream thinning → K⁺ stops leaving the collecting duct',
  'organ.adrenal.thiazideOnly': 'volume depletion → RAAS activation → K⁺ wasted twice over',
  'organ.adrenal.raasAriaLabel': 'RAAS cascade',
  'organ.adrenal.raasTitle': 'Renin–angiotensin–aldosterone cascade with drug stop-bars',
  'organ.adrenal.reninRising': 'renin rises while blood pressure falls — expected, not a failure',
  'organ.adrenal.stopBarNotModelled': (v: Vars) =>
    `${v.label} blockade not modelled — bar height is the engagement fraction.`,
  'organ.adrenal.stopBarValue': (v: Vars) =>
    `${v.label} blockade ${v.pct} % — bar height is the engagement fraction.`,

  'organ.vessels.conduitTitle':
    'Conduit arteries. Wall colour bound to systemic vascular resistance (bip(norm(svr, 700, 2200), 0.5, 0.5)); blue = resistance down.',
  'organ.vessels.resistanceTitle':
    'Resistance unit. Precapillary arteriole calibre is bound to haemo.arteriolar_radius_index and the postcapillary venule to haemo.venous_tone_index. Amlodipine moves the first and barely the second — that asymmetry is the oedema mechanism.',
  'organ.vessels.precapillary': 'precapillary arteriole',
  'organ.vessels.postcapillary': 'postcapillary venule',
  'organ.vessels.notModelled': 'not modelled',
  'organ.vessels.timesBaseline': (v: Vars) => `${v.value} × baseline`,
  'organ.vessels.capillaryPressureLabel': 'capillary hydrostatic pressure',
  'organ.vessels.capillaryPressureNotModelled': '— not modelled',
  'organ.vessels.capillaryPressureValue': (v: Vars) => `${v.value} × baseline (relative)`,
  'organ.vessels.tierNote': 'tissue level (T3) — mechanism inferred, no cell population named',

  'organ.lungs.title':
    'Lungs. Pulmonary capillary mesh density is bound to engagement.ace_inhibition_pulmonary; airway calibre to engagement.beta2_occupancy. Mechanism inferred (T3) — rendered at tissue level, no cell population named.',
  'organ.lungs.capillaryBedTitle': 'Pulmonary capillary bed — ACE inhibited where the whole cardiac output passes.',
  'organ.lungs.hazeTitle':
    'Bradykinin and substance P accumulate — both are ACE substrates. This sensitises airway sensory nerves; it is the cough channel and it is delayed, not first-dose.',
  'organ.lungs.airwayTitle':
    'Bronchial tree. Lumen = base × (1 − 0.45 × beta2_occupancy). The 0.45 gain is an ESTIMATED visual constant; the beta-2 occupancy itself is the sourced signal.',
  'organ.lungs.noBradykinin': 'no bradykinin accumulation — no cough channel',
  'organ.lungs.beta2AirwayLabel': 'β2 (airway)',
  'organ.lungs.fev1NotModelled': 'FEV₁ —',
  'organ.lungs.fev1Value': (v: Vars) => `FEV₁ ${v.value} % of untreated`,
  'organ.lungs.tierNote': 'tissue level (T3) — mechanism inferred',

  'organ.heart.title':
    'Heart — beat rate bound to haemo.hr, beat depth to haemo.contractility_index, colour to beta-1 blockade and sympathetic tone. Rendered at tissue level (T2).',
  'organ.heart.saNodeTitle':
    'Sinoatrial node (region). Tier T2 — rendered at tissue level. HPA single-cell ADRB1 is "cell type enhanced", tau 0.79, top hit cytotrophoblasts, so no cell population is named here.',
  'organ.heart.hrNotModelled': 'HR —',

  'organ.periphery.oedemaNotModelled': 'oedema —',
  'organ.periphery.pitting': (v: Vars) => `pitting ${v.grade}/3`,
  'organ.periphery.dependentOedema': 'dependent oedema',
  'organ.periphery.coldExtremity': 'cold extremity',
  'organ.periphery.notModelledTitle': 'Dependent limb — interstitial volume not modelled in this build.',
  'organ.periphery.pittingTitle': (v: Vars) =>
    `Dependent-limb interstitium. Pitting grade ${v.grade} of 3 (a presentational bridge from interstitial_volume_index, not a measurement). Click to pit.`,
  'organ.periphery.capPressure': (v: Vars) => `cap. pressure ${v.value} × baseline`,
  'organ.periphery.explainerHeading': (v: Vars) => `Peripheral oedema, grade ${v.grade} of 3`,
  'organ.periphery.explainerLead':
    'Precapillary arterioles are dilated without a matching change in the postcapillary venules, so capillary hydrostatic pressure rises and fluid moves into the interstitium at gravitationally dependent sites. This is',
  'organ.periphery.explainerNot': 'not',
  'organ.periphery.explainerTail': 'salt-and-water retention.',
  'organ.periphery.thiazideNegative':
    'A thiazide is on board and the swelling has barely changed — it does not target this mechanism. Showing a treatment that does not work is deliberate.',
  'organ.periphery.raasPositive':
    'A RAAS blocker is on board, which dilates the postcapillary side and partly restores the pre/post balance, so the swelling recedes. Direction is well supported; no percentage is claimed, because no primary source for the magnitude was found.',

  'organ.gauges.potassiumLabel': 'Serum potassium',
  'organ.gauges.potassiumNote':
    'Thiazide wastes it; ACE inhibitor and ARB retain it. On the combination the two partly cancel.',
  'organ.gauges.urateLabel': 'Serum urate',
  'organ.gauges.urateNote':
    "Losartan's URAT1 inhibition drives it down; thiazide volume contraction drives it up. Opposite arrows, same patient.",
  'organ.gauges.sodiumLabel': 'Serum sodium',
  'organ.gauges.sodiumNote': 'Thiazide water retention risk.',
  'organ.gauges.creatinineLabel': 'Serum creatinine',
  'organ.gauges.notModelled': 'not modelled',
  'organ.gauges.reference': 'reference',

  'organ.figure.restingBaseline': 'Resting baseline — not simulation output.',
  'organ.figure.untreated': 'Untreated — no drug on board.',
  'organ.figure.testSubject': 'Test subject',
  'organ.figure.haltedShort': 'Halted by a hard gate.',
  'organ.figure.haltedFull': 'Simulation halted by a hard gate.',
  'organ.figure.contraindicatedNote': 'A contraindicated combination was requested.',
  'organ.figure.kidneyPanelTitle': 'Kidney — nephron segments',
  'organ.figure.kidneyPanelNote':
    'Four drugs, four anatomically distinct sites, all visible at once. The thiazide target and the RAAS targets are in different segments, and that is the point.',
  'organ.figure.t1NoteMid': 'is the only cell population named anywhere in this UI.',
  'organ.figure.t1NoteTail': 'Every other target is rendered at tissue level.',
  'organ.figure.liverPanelTitle': 'Liver — three CYP enzymes',
  'organ.figure.liverPanelNote': 'Where personalisation becomes visible.',
  'organ.figure.raasPanelTitle': 'RAAS cascade',
  'organ.figure.raasPanelNote': 'Two stop-bars on one cascade is the dual-blockade case.',
  'organ.figure.resistancePanelTitle': 'Resistance unit',
  'organ.figure.resistancePanelNote': 'Arteriole versus venule — the asymmetry that causes dependent oedema.',
  'organ.figure.disclaimer':
    'Research simulator. Not a clinical decision tool and not a treatment recommendation. Uncalibrated proxy signals — intraglomerular pressure above all — are shown as relative indices and never in absolute units.',
  'organ.figure.noDrugOnBoard': 'no drug on board',

  'organ.liver.outlineTitle': 'Liver — three CYP reactors. Working enzymes are marked, not made to glow.',
  'organ.liver.gateNotModelled': 'CYP2D6 gate —',
  'organ.liver.gateValue': (v: Vars) => `CYP2D6 gate ${v.value}×`,
  'organ.liver.reactorsAriaLabel': 'Hepatic CYP reactors',
  'organ.liver.reactorsTitle': 'Hepatic CYP reactors — CYP3A4, CYP2C9, CYP2D6',
  'organ.liver.portalVein': 'portal vein',
  'organ.liver.hepaticVein': 'hepatic vein',
  'organ.liver.cyp3a4Sub': 'liver-specific, 3367.1 nTPM',
  'organ.liver.cyp3a4Title':
    "CYP3A4 (P08684). Amlodipine's route, with a minor losartan contribution. When both drugs are present the reactor is shared — direction is defensible but no quantitative interaction magnitude is sourced, so no number is shown.",
  'organ.liver.sharedReactor': 'shared reactor — queue',
  'organ.liver.cyp2c9Sub': 'liver-specific, 1607.6 nTPM',
  'organ.liver.cyp2c9Title':
    'CYP2C9 (P11712) converts losartan to EXP3174, the more potent active metabolite. Parent t1/2 ~2 h; metabolite 6-9 h (FDA label).',
  'organ.liver.exp3174MorePotent': 'EXP3174 · more potent',
  'organ.liver.cyp2d6Sub': 'liver-specific, 386.2 nTPM',
  'organ.liver.cyp2d6Title':
    'CYP2D6 (P10635). Polymorphic. The gate aperture is bound to liver.cyp2d6_capacity_fold: the same metoprolol dose gives two visibly different animations in two patients.',
  'organ.liver.gateApertureTitle': (v: Vars) =>
    `CYP2D6 gate aperture = clamp(cyp2d6_capacity_fold, 0.05, 2.0) x ${v.base} px. Currently ${v.pheno}.`,
  'organ.liver.gateShort': (v: Vars) => `gate ${v.value}`,
  'organ.liver.passthrough': 'not metabolised in this model — passes straight through',
  'organ.liver.fluxNotModelled': 'flux —',
  'organ.liver.fluxValue': (v: Vars) => `${v.value} mg/h`,
  'organ.liver.notModelled': 'not modelled',
  'organ.liver.ultrarapid': 'ultrarapid metaboliser',
  'organ.liver.normal': 'normal metaboliser',
  'organ.liver.intermediate': 'intermediate metaboliser',
  'organ.liver.poor': 'poor metaboliser',

  'organ.kidney.outlineTitle':
    'Kidney. Colour bound to renal.p_glomerular (PROXY — uncalibrated, shown as a relative index only). Filtration is never rendered in absolute pressure units.',
  'organ.kidney.egfrNotModelled': 'eGFR —',
  'organ.kidney.nephronAriaLabel': 'Schematic nephron',
  'organ.kidney.nephronTitle': 'Schematic nephron with the four drug-acting segments',
  'organ.kidney.dualRaasTitle':
    'Dual RAAS blockade: additive efferent dilation, disproportionate GFR fall and potassium rise. Persistent overlay per §13.',
  'organ.kidney.dualRaasLabel': 'dual RAAS blockade',
  'organ.kidney.afferentArteriole': 'afferent arteriole',
  'organ.kidney.notModelled': 'not modelled',
  'organ.kidney.timesBaseline': (v: Vars) => `${v.value} × baseline`,
  'organ.kidney.afferentTitle':
    'Reference vessel. Amlodipine dilates it mildly; the RAAS drugs act on the efferent side.',
  'organ.kidney.jgaTitle':
    'Juxtaglomerular apparatus — renin release site. Renin RISES on a RAAS blocker while blood pressure falls. This is expected counter-regulation, not a failure of the drug. Losartan 100 mg doubles to triples plasma renin activity (FDA label).',
  'organ.kidney.reninNotModelled': 'renin —',
  'organ.kidney.reninValue': (v: Vars) => `renin ${v.value} ×`,
  'organ.kidney.glomerulusTitle':
    'Glomerular capillary tuft. Colour bound to renal.p_glomerular — a PROXY-tier, uncalibrated index, so it is shown as a relative value and never in mmHg.',
  'organ.kidney.glomerulus': 'glomerulus',
  'organ.kidney.pGlomNotModelled': 'P_glom not modelled',
  'organ.kidney.pGlomValue': (v: Vars) => `P_glom ${v.value} × baseline (uncalibrated)`,
  'organ.kidney.pGlomTitle':
    'renal.p_glomerular is PROXY tier. It drives the renal-protection animation but is not calibrated, so it is never rendered with absolute units.',
  'organ.kidney.efferentArteriole': 'efferent arteriole',
  'organ.kidney.efferentTitle':
    'Lisinopril and losartan dilate this vessel specifically, while the afferent holds. That is what lowers intraglomerular pressure — and what causes the acute eGFR dip.',
  'organ.kidney.aceRenalLabel': 'ACE (renal)',
  'organ.kidney.proximalTubule': 'proximal tubule',
  'organ.kidney.naReabsorbed': (v: Vars) => `Na⁺ reabsorbed ${v.value}`,
  'organ.kidney.proximalTitle':
    'Proximal convoluted tubule. URAT1 (SLC22A12) apical localisation here is classical, not cell-resolved in our sources. Tier T2 — no cell population named.',
  'organ.kidney.urateNotModelled': 'urate —',
  'organ.kidney.urateOut': 'urate → out',
  'organ.kidney.urateBackIn': 'urate ← back in',
  'organ.kidney.uricosuric': '(uricosuric)',
  'organ.kidney.retained': '(retained)',
  'organ.kidney.thickAscendingLimb': 'thick ascending limb',
  'organ.kidney.thickAscendingTitle': 'Reference segment — no drug in this set acts here.',
  'organ.kidney.dctTitle': (v: Vars) =>
    `Distal convoluted tubule. ${v.protein} / ${v.gene} (${v.uniprot}) in ${v.cellPopulation}. ${v.evidence}. ${v.source}. This is the only target in the whole drug set with single-cell evidence, and therefore the only place this UI names a cell population.`,
  'organ.kidney.distalConvolutedTubule': 'distal convoluted tubule',
  'organ.kidney.distalConvolutedTubuleCells': 'distal convoluted tubule cells · NCC / SLC12A3',
  'organ.kidney.naReabsorbedHere': (v: Vars) => `Na⁺ reabsorbed here ${v.value} · thiazide target`,
  'organ.kidney.cdTitle':
    'Connecting tubule and collecting duct. Increased distal sodium delivery drives Na⁺/K⁺ exchange, so potassium leaves — the adverse effect arising from the therapeutic mechanism. Mechanism inferred (T3): no cell population is named here.',
  'organ.kidney.collectingDuct': 'collecting duct',
  'organ.kidney.inferredT3': 'inferred (T3)',
  'organ.kidney.kStatus': (v: Vars) => `K⁺ ${v.value}`,
  'organ.kidney.wasting': 'wasting',
  'organ.kidney.retained2': 'retained',
  'organ.kidney.baseline': 'baseline',
  'organ.kidney.ureter': 'ureter',
  'organ.kidney.rampKey': 'turned down · untreated · turned up or stressed',

  // ---------------------------------------------------- organ.affected (AffectedAnatomy)
  'organ.affected.ariaNone': 'Human figure — no modelled organ action',
  'organ.affected.ariaActing': (v: Vars) => `Human figure with the organs ${v.list} act on highlighted`,
  'organ.affected.noneTitle': 'No modelled organ action.',
  'organ.affected.nothingSelected': 'Nothing is selected yet.',
  'organ.affected.excipientNote': (v: Vars) =>
    `${v.names} ${Number(v.count) === 1 ? 'is an excipient' : 'are excipients'} — they shape the tablet, not the patient.`,
  'organ.affected.noOrganAction': (v: Vars) => `No organ action: ${v.names}.`,
  'organ.affected.siteCount': (v: Vars) => `${v.n} site${Number(v.n) === 1 ? '' : 's'}`,
  'organ.affected.moreHere': (v: Vars) => `and ${v.n} more here`,
  'organ.affected.and': 'and',

  // -------------------------------------------------------- organ.bodyFigure (BodyFigure)
  'organ.bodyFigure.ariaLabel': 'Human figure with organ-level drug effects',
  'organ.bodyFigure.titleFull': 'Human figure with organ-level drug effects bound to the effect bus',
  'organ.bodyFigure.pregnancyBarrierTitle':
    'Fetal toxicity. An ACE inhibitor or ARB is contraindicated in pregnancy — the simulation does not run. Animating a dose curve for a contraindicated drug would be the wrong message from a medical simulator.',
  'organ.bodyFigure.coldExtremitiesTitle': 'Cold extremities — reduced peripheral perfusion on a beta blocker.',
  'organ.bodyFigure.lungsTitle': 'Lungs',
  'organ.bodyFigure.lungsHint':
    'Airway calibre is bound to beta-2 occupancy; the capillary mesh to pulmonary ACE inhibition. Tissue level (T3).',
  'organ.bodyFigure.fev1NotModelled': 'FEV₁ not modelled',
  'organ.bodyFigure.beta2Airway': (v: Vars) => `β2 airway ${v.value} %`,
  'organ.bodyFigure.noCoughChannel': 'no cough channel',
  'organ.bodyFigure.liverTitle': 'Liver',
  'organ.bodyFigure.liverHint':
    'The CYP2D6 gate aperture is set by genotype and decides whether a standard metoprolol dose stays below 80.2 ng/mL.',
  'organ.bodyFigure.gateNotModelled': 'CYP2D6 gate —',
  'organ.bodyFigure.cyp2d6GateNormal': (v: Vars) => `CYP2D6 gate ${v.value} × normal`,
  'organ.bodyFigure.kidneysTitle': 'Kidneys',
  'organ.bodyFigure.kidneysHint':
    'Intraglomerular pressure is a PROXY-tier index and is never shown in absolute units. eGFR is.',
  'organ.bodyFigure.egfrNotModelled': 'eGFR not modelled',
  'organ.bodyFigure.urineNotModelled': 'urine not modelled',
  'organ.bodyFigure.urineValue': (v: Vars) => `urine ${v.value} mL/h`,
  'organ.bodyFigure.limbsTitle': 'Dependent limbs',
  'organ.bodyFigure.limbsHint': 'Gravitationally dependent sites. Click a limb to pit it.',
  'organ.bodyFigure.oedemaNotModelled': 'oedema not modelled',
  'organ.bodyFigure.pitting': (v: Vars) => `pitting ${v.grade} / 3`,
  'organ.bodyFigure.dependentOedema': 'dependent oedema',
  'organ.bodyFigure.dizzinessTitle': 'Orthostatic dizziness',
  'organ.bodyFigure.dizzinessHint':
    "The figure's posture is unsteady while hazards.dizziness_orthostatic is above its firing threshold.",
  'organ.bodyFigure.standingToleranceDown': 'standing tolerance ↓',
  'organ.bodyFigure.heartTitle': 'Heart',
  'organ.bodyFigure.heartHint':
    'Beat rate bound to haemo.hr, beat depth to haemo.contractility_index. Tissue level (T2).',
  'organ.bodyFigure.hrNotModelled': 'HR not modelled',
  'organ.bodyFigure.bradycardicLt50': 'bradycardic (< 50)',
  'organ.bodyFigure.coNotModelled': 'CO not modelled',
  'organ.bodyFigure.adrenalTitle': 'Adrenal cortex',
  'organ.bodyFigure.adrenalHint':
    'Outer cortex (zona glomerulosa), tissue level (T3). Aldosterone breakthrough over weeks is not modelled.',
  'organ.bodyFigure.aldosteroneNotModelled': 'aldosterone —',
  'organ.bodyFigure.aldosteroneValue': (v: Vars) => `aldosterone ${v.value} ×`,
  'organ.bodyFigure.conduitTitle': 'Conduit arteries',
  'organ.bodyFigure.conduitHint': 'Wall colour is bound to systemic vascular resistance. Blue means resistance is down.',
  'organ.bodyFigure.bpNotModelled': 'BP not modelled',
  'organ.bodyFigure.svrNotModelled': 'SVR not modelled',

  // ------------------------------------------------------------- organ.plate (scenePlates)
  'organ.plate.traceBuilds': 'trace builds as the run plays',

  // ---------------------------------------------------- organ.journeyPlate (scenePlates)
  'organ.journeyPlate.routeKidneyUnchanged': 'kidney · unchanged',
  'organ.journeyPlate.routeLiverCyp2c9': 'liver · CYP2C9',
  'organ.journeyPlate.routeMadeInLiver': 'made in the liver',
  'organ.journeyPlate.routeLiverCyp3a4': 'liver · CYP3A4',
  'organ.journeyPlate.routeLiverCyp2d6': 'liver · CYP2D6',
  'organ.journeyPlate.noteLisinopril': 'not metabolised — excreted unchanged in the urine',
  'organ.journeyPlate.noteLosartan': 'becomes EXP3174, the more potent blocker',
  'organ.journeyPlate.noteExp3174': 'never swallowed — it is formed from losartan on the way through',
  'organ.journeyPlate.noteAmlodipine': 'extensively metabolised — slow to clear',
  'organ.journeyPlate.noteHctz': 'not metabolised in this model',
  'organ.journeyPlate.noteMetoprolol': 'genotype sets the size of the gate',
  'organ.journeyPlate.routeTitle':
    "The route a swallowed dose takes. Sprite density on the circulating segments is the drug's plasma concentration in this frame; the swallow and portal segments are drawn as a dashed route because gut transit is not modelled in this build.",
  'organ.journeyPlate.swallowed': 'swallowed',
  'organ.journeyPlate.routeOnly': 'route only',
  'organ.journeyPlate.firstPass': 'first pass',
  'organ.journeyPlate.inBlood': 'in the blood',
  'organ.journeyPlate.densityPlasma': 'density = plasma level',
  'organ.journeyPlate.cleared': 'cleared',
  'organ.journeyPlate.title': 'Journey of a dose',
  'organ.journeyPlate.sub': 'what survives each step, in this frame',
  'organ.journeyPlate.noneOnBoard': 'No drug is on board in this frame — there is no dose to follow yet.',
  'organ.journeyPlate.plasmaNotModelled': 'plasma not modelled',
  'organ.journeyPlate.plasmaValue': (v: Vars) => `plasma ${v.value} ng/mL`,
  'organ.journeyPlate.noFirstPass': 'no first-pass step here',
  'organ.journeyPlate.firstPassRemoves': (v: Vars) => `first pass removes ${v.value} %`,
  'organ.journeyPlate.gutNote1': 'Gut transit is not modelled in this build — the dashed part of the route on the body is',
  'organ.journeyPlate.gutNote2':
    'drawn for orientation and carries no number. Everything that moves is a plasma level.',
  'organ.journeyPlate.noExtraction': 'No first-pass extraction is modelled for this substance.',
  'organ.journeyPlate.extractionTitle': (v: Vars) =>
    `liver.first_pass_extraction = ${v.value} — the open part of the gate is what reaches the circulation.`,

  // -------------------------------------------------------- organ.heartPlate (scenePlates)
  'organ.heartPlate.title': 'Heart',
  'organ.heartPlate.sub': 'rate and force, and how much of the β1 pool is occupied',
  'organ.heartPlate.rateTitle': 'Rate',
  'organ.heartPlate.rateHint':
    'The figure beats at 60 / haemo.hr seconds per cycle. What you see is the modelled rate, not a loop.',
  'organ.heartPlate.notModelled': 'not modelled',
  'organ.heartPlate.bradycardicGate': 'bradycardic — gate fires below 50',
  'organ.heartPlate.forceTitle': 'Force',
  'organ.heartPlate.forceHint':
    'haemo.contractility_index is an index normalised to 1.00 at baseline, so it is shown relative and never in absolute units.',
  'organ.heartPlate.outputTitle': 'Output',
  'organ.heartPlate.coNotModelled': 'CO not modelled',
  'organ.heartPlate.svNotModelled': 'SV not modelled',
  'organ.heartPlate.receptorsTitle': 'Receptors',
  'organ.heartPlate.receptorsHint':
    'β1 and β2 are separate bus fields. Metoprolol is β1-selective only while the plasma level stays below the label crossover.',
  'organ.heartPlate.beta1NotModelled': 'β1 —',
  'organ.heartPlate.beta1Value': (v: Vars) => `β1 cardiac ${v.value} %`,
  'organ.heartPlate.beta2NotModelled': 'β2 —',
  'organ.heartPlate.beta2Value': (v: Vars) => `β2 airway ${v.value} %`,
  'organ.heartPlate.selectivityFading': 'above 80.2 ng/mL — selectivity fading',
  'organ.heartPlate.traceLabel': 'heart rate, this run',
  'organ.heartPlate.note': 'Tissue level (T2). The sinoatrial node is drawn as a region — no cell population is named.',

  // ------------------------------------------------------ organ.vesselsPlate (scenePlates)
  'organ.vesselsPlate.title': 'One resistance unit',
  'organ.vesselsPlate.sub': 'inlet, capillary bed, outlet — and the pressure between them',
  'organ.vesselsPlate.pressureTitle': 'Pressure',
  'organ.vesselsPlate.bpNotModelled': 'BP not modelled',
  'organ.vesselsPlate.svrNotModelled': 'SVR not modelled',
  'organ.vesselsPlate.inletOutletTitle': 'Inlet vs outlet',
  'organ.vesselsPlate.inletOutletHint':
    'Both are indices normalised to 1.00 at baseline. A dihydropyridine moves the first and barely the second, and that asymmetry is the oedema mechanism.',
  'organ.vesselsPlate.arteriolePrefix': (v: Vars) => `arteriole ${v.value}`,
  'organ.vesselsPlate.venulePrefix': (v: Vars) => `venule ${v.value}`,
  'organ.vesselsPlate.capillaryTitle': 'Capillary pressure',
  'organ.vesselsPlate.capillaryHint':
    'haemo.capillary_hydrostatic_p is PROXY tier — uncalibrated, so it is shown as a relative index and never in mmHg.',

  // -------------------------------------------------------- organ.lungsPlate (scenePlates)
  'organ.lungsPlate.title': 'Lungs',
  'organ.lungsPlate.sub': 'a target organ here, not a bystander',
  'organ.lungsPlate.airflowTitle': 'Airflow',
  'organ.lungsPlate.beta2SpilloverTitle': 'β2 spillover',
  'organ.lungsPlate.beta2SpilloverHint':
    'Airway calibre = base × (1 − 0.45 × beta2_occupancy). The gain is a visual constant; the occupancy is the sourced signal.',
  'organ.lungsPlate.notModelled': 'not modelled',
  'organ.lungsPlate.occupiedPct': (v: Vars) => `${v.value} % occupied`,
  'organ.lungsPlate.bradykininTitle': 'Bradykinin',
  'organ.lungsPlate.bradykininHint':
    'Bradykinin and substance P are ACE substrates. They accumulate on an ACE inhibitor and sensitise airway sensory nerves — the cough channel, and it is delayed, not first-dose.',
  'organ.lungsPlate.airwayPrefix': (v: Vars) => `airway ${v.value}`,
  'organ.lungsPlate.pulmonaryAceNotModelled': 'pulmonary ACE —',
  'organ.lungsPlate.pulmonaryAceValue': (v: Vars) => `pulmonary ACE ${v.value} % inhibited`,
  'organ.lungsPlate.coughChannel': (v: Vars) => `cough channel ${v.value}`,
  'organ.lungsPlate.absenceTitle': 'The absence',
  'organ.lungsPlate.absenceHint':
    'An ARB blocks the receptor instead of the enzyme, so bradykinin never accumulates. The missing layer is the teaching point.',
  'organ.lungsPlate.noBradykininAccumulation': 'no bradykinin accumulation',
  'organ.lungsPlate.noCoughChannelAtAll': 'so no cough channel at all',
  'organ.lungsPlate.note':
    'Mechanism inferred (T3). Pulmonary endothelial ACE is classical physiology; the expression data pulled for this build lists intestine and testis, not lung, and the figure says so.',

  // -------------------------------------------------------- organ.liverPlate (scenePlates)
  'organ.liverPlate.title': 'Liver',
  'organ.liverPlate.sub': 'three enzymes, and one gate whose size is set by genotype',
  'organ.liverPlate.capacityNotModelled': 'CYP2D6 capacity is not modelled in this build.',
  'organ.liverPlate.gateNote': (v: Vars) =>
    `The CYP2D6 gate is ${v.value} × normal in this patient. The dose is not what decides the level — the gate is.`,
  'organ.liverPlate.idle': 'No metoprolol on board, so the gate is idle this frame.',
  'organ.liverPlate.aboveThreshold':
    'Metoprolol is above 80.2 ng/mL — the concentration at which the label says β1 selectivity diminishes.',
  'organ.liverPlate.belowThreshold':
    'Metoprolol is below 80.2 ng/mL, the label crossover — it is still behaving as β1-selective here.',

  // ------------------------------------------------------- organ.kidneyPlate (scenePlates)
  'organ.kidneyPlate.title': 'Kidney',
  'organ.kidneyPlate.sub': 'four drugs, four different segments, all at once',
  'organ.kidneyPlate.filtrationTitle': 'Filtration',
  'organ.kidneyPlate.filtrationHint':
    'renal.p_glomerular is PROXY tier — it drives the renal-protection animation but is uncalibrated, so it is never rendered in mmHg.',
  'organ.kidneyPlate.pGlomPrefix': (v: Vars) => `P_glom ${v.value}`,
  'organ.kidneyPlate.traceLabel': 'eGFR, this run — a dip that settles is the efferent arteriole opening, not injury',

  // --------------------------------------------------------- organ.raasPlate (scenePlates)
  'organ.raasPlate.title': 'Counter-regulation',
  'organ.raasPlate.sub': 'the loop that fights back while the pressure falls',
  'organ.raasPlate.reninNotModelled': 'Renin is not modelled in this build.',
  'organ.raasPlate.reninNote': (v: Vars) =>
    `Renin is ${v.value} × baseline and rising against a falling pressure. That is the loop working as designed, not the drug failing.`,
  'organ.raasPlate.aldosteroneNotModelled': 'Aldosterone is not modelled in this build.',
  'organ.raasPlate.aldosteroneNote': (v: Vars) =>
    `Aldosterone ${v.value} × baseline — which is why potassium moves whenever this cascade does.`,
  'organ.raasPlate.dualNote':
    'Two stop-bars on one cascade: the enzyme and the receptor are both blocked. Additive efferent dilation, and potassium and eGFR move further than either drug alone.',
  'organ.raasPlate.singleNote':
    'Aldosterone breakthrough over weeks is not modelled in this build — stated, not hidden.',

  // -------------------------------------------------------- organ.limbsPlate (scenePlates)
  'organ.limbsPlate.title': 'Dependent limbs',
  'organ.limbsPlate.sub': 'where gravity puts the fluid, and why a diuretic does not fix it',
  'organ.limbsPlate.noSwelling': 'No dependent swelling in this frame.',
  'organ.limbsPlate.thiazideOnly':
    'A thiazide is on board and the swelling has barely moved — it does not target this mechanism. Showing a treatment that does not work is deliberate.',
  'organ.limbsPlate.raasOn':
    'A RAAS blocker is on board. It opens the postcapillary side too, so the pre/post balance is partly restored and the swelling recedes.',
  'organ.limbsPlate.default':
    'The inlet is open and the outlet is not, so fluid is leaving the capillary where gravity puts it.',
  'organ.limbsPlate.interstitiumTitle': 'Interstitium',
  'organ.limbsPlate.interstitiumHint':
    'periph.interstitial_volume_index is an index normalised to 1.00 at baseline; the pitting grade derived from it is a presentational bridge, not a measurement.',
  'organ.limbsPlate.pittingNotModelled': 'pitting —',
  'organ.limbsPlate.pittingPresentational': (v: Vars) => `pitting ${v.grade} / 3 (presentational)`,
  'organ.limbsPlate.capillaryTitle': 'Capillary pressure',
  'organ.limbsPlate.whatHappeningTitle': 'What is happening',
  'organ.limbsPlate.note':
    'Reported incidence 1.8 / 3.0 / 10.8 % at 2.5 / 5 / 10 mg vs 0.6 % placebo; female 14.6 % vs male 5.6 %. FDA label, amlodipine besylate.',

  // ------------------------------------------------------- organ.safetyPlate (scenePlates)
  'organ.safetyPlate.title': 'Safety',
  'organ.safetyPlate.sub': 'what fired, where it shows, and the reported incidence behind it',
  'organ.safetyPlate.drivenBy': (v: Vars) => `driven by ${v.drugs}`,
  'organ.safetyPlate.incidence': (v: Vars) => `incidence: ${v.value}`,
  'organ.safetyPlate.haltedGate': 'Halted by a hard gate',
  'organ.safetyPlate.fetalBarrier': 'Fetal toxicity barrier',
  'organ.safetyPlate.pregnancyNote':
    'An ACE inhibitor or ARB is contraindicated in pregnancy. The simulation does not animate a dose curve for a drug that must not be given.',
  'organ.safetyPlate.contraindicatedNote': 'A contraindicated combination was requested, so no dose curve is animated.',
  'organ.safetyPlate.noneAboveThreshold': 'No adverse-effect channel is above its firing threshold in this frame.',
  'organ.safetyPlate.noRun': 'No run in progress.',
  'organ.safetyPlate.rareSuffix': '  · rare',
  'organ.safetyPlate.note':
    'Where sources disagree the range is shown, never a point estimate. Firing thresholds are visual tuning constants, not clinical thresholds.',

  // -------------------------------------------------------------- organ.scene (scenes)
  'organ.scene.selectorAriaLabel': 'Scene',
  'organ.scene.clockStatus': (v: Vars) => `t = ${v.t} h since first dose`,
  'organ.scene.watch.noRun': 'No run in progress — the figure is holding a resting, untreated baseline.',
  'organ.scene.watch.journeyNone': 'Nothing is on board in this frame, so there is no dose to follow yet.',
  'organ.scene.watch.journeyLead': (v: Vars) => `${v.n} substance${Number(v.n) === 1 ? '' : 's'} in the blood.`,
  'organ.scene.watch.journeyWithGate': (v: Vars) =>
    `${v.lead} Watch the gate at the liver — ${v.pct} % of the metoprolol never reaches the circulation.`,
  'organ.scene.watch.journeyNoGate': (v: Vars) =>
    `${v.lead} Watch the gate at the liver: what it removes never reaches the circulation.`,
  'organ.scene.watch.heart': (v: Vars) => `Watch the beat — it runs at the modelled rate, ${v.hr}, with β1 ${v.b1} occupied.`,
  'organ.scene.watch.vessels': (v: Vars) => `Watch the two ends of the capillary: inlet ${v.inlet}, outlet ${v.outlet}.`,
  'organ.scene.watch.lungsAbsence':
    'Watch what is missing: an ARB leaves no bradykinin haze over the airways, so there is no cough channel to draw.',
  'organ.scene.watch.lungs': (v: Vars) => `Watch the bronchial lumen — it narrows as β2 occupancy climbs, and it is ${v.pct} now.`,
  'organ.scene.watch.liverNone': 'Watch the three reactors: what enters on the left is not what leaves on the right.',
  'organ.scene.watch.liver': (v: Vars) =>
    `Watch the CYP2D6 gate — ${v.value} × normal in this patient, which is what sets the level, not the dose.`,
  'organ.scene.watch.kidney': (v: Vars) =>
    `Watch four segments at once: NCC ${v.ncc} blocked in the distal tubule, ACE ${v.ace} and AT1 ${v.at1} on the efferent side.`,
  'organ.scene.watch.raas': (v: Vars) =>
    `Watch renin ${v.renin} while mean pressure sits at ${v.map}. Rising renin is the loop working, not the drug failing.`,
  'organ.scene.watch.limbs': (v: Vars) => `Watch the ankle thicken as interstitial volume reaches ${v.value}.`,
  'organ.scene.watch.safetyNone': 'Nothing is above its firing threshold in this frame. That is a result, not an empty panel.',
  'organ.scene.watch.safety': (v: Vars) =>
    `${v.n} channel${Number(v.n) === 1 ? '' : 's'} firing — each numbered on the body and sourced beside it.`,
  'organ.scene.watch.default': (v: Vars) => `Every trace of colour on the figure is a drug doing something. ${v.bp} · HR ${v.hr} · eGFR ${v.gfr}.`,

  // ---------------------------------------------------- organ.scene.<id> (SCENES list)
  'organ.scene.overview.label': 'Overview',
  'organ.scene.overview.blurb':
    'The whole body at once — every organ this regimen reaches, with its numbers in the margin.',
  'organ.scene.journey.label': 'Journey of a dose',
  'organ.scene.journey.blurb':
    'Follow the drug: swallowed, taken through the liver on the way in, out into the blood, and cleared.',
  'organ.scene.heart.label': 'Heart',
  'organ.scene.heart.blurb': 'Rate, force and output, and how much of the β1 receptor pool is currently occupied.',
  'organ.scene.vessels.label': 'Vessels',
  'organ.scene.vessels.blurb':
    'A single resistance unit: the arteriole opens, the venule does not, and the pressure between them explains the ankles.',
  'organ.scene.lungs.label': 'Lungs',
  'organ.scene.lungs.blurb':
    'Two drugs reach the airway — one lets bradykinin build, one blocks β2 — and the one that does neither is shown doing neither.',
  'organ.scene.liver.label': 'Liver',
  'organ.scene.liver.blurb': 'Three CYP enzymes and one gate whose size is set by genotype, not by the dose.',
  'organ.scene.kidney.label': 'Kidney',
  'organ.scene.kidney.blurb': 'Four drugs acting in four anatomically different nephron segments, all at the same time.',
  'organ.scene.raas.label': 'Counter-regulation',
  'organ.scene.raas.blurb':
    'The loop that fights back: renin climbs while the blood pressure falls, and that is expected.',
  'organ.scene.limbs.label': 'Dependent limbs',
  'organ.scene.limbs.blurb':
    'Where gravity puts the fluid — and why a diuretic does not fix this particular swelling.',
  'organ.scene.safety.label': 'Safety',
  'organ.scene.safety.blurb': 'What fired, where on the body it shows, and the reported incidence behind each one.',

  'common.sourcedRangeTitle': (v: Vars) => `Sourced range ${v.lo}–${v.hi}${v.unit}`,

  // ------------------------------------------------------- chat assistant (src/ui/chat)
  // Chrome only. The user's question and the model's answer are never translated
  // here — the model answers in whatever language it was asked in.
  'chat.open': 'Ask the AI',
  'chat.openAria': 'Open the assistant and ask about this page',
  'chat.title': 'Ask the AI',
  'chat.sub': 'Grounded in this page — it answers only from what PilSim has already computed.',
  'chat.closeAria': 'Close the assistant',
  'chat.panelAria': 'PilSim assistant',
  'chat.notConfigured': 'No AI provider configured',
  'chat.groundedIn': 'Grounded in',
  'chat.grounded.substance': 'the open substance',
  'chat.grounded.patient': 'the selected patient',
  'chat.grounded.regimen': 'the regimen',
  'chat.grounded.run': 'the last run',
  'chat.grounded.rules': 'the fired rules',
  'chat.grounded.pageOnly': 'this page only — nothing is selected yet',
  'chat.introLead':
    'Ask anything about what is on this page — the substance, the patient, the pill, the run.',
  'chat.introBoundaryLead': 'It cannot invent.',
  'chat.introBoundary':
    'Answers come from the dataset, the fired rules and the engine output, and every number is checked against them. If PilSim does not model something, it says so rather than guessing.',
  'chat.noProviderTitle': 'The assistant is switched off',
  'chat.noProviderBody':
    'No AI provider is configured, so a question cannot be sent yet. Everything else on this page works without one. AI settings are on the Simulation page.',
  'chat.starter.home.a': 'What can this product actually simulate?',
  'chat.starter.home.b': 'Which drugs are in the dataset?',
  'chat.starter.substances.a': 'What does this substance do, and where?',
  'chat.starter.substances.b': 'Which of these parameters are estimated rather than sourced?',
  'chat.starter.pills.a': 'Why did the rules flag this composition?',
  'chat.starter.pills.b': 'What would make this pill safe for this patient?',
  'chat.starter.subject.a': 'Which comorbidity moved this twin the most?',
  'chat.starter.subject.b': 'What does this creatinine mean for dosing?',
  'chat.starter.simulation.a': 'Why did the engine rank it this way?',
  'chat.starter.simulation.b': 'What in this patient drove the result?',
  'chat.placeholder': 'Ask about this page…',
  'chat.send': 'Send',
  'chat.stop': 'Stop',
  'chat.clear': 'Clear conversation',
  'chat.you': 'You',
  'chat.assistant': 'PilSim assistant',
  'chat.generatedMark': 'Generated text',
  'chat.waiting': 'Waiting for the first token…',
  'chat.verdictNone': 'No numbers in this answer.',
  'chat.verdictClean': (v: Vars) =>
    `${v.n} number${Number(v.n) === 1 ? '' : 's'}, every one traced to the ${v.facts} values supplied to the model.`,
  'chat.verdictDirty': (v: Vars) =>
    `${v.unsupported} of ${v.total} numbers trace to nothing this page supplied — ${v.ids}. Struck through above; do not use them.`,
  'chat.numberFlag': 'not in context',
  'chat.numberFlagSr': 'This number was not in the data supplied to the model.',
  'chat.numberTrace': 'Traced to a value supplied to the model.',
  'chat.disclaimer': 'Simulated patients. Not medical advice.',

  // -------------------------------------------------------- sidebar: history / settings
  'sidebar.history': 'History',
  'sidebar.historyEmpty': 'No simulations run yet. Every run you complete appears here.',
  'sidebar.clearHistory': 'Clear history',
  'sidebar.replayRun': (v: Vars) => `Open ${v.regimen} · ${v.subject}`,
  'sidebar.historyBp': (v: Vars) => `${v.value} mmHg systolic`,
  'sidebar.settings': 'Settings',

  // -------------------------------------------------------- five-year projection hedge
  // NORMATIVE. If either of these is ever edited, Uzbek and Russian must keep the same
  // hedge — a PROJECTION of blood-pressure control and organ-relevant markers, never a
  // prediction of events — not a confident resolution. See the task brief this pass was
  // built against.
  'sim.limits.noAldosteroneEscape': 'No aldosterone escape / breakthrough over weeks.',
  'sim.limits.noBaroreflexAdaptation': 'No baroreflex adaptation beyond the modelled counter-regulation.',
  'sim.limits.noPdTolerance': 'No pharmacodynamic tolerance.',
  'sim.limits.noAdherenceBehaviour': 'No adherence behaviour — every dose is assumed taken.',
  'sim.limits.noHardOutcomes':
    'No hard cardiovascular outcomes (stroke, MI, mortality). The product models blood pressure and laboratory values, not events. A long-horizon view is a projection of blood pressure control and organ-relevant markers, never a prediction of strokes, infarctions or deaths.',
  'sim.limits.cellLevelOneTarget':
    'Cell-level resolution is claimed for exactly one target: NCC / SLC12A3 in distal convoluted tubule cells.',
  'sim.limits.fiveYearWording':
    'Five-year view: a projection of blood pressure control and organ-relevant markers. It is not a prediction of strokes, infarctions or deaths, and must never be read as one.',

  // ------------------------------------------------------------ dose timing (src/report/timing.ts)
  // Structural labels. The generated sentences themselves live under `sim.timing.text.*`
  // further down — `buildTiming` takes a `t` and resolves them — while the citations, trial
  // names, drug names and numbers inside them stay verbatim in every language.
  'sim.timing.heading': 'When in the day to take it',
  'sim.timing.categoryOutcome': 'Outcome',
  'sim.timing.categoryTolerability': 'Tolerability',
  'sim.timing.categoryPharmacokinetic': 'Pharmacokinetic',
  'sim.timing.confidenceHigh': 'High confidence',
  'sim.timing.confidenceModerate': 'Moderate confidence',
  'sim.timing.confidenceLow': 'Low confidence',
  'sim.timing.suggestedTimeLabel': 'Suggested time',
  'sim.timing.firstDoseLabel': 'First dose',
  'sim.timing.timeMorning': 'in the morning',
  'sim.timing.timeEvening': 'in the evening',
  'sim.timing.timeBedtime': 'at bedtime',
  'sim.timing.timeAnyConsistent': 'at the same time every day — any hour that suits you',
  'sim.timing.gapsHeading': 'Timing — what this does not answer',
  'sim.timing.headlineHeading': 'When to take it',
  'sim.timing.headlineDetailLink': 'Why — full timing evidence below ↓',

  // ==========================================================================
  // GENERATED PROSE — sentences the PRODUCT wrote, from src/report/**
  // ==========================================================================
  // These were string literals inside `src/report/timing.ts` and
  // `src/report/score.ts`, which is why they rendered in English under every
  // language. They are OURS, not a source's, so they translate. What stays
  // English INSIDE them, in every language, is everything a reader would use to
  // check us: trial names (TIME, BedMed, MAPEC, Hygia, ONTARGET), journal
  // names, PMIDs, DOIs, verbatim quoted titles, every number, unit and
  // statistic, and every drug or substance name. Those arrive as interpolated
  // vars or are written into the translation unchanged.
  //
  // NORMATIVE, and it must survive translation exactly:
  //  - the timing verdict is a NEGATIVE claim — night-time dosing has NOT been
  //    shown to prevent events. Never "may help", never "is not recommended".
  //  - "this product does not agree" keeps its force.
  //  - a refusal stays a decision: "not determined", never "no data available".

  // ------------------------------------------------- timing: the outcome verdict
  'sim.timing.text.outcomeVerdict':
    'Taking your blood-pressure tablets at night has NOT been shown to prevent heart attacks, strokes or ' +
    'deaths. If you have heard otherwise, this product does not agree, and the paragraphs below say why.',
  'sim.timing.text.outcomeTrials':
    'Two large randomised trials looked for that benefit and did not find it. TIME randomised 21 104 UK adults ' +
    'to morning or evening dosing and followed them a median of 5.2 years: a vascular death, heart attack or ' +
    'stroke occurred in 362 (3.4 %) of the evening group and 390 (3.7 %) of the morning group, hazard ratio ' +
    '0.95 (95 % CI 0.83–1.10), p=0.53. BedMed randomised 3357 Canadian primary-care adults to bedtime or ' +
    'morning and followed them a median of 4.6 years: 2.3 against 2.4 events per 100 patient-years, adjusted ' +
    'hazard ratio 0.96 (95 % CI 0.77–1.19), p=.70.',
  'sim.timing.text.outcomeContested':
    'The claim of a benefit comes from two studies by one research group — MAPEC (2010) and the Hygia ' +
    'Chronotherapy Trial (2020), whose title is "Bedtime hypertension treatment improves cardiovascular risk ' +
    'reduction". Neither has been retracted. Hygia carries TWO Expressions of Concern from the European Heart ' +
    'Journal (2020;41(16):1600 and 2020;41(48):4564), and eight hypertension researchers published a challenge ' +
    'to the project titled "Missing Verification of Source Data in Hypertension Research: The HYGIA PROJECT in ' +
    'Perspective". PilSim deliberately does not reproduce Hygia\'s effect size: a precise, memorable number ' +
    'from a contested paper is harder to un-read than it is to qualify.',
  'sim.timing.text.outcomeSafetyMirror':
    'The safety worry runs the other way too, and it was also answered: BedMed found no excess of falls or ' +
    'fractures, no excess of new glaucoma diagnoses and no difference in cognitive decline at 18 months with ' +
    'bedtime dosing. So the honest summary is not "night-time dosing is dangerous" either — it is that the ' +
    'time of day did not change the outcome in either direction.',
  'sim.timing.text.outcomeSurrogate':
    'What is still genuinely open is night-time blood pressure as a number, not as an outcome: the OMAN trial ' +
    '(2025) found bedtime dosing lowered night-time systolic pressure by about 3 mmHg more than morning ' +
    'dosing. That is a surrogate. No trial has shown that closing that 3 mmHg changes what happens to a ' +
    'patient, and PilSim cannot identify who has raised night-time pressure in the first place — it models no ' +
    'circadian rhythm at all.',
  'sim.timing.text.outcomeConsistentTime':
    'So: take them at a time you will reliably keep. TIME\'s own advice, verbatim — "Patients can be advised ' +
    'that they can take their regular antihypertensive medications at a convenient time that minimises any ' +
    'undesirable effects." Note that "no best hour" is not "any hour on any day": both trials assigned a fixed ' +
    'time and kept it, so the recommendation is one consistent time, not a moving one.',

  // ------------------------------------------------------- timing: per drug
  'sim.timing.text.drugOutcome': (v: Vars) =>
    `No time of day is established to make ${v.name} better at preventing heart attacks, strokes or deaths. ` +
    `Randomised trials of morning against evening dosing found no difference in those outcomes.`,
  'sim.timing.text.thiazideMorning': (v: Vars) =>
    `Take ${v.name} in the morning, so its diuresis happens while you are up: the label puts the ` +
    `onset at about ${v.onset} hours after the dose${v.peakClause}` +
    `, and the whole episode at ${v.duration}. An evening dose spends that window in the night and wakes ` +
    `you to pass urine. This is about your sleep, not about your heart — it carries no claim of any effect on ` +
    `heart attacks or strokes.`,
  'sim.timing.text.thiazidePeakClause': (v: Vars) => `, the peak at about ${v.peak}`,
  'sim.timing.text.durationRange': (v: Vars) => `about ${v.lo}–${v.hi} hours`,
  'sim.timing.text.durationSingle': (v: Vars) => `about ${v.value} hours`,
  'sim.timing.text.firstDoseHypotension': (v: Vars) =>
    `Take the FIRST dose of ${v.name} at bedtime, then at whatever time suits you thereafter: the dataset records ` +
    `hypotension for it with an onset of "${v.onset}", so if that first dose does drop ` +
    `your pressure enough to make you light-headed, it is better that you are already lying down.` +
    `${v.mechanismClause}` +
    ` The hazard is labelled; taking the first dose at bedtime is an inference FROM it and not a labelled ` +
    `instruction, which is why this is stated with moderate rather than high confidence.`,
  'sim.timing.text.datasetOwnWords': (v: Vars) => ` The dataset's own words on it: ${v.mechanism}.`,

  // --------------------------------------------- timing: pharmacokinetic room
  'sim.timing.text.pkNegligible': (v: Vars) =>
    `For ${v.name} the hour is close to irrelevant on pharmacokinetic grounds alone: with a ` +
    `${v.halfLife} h half-life the concentration only swings ${v.swing} across the ` +
    `${v.intervalH} h between doses and is still at ${v.troughPct}% of its peak when the next dose is due, ` +
    `so no part of the day is meaningfully better covered than any other.${v.via}${v.perDayNote}`,
  'sim.timing.text.pkMarked': (v: Vars) =>
    `${v.name} swings ${v.swing} across the ${v.intervalH} h between doses and is down to ${v.troughPct}% of its ` +
    `peak by the time the next one is due, so on this schedule part of every day is barely covered whichever ` +
    `hour you choose. Moving the dose moves the gap, it does not close it — closing it means a divided dose or ` +
    `the extended-release form, which is a prescribing decision, not a timing one.${v.via}${v.perDayNote}`,
  'sim.timing.text.pkModerate': (v: Vars) =>
    `${v.name} falls to ${v.troughPct}% of its peak — a ${v.swing} swing — across the ${v.intervalH} h between ` +
    `doses, so there is room for the hour to matter in principle. It does not follow that one hour controls ` +
    `blood pressure better than another: the engine models no circadian rhythm, and the trials that looked ` +
    `found no difference.${v.tolerabilityClause}${v.via}${v.perDayNote}`,
  'sim.timing.text.pkSwingFold': (v: Vars) => `${v.value}-fold`,
  'sim.timing.text.pkSwingUnbounded': 'unbounded',
  'sim.timing.text.pkViaMetabolite': (v: Vars) =>
    ` ${v.name} itself is short-lived; what acts across the interval is its metabolite ${v.species}, ` +
    `whose ${v.halfLife} h half-life is the one that matters here.`,
  'sim.timing.text.pkPerDayNote': (v: Vars) =>
    ` This is a ${v.perDay}-times-daily schedule, so the question is spacing rather than which hour of the day.`,
  'sim.timing.text.pkHourFromTolerability':
    ' The hour recommended above is recommended on tolerability grounds, not on this one.',
  'sim.timing.text.metoprololContrast': (v: Vars) =>
    `Concretely: the same ${v.mgPerDay} mg/day of metoprolol swings ${v.ir}-fold as a ` +
    `once-daily immediate-release tablet, ${v.er}-fold as the extended-release succinate, and ` +
    `${v.bid}-fold split into two doses. If the flat profile is what you want, that is the ` +
    `lever — not the clock.`,

  // ------------------------------------------------ timing: the plan sentences
  'sim.timing.text.anyTimeStatement': (v: Vars) =>
    `${v.name}: take it ${v.label}. That is the answer, not a missing one — the ` +
    `evidence does not establish a best time for this drug, and nothing about it makes one hour easier to ` +
    `tolerate than another.`,
  'sim.timing.text.takeAtStatement': (v: Vars) => `${v.name}: take it ${v.label}.`,
  'sim.timing.text.threeKinds':
    'Timing advice in this plan comes in three kinds and they are not interchangeable: what the evidence says ' +
    'about OUTCOMES (heart attacks and strokes), what makes a drug easier to TOLERATE, and what the ' +
    'PHARMACOKINETICS allow. Only the second one ever moves a recommended hour.',
  'sim.timing.text.noGuidelineTiming':
    'Nothing in PilSim\'s own guideline layer recommends a dose time: data/rules.json emits no timing effect ' +
    'for any of the five substances. Every outcome statement here is read from the published trials directly ' +
    'and is marked as literature, not as a guideline recommendation.',

  // ------------------------------------------------------- timing: the gaps
  'sim.timing.text.gapNonDipperWhat': 'whether this patient in particular would do better on a bedtime dose',
  'sim.timing.text.gapNonDipperWhy':
    'The one place the timing question is still live is raised night-time blood pressure and the non-dipper ' +
    'pattern, and PilSim cannot identify either: data/patient_model.json lists "Circadian rhythm in blood ' +
    'pressure — no dipper/non-dipper pattern" under `validity_limits.not_modelled`. The product carries no ' +
    'ambulatory blood-pressure input and would have nothing to read even if it did.',
  'sim.timing.text.gapMorningEveningWhat': 'a simulated comparison of a morning against an evening dose',
  'sim.timing.text.gapMorningEveningWhy':
    'The engine has no circadian rhythm in blood pressure, so a morning and an evening dose produce the same ' +
    'simulated result by construction. The coverage figures above describe the SHAPE of the concentration curve ' +
    'across a dosing interval; they say nothing about what the blood pressure is doing at 3 a.m., and this ' +
    'product will not run a comparison whose answer is a property of its own simplifications.',

  // ------------------------------------------ score: the reason lines and refusals
  // Lab and risk CHANNEL names stay as the dataset words them ("Serum k",
  // "Peripheral edema") — they are identifiers a reader matches back to the
  // data, like a drug name. Only the sentence around them translates.
  'sim.score.text.goalSingle': (v: Vars) =>
    `Single simulated subject reaches ${v.target} with probability ${v.pct}% (assumed response spread; N = 1)`,
  'sim.score.text.goalPopulation': (v: Vars) => `${v.pct}% of simulated patients reached ${v.target}`,
  'sim.score.text.sbpFall': (v: Vars) => `Systolic pressure falls ${v.mmHg} mmHg at steady state`,
  'sim.score.text.riskLine': (v: Vars) => `${v.name} risk ${v.pct}%`,
  'sim.score.text.labOutside': (v: Vars) =>
    `${v.name} left its reference range (${v.value} vs ${v.lo}–${v.hi})`,
  'sim.score.text.labChance': (v: Vars) =>
    `${v.pct}% chance ${v.name} leaves its reference range (${v.lo}–${v.hi})`,
  'sim.score.text.tooCloseToCall':
    'Too close to call: the arms within a point of each other are not separated by this model. ' +
    'Every weight in the composite is an estimate, so treat them as equivalent and choose on the ' +
    'components (efficacy, safety, appropriateness) shown beside the score.',
  'sim.score.text.rankedBelowOverride':
    'Ranked below every arm with no override requirement — a guideline says avoid, not forbid',
  'sim.score.text.armNotRanked': (v: Vars) =>
    `This arm is not ranked. ${v.title} fired at severity ` +
    `${v.severity}. Printing a safety score next to an absolute ` +
    `contraindication invites someone to read it as a tradeoff. It is not one.`,
  'sim.score.text.anAbsoluteContraindication': 'An absolute contraindication',
  'sim.score.text.absolutelyContraindicated': 'Absolutely contraindicated.',
  'sim.score.text.caveatSexByDose':
    'Modelling assumption: the sex difference is applied as a constant proportional effect across the dose range. The label reports sex and dose separately and states no sex-by-dose figure — this interaction is assumed, not labelled.',
  'sim.score.text.caveatGeneric': (v: Vars) => `Modelling assumption: ${v.text}.`,

  // --------------------------------------------------- formulation verdicts
  // The English refusal wording is NORMATIVE (report spec §5.4) and has exactly
  // one home — src/report/disclaimer.ts. It is imported, never retyped, so the
  // English here cannot drift from the constant the scorer and the tests use.
  'sim.formulation.text.refusal': FORMULATION_REFUSAL_TEXT,
  'sim.formulation.text.refusalChip': FORMULATION_REFUSAL_CHIP,
  'sim.formulation.text.noProfile':
    'Best formulation type: not determined. The run did not produce a concentration profile, so trough-to-peak ratio and fluctuation could not be measured.',
  'sim.formulation.text.tprReason': (v: Vars) => `Trough-to-peak ratio ${v.value}${v.derived}`,
  'sim.formulation.text.tprDerivedClause': ' (from the concentration profile)',
  'sim.formulation.text.onceDaily': 'Once daily',
  'sim.formulation.text.timesDaily': (v: Vars) => `${v.n}× daily dosing`,
  'sim.formulation.text.forgivenessProxy':
    'Forgiveness after a missed dose was not measured; trough-to-peak used as a proxy.',
  'sim.formulation.text.metoprololRanked':
    'Extended-release preferred. Succinate ER peak plasma levels average one-fourth to one-half ' +
    'those of a corresponding dose of conventional metoprolol, which lowers peak β-blockade and ' +
    'reduces β2 spillover at peak — the mechanism that matters for the airway archetype.',
  'sim.formulation.text.amlodipineNotIndicated':
    'Extended-release formulation not indicated — the drug’s 30–50 h half-life already produces ' +
    'a flat concentration profile, so an ER form would change trough-to-peak and fluctuation negligibly.',
} satisfies Record<string, DictValue>

export type DictKey = keyof typeof en

const uz: Partial<Record<DictKey, DictValue>> = {
  // ---------------------------------------------------------------- sidebar / shell
  'app.tagline': 'Virtual bemor uchun dori simulyatori',
  'nav.home': 'Umumiy koʻrinish',
  'nav.substances': 'Moddalar',
  'nav.pills': 'Dorilar',
  'nav.subject': 'Sinov bemorlari',
  'nav.simulation': 'Simulyatsiya',
  'sidebar.saved': 'Saqlangan',
  'sidebar.savedEmpty':
    'Hali hech narsa saqlanmagan. Siz yaratgan yoki tuzgan narsalar shu yerda paydo boʻladi.',
  'sidebar.loading': 'Maʼlumotlar yuklanmoqda…',
  'sidebar.error': 'Maʼlumotlarni yuklab boʻlmadi',
  'sidebar.researchSimulator': 'Ilmiy-tadqiqot simulyatori',
  'lang.toggle.label': 'Til',
  'lang.en': 'English',
  'lang.uz': 'Oʻzbekcha',
  'lang.ru': 'Русский',

  // ------------------------------------------------------------------------- common
  'common.retry': 'Qayta urinish',
  'common.cancel': 'Bekor qilish',
  'common.clear': 'Tozalash',
  'common.edited': 'Oʻzgartirilgan',
  'common.revert': 'Asl holatga qaytarish',
  'common.userEntered': 'Foydalanuvchi kiritgan',
  'common.yours': 'Sizniki',
  'common.was': (v: Vars) => `avvalgi qiymat: ${v.value}`,
  'common.selectDetail': 'Tanlash',
  'common.selectedDetail': 'Tanlandi',
  'common.openDetails': 'Batafsil ›',
  'common.allParameters': 'Barcha parametrlar',
  'common.identifiersAndSynonyms': 'Identifikatorlar va sinonimlar',
  'common.synonyms': 'Sinonimlar',
  'common.name': 'Nomi',
  'common.role': 'Vazifasi',
  'common.class': 'Sinf',
  'common.active': 'Faol modda',
  'common.excipient': 'Yordamchi modda',
  'common.metabolite': 'Faol metabolit',
  'common.na': 'Tegishli emas.',

  // ---------------------------------------------------------------- status / errors
  'status.loading.title': 'Maʼlumotlar toʻplami yuklanmoqda',
  'status.loading.message': 'Moddalar, mahsulotlar va qoidalar olinmoqda…',
  'status.error.title': 'Maʼlumotlarni yuklab boʻlmadi',
  'status.error.message': 'Maʼlumotlar toʻplamini oʻqib boʻlmadi.',
  'status.empty.title': 'Koʻrsatish uchun hech narsa yoʻq',

  // ---------------------------------------------------------------------- severity
  'severity.info': 'Maʼlumot',
  'severity.preferred': 'Afzal',
  'severity.compelling': 'Ishonarli',
  'severity.minor': 'Yengil',
  'severity.moderate': 'Oʻrtacha',
  'severity.major': 'Jiddiy',
  'severity.contraindicated_relative': 'Nisbiy kontrendikatsiya',
  'severity.contraindicated_absolute': 'Mutlaq kontrendikatsiya',

  // -------------------------------------------------------------------- provenance
  'prov.status.CITED': 'Manba koʻrsatilgan',
  'prov.status.ESTIMATED': 'Taxminiy',
  'prov.status.NOT_FOUND': 'Topilmadi',
  'prov.detail.status': 'Holati',
  'prov.detail.source': 'Manba',
  'prov.detail.url': 'URL',
  'prov.detail.quote': 'Iqtibos',
  'prov.detail.basis': 'Asos',
  'prov.detail.searched': 'Qidirildi',
  'prov.detail.note': 'Izoh',
  'prov.detail.noSourceRecorded': 'Bu maydon uchun manba, iqtibos yoki asos qayd etilmagan.',
  'prov.detail.noneOnField': 'Bu maydonda manba obyekti yoʻq.',
  'prov.retrieved': (v: Vars) => `olingan sana: ${v.date}`,
  'prov.tier': (v: Vars) => `daraja ${v.tier} — ${v.label}`,
  'prov.confidence': (v: Vars) => `ishonch darajasi ${v.value}`,
  'prov.legend.cited': 'manbali',
  'prov.legend.estimated': 'taxminiy',
  'prov.legend.notFound': 'topilmagan',
  'prov.legend.ofValues': (v: Vars) => `${v.total} qiymatdan`,

  // -------------------------------------------------------------------------- home
  'home.title': 'Dorini hech kim ichishidan oldin uning taʼsirini koʻring.',
  'home.lede':
    'PilSim modellashtirilgan dorini virtual bemorga beradi, taʼsirini simulyatsiya qiladi va variantlarni saralaydi — har bir raqam ortida manba yoki halol “taxminiy” belgisi turadi.',
  'home.start': 'Boshlash — dori tanlang',
  'home.pickPatient': 'Bemor tanlang',
  'home.facts': (v: Vars) =>
    `${v.substances} ta modda · ${v.products} ta mahsulot · ${v.rules} ta manbali xavfsizlik qoidasi`,
  'home.step1.title': 'Dori tanlang',
  'home.step1.text': 'Haqiqiy mahsulot yoki oʻzingiznikini tuzing.',
  'home.step2.title': 'Bemor tanlang',
  'home.step2.text': 'Yosh, buyraklar, kasalliklar, genotip.',
  'home.step3.title': 'Ishga tushiring',
  'home.step3.text': 'Model soatma-soat hisoblab boradi.',
  'home.step4.title': 'Natijani oʻqing',
  'home.step4.text': 'Variantlar saralangan, foyda va zarar solishtirilgan.',

  // -------------------------------------------------------------------- substances
  'substances.pageTitle': 'Moddalar',
  'substances.pageSub': 'Katalogdan qidiring. Rafingiz dorilar shundan tuziladi.',
  'substances.searchPlaceholder': 'Katalogdan qidirish…',
  'substances.newSubstance': '+ Yangi modda',
  'substances.filter.all': 'Barchasi',
  'substances.filter.active': 'Faol moddalar',
  'substances.filter.excipient': 'Yordamchi moddalar',
  'substances.status.cited': 'Manbali',
  'substances.status.estimated': 'Taxminiy',
  'substances.status.notFound': 'Topilmagan',
  'substances.noMatch': (v: Vars) => `Katalogda “${v.query}” boʻyicha hech narsa topilmadi.`,
  'substances.catalogue': 'Katalog',
  'substances.matchCount': (v: Vars) => `${v.total}${v.capped ? '+' : ''} ta mos`,
  'substances.noMatchShort': 'mos kelmadi',
  'substances.showMore': (v: Vars) => `Yana ${v.n} tasini koʻrsatish`,
  'substances.yourShelf': 'Sizning rafingiz',
  'substances.yoursCount': (v: Vars) => `${v.n} ta sizniki`,
  'substances.shelfEmptyTitle': 'Rafda hech narsa yoʻq',
  'substances.shelfEmptyMessage': 'Katalogdan qidiring yoki oʻz moddangizni yarating.',
  'substances.next.putInPill': 'Uni doriga qoʻshing',
  'substances.next.compose': 'Keyingi qadam: shulardan dori tuzing',
  'substances.goToPills': 'Dorilarga oʻtish',
  'substances.readingLibrary': 'Moddalar kutubxonasi oʻqilmoqda.',
  'substances.loadError': 'Moddalar maʼlumotini yuklab boʻlmadi',
  'substances.addToShelf': '+ Rafga qoʻshish',
  'substances.removeFromShelf': 'Rafdan olib tashlash',
  'substances.backToShelf': '← Raf',
  'substances.identity': 'Umumiy maʼlumot',
  'substances.classPlaceholder': 'masalan, AAF inhibitori',
  'substances.everyValueEstimated': 'Siz kiritgan har bir qiymat taxminiy deb belgilanadi, hech qachon manbali emas.',
  'substances.delete': 'Oʻchirish',
  'substances.keyParameters': 'Asosiy parametrlar',
  'substances.resetEdits': (v: Vars) => `${v.n} ta oʻzgartirishni bekor qilish`,
  'substances.noMeasuredValues': 'Hali oʻlchangan qiymatlar yoʻq.',
  'substances.filterByStatus': 'Qiymat manbasi boʻyicha filtrlash',
  'substances.noFilterMatch': 'Bu filtrga hech narsa mos kelmaydi.',
  'substances.field': 'Maydon',
  'substances.value': 'Qiymat',
  'substances.rangeSpread': 'Diapazon / tarqalish',
  'substances.source': 'Manba',
  'substances.showSource': 'Manbani koʻrsatish',
  'substances.hideSource': 'Manbani yashirish',
  'substances.substancesSelected': (v: Vars) => `${v.n} ta modda tanlandi`,
  'substances.removeFromSelection': (v: Vars) => `${v.name} tanlovdan olib tashlansin`,
  'substances.createPillFrom': (v: Vars) => `${v.n} ta moddadan dori yaratish`,
  'substances.noConflictYet': 'Bu tanlovlar orasida hozircha ziddiyat yoʻq.',
  'substances.onShelf': 'rafda bor',
  'substances.deselect': (v: Vars) => `${v.name} tanlovdan olib tashlansin`,
  'substances.select': (v: Vars) => `${v.name} tanlansin`,
  'substances.userEnteredValues': (v: Vars) => `${v.n} ta qiymat, foydalanuvchi kiritgan`,
  'substances.citedOfTotal': (v: Vars) => `${v.total} tadan ${v.cited} tasi manbali`,

  // ---------------------------------------------------------------------- section labels
  'section.general': 'Yozuv darajasidagi qiymatlar',
  'section.physchem': 'Fizik-kimyoviy xossalar',
  'section.pk': 'Farmakokinetika',
  'section.pd': 'Farmakodinamika',
  'section.dosing': 'Dozalash',
  'section.formulations': 'Shakllari',
  'section.simulation_hooks': 'Simulyatsiya bogʻlamlari',
  'section.flags': 'Belgilar',
  'section.identifiers': 'Identifikatorlar',

  // ------------------------------------------------------------------------- pills
  'pills.pageTitle': 'Dorilar',
  'pills.pageSub': 'Sakkizta haqiqiy mahsulot. Oʻzingiznikini tuzing — xuddi shu qoidalar tekshiradi.',
  'pills.searchPlaceholder': 'Dorilar va tarkibiy qismlarni filtrlash…',
  'pills.compose': '+ Yangi dori',
  'pills.composeTitle': 'Dori tuzish',
  'pills.composeEmptyHint':
    'Bu yerdagi sakkiztasi bilan cheklanmang — istalgan moddadan oʻzingiznikini tuzing.',
  'pills.allPills': '← Barcha dorilar',
  'pills.safetyCheck': 'Xavfsizlik tekshiruvi',
  'pills.runsOnFirst': 'birinchi moddada ishga tushadi',
  'pills.activeExcipientCount': (v: Vars) => `${v.active} ta faol · ${v.excipient} ta yordamchi`,
  'pills.twoActivesHint': 'Turli sinflardagi ikkita faol modda eng qiziqarli holat.',
  'pills.duplicateSubstance': 'Bir xil modda ikki marta koʻrsatilgan. Miqdorlarni birlashtiring.',
  'pills.doseEdited': (v: Vars) => `${v.n} ta doza oʻzgartirildi`,
  'pills.compositionOnly': 'faqat tarkib, bemor hali yoʻq',
  'pills.noPillMatch': (v: Vars) => `“${v.query}” boʻyicha hech qanday dori topilmadi.`,
  'pills.next.choosePatient': 'Keyingi qadam: kim qabul qilishini tanlang',
  'pills.next.pickPatient': 'Keyingi qadam: bemor tanlang',
  'pills.pickPatient': 'Bemor tanlang',
  'pills.readingLibrary': 'Mahsulotlar kutubxonasi oʻqilmoqda.',
  'pills.loadError': 'Mahsulot maʼlumotini yuklab boʻlmadi',
  'pills.checkScope.summary': 'Bu tekshiruv nimani qamrab oladi',
  'pills.checkScope.body':
    'Simulyatsiyada ishlatiladigan 48 qoidali dvigatel. Bemorsiz u sinf darajasidagi oʻzaro taʼsirlar, tarkibiy qismlar juftligi, doza chegaralari va yordamchi moddalarni hal qiladi. Holat, tahlil, fenotip yoki demografik maʼlumot talab qiladigan qoidalar kutilayotgan deb koʻrsatiladi. 7-daraja bloklaydi; 6-daraja qayd etilgan chetlanishni talab qiladi.',

  // -------------------------------------------------------------------- composer
  'composer.newComposition': 'Yangi tarkib',
  'composer.name': 'Nomi',
  'composer.namePlaceholder': 'masalan, Lisinopril + amlodipin 10/5',
  'composer.selectSubstance': '— moddani tanlang —',
  'composer.yoursGroup': (v: Vars) => `Sizniki (${v.n})`,
  'composer.activeGroup': (v: Vars) => `Faol moddalar (${v.n})`,
  'composer.excipientGroup': (v: Vars) => `Yordamchi moddalar (${v.n})`,
  'composer.dose': 'Doza',
  'composer.form': 'Shakli',
  'composer.addAnother': '+ Yana bir modda qoʻshish',
  'composer.singleSubstanceHint':
    'Bitta modda bilan ham ishlaydi — ular qanday taʼsir qilishishini koʻrish uchun ikkinchisini qoʻshing.',
  'composer.saveToLibrary': 'Kutubxonaga saqlash',
  'composer.clear': 'Tozalash',
  'composer.duplicateHint': 'Bir xil modda takrorlangan',
  'composer.addAtLeastOne': 'Kamida bitta modda qoʻshing',
  'composer.giveItName': 'Nom bering',
  'composer.removeComponent': 'Tarkibiy qismni olib tashlash',
  'composer.formStandard': (v: Vars) => `${v.form} — standart`,
  'composer.formNotReal': (v: Vars) => `${v.form} — haqiqiy mahsulot emas`,
  'composer.formPkEquivalent': (v: Vars) =>
    `${v.form} — haqiqiy, lekin standartdan farqli PK oʻlchovi yoʻq`,
  'composer.formDifferent': (v: Vars) => `${v.form} — soʻrilish profili boshqacha`,

  // -------------------------------------------------------------------- findings
  'findings.verdict.blocked': 'Bloklangan',
  'findings.verdict.override': 'Chetlanish talab qilinadi',
  'findings.verdict.warn': 'Ogohlantirishlar',
  'findings.verdict.clear': 'Ziddiyat yoʻq',
  'findings.verdictText.blocked': 'Mutlaq kontrendikatsiya mavjud. Chetlanish taklif etilmaydi.',
  'findings.verdictText.override':
    '6-daraja — undan saqlaning, kontrendikatsiya emas. Bu faqat qayd etilgan chetlanish asosida davom etadi va ruxsat etilgan barcha variantlardan pastda turadi.',
  'findings.verdictText.warn': 'Ruxsat etilgan, ammo dozalashdan oldin ogohlantirishlarni oʻqing.',
  'findings.verdictText.clear': 'Bemorsiz baholash mumkin boʻlgan qoidalar orasida tarkib darajasida ziddiyat yoʻq.',
  'findings.group.blockers': 'Bloklovchilar',
  'findings.group.overrides': 'Chetlanish talab qiladi',
  'findings.group.warnings': 'Ogohlantirishlar',
  'findings.group.positives': 'Ijobiy koʻrsatmalar',
  'findings.group.info': 'Maʼlumot',
  'findings.noRuleFired': 'Bu tarkibda hech qanday qoida ishga tushmadi.',
  'findings.hideEvidence': 'Dalilni yashirish',
  'findings.evidenceAndEffects': 'Dalil va taʼsirlar',
  'findings.effectCount': (v: Vars) => `${v.direction} · ${v.n} ta taʼsir`,
  'findings.effects': 'Taʼsirlar',
  'findings.deferred.noneRemain': (v: Vars) =>
    `Faqat tarkib, ${v.engine} tomonidan. Bemorga bogʻliq qoidalar sinov bemori paydo boʻlgach ishga tushadi.`,
  'findings.deferred.some': (v: Vars) => `Faqat tarkib, ${v.engine} tomonidan.`,
  'findings.deferred.moreRules': (v: Vars) => `Yana ${v.n} ta qoida`,
  'findings.deferred.matchNeedSubject': 'shu tarkibiy qismga mos keladi, lekin bemor talab qiladi.',
  'findings.deferred.hide': 'yashirish',
  'findings.deferred.list': 'roʻyxatini koʻrish',
  'findings.deferred.needs': (v: Vars) => `talab qiladi: ${v.needs}`,
  'findings.engine.tier': 'Daraja',
  'findings.engine.doseCaps': 'Doza chegaralari',
  'findings.engine.risks': 'Xavflar',
  'findings.engine.monitor': 'Kuzatuv',

  // -------------------------------------------------------------------- pill card
  'pillcard.activeIngredients': (v: Vars) => `Faol moddalar · ${v.n}`,
  'pillcard.identity': 'Umumiy maʼlumot',
  'pillcard.productClass': 'Mahsulot sinfi',
  'pillcard.generic': 'Xalqaro nomi',
  'pillcard.dosageForm': 'Dozalash shakli',
  'pillcard.route': 'Qabul qilish yoʻli',
  'pillcard.dosingInterval': 'Qabul qilish oraligʻi',
  'pillcard.every': (v: Vars) => `har ${v.h} soatda`,
  'pillcard.strengths': 'Doza koʻrinishlari',
  'pillcard.asMarketed': 'bozordagidek',
  'pillcard.modelledStrength': 'Modellashtirilgan doza',
  'pillcard.referenceBrands': 'Manba brendlar',
  'pillcard.lactose': 'Laktoza',
  'pillcard.excipients': 'Yordamchi moddalar',
  'pillcard.noneInComposition': 'bu tarkibda yoʻq',
  'pillcard.tradeSecret': (v: Vars) => `${v.n} ta · miqdorlari tijorat siri`,
  'pillcard.noExcipients': 'Bu tarkibda yordamchi moddalar yoʻq.',
  'pillcard.substance': 'Modda',
  'pillcard.amount': 'Miqdori',
  'pillcard.notDisclosed': 'oshkor qilinmagan',
  'pillcard.userEntered': 'foydalanuvchi kiritgan',
  'pillcard.notes': 'Izohlar',
  'pillcard.label': (v: Vars) => `yorliqda ${v.amount}`,
  'pillcard.containsLactose': 'Tarkibida laktoza bor',
  'pillcard.excipientCount': (v: Vars) =>
    `${v.n} ta yordamchi modda${v.interval ? ` · har ${v.interval} soatda` : ''}`,
  'pillcard.formNote': (v: Vars) => `Shakli: ${v.form}`,
  'pillcard.formNotePkEquivalent': ' — haqiqiy, lekin standart tabletkadan farqli PK oʻlchovi yoʻq',
  'pillcard.dose': 'doza',
  'pillcard.baseContent': (v: Vars) => `Yorliqda ${v.salt} — ${v.base} mg asos miqdori`,

  // ----------------------------------------------------------------------- subject
  'subject.pageTitle': 'Sinov bemorlari',
  'subject.pageSub': 'Simulyatsiya qilinadigan bemorni tanlang. Har biri javobni oʻzgartiradi.',
  'subject.addSubject': '+ Bemor qoʻshish',
  'subject.restoreScenarios': (v: Vars) => `${v.n} ta stsenariyni tiklash`,
  'subject.isSelected': (v: Vars) => `${v.label} tanlandi`,
  'subject.runRegimen': ' — shu bemorga rejim asosida simulyatsiya ishga tushiring.',
  'subject.runSimulation': 'Simulyatsiyani ishga tushirish',
  'subject.loadingModel': 'Bemor modeli yuklanmoqda',
  'subject.modelLoadError': (v: Vars) =>
    `patient_model.json yuklanmadi (${v.error}). Hech qanday holat presetini qoʻllab boʻlmaydi, shuning uchun bu sahifa faqat asosiy hisoblash quvurini koʻrsatmoqda.`,
  'subject.library': '← Kutubxona',
  'subject.subjectName': 'Bemor nomi',
  'subject.hepaticGate': 'Jigar darvozasi',
  'subject.hepaticGateNote':
    'Hech narsa organizmda emas, shuning uchun har bir oqim nolga teng. Ochilish darajasi faqat genotipga bogʻliq — u standart metoprolol dozasi 80,2 ng/mL dan pastda qolishini (bu yerda dori hali ham β1-selektiv) yoki undan oshib ketishini (bu yerda endi selektiv emas) belgilaydi.',
  'subject.footer':
    'Ilmiy-tadqiqot simulyatori, klinik qaror qabul qilish vositasi emas. Kalibrlanmagan proksi signallar mutlaq birliklarda emas, faqat nisbiy koʻrsatkichlar sifatida koʻrsatiladi.',
  'subject.untreatedBaseline': 'Davolanmagan boshlangʻich holat',
  'subject.pregnancyGate': 'Homiladorlik belgisi qoʻyilgan. AAF inhibitori yoki ARB simulyatsiya qilinmaydi.',
  'subject.affectedAnatomyAria': 'Davolanmagan boshlangʻich holat anatomiyasi',
  // parameter panel
  'subject.group.who': 'Kim',
  'subject.group.body': 'Tana',
  'subject.group.circulation': 'Qon aylanishi',
  'subject.group.kidney': 'Buyrak',
  'subject.group.genotype': 'Genotip',
  'subject.group.genotypeNote': 'har bir metoprolol dozasi oʻtishi kerak boʻlgan jigar darvozasini belgilaydi',
  'subject.group.conditions': 'Kasalliklar',
  'subject.group.conditionsOn': (v: Vars) => `${v.n} ta yoqilgan — har biri nomlangan holat oʻzgaruvchilarini siljitadi`,
  'subject.group.conditionsOff': 'har biri nomlangan holat oʻzgaruvchilarini siljitadi',
  'subject.sexAtBirth': 'Tugʻilgandagi jinsi',
  'subject.sexCovariate': 'biologik kovariat',
  'subject.sexTitle': 'CKD-EPI, Watson, Janmahasatian va Nadler formulalaridagi kovariat. Jinsiy identiklik emas.',
  'subject.male': 'Erkak',
  'subject.female': 'Ayol',
  'subject.pregnant': 'Homilador',
  'subject.pregnantGateHint': 'har qanday AAF inhibitori yoki ARB uchun qattiq toʻsiq',
  'subject.yes': 'Ha',
  'subject.no': 'Yoʻq',
  'subject.age': 'Yosh',
  'subject.ageHint': 'faqat kattalar — bolalar uchun yetilish modeli qoʻllanilmagan',
  'subject.weight': 'Vazn',
  'subject.height': 'Boʻy',
  'subject.systolic': 'Sistolik bosim',
  'subject.diastolic': 'Diastolik bosim',
  'subject.heartRate': 'Yurak urishi',
  'subject.reference': (v: Vars) => `norma ${v.lo}–${v.hi}`,
  'subject.serumCreatinine': 'Qon zardobidagi kreatinin',
  'subject.cyp2d6': 'CYP2D6',
  'subject.cyp2d6Hint': 'darvoza kengligi',
  'subject.cyp2d6GateTitle': (v: Vars) => `Darvoza normal sigʻimning ${v.gate} baravarigacha ochiladi`,
  'subject.cyp2c9': 'CYP2C9',
  'subject.cyp2c9Hint': 'lozartan → EXP3174',
  'subject.phenotype.poor': 'Sust',
  'subject.phenotype.intermediate': 'Oraliq',
  'subject.phenotype.normal': 'Normal',
  'subject.phenotype.ultrarapid': 'Juda tez',
  'subject.modelNotLoaded': 'patient_model.json yuklanmadi, shuning uchun hech qanday preset qoʻllanilmaydi.',
  'subject.modifierCount': (v: Vars) => `${v.n} ta modifikator`,
  'subject.derived.bsa': 'Tana yuzasi',
  'subject.derived.bmi': 'Tana massasi indeksi',
  'subject.derived.bodyWater': 'Tana suvi',
  'subject.derived.meanPressure': 'Oʻrtacha bosim',
  'subject.derived.cardiacOutput': 'Yurak minutlik hajmi',
  'subject.derived.vascularResistance': 'Qon tomir qarshiligi',
  'subject.derived.egfr': 'eGFR',
  'subject.derived.renalBloodFlow': 'Buyrak qon oqimi',
  'subject.derived.ckdStage': 'SBK bosqichi',
  'subject.derived.hepaticGate': 'Jigar darvozasi',
  'subject.derived.cyp2d6Phenotype': 'CYP2D6 fenotipi',
  // derived panel
  'subject.derivedPanel.title': 'Model nimani hisoblaydi',
  'subject.derivedPanel.source.engine': 'rules/twin.ts',
  'subject.derivedPanel.source.fallback': 'sahifa zaxira rejimi — rules/twin.ts yuklanmagan',
  'subject.derivedPanel.whatMoved': 'Kasalliklar nimani oʻzgartirdi',
  'subject.derivedPanel.stateVarCount': (v: Vars) => `${v.n} ta holat oʻzgaruvchisi`,
  'subject.derivedPanel.nothingMoved':
    'Kasallik tanlangan, lekin hech narsa oʻzgarmadi — bu preset faqat qoidalar dvigateli belgilarini oʻz ichiga oladi.',
  'subject.derivedPanel.moreShifted': 'Yana oʻzgargan oʻzgaruvchilar',
  'subject.derivedPanel.allDerived': 'Barcha hisoblangan oʻzgaruvchilar',
  'subject.derivedPanel.auditTrail': 'Modifikatorlar audit izi',
  'subject.derivedPanel.warnings': 'Hisoblash ogohlantirishlari',
  'subject.derivedPanel.was': (v: Vars) => `avvalgi qiymat: ${v.value}`,
  // subject card
  'subject.card.pregnant': 'Homilador',
  'subject.card.noComorbidity': 'Qoʻshimcha kasallik yoʻq',
  'subject.card.bloodPressure': 'Qon bosimi',
  'subject.card.egfr': 'eGFR',
  'subject.card.selected': 'Tanlandi',
  'subject.card.edit': 'Tahrirlash',
  'subject.card.duplicate': 'Nusxalash',
  'subject.card.delete': 'Oʻchirish',
  'subject.card.confirm': 'Tasdiqlash',
  'subject.card.confirmDelete': (v: Vars) => `${v.label} oʻchirilishini tasdiqlang`,
  'subject.card.deleteLabel': (v: Vars) => `${v.label} oʻchirilsin`,
  'subject.card.meta': (v: Vars) => `${v.age} yosh · ${v.sex} · ${v.weight} kg`,
  'subject.card.male': 'erkak',
  'subject.card.female': 'ayol',
  'subject.card.moreCount': (v: Vars) => `+${v.n}`,

  // ------------------------------------------------------------------ anatomy rail
  'rail.affectedAnatomy': 'Taʼsirlangan anatomiya',
  'rail.pickSubstance': 'Uning qayerga taʼsir qilishini koʻrish uchun modda tanlang.',

  // ---------------------------------------------------- UI-A batch 2: rail captions
  'substances.rail.whereActs': (v: Vars) => `${v.name} qayerga taʼsir qiladi`,
  'substances.rail.shelfCaption': 'Rafingizdagi barcha narsalar',
  'substances.rail.shelfEmpty':
    'Uning qayerga taʼsir qilishini koʻrish uchun rafga faol modda qoʻshing.',
  'substances.addShort': '+ Raf',
  'substances.editedCount': (v: Vars) => `${v.n} ta oʻzgartirilgan`,
  'common.amountAria': (v: Vars) => `${v.name} miqdori, milligramda`,
  'pills.rail.composeCaption': 'Bu tarkib nimaga taʼsir qilishi',
  'pills.rail.composeEmpty': 'Faol moddani tanlang — tana uning qayerga yetishini koʻrsatadi.',
  'pills.rail.actsOn': (v: Vars) => `${v.name} nimaga taʼsir qiladi`,
  'pills.rail.libraryCaption': 'Kutubxonadagi barcha narsalar',
  'pills.rail.libraryEmpty': 'Uning nimaga taʼsir qilishini koʻrish uchun dori tuzing.',

  // ------------------------------------------------ UI-A batch 2: field/card copy
  'field.typicalStartingDose': 'Odatiy boshlangʻich doza',
  'field.maxDailyDose': 'Maksimal kunlik doza',
  'field.halfLife': 'Yarim yemirilish davri',
  'field.timeToPeak': 'Choʻqqiga yetish vaqti',
  'field.oralBioavailability': 'Peroral bioavailability',
  'field.systolicBpChange': 'Sistolik bosim oʻzgarishi',
  'field.onsetOfEffect': 'Taʼsir boshlanishi',
  'field.durationOfEffect': 'Taʼsir davomiyligi',
  'field.clearance': 'Klirens',
  'field.volumeOfDistribution': 'Taqsimlanish hajmi',
  'field.proteinBinding': 'Oqsil bilan bogʻlanish',
  'field.excretedUnchangedUrine': 'Siydik bilan oʻzgarmagan holda chiqarilishi',
  'field.typicalAmountPerTablet': 'Tabletkadagi odatiy miqdor',
  'field.maximumPerDay': 'Kunlik maksimal miqdor',
  'field.molecularWeight': 'Molekulyar massa',
  'field.startDose': 'Boshlangʻich doza',
  'field.maxPerDayShort': 'Kuniga maks.',
  'field.bioavailability': 'Bioavailability',
  'field.typicalAmount': 'Odatiy miqdor',

  'field.class.aceInhibitor': 'AAF inhibitori',
  'field.plain.aceInhibitor': 'AAF fermentini bloklab, qon tomirlarni kengaytiradi.',
  'field.class.arb': 'ARB',
  'field.plain.arb': 'Tomirlarni toraytiradigan angiotenzin II retseptorini bloklaydi.',
  'field.class.ccb': 'Kalsiy kanali blokatori',
  'field.plain.ccb': 'Kalsiy kirishini bloklab, arteriyalarni kengaytiradi.',
  'field.class.thiazide': 'Tiazid diuretigi',
  'field.plain.thiazide': 'Buyrakni tuz va suvni chiqarishga majbur qiladi.',
  'field.class.betaBlocker': 'Beta-blokator',
  'field.plain.betaBlocker': 'Yurak urishini sekinlashtiradi va uning zarba hajmini kamaytiradi.',

  'field.fn.filler': 'Tabletkani qulay hajmga toʻldiradi.',
  'field.fn.disintegrant': 'Tabletkani yutilgandan keyin parchalanishini taʼminlaydi.',
  'field.fn.binder': 'Tabletka qismlarini bir-biriga ushlab turadi.',
  'field.fn.lubricant': 'Kukunning presslash mashinasiga yopishib qolishining oldini oladi.',
  'field.fn.glidant': 'Ishlab chiqarish jarayonida kukunning erkin oqishiga yordam beradi.',
  'field.fn.coating': 'Tabletkaning tashqi qobigʻini hosil qiladi.',
  'field.fn.colorant': 'Tabletkani boʻyaydi.',
  'field.fn.colorant_substrate': 'Boʻyoq pigmentini olib yuradi.',
  'field.fn.surfactant': 'Dorining hoʻllanishi va erishiga yordam beradi.',
  'field.fn.preservative': 'Suyuq shakllarda mikroblar oʻsishining oldini oladi.',
  'field.fn.sweetener': 'Suyuq shaklni shirin qiladi.',
  'field.fn.vehicle': 'Dori tarkibida erigan suyuqlik.',
  'field.fn.buffer': 'pH darajasini barqaror ushlab turadi.',
  'field.fn.chelator': 'Dorini buzadigan iz metallarni bogʻlaydi.',
  'field.fn.viscosity_modifier': 'Suyuq shaklni quyuqlashtiradi.',

  // ------------------------------------------------- simulation: run controls
  // Drug names stay as the data supplies them (Amlodipine, not Amlodipin) so the
  // interface and the cited sources always name the same molecule the same way.
  'field.ed50': 'ED50',

  'sim.pill.label': 'Sinaladigan dorilar',
  'sim.pill.selectedCount': ({ n }) => `${n} ta tanlandi`,
  'sim.pill.editPills': 'Dorilarni tahrirlash',
  'sim.pill.composeOwn': "O'zingiznikini yarating",
  'sim.pill.composedNote': 'Bittasini belgilab ishga tushiring yoki bir nechtasini taqqoslang.',
  'sim.pill.eightProducts': 'Bittasini belgilab ishga tushiring yoki bir nechtasini yonma-yon taqqoslang.',
  'sim.pill.formLabel': 'Dori shakli',
  'sim.pill.formNotePkEquivalent': "Bu shakl mavjud, lekin ta'siri bir xil.",
  'sim.pill.formNoteDifferent': "Bu shaklning so'rilish profili boshqacha.",

  // ===== APPENDED BLOCK — simulation arm builder (RunControls PillPicker) =====
  'sim.pill.armsLabel': 'Taqqoslanadigan variantlar',
  'sim.pill.armCount': ({ n }) => `${n} ta variant`,
  'sim.pill.rolePrimary': 'Asosiy',
  'sim.pill.roleComparison': 'Taqqoslash',
  'sim.pill.removeArm': ({ name }) => `${name} — olib tashlash`,
  'sim.pill.singleArmNote':
    "Grafiklar va tana shu variantga ergashadi. Ishga tushirish uchun kamida bitta variant kerak, shuning uchun buni olib tashlashdan oldin boshqasini qo'shing.",
  'sim.pill.primaryNote':
    'Birinchi variant asosiy — grafiklar va tana unga ergashadi. Qolganlari u bilan birga ishlaydi va unga nisbatan baholanadi.',
  'sim.pill.noneConsequence':
    "Variant tanlanmagan, shuning uchun ishga tushiradigan narsa yo'q. Quyida bittasini qo'shing — u dori shakllari bilan shu yerda paydo bo'ladi.",
  'sim.pill.addArm': "Variant qo'shish",
  'sim.pill.libraryCount': ({ n }) => `kutubxonada ${n} ta`,
  'sim.pill.searchPlaceholder': 'Kutubxonadan qidirish',
  'sim.pill.groupMono': 'Monoterapiya',
  'sim.pill.groupCombo': "Qat'iy dozali kombinatsiya",
  'sim.pill.added': "Qo'shildi",
  'sim.pill.noMatch': ({ q }) =>
    `Kutubxonada “${q}” ga mos hech narsa yo'q, shuning uchun qo'shadigan narsa ham yo'q. Barchasini ko'rish uchun qidiruvni tozalang.`,
  'sim.form.aria': ({ drug }) => `${drug} uchun dori shakli`,
  'sim.form.primaryOnly': 'Dori shaklini faqat asosiy variantda tanlash mumkin.',
  // ===== end appended block =====

  'sim.subject.label': 'Bemor',
  'sim.subject.build': 'Bemor yaratish',

  'sim.run.run': 'Simulyatsiyani ishga tushirish',
  'sim.run.stop': "To'xtatish",
  'sim.run.settings': 'Ishga tushirish sozlamalari',
  'sim.run.horizon': 'Simulyatsiya vaqti',
  'sim.run.initialConditions': "Boshlang'ich holat",
  'sim.run.steadyState': 'Barqaror holat',
  'sim.run.firstDose': 'Birinchi doza',
  'sim.run.steadyStateNote': "Doimiy qabul — rejimlarni taqqoslash uchun to'g'ri asos.",
  'sim.run.firstDoseNote':
    "Faqat birinchi doza. Amlodipine barqaror holatga 7–8 kunda yetadi, shuning uchun bu yerda taqqoslash o'rinli emas.",
  'sim.run.population': 'Virtual bemorlar',
  'sim.run.populationN': ({ n }) => `${n}`,
  'sim.run.singleTwin': 'Faqat shu bemor',
  'sim.run.populationNote': "Bir nechtasi odamlar orasidagi farqni ko'rsatadi.",
  'sim.run.frameInterval': 'Tafsilot',
  'sim.run.frameMinutes': ({ n }) => `har ${n} daqiqada`,

  // ============================================================ pills/subject wiring
  'pill.compose.nameAria': 'Tarkib nomi',
  'subj.cyp2c9Activity': 'CYP2C9 faolligi',
  'subj.condition.gradeAria': (v: Vars) => `${v.label} darajasi`,
  'subj.readout.bsa': 'Tana yuzasi',
  'subj.readout.bmi': 'Tana massasi indeksi',
  'subj.readout.lbw': 'Yogʻsiz tana vazni',
  'subj.readout.tbw': 'Umumiy tana suvi',
  'subj.readout.plasmaVolume': 'Plazma hajmi',
  'subj.readout.map': 'Oʻrtacha arterial bosim',
  'subj.readout.cardiacOutput': 'Yurak minutlik hajmi',
  'subj.readout.strokeVolume': 'Zarba hajmi',
  'subj.readout.svr': 'Qon tomir qarshiligi',
  'subj.readout.arterialCompliance': 'Arterial komplayans',
  'subj.readout.egfr': 'eGFR',
  'subj.readout.absoluteGfr': 'Mutlaq GFR',
  'subj.readout.crcl': 'Kreatinin klirensi',
  'subj.readout.renalBloodFlow': 'Buyrak qon oqimi',
  'subj.readout.filtrationFraction': 'Filtratsiya fraksiyasi',
  'subj.readout.hepaticBloodFlow': 'Jigar qon oqimi',
  'subj.readout.plasmaReninActivity': 'Plazma renin faolligi',
  'subj.readout.sympatheticTone': 'Simpatik tonus',
  'subj.readout.allometricClScalar': 'Allometrik klirens skalari',

  // ======================================================================
  // sim.* — UI-SIM wiring (see matching block at the end of `en` above).
  // ======================================================================
  'sim.ai.title': "Klinik mulohaza — sun'iy intellekt yaratgan matn",
  'sim.ai.sub':
    "Dvigatel natijasini o'qiydigan til modeli. U tushuntiradi va taklif qiladi; hech narsani hal qilmaydi, va yozgan har bir raqami unga berilgan ma'lumotlar bilan tekshiriladi.",
  'sim.ai.askAgain': "Qayta so'rash",
  'sim.ai.explainThis': 'Buni tushuntirish',
  'sim.ai.stop': "To'xtatish",
  'sim.ai.hideSettings': 'Sozlamalarni yashirish',
  'sim.ai.showSettings': 'AI sozlamalari',
  'sim.ai.notConfigured': "provayder sozlanmagan — panel o'chirilgan",
  'sim.ai.explainingLabel': 'tushuntirilmoqda:',
  'sim.ai.generatedMark': 'yaratilgan matn — manba emas',
  'sim.ai.waitingFirstToken': 'birinchi belgini kutmoqda…',
  'sim.ai.verdictCleanStrong': (v: Vars) => `${v.n} ta raqam tekshirildi, barchasi kuzatiladi.`,
  'sim.ai.verdictCleanRest': (v: Vars) =>
    `Yuqoridagi har bir raqam modelga berilgan ${v.facts} ta qiymat orasida mavjud edi. Uning manbasini ko'rish uchun ustiga suring.`,
  'sim.ai.verdictDirtyStrong': (v: Vars) =>
    `${v.total} ta raqamdan ${v.unsupported} tasi berilgan ma'lumotlarga mos kelmaydi`,
  'sim.ai.verdictDirtyRest':
    "Ular yuqorida chizib tashlangan va manbali deb o'qilmasligi kerak. Bu chegaraning o'z vazifasini bajarishi, render xatosi emas: model dvigatel hech qachon hisoblamagan raqamni yaratdi.",
  'sim.ai.worthWatching': 'Tomosha qilishga arziydi:',
  'sim.ai.sceneNote':
    "Sahna — allaqachon bo'lib o'tgan yugurishning ko'rinishi. Unga o'tish anatomiyani qayta kadrlaydi, hech qanday raqamni o'zgartirmaydi.",
  'sim.ai.watchIt': 'Tomosha qilish',
  'sim.ai.proposedNext': 'Taklif etilgan keyingi simulyatsiyalar',
  'sim.ai.suggestsNote':
    "Model taklif qiladi; dvigatel hal qiladi. Bularning har biri ushbu mahsulot allaqachon aniqlagan rejim — model uni ro'yxatdan id bo'yicha tanladi va o'zidan doza nomlay olmaydi. Birini bosish deterministik simulyatsiyani ishga tushiradi va natija dvigateldan keladi, bu yerdan emas.",
  'sim.ai.simulateThis': 'Buni simulyatsiya qilish',
  'sim.ai.discarded': (v: Vars) =>
    `${v.ids} nomli ${v.n === 1 ? 'taklif' : `${v.n} ta taklif`} rad etildi — bu mahsulotda bunday rejim mavjud emas, shuning uchun ishga tushiradigan narsa yo'q va bo'shliqni to'ldirish uchun hech narsa o'ylab topilmadi.`,
  'sim.ai.failureTitleNoProvider': 'AI provayderi sozlanmagan',
  'sim.ai.failureTitleNetwork': 'Modelga ulanib bo\'lmadi',
  'sim.ai.failureTitleRateLimit': "Provayder so'rovlar chastotasini cheklamoqda",
  'sim.ai.failureTitleServer': 'Provayder xatolik qaytardi',
  'sim.ai.failureTitleMalformed': "Javobni o'qib bo'lmadi",
  'sim.ai.failureTitleAborted': 'Bekor qilindi',
  'sim.ai.failureTitleTimeout': 'Model vaqtida javob bermadi',
  'sim.ai.failureNote':
    "Ushbu sahifadagi boshqa hech narsa modelga bog'liq emas. Simulyatsiya, qoidalar, saralash va hisobot ta'sirlanmagan — va o'rniga tayyor matn ko'rsatilmayapti.",
  'sim.ai.openSettings': 'AI sozlamalarini ochish',
  'sim.ai.settingsHeading': 'AI provayderi',
  'sim.ai.close': 'Yopish',
  'sim.ai.settingsIntro':
    "Qaysi model javob berishi — sozlama, kod o'zgarishi emas. Agar namoyish paytida bitta provayder cheklab qo'ysa, shu yerdan almashtiring va qayta so'rang.",
  'sim.ai.provider': 'Provayder',
  'sim.ai.automatic': 'Avtomatik — birinchi sozlangani',
  'sim.ai.workerEndpoint': 'Worker manzili',
  'sim.ai.workerShouldCall': "Worker chaqirishi kerak bo'lgan xizmat",
  'sim.ai.geminiKeyLabel': "Gemini kaliti — brauzerdan to'g'ridan-to'g'ri yo'l uchun",
  'sim.ai.geminiKeyPlaceholder': 'bir martalik kalitni joylashtiring',
  'sim.ai.keyWarning':
    "Bu yerga joylashtirilgan kalit shu brauzerda saqlanadi va devtools yoki tarmoq (network) yorlig'ini ochgan har kimga ko'rinadi. Bu o'z kompyuteringizda bir martalik kalit bilan namoyish uchun yaxshi. Lekin ishlab chiqarishga chiqarish uchun mo'ljallanmagan — buning o'rniga Geminini Worker orqali yo'naltiring, u yerda kalit serverda qoladi.",

  'sim.bench.orderingSays': "Tartib nimani ko'rsatadi",
  'sim.bench.failed': (v: Vars) => `Sinov bajarilmadi: ${v.error}`,
  'sim.bench.syntheticWarning':
    "Bu qo'llar zaxira dvigatel tomonidan yaratilgan, src/engine tomonidan emas. Quyidagi tartib vaqtinchalik model xususiyati, hech qanday farmakologik da'voni bildirmaydi.",
  'sim.bench.singleArmWarning':
    "Faqat bitta amalga oshiriladigan variant baholandi. Reyting ko'rsatilmaydi — raqibsiz tavsiya ataylab yashiriladi.",
  'sim.bench.bpEffectOnly': "Faqat qon bosimi ta'siri",
  'sim.bench.effectOnlyNote':
    "Bu mahsulotning reytingi emas. Bu faqat ΔSBP — xavfsizlik omili, muvofiqlik omili, xavfsizlik chegarasi va qoida darajalanishisiz. Bu yugurish behuda ketmasligi uchun ko'rsatilgan va tavsiya sifatida o'qilmasligi kerak.",

  'sim.chart.noSamplesYet': "Hali namunalar yo'q.",
  'sim.chart.nothingToRankYet': "Hali saralash uchun hech narsa yo'q.",
  'sim.chart.efficacy': 'Samaradorlik',
  'sim.chart.safety': 'Xavfsizlik',
  'sim.chart.appropriateness': 'Muvofiqlik',
  'sim.chart.composite': "yig'indi",
  'sim.chart.systolicReductionLabel': 'sistolik pasayish, mmHg',
  'sim.chart.plasmaConcentration': 'Plazma kontsentratsiyasi',
  'sim.chart.concSubtitle':
    "Bu yerda EXP3174 — losartanning faol metaboliti — chizilgan. Losartan ona birikmasi o'z alohida o'qiga ega.",
  'sim.chart.hoursSinceFirstDose': 'Birinchi dozadan keyingi soatlar',
  'sim.chart.emptyConcentration': 'Kontsentratsiyalarni ko\'rish uchun simulyatsiyani ishga tushiring.',
  'sim.chart.losartanParentTitle': "Losartan ona birikmasi — alohida o'q",
  'sim.chart.losartanParentSubtitle': "Cho'qqi-pastlik nisbati ≈ 2000 bo'lgani uchun alohida ko'rsatilgan.",
  'sim.chart.noLosartanInRegimen': "Bu rejimda losartan yo'q.",
  'sim.chart.concParentFootnote':
    "Bu egri chiziqni umumiy o'qqa hech qachon qo'ymang. Ta'sirning 60–85 % ini EXP3174 moietasi olib yuradi.",
  'sim.chart.haemodynamicResponse': 'Gemodinamik javob',
  'sim.chart.haemoSubtitle': "Qon bosimi mmHg da va yurak urishi bpm da, bitta o'qda.",
  'sim.chart.systolicBp': 'Sistolik qon bosimi',
  'sim.chart.systolicShort': 'Sistolik',
  'sim.chart.diastolicBp': 'Diastolik qon bosimi',
  'sim.chart.diastolicShort': 'Diastolik',
  'sim.chart.meanArterialPressure': "O'rtacha arterial bosim",
  'sim.chart.meanArterialShort': "O'rtacha arterial",
  'sim.chart.heartRate': 'Yurak urishi',
  'sim.chart.thisRunSuffix': ' · shu yugurish',
  'sim.chart.emptyHaemodynamic': "Gemodinamik javobni ko'rish uchun simulyatsiyani ishga tushiring.",
  'sim.chart.untreatedBaselineSystolic': (v: Vars) => `Davolanmagan boshlang'ich sistolik — ${v.value} mmHg`,
  'sim.chart.targetEngagement': "Nishonga ta'sir",
  'sim.chart.engagementSubtitle': "Har bir nishonning band bo'lish ulushi, 0–1.",
  'sim.chart.fractionEngaged': "Band bo'lish ulushi",
  'sim.chart.emptyEngagement': "Nishonga ta'sirni ko'rish uchun simulyatsiyani ishga tushiring.",
  'sim.chart.engagementFootnote':
    "β2 bandligi — selektivlik yo'qolish kanali. Distal burama kanalcha hujayralaridagi NCC / SLC12A3 — bu model hujayra darajasida da'vo qiladigan yagona nishon.",
  'sim.chart.engAceInhibitionPlasma': 'AAF inhibitsiyasi (plazma)',
  'sim.chart.engAt1Blockade': 'AT1 blokadasi',
  'sim.chart.engCav12Vessel': 'Cav1.2 blokadasi, tomir silliq muskuli',
  'sim.chart.engCav12Heart': 'Cav1.2 blokadasi, miokard',
  'sim.chart.engNccInhibition': 'NCC inhibitsiyasi, distal burama kanalcha',
  'sim.chart.engBeta1Occupancy': 'β1 bandligi',
  'sim.chart.engBeta2Occupancy': "β2 bandligi, selektivlik yo'qolish kanali",
  'sim.chart.engShortAce': 'AAF inhibitsiyasi',
  'sim.chart.engShortAt1': 'AT1 blokadasi',
  'sim.chart.engShortCav12Vessel': 'Cav1.2 — tomir',
  'sim.chart.engShortCav12Heart': 'Cav1.2 — yurak',
  'sim.chart.engShortNcc': 'NCC inhibitsiyasi',
  'sim.chart.engShortBeta1': 'β1 bandligi',
  'sim.chart.engShortBeta2': 'β2 bandligi',

  'sim.ranked.declinedToRank': 'Saralashdan bosh tortildi',
  'sim.ranked.refusalNote':
    "Bosh tortishning o'zi natijadir. Bu yerda saralashni o'ylab topish mahsulotdagi eng oson payqaladigan soxtalik bo'lardi — yo'llar va ularning FK farmatsevt-hakam yodida bo'ladigan narsalardir.",
  'sim.ranked.tooCloseToCall': "juda yaqin — aniqlab bo'lmaydi",
  'sim.ranked.disqualifiedNoRule': "Chetlashtirilgan, lekin baholovchi ko'rsatish uchun qoida topmadi.",
  'sim.ranked.systolicChange': "Sistolik o'zgarish",
  'sim.ranked.reached': (v: Vars) => `${v.target} ga yetdi`,
  'sim.ranked.safetyPenalties': 'Xavfsizlik jarimalari',
  'sim.ranked.penaltyBreakdown': (v: Vars) => `${v.rule} qoida · ${v.risk} xavf · ${v.lab} tahlil`,
  'sim.ranked.disqualifiedSectionHeading': "Chetlashtirilgan — saralanmagan, ballar ko'rsatilmaydi",
  'sim.ranked.rankingUnavailable': 'Saralash mavjud emas',
  'sim.ranked.noRankingDefault': "Baholovchi bu solishtirish to'plami uchun hech qanday saralash qaytarmadi.",
  'sim.ranked.simOutputRealNote':
    "Simulyatsiya natijasi haqiqiy; bo'shliqni to'ldirish uchun saralash o'ylab topilmayapti.",
  'sim.ranked.tieBannerStrong': (v: Vars) => `${v.n} ta variant orasidagi farqni aniqlab bo'lmaydi.`,
  'sim.ranked.tieBannerRest':
    "Ular modelning teng natija chegarasi ichida joylashgan, shuning uchun ular orasidagi tartib tavsiya emas, balki arifmetika natijasidir — har bir ball yonida ko'rsatilgan samaradorlik, xavfsizlik va muvofiqlik komponentlariga qarab tanlang.",

  'sim.report.steadyStateExposure': "Barqaror holatdagi ta'sir",
  'sim.report.adverseEventProbability': "Ufq davomida yon ta'sir ehtimoli",
  'sim.report.bestFormulationType': 'Eng yaxshi shakl turi',
  'sim.report.whatModelDoesNotRepresent': 'Bu model nimani aks ettirmaydi',
  'sim.report.twinDerivationWarnings': 'Egizak hisoblash ogohlantirishlari',
  'sim.report.whyThisResult': 'Nega bu natija',
  'sim.report.modellingAssumptions': "Bu raqamlar ortidagi modellashtirish taxminlari",
  'sim.report.eyebrow': 'Simulyatsiya hisoboti',
  'sim.report.tableMoiety': 'Moiety',
  'sim.report.tablePeak': "Cho'qqi",
  'sim.report.tableTrough': 'Pastlik',
  'sim.report.tablePeakTrough': "Cho'qqi:pastlik",
  'sim.report.concentrationsUnitNote': 'Kontsentratsiyalar ng/mL da.',
  'sim.report.noAdverseEvents': "Hisobot chegarasidan yuqori yon ta'sir ehtimoli yo'q.",
  'sim.report.declinedNoData': "Saralashdan bosh tortildi — ma'lumot mavjud emas",
  'sim.report.riskAngioedema': 'Angioedema',
  'sim.report.riskBronchospasm': 'Bronxospazm',
  'sim.report.riskHyperkalemia': 'Giperkaliemiya',
  'sim.report.riskAcuteGfrDrop': "O'tkir GFR pasayishi",
  'sim.report.riskBradycardia': 'Bradikardiya',
  'sim.report.riskHyponatremia': 'Giponatriemiya',
  'sim.report.riskHypokalemia': 'Gipokaliemiya',
  'sim.report.riskDizzinessOrthostatic': 'Bosh aylanishi / ortostatik',
  'sim.report.riskHyperuricemiaGout': 'Giperurikemiya / podagra',
  'sim.report.riskPeripheralEdema': 'Periferik shish',
  'sim.report.riskCough': "Yo'tal",

  // ---------------------------------------------------------------- evidence
  'sim.evidence.aria': 'Bu natija ortidagi dalillar',
  'sim.evidence.heading': 'Bu natija nimaga asoslanadi',
  'sim.evidence.restsOn': (v: Vars) =>
    `Bu tavsiya manbaga havolali ${v.cited} ta qiymat va ${v.estimated} ta taxminga asoslanadi.`,
  'sim.evidence.notFoundClause': (v: Vars) =>
    `${v.n} tasiga manba topilmadi va ular to'ldirilmasdan bo'sh ko'rsatilgan.`,
  'sim.evidence.rulesClause': (v: Vars) => `${v.n} ta xavfsizlik qoidasi ishga tushdi, har biri o'z manbasi bilan.`,
  'sim.evidence.doseAgainstLabel': 'Doza — rasmiy yorliqqa nisbatan',
  'sim.evidence.bpHeading': "Bashorat qilingan bosim o'zgarishi qayerdan olingan",
  'sim.evidence.showAll': 'Bu dorilar ortidagi barcha parametrlar',
  'sim.evidence.openSource': 'Manbani ochish',
  'sim.evidence.noQuote': "Bu qiymat uchun manbadan aynan matn yozib olinmagan.",
  'sim.evidence.notSourced': "Qidirildi; manba topilmadi. To'ldirilmasdan bo'sh qoldirildi.",
  'sim.evidence.sourceLabel': 'Manba',
  'sim.evidence.tier1': "Rasmiy dori yorlig'i",
  'sim.evidence.tier2': "Taqrizdan o'tgan tadqiqot",
  'sim.evidence.tier3': "Kimyoviy / dori ma'lumotlar bazasi",
  'sim.evidence.tier4': 'Ikkilamchi manba',
  'sim.evidence.doseStart': "Yorliqdagi boshlang'ich doza",
  'sim.evidence.doseUsual': 'Yorliqdagi odatiy oraliq',
  'sim.evidence.doseMax': 'Yorliqdagi kunlik maksimum',
  'sim.evidence.paramF': "Peroral bioo'zlashtirish",
  'sim.evidence.paramTmax': 'Plazmada eng yuqori darajaga yetish vaqti',
  'sim.evidence.paramHalfLife': 'Yarim chiqarilish davri',
  'sim.evidence.paramVd': 'Taqsimlanish hajmi',
  'sim.evidence.paramClearance': 'Klirens',
  'sim.evidence.paramRenal': "Buyrak orqali o'zgarmagan holda chiqishi",
  'sim.evidence.paramSbpDrop': "Manbada ko'rsatilgan sistolik pasayish",
  'sim.evidence.paramDbpDrop': "Manbada ko'rsatilgan diastolik pasayish",
  'sim.evidence.paramOnset': "Ta'sir boshlanishi",
  'sim.evidence.paramDuration': "Ta'sir davomiyligi",
  'sim.evidence.modelDoseResponse': "Doza–javob egri chizig'i",
  'sim.evidence.modelBaseline': "Davolashdan oldingi bosimning ta'siri",
  'sim.evidence.modelPooling': 'Ikki dorini birlashtirish chegarasi',
  'sim.evidence.modelHomeostasis': 'Yurak-qon tomir modeli koeffitsiyentlari',
  'sim.evidence.armBasis': 'Bu variantdagi dozalar — yorliqqa nisbatan',
  'sim.evidence.rankingBasis': "Bu ro'yxatdagi har bir qator nimaga asoslanadi",
  'sim.evidence.rankingBasisNote':
    "Ro'yxatdagi har bir doza — yorliqda ruxsat etilgan doza. Har bir qatordagi bosim o'zgarishi to'liq " +
    "simulyatsiya ishlatadigan doza–javob modeli bilan baholanadi.",

  'sim.scene.anatomy': 'Anatomiya',
  'sim.scene.everySceneNote':
    "Har bir sahna bir xil yugurishni o'qiydi. Birini almashtirish faqat ko'rinishni o'zgartiradi, simulyatsiyani emas.",
  'sim.scene.tablistAria': 'Sahna',
  'sim.scene.staticCaption':
    "Bu rejim qayerga ta'sir qiladi. Yugurish freymlar hosil qilmaguncha hech narsa animatsiya qilinmaydi.",

  'sim.topcombos.title': "Eng yaxshi 5 ta kombinatsiya",
  'sim.topcombos.pickSubject': "Saralashni ko'rish uchun sub'ektni tanlang.",
  'sim.topcombos.allBlocked': "Bu bemor uchun barcha nomzod kombinatsiyalar qattiq bloklangan.",
  'sim.topcombos.runThroughSimulation': 'Buni simulyatsiya orqali ishga tushirish',
  'sim.topcombos.diastolicChange': "Diastolik o'zgarish",
  'sim.topcombos.adverseBurden': "Yon ta'sir yuki",

  'sim.common.comparisonSet': "Solishtirish to'plami",
  'sim.common.excluded': 'Chiqarib tashlangan',

  'sim.weights.ariaLabel': "Baholash og'irliklari",
  'sim.weights.estimatedTag': 'TAXMINIY',
  'sim.weights.explainerPre': "Bu paneldagi har bir qiymat",
  'sim.weights.explainerPost':
    " belgisiga ega. Tartib asoslangan qism, aniq raqamlar esa emas. Birini siljiting — reyting allaqachon simulyatsiya qilingan yugurishlardan qayta hisoblanadi, qayta yugurish shart emas.",
  'sim.weights.movedWarning': (v: Vars) =>
    `${v.n} ta og'irlik standart qiymatdan siljidi. Quyidagi reyting sizniki, standart emas.`,
  'sim.weights.resetDefaults': "Standart qiymatlarga qaytarish",
  'sim.weights.rescoring': 'Qayta baholanmoqda…',
  'sim.weights.rescoreRanking': 'Reytingni qayta baholash',
  'sim.weights.compositeSumWarning': (v: Vars) =>
    `Yig'indi og'irliklar ${v.sum} ni tashkil qiladi, 1.00 emas. Reyting baribir hisoblanadi, lekin yig'indi endi standartning 0–100 shkalasida emas — jamini emas, E, S va A chiziqlarini o'qing.`,
  'sim.weights.specDefault': (v: Vars) => `(standart qiymat ${v.def})`,

  'sim.ai.numberFlagNotInContext': 'kontekstda yo\'q',
  'sim.ai.numberFlagUnsourcedSr':
    "— bu raqam modelga berilgan ma'lumotlarda yo'q edi va manbasi ko'rsatilmagan",
  'sim.ai.numberTracePresent': "berilgan kontekstda mavjud",
  'sim.ai.configured': 'Sozlangan.',

  // ------------------------------------------------------------ layout zones
  'zone.quickJump': 'Tez oʻtish',
  'zone.complete': 'Tayyor',
  'zone.incomplete': 'Hali tugallanmagan',
  'zone.doneOfTotal': (v: Vars) => `${v.total} tadan ${v.done} tasi bajarildi`,

  'sim.zone.act': 'Ishga tushirishni sozlash',
  'sim.zone.actLead':
    'Dorini tanlang, bemorni tanlang, «Ishga tushirish»ni bosing. Shungacha bu sahifada boshqa hech narsa yoʻq — doza tavsiyasi simulyatsiyaning natijasi, uning kirish maʼlumoti emas.',
  'sim.zone.answer': 'Simulyatsiya nimani aniqladi',
  'sim.zone.answerLead':
    'Ishga tushirilgan rejim va uning taʼsiri, soʻngra aynan shu bemor uchun eng yaxshi baholangan muqobillar.',
  'sim.zone.evidence': 'Nima uchun shunday',
  'sim.zone.evidenceLead':
    'Yuqoridagi javob qurilgan egri chiziqlar, tana koʻrinishi, reytinglar va qoidalar.',
  'sim.zone.detail': 'Mayda shartlar',
  'sim.zone.detailLead':
    'Baholash ogʻirliklari, ishga tushirish sozlamalari va model nimani aks ettirmasligi. Kerakligini oching.',

  'sim.pill.why':
    'Belgilangan dorining moddalari va milligrammlari — bu aynan dvigatelga beriladigan narsa. Bir nechtasini belgilasangiz, ular solishtirish tarmoqlari sifatida ishga tushiriladi.',
  'sim.subject.why':
    'Bemor buyrak faoliyatini, jigar genotipini va qoidalar oʻqiydigan kasalliklarni belgilaydi — aynan shu dori dozasi kamaytiriladimi, afzal koʻriladimi yoki umuman rad etiladimi, shuni hal qiladi.',
  'sim.run.why':
    'Ishga tushirish tanlangan davr mobaynida plazmadagi konsentratsiyani, nishonlar band boʻlishini va qon bosimini uzatadi. Bu kartochkadan pastdagi hamma narsa oʻsha kadrlardan oʻqiladi.',
  'sim.run.groupTitle': 'Ishga tushiring',

  'sim.act.checkPill': 'Dori belgilandi',
  'sim.act.checkPatient': 'Bemor tanlandi',
  'sim.act.checkRun': 'Simulyatsiya bajarildi',
  'sim.act.noPillConsequence':
    'Hech qanday dori yuklanmagan, shuning uchun dvigatelning bemorga beradigan narsasi yoʻq. Bittasini yarating va u shu roʻyxatda paydo boʻladi.',

  'sim.demos.title': 'Yoʻnaltirilgan namoyishlar',
  'sim.demos.why':
    'Har biri modelning bitta xatti-harakatini koʻrsatadigan dori, bemor va davrni tayyorlab, siz uchun ishga tushiradi.',

  'sim.section.curves': 'Vaqt boʻyicha egri chiziqlar',
  'sim.section.body': 'Tana, toʻliq kenglikda',
  'sim.section.alternatives': 'Muqobillar reytingi',
  'sim.section.bestDose': 'Eng yaxshi doza',
  'sim.section.rulesTables': 'Qoidalar va taʼsir jadvallari',
  'sim.section.compare': 'Yugurishlarni solishtirish',

  'sim.detail.weights': 'Baholash ogʻirliklari',
  'sim.detail.engine': 'Dvigatel, maʼlumotlar va ishga tushirish sozlamalari',
  'sim.detail.limits': 'Bu model nimani aks ettirmaydi',

  'sim.next.title': 'Keyin qayerga',
  'sim.next.desc':
    'Dorini yoki bemorni oʻzgartirib qayta ishga tushiring, yoki bu natijani boshqa sahifaga olib oʻting.',

  // -------------------------------------------------------- subject page zones
  'subject.zone.act': 'Bemorni tanlang yoki yarating',
  'subject.zone.actLead':
    'Bemor — bu kirish qiymatlari toʻplami. Mahsulot u haqida koʻrsatadigan hamma narsa shulardan keltirib chiqariladi, shuning uchun bemor faqat shu yerda oʻzgaradi.',
  'subject.zone.answer': 'Bu bemor anglatadigan model',
  'subject.zone.answerLead':
    'Har qanday simulyatsiya shu bemor uchun boshlanadigan fiziologiya — hali hech qanday dori berilmagan holat.',
  'subject.zone.evidence': 'Kasalliklar nimani siljitdi',
  'subject.zone.evidenceLead':
    'Kasallikni yoqish nomlangan holat oʻzgaruvchilarini sezilarli miqdorda siljitadi. Mana siljiganlari.',
  'subject.zone.detail': 'Mayda shartlar',
  'subject.zone.detailLead':
    'Toʻliq keltirib chiqarilgan holat, modifikatorlar auditi va keltirib chiqarish ogohlantirishlari.',
  'subject.editor.zoneAct': 'Bu bemorni tahrirlash',
  'subject.editor.zoneActLead':
    'Quyidagi har bir guruh mahsulot u bilan nima qilishini aytadi. Qiymatni oʻzgartiring — pastdagi model koʻz oldingizda siljiydi.',
  'subject.editor.continue': 'Simulyatsiyaga oʻtish',

  'subject.group.whoWhy':
    'Yosh va jins klirensni masshtablaydi hamda eGFR tenglamasiga kiradi. Homiladorlik belgisi qatʼiy toʻsiq: homilador bemor uchun AAF ingibitori yoki ARB umuman simulyatsiya qilinmaydi.',
  'subject.group.bodyWhy':
    'Vazn va boʻy tana yuzasini, umumiy tana suvini va allometrik klirens skalarini belgilaydi — yaʼni doza tarqaladigan hajmni va u chiqib ketish tezligini.',
  'subject.group.circulationWhy':
    'Davolanmagan bosim va yurak urishi — har bir simulyatsiya qilingan oʻzgarish oʻlchanadigan boshlangʻich nuqta; ular oʻrtacha bosim, yurak minutlik hajmi va qon tomir qarshiligini keltirib chiqaradi.',
  'subject.group.kidneyWhy':
    'Zardobdagi kreatinin buyrak faoliyatini (eGFR) belgilaydi — aynan shu buyrak orqali chiqadigan dori dozasi kamaytiriladimi yoki bu bemorda umuman ishlatilmaydimi, shuni hal qiladi.',
  'subject.group.genotypeWhy':
    'CYP2D6 har bir metoprolol dozasi oʻtishi kerak boʻlgan jigar darvozasini belgilaydi. Sekin metabolizator standart dozada dori β1-selektiv boʻlmay qoladigan konsentratsiyaga yetadi; normal metabolizator esa yetmaydi.',
  'subject.group.conditionsWhy':
    'Kasallik nomlangan holat oʻzgaruvchilarini siljitadigan modifikatorlar toʻplamini qoʻllaydi. Qoidalar va dvigatel oʻqiydigan narsa — aynan oʻsha siljigan oʻzgaruvchilar; yorliqning oʻzi hech narsani oʻzgartirmaydi.',
  'subject.group.conditionsNoneConsequence':
    'Kasalliklar yoʻq — model shu yosh va vazndagi sogʻlom kattayosh odam boʻladi.',
  'subject.emptyLibrary':
    'Bemorlar yoʻq — simulyatsiya qiladigan hech kim yoʻq. Bittasini qoʻshing yoki tayyor stsenariylarni tiklang.',

  'subject.headline.title': 'Keltirib chiqarilgan model',
  'subject.headline.untreated':
    'Davolanmagan. Bu holatdagi har bir dori konsentratsiyasi va har bir nishon bandligi nolga teng, yaʼni bu birinchi dozadan oldingi tana.',
  'subject.headline.noneSelected':
    'Hech bir bemor tanlanmagan, shuning uchun hech narsa keltirib chiqarilmaydi. Yuqoridan birini tanlang va uning modeli shu yerda paydo boʻladi.',
  'subject.form.quickJumpAria': 'Shu shakldagi guruhga oʻtish',
  'subject.completeness': (v: Vars) => `6 guruhdan ${v.n} tasi koʻrib chiqildi`,

  // -------------------------------------------------- UI-C: hardcoded-string pass
  'sim.alert.syntheticTitle': "Vaqtinchalik dvigatel.",
  'sim.alert.syntheticBody': "Bu ekrandagi har bir egri chiziq, ball va ehtimollik shakl, o'lchov emas.",
  'sim.alert.dataErrorTitle': "Ma'lumot fayllari yuklanmadi.",
  'sim.alert.dataErrorBody': (v: Vars) =>
    `${v.message} — model keltirib chiqarilmaydi va hech qanday qoida ishlamaydi. Bu tuzatilmaguncha bu sahifadagi hech narsa o'qilmasligi kerak.`,
  'sim.chart.logAxis': 'Logarifmik kontsentratsiya oʻqi',
  'sim.chart.showParent': "Losartan ona moddasini koʻrsatish (alohida oʻq)",
  'sim.chart.framesStreamed': (v: Vars) => `${v.n} freym${v.streaming ? ' · oqim' : ''}`,
  'sim.bench.comboTitle': "Kombinatsiya reytingi — barcha oʻnta juftlik",
  'sim.bench.doseTitle': 'Eng yaxshi doza — amlodipin zinapoyasi',
  'sim.bench.labelAsStated': 'Yorliqda yozilganidek:',
  'sim.tray.tickToOverlay': "Diagrammalarda pунктир chiziq bilan koʻrsatish uchun tugallangan ishga tushirishni belgilang.",
  'sim.tray.day': (v: Vars) => (v.steadyState ? '8-kun' : '1-kun'),
  'sim.weights.rerankNote': "Allaqachon simulyatsiya qilingan variantlarni qayta reytinglaydi. Yuqoridagi reyting siz sudrab olib borganingizda harakatlanadi.",
  'sim.weights.runBenchFirst': "Avval benchni ishga tushiring — hali qayta reytinglash uchun hech narsa yoʻq.",
  'sim.detail.engineLabel': (v: Vars) => `Dvigatel: ${v.source}${v.worker ? ' (Web Worker)' : ''}`,
  'sim.detail.engineNotProbed': 'Dvigatel: hali tekshirilmagan',
  'sim.detail.loadingData': " · ma'lumot fayllari yuklanmoqda…",
  'sim.detail.dataLoaded': " · ma'lumot fayllari yuklandi",
  'sim.next.buildSubject': 'Bemor yaratish',

  'sim.report.disclaimerAria': "Ogohlantirish",
  'sim.report.endOfRunAria': 'Ishga tushirish yakuni hisoboti',
  'sim.report.hHorizon': (v: Vars) => `${v.h} soatlik ufq`,
  'sim.report.steadyStateInitial': "barqaror holat boshlangʻich sharoitlari",
  'sim.report.firstDoseInitial': "birinchi doza boshlangʻich sharoitlari",
  'sim.report.singleTwin': 'yagona model',
  'sim.report.virtualSubjects': (v: Vars) => `${v.n} ta virtual bemor`,
  'sim.report.framesEmittedCount': (v: Vars) => `${v.n} freym`,
  'sim.report.effectTroughPeak': (v: Vars) => ` · ta'sir trough:peak ${v.value}`,
  'sim.report.periodDays': (v: Vars) => `${v.days} kun`,
  'sim.report.periodHours': (v: Vars) => `${v.h} soat`,
  'sim.report.singleVirtualTwin': 'bitta virtual model',
  'sim.report.fromSteadyState': "barqaror holatdan boshlab",
  'sim.report.fromFirstDose': "birinchi dozadan boshlab",
  'sim.report.ledeSentence': (v: Vars) =>
    `${v.period} davomida, ${v.basis}, ${v.regimen} sistolik bosimni ${v.dsbp} mmHg ga va diastolikni ${v.ddbp} mmHg ga oʻzgartirdi (${v.who}). Zardobdagi kaliy ${v.k} mmol/L da, kreatinin esa ${v.cr} mg/dL da yakunlandi.`,
  'sim.report.unitSystolic': 'mmHg, sistolik',
  'sim.report.unitDiastolic': 'mmHg, diastolik',
  'sim.report.unitSerumK': "mmol/L, zardobdagi K",
  'sim.report.unitCreatinine': 'mg/dL, kreatinin',
  'sim.report.spreadP': (v: Vars) => `P05 ${v.p05} · P95 ${v.p95}`,

  'sim.topcombos.ariaLabel': "Eng yaxshi 5 ta doza kombinatsiyasi",
  'sim.topcombos.noPatientPre': "Hali bemor tanlanmagan, shuning uchun bu reyting",
  'sim.topcombos.typicalAdultFallback': "davolanmagan gipertoniyasi bor odatiy kattalar",
  'sim.topcombos.noPatientPost':
    "— standart bemor uchun hisoblangan. Yuqoridagi sozlashda bemorni tanlang va bu roʻyxat u uchun qayta reytinglanadi.",
  'sim.topcombos.rankedFor': (v: Vars) => `${v.subject} uchun reytinglangan.`,
  'sim.topcombos.everyDrugNote': (v: Vars) =>
    ` Har bir dozalanadigan dori har bir litsenziyalangan dozada, yakka va juft holda — ${v.total} nomzod, tahliliy usulda (simulyatsiyasiz) millisekundlarda baholanadi va bemor oʻzgarganda qayta reytinglanadi. Xom samaradorlik boʻyicha emas, balki qon bosimi pasayishi va yon ta'sir yukini solishtirib reytinglangan.`,
  'sim.topcombos.excludedNote': (v: Vars) =>
    `Shu bemor uchun ${v.excluded} ta / ${v.total} ta nomzod butunlay bloklangan (7-daraja — masalan, homiladorlikda AAF inhibitori yoki ARB). Qolgan barchasi, jumladan qoʻsh RAAS blokadasi, oʻz xususiyatlariga koʻra pastda reytinglangan.`,
  'sim.topcombos.rerankedFor': (v: Vars) => `${v.subject} uchun qayta reytinglandi`,
  'sim.topcombos.rerankedAgainst': "standart bemorga nisbatan.",
  'sim.topcombos.moreBlocked': (v: Vars) =>
    `Standart kattalarga qaraganda bu bemor uchun yana ${v.n} ta nomzod butunlay bloklangan. `,
  'sim.topcombos.droppedTop5': (v: Vars) => `Top 5 dan chiqib ketdi: ${v.list}. `,
  'sim.topcombos.newTop5': (v: Vars) => `Top 5 ga yangi kirdi: ${v.list}.`,
  'sim.topcombos.tagDualRaas': "qoʻsh RAAS blokadasi",
  'sim.topcombos.tagBetaRas': 'beta + RAS kesishuvi',
  'sim.topcombos.tagDoseExtrapolated': "doza ekstrapolyatsiya qilingan",
  'sim.topcombos.reasonPrimary': (v: Vars) =>
    `Sistolik ${v.dsbp} mmHg, diastolik ${v.ddbp} mmHg pasayishi bashorat qilingan, ${v.burden} balllik yon ta'sir yukiga qarshi tortilgan — eng katta qon bosimi pasayishi avtomatik ravishda eng yaxshi tanlov boʻlavermaydi.`,
  'sim.topcombos.reasonDualRaas':
    "Qoʻsh RAAS blokadasi — AAF inhibitori va ARB bir xil toʻyingan yoʻlga ta'sir qiladi, shuning uchun ikkinchi dori oʻz xavfini qoʻshgan holda ozgina qoʻshimcha pasayish beradi. Bu yerda yashirilmasdan reytinglangan: buni aniqlash aslida maqsad.",
  'sim.topcombos.reasonBetaRas':
    "Beta-blokator va RAS inhibitori: beta-blokator ta'sirining bir qismi RAS inhibitori bilan bir xil renin bosilishi joyi uchun raqobatlashadi.",
  'sim.topcombos.reasonExtrapolated': (v: Vars) =>
    `${v.drugs} uchun tasdiqlangan 0.25×–4× oynasidan tashqarida doza — ta'sir moslashtirish chegarasida ushlab turiladi, undan tashqariga ekstrapolyatsiya qilinmaydi.`,

  'sim.ai.panelAria': "SI fikrlashi",
  'sim.ai.mark': 'AI',

  'sidebar.primaryNav': 'Asosiy',

  'substances.metaboliteTag': 'Metabolit',
  'substances.valuePlaceholderNone': "yoʻq",
  'substances.editedTitle': "Siz bu qiymatni oʻzgartirdingiz; bu manba qiymati emas.",

  // ---------------------------------------------------------- organ illustrations (Agent ORGANS)
  'organ.common.notModelledInBuild': (v: Vars) => `${v.what} — bu versiyada modellashtirilmagan`,

  'organ.badges.header': 'Nojoʻya taʼsir kanallari',
  'organ.badges.firingCount': (v: Vars) => `${v.n} ta faol`,
  'organ.badges.noneFiring': 'Hech qanday nojoʻya taʼsir kanali ishga tushish chegarasidan yuqori emas.',
  'organ.badges.noRun': 'Simulyatsiya ishlamayapti.',
  'organ.badges.rare': 'kam uchraydi',
  'organ.badges.drivenBy': 'Sababchi:',
  'organ.badges.reportedIncidence': 'Qayd etilgan chastota:',
  'organ.badges.thresholdNote': (v: Vars) =>
    `θ_on ${v.on} / θ_off ${v.off} ishga tushish chegaralari — vizual sozlash konstantalari, klinik chegara emas.`,

  'organ.selectivity.title': 'β1 / β2 selektivligi',
  'organ.selectivity.ariaLabel': 'Metoprolol selektivligi',
  'organ.selectivity.svgTitle': 'Metoprolol plazma kontsentratsiyasi beta-1 selektivlik chegara nuqtasiga nisbatan',
  'organ.selectivity.beta1Cardiac': 'β1 yurak',
  'organ.selectivity.beta2Airway': 'β2 havo yoʻli',
  'organ.selectivity.measuredAnchor': 'kuniga 2 mahal 100 mg dozada oʻlchangan asos:',
  'organ.selectivity.cyp2d6NotModelled': 'CYP2D6 sigʻimi modellashtirilmagan',
  'organ.selectivity.cyp2d6Value': (v: Vars) => `CYP2D6 sigʻimi ${v.value} × normal`,
  'organ.selectivity.concNotModelled': 'Bu versiyada metoprolol kontsentratsiyasi modellashtirilmagan.',
  'organ.selectivity.aboveCrossover': (v: Vars) =>
    `Chegara nuqtasidan yuqori. β1 selektivligi pasaymoqda, β2 blokadasi kuchaymoqda — havo yoʻli kanali faol${v.suffix}.`,
  'organ.selectivity.bradycardicSuffix': ' va yurak urishi bradikardiya diapazonida',
  'organ.selectivity.belowCrossover':
    'Chegara nuqtasidan past. Dori bu bemorda shu kontsentratsiyada β1-selektiv tarzda taʼsir qilmoqda.',
  'organ.selectivity.sourceSummary': '80.2 ng/mL qayerdan kelib chiqqan',
  'organ.selectivity.sourceNote':
    "Chegara nuqtasi kontsentratsiya darvozasi boʻlib, doza xususiyati emas — shu sababli u genotipga bogʻliq. CYP2D6 sekin metabolizator standart dozada uni kesib oʻtishi mumkin, normal metabolizator esa undan ancha past qoladi.",

  'organ.adrenal.title':
    "Buyrak usti bezi — tashqi qatlam (zona glomerulosa). Qatlam rangi mediators.aldosterone_fold qiymatiga bogʻliq. Haftalar davomida aldosteronning qisman qaytishi bu versiyada modellashtirilmagan.",
  'organ.adrenal.cortexLabel': 'tashqi qatlam (zona glomerulosa)',
  'organ.adrenal.aldosteroneNotModelled': 'aldosteron modellashtirilmagan',
  'organ.adrenal.aldosteroneValue': (v: Vars) => `aldosteron ${v.value} × asos darajaga nisbatan`,
  'organ.adrenal.cortexTitle':
    "Toʻqima darajasi (T3). Lisinopril signalning ishlab chiqarilishini bloklaydi; losartan esa uning qabul qilinishini bloklaydi. Bir xil oqibat, bitta kaskadning ikki xil bosqichi.",
  'organ.adrenal.raasAndThiazide': "RAAS blokadasi va tiazid bir-biriga qarama-qarshi yoʻnalishda taʼsir qiladi",
  'organ.adrenal.raasOnly': 'oqim susayadi → K⁺ yigʻuvchi naycha orqali chiqishni toʻxtatadi',
  'organ.adrenal.thiazideOnly': 'hajm kamayishi → RAAS faollashuvi → K⁺ ikki barobar isrof boʻladi',
  'organ.adrenal.raasAriaLabel': 'RAAS kaskadi',
  'organ.adrenal.raasTitle': 'Dori toʻxtatish choʻplari bilan renin–angiotenzin–aldosteron kaskadi',
  'organ.adrenal.reninRising': 'qon bosimi pasayayotganda renin koʻtariladi — bu kutilgan holat, nosozlik emas',
  'organ.adrenal.stopBarNotModelled': (v: Vars) =>
    `${v.label} blokadasi modellashtirilmagan — ustun balandligi bogʻlanish ulushini bildiradi.`,
  'organ.adrenal.stopBarValue': (v: Vars) =>
    `${v.label} blokadasi ${v.pct} % — ustun balandligi bogʻlanish ulushini bildiradi.`,

  'organ.vessels.conduitTitle':
    "Magistral arteriyalar. Devor rangi tizimli qon tomir qarshiligiga bogʻliq (bip(norm(svr, 700, 2200), 0.5, 0.5)); koʻk = qarshilik pasaygan.",
  'organ.vessels.resistanceTitle':
    "Qarshilik birligi. Prekapillyar arteriola kengligi haemo.arteriolar_radius_index ga, postkapillyar venula esa haemo.venous_tone_index ga bogʻliq. Amlodipin birinchisini kuchli, ikkinchisini deyarli oʻzgartirmaydi — bu nomutanosiblik shish mexanizmidir.",
  'organ.vessels.precapillary': 'prekapillyar arteriola',
  'organ.vessels.postcapillary': 'postkapillyar venula',
  'organ.vessels.notModelled': 'modellashtirilmagan',
  'organ.vessels.timesBaseline': (v: Vars) => `${v.value} × asos darajaga nisbatan`,
  'organ.vessels.capillaryPressureLabel': 'kapillyar gidrostatik bosim',
  'organ.vessels.capillaryPressureNotModelled': '— modellashtirilmagan',
  'organ.vessels.capillaryPressureValue': (v: Vars) => `${v.value} × asos darajaga nisbatan (nisbiy)`,
  'organ.vessels.tierNote': "toʻqima darajasi (T3) — mexanizm xulosa qilingan, hujayra populyatsiyasi nomlanmagan",

  'organ.lungs.title':
    "Oʻpka. Oʻpka kapillyar toʻrining zichligi engagement.ace_inhibition_pulmonary ga, havo yoʻli kengligi esa engagement.beta2_occupancy ga bogʻliq. Mexanizm xulosa qilingan (T3) — toʻqima darajasida tasvirlangan, hujayra populyatsiyasi nomlanmagan.",
  'organ.lungs.capillaryBedTitle': "Oʻpka kapillyar toʻri — butun yurak chiqindisi oʻtadigan joyda AAF bloklangan.",
  'organ.lungs.hazeTitle':
    "Bradikinin va P moddasi toʻplanadi — ikkalasi ham AAF substratlari. Bu havo yoʻli sezuvchi nervlarini sezgir qiladi; bu yoʻtal kanali boʻlib, u kechikkan holda paydo boʻladi, birinchi dozada emas.",
  'organ.lungs.airwayTitle':
    "Bronxial daraxt. Lumen = asos × (1 − 0.45 × beta2_occupancy). 0.45 koeffitsienti — BAHOLANGAN vizual konstanta; beta-2 bandligi esa manbali signal.",
  'organ.lungs.noBradykinin': 'bradikinin toʻplanmaydi — yoʻtal kanali yoʻq',
  'organ.lungs.beta2AirwayLabel': 'β2 (havo yoʻli)',
  'organ.lungs.fev1NotModelled': 'FEV₁ —',
  'organ.lungs.fev1Value': (v: Vars) => `FEV₁ ${v.value} % (davolanmagan holatga nisbatan)`,
  'organ.lungs.tierNote': 'toʻqima darajasi (T3) — mexanizm xulosa qilingan',

  'organ.heart.title':
    "Yurak — urish tezligi haemo.hr ga, urish chuqurligi haemo.contractility_index ga, rangi esa beta-1 blokadasi va simpatik tonusga bogʻliq. Toʻqima darajasida (T2) tasvirlangan.",
  'organ.heart.saNodeTitle':
    'Sinoatrial tugun (hudud). T2 darajasi — toʻqima darajasida tasvirlangan. HPA yagona hujayra maʼlumotlarida ADRB1 "hujayra turi kuchaytirilgan" holatda, tau 0.79, eng yuqori mos kelish sitotrofoblastlarda, shuning uchun bu yerda hujayra populyatsiyasi nomlanmagan.',
  'organ.heart.hrNotModelled': 'HR —',

  'organ.periphery.oedemaNotModelled': 'shish —',
  'organ.periphery.pitting': (v: Vars) => `botiq shish ${v.grade}/3`,
  'organ.periphery.dependentOedema': 'osilib turuvchi shish',
  'organ.periphery.coldExtremity': 'sovuq oyoq-qoʻl',
  'organ.periphery.notModelledTitle': 'Osilib turuvchi oyoq — interstitsial hajm bu versiyada modellashtirilmagan.',
  'organ.periphery.pittingTitle': (v: Vars) =>
    `Osilib turuvchi oyoq interstitsiumi. Botiq shish darajasi ${v.grade}/3 (interstitial_volume_index dan olingan taqdimot koʻprigi, oʻlchov emas). Bosish uchun bosing.`,
  'organ.periphery.capPressure': (v: Vars) => `kap. bosim ${v.value} × asos darajaga nisbatan`,
  'organ.periphery.explainerHeading': (v: Vars) => `Periferik shish, ${v.grade}/3 daraja`,
  'organ.periphery.explainerLead':
    "Prekapillyar arteriolalar postkapillyar venulalarda mos oʻzgarishsiz kengayadi, shu sababli kapillyar gidrostatik bosim koʻtariladi va suyuqlik tortishish kuchi taʼsiridagi joylarda interstitsiumga oʻtadi. Bu tuz-suv ushlanishi",
  'organ.periphery.explainerNot': 'emas.',
  'organ.periphery.explainerTail': '',
  'organ.periphery.thiazideNegative':
    "Tiazid qabul qilinmoqda va shish deyarli oʻzgarmadi — u bu mexanizmga taʼsir qilmaydi. Ishlamaydigan davolashni koʻrsatish ataylab qilingan.",
  'organ.periphery.raasPositive':
    "RAAS blokatori qabul qilinmoqda, u postkapillyar tomonni ham kengaytiradi va prekapillyar/postkapillyar muvozanatni qisman tiklaydi, shu sababli shish kamayadi. Yoʻnalish yaxshi asoslangan; foiz koʻrsatilmagan, chunki kattalik uchun asosiy manba topilmadi.",

  'organ.gauges.potassiumLabel': 'Zardob kaliy',
  'organ.gauges.potassiumNote':
    "Tiazid uni yoʻqotadi; AAF inhibitori va ARB uni ushlab qoladi. Kombinatsiyada ikkalasi qisman bir-birini bekor qiladi.",
  'organ.gauges.urateLabel': 'Zardob urat',
  'organ.gauges.urateNote':
    "Losartanning URAT1 inhibisiyasi uni pasaytiradi; tiazidning hajm kamayishi uni oshiradi. Bir xil bemorda qarama-qarshi yoʻnalishlar.",
  'organ.gauges.sodiumLabel': 'Zardob natriy',
  'organ.gauges.sodiumNote': "Tiazidga bogʻliq suv ushlanishi xavfi.",
  'organ.gauges.creatinineLabel': 'Zardob kreatinin',
  'organ.gauges.notModelled': 'modellashtirilmagan',
  'organ.gauges.reference': 'meʼyor',

  'organ.figure.restingBaseline': "Tinch holatdagi asos — simulyatsiya natijasi emas.",
  'organ.figure.untreated': "Davolanmagan — hech qanday dori qabul qilinmagan.",
  'organ.figure.testSubject': 'Sinov bemori',
  'organ.figure.haltedShort': "Qattiq toʻsiq tomonidan toʻxtatildi.",
  'organ.figure.haltedFull': "Simulyatsiya qattiq toʻsiq tomonidan toʻxtatildi.",
  'organ.figure.contraindicatedNote': "Kontrendikatsiya qilingan kombinatsiya soʻralgan edi.",
  'organ.figure.kidneyPanelTitle': 'Buyrak — nefron segmentlari',
  'organ.figure.kidneyPanelNote':
    "Toʻrtta dori, toʻrtta anatomik jihatdan alohida joy, barchasi bir vaqtda koʻrinadi. Tiazid nishoni va RAAS nishonlari turli segmentlarda joylashgan — muhim jihati ham shu.",
  'organ.figure.t1NoteMid': "— bu koʻrsatuvda nomlangan yagona hujayra populyatsiyasi.",
  'organ.figure.t1NoteTail': "Boshqa barcha nishonlar toʻqima darajasida tasvirlangan.",
  'organ.figure.liverPanelTitle': 'Jigar — uchta CYP fermenti',
  'organ.figure.liverPanelNote': "Individuallashtirish qayerda koʻzga tashlanishi.",
  'organ.figure.raasPanelTitle': 'RAAS kaskadi',
  'organ.figure.raasPanelNote': "Bitta kaskadda ikkita toʻxtatish choʻpi — bu qoʻsh blokada holati.",
  'organ.figure.resistancePanelTitle': 'Qarshilik birligi',
  'organ.figure.resistancePanelNote': "Arteriola va venula — osilib turuvchi shishga sabab boʻluvchi nomutanosiblik.",
  'organ.figure.disclaimer':
    "Ilmiy-tadqiqot simulyatori. Klinik qaror qabul qilish vositasi yoki davolash tavsiyasi emas. Kalibrlanmagan proksi signallar — ayniqsa intraglomerulyar bosim — faqat nisbiy indekslar sifatida koʻrsatiladi va hech qachon mutlaq birliklarda emas.",
  'organ.figure.noDrugOnBoard': "hech qanday dori qabul qilinmagan",

  'organ.liver.outlineTitle': "Jigar — uchta CYP reaktori. Ishlayotgan fermentlar belgilanadi, lekin porlab turmaydi.",
  'organ.liver.gateNotModelled': 'CYP2D6 darvozasi —',
  'organ.liver.gateValue': (v: Vars) => `CYP2D6 darvozasi ${v.value}×`,
  'organ.liver.reactorsAriaLabel': 'Jigar CYP reaktorlari',
  'organ.liver.reactorsTitle': 'Jigar CYP reaktorlari — CYP3A4, CYP2C9, CYP2D6',
  'organ.liver.portalVein': 'darvoza venasi',
  'organ.liver.hepaticVein': 'jigar venasi',
  'organ.liver.cyp3a4Sub': 'jigarga xos, 3367.1 nTPM',
  'organ.liver.cyp3a4Title':
    "CYP3A4 (P08684). Amlodipinning yoʻli, losartanning ozgina hissasi bilan. Ikkala dori ham mavjud boʻlganda reaktor umumiy boʻladi — yoʻnalish asoslangan, lekin miqdoriy oʻzaro taʼsir kattaligi haqida manba yoʻq, shuning uchun raqam koʻrsatilmagan.",
  'organ.liver.sharedReactor': 'umumiy reaktor — navbat',
  'organ.liver.cyp2c9Sub': 'jigarga xos, 1607.6 nTPM',
  'organ.liver.cyp2c9Title':
    "CYP2C9 (P11712) losartanni EXP3174 ga aylantiradi, bu kuchliroq faol metabolit. Ona modda yarim yemirilish davri ~2 soat; metabolitniki 6-9 soat (FDA yorligʻi).",
  'organ.liver.exp3174MorePotent': 'EXP3174 · kuchliroq',
  'organ.liver.cyp2d6Sub': 'jigarga xos, 386.2 nTPM',
  'organ.liver.cyp2d6Title':
    "CYP2D6 (P10635). Polimorf. Darvoza kengligi liver.cyp2d6_capacity_fold ga bogʻliq: bir xil metoprolol dozasi ikki bemorda koʻzga aniq koʻrinadigan ikki xil animatsiya beradi.",
  'organ.liver.gateApertureTitle': (v: Vars) =>
    `CYP2D6 darvoza kengligi = clamp(cyp2d6_capacity_fold, 0.05, 2.0) x ${v.base} px. Hozir: ${v.pheno}.`,
  'organ.liver.gateShort': (v: Vars) => `darvoza ${v.value}`,
  'organ.liver.passthrough': "bu modelda metabolizmga uchramaydi — toʻgʻridan-toʻgʻri oʻtadi",
  'organ.liver.fluxNotModelled': 'oqim —',
  'organ.liver.fluxValue': (v: Vars) => `${v.value} mg/soat`,
  'organ.liver.notModelled': 'modellashtirilmagan',
  'organ.liver.ultrarapid': 'ultra tez metabolizator',
  'organ.liver.normal': 'normal metabolizator',
  'organ.liver.intermediate': 'oraliq metabolizator',
  'organ.liver.poor': 'sekin metabolizator',

  'organ.kidney.outlineTitle':
    'Buyrak. Rang renal.p_glomerular qiymatiga bogʻliq (PROKSI — kalibrlanmagan, faqat nisbiy indeks sifatida koʻrsatiladi). Filtratsiya hech qachon mutlaq bosim birliklarida koʻrsatilmaydi.',
  'organ.kidney.egfrNotModelled': 'eGFR —',
  'organ.kidney.nephronAriaLabel': 'Sxematik nefron',
  'organ.kidney.nephronTitle': 'Toʻrtta dori taʼsir qiladigan segmentli sxematik nefron',
  'organ.kidney.dualRaasTitle':
    'Qoʻsh RAAS blokadasi: qoʻshiluvchi chiqaruvchi arteriola kengayishi, nomutanosib GFR pasayishi va kaliyning koʻtarilishi. §13-bandga koʻra doimiy koʻrinadigan qatlam.',
  'organ.kidney.dualRaasLabel': 'qoʻsh RAAS blokadasi',
  'organ.kidney.afferentArteriole': 'keltiruvchi arteriola',
  'organ.kidney.notModelled': 'modellashtirilmagan',
  'organ.kidney.timesBaseline': (v: Vars) => `${v.value} × asos darajaga nisbatan`,
  'organ.kidney.afferentTitle':
    'Etalon tomir. Amlodipin uni yengil kengaytiradi; RAAS dorilari chiqaruvchi tomonda taʼsir qiladi.',
  'organ.kidney.jgaTitle':
    'Yukstaglomerulyar apparat — renin ajralib chiqadigan joy. RAAS blokatori qabul qilinganda qon bosimi pasayayotgan boʻlsa-da, renin KOʻTARILADI. Bu kutilgan kompensatsion javob, dori nosozligi emas. Losartan 100 mg plazma renin faolligini ikki-uch baravar oshiradi (FDA yorligʻi).',
  'organ.kidney.reninNotModelled': 'renin —',
  'organ.kidney.reninValue': (v: Vars) => `renin ${v.value} ×`,
  'organ.kidney.glomerulusTitle':
    'Glomerulyar kapillyar tutami. Rang renal.p_glomerular ga bogʻliq — bu PROKSI darajasidagi, kalibrlanmagan koʻrsatkich, shuning uchun u nisbiy qiymat sifatida koʻrsatiladi va hech qachon mmHg da emas.',
  'organ.kidney.glomerulus': 'glomerula',
  'organ.kidney.pGlomNotModelled': 'P_glom modellashtirilmagan',
  'organ.kidney.pGlomValue': (v: Vars) => `P_glom ${v.value} × asos darajaga nisbatan (kalibrlanmagan)`,
  'organ.kidney.pGlomTitle':
    'renal.p_glomerular PROKSI darajasida. U buyrakni himoya qilish animatsiyasini boshqaradi, lekin kalibrlanmagan, shuning uchun hech qachon mutlaq birliklarda koʻrsatilmaydi.',
  'organ.kidney.efferentArteriole': 'chiqaruvchi arteriola',
  'organ.kidney.efferentTitle':
    'Lisinopril va losartan aynan shu tomirni kengaytiradi, keltiruvchi tomir esa oʻzgarmaydi. Aynan shu narsa glomerula ichidagi bosimni pasaytiradi — va oʻtkir eGFR pasayishiga sabab boʻladi.',
  'organ.kidney.aceRenalLabel': 'ACE (buyrak)',
  'organ.kidney.proximalTubule': 'proksimal kanalcha',
  'organ.kidney.naReabsorbed': (v: Vars) => `Na⁺ qayta shimilishi ${v.value}`,
  'organ.kidney.proximalTitle':
    'Proksimal burama kanalcha. URAT1 (SLC22A12) ning bu yerdagi apikal joylashuvi klassik hisoblanadi, ammo manbalarimizda hujayra darajasida aniqlanmagan. T2 darajasi — hujayra populyatsiyasi nomlanmagan.',
  'organ.kidney.urateNotModelled': 'urat —',
  'organ.kidney.urateOut': 'urat → tashqariga',
  'organ.kidney.urateBackIn': 'urat ← qaytadan',
  'organ.kidney.uricosuric': '(urikozurik)',
  'organ.kidney.retained': '(ushlab qolingan)',
  'organ.kidney.thickAscendingLimb': 'yoʻgʻon koʻtariluvchi qism',
  'organ.kidney.thickAscendingTitle': 'Etalon segment — bu toʻplamdagi hech qanday dori bu yerda taʼsir qilmaydi.',
  'organ.kidney.dctTitle': (v: Vars) =>
    `Distal burama kanalcha. ${v.protein} / ${v.gene} (${v.uniprot}) — ${v.cellPopulation} da. ${v.evidence}. ${v.source}. Bu butun dori toʻplamida yagona hujayra darajasidagi dalilga ega yagona nishon, shuning uchun bu interfeysda hujayra populyatsiyasi nomlanadigan yagona joy shu yerdir.`,
  'organ.kidney.distalConvolutedTubule': 'distal burama kanalcha',
  'organ.kidney.distalConvolutedTubuleCells': 'distal burama kanalcha hujayralari · NCC / SLC12A3',
  'organ.kidney.naReabsorbedHere': (v: Vars) => `Na⁺ bu yerda qayta shimilishi ${v.value} · tiazid nishoni`,
  'organ.kidney.cdTitle':
    'Ulovchi naycha va yigʻuvchi naycha. Distalga yetkazilgan natriy miqdorining oshishi Na⁺/K⁺ almashinuvini kuchaytiradi, shu sababli kaliy chiqib ketadi — bu terapevtik mexanizmdan kelib chiqadigan nojoʻya taʼsir. Mexanizm xulosa qilingan (T3): bu yerda hujayra populyatsiyasi nomlanmagan.',
  'organ.kidney.collectingDuct': 'yigʻuvchi naycha',
  'organ.kidney.inferredT3': 'xulosa qilingan (T3)',
  'organ.kidney.kStatus': (v: Vars) => `K⁺ ${v.value}`,
  'organ.kidney.wasting': 'isrof boʻlmoqda',
  'organ.kidney.retained2': 'ushlab qolinmoqda',
  'organ.kidney.baseline': 'asos',
  'organ.kidney.ureter': 'ureter',
  'organ.kidney.rampKey': 'pasaytirilgan · davolanmagan · oshirilgan yoki zoʻriqqan',

  // ---------------------------------------------------- organ.affected (AffectedAnatomy)
  'organ.affected.ariaNone': 'Odam figurasi — modellashtirilgan organ taʼsiri yoʻq',
  'organ.affected.ariaActing': (v: Vars) => `${v.list} taʼsir qiladigan organlari yoritilgan odam figurasi`,
  'organ.affected.noneTitle': 'Modellashtirilgan organ taʼsiri yoʻq.',
  'organ.affected.nothingSelected': 'Hali hech narsa tanlanmagan.',
  'organ.affected.excipientNote': (v: Vars) =>
    `${v.names} — yordamchi modda${Number(v.count) === 1 ? '' : 'lar'}, ular tabletkaning shaklini belgilaydi, bemorga emas.`,
  'organ.affected.noOrganAction': (v: Vars) => `Organga taʼsir yoʻq: ${v.names}.`,
  'organ.affected.siteCount': (v: Vars) => `${v.n} ta joy`,
  'organ.affected.moreHere': (v: Vars) => `va yana bu yerda ${v.n} ta`,
  'organ.affected.and': 'va',

  // -------------------------------------------------------- organ.bodyFigure (BodyFigure)
  'organ.bodyFigure.ariaLabel': 'Organ darajasidagi dori taʼsirlari bilan odam figurasi',
  'organ.bodyFigure.titleFull': 'Taʼsir shinasiga bogʻlangan organ darajasidagi dori taʼsirlari bilan odam figurasi',
  'organ.bodyFigure.pregnancyBarrierTitle':
    'Fetal toksiklik. AAF inhibitori yoki ARB homiladorlikda kontrendikatsiya qilingan — simulyatsiya ishlamaydi. Kontrendikatsiya qilingan dori uchun doza egri chizigʻini animatsiya qilish tibbiy simulyator uchun notoʻgʻri xabar boʻlar edi.',
  'organ.bodyFigure.coldExtremitiesTitle': 'Sovuq qoʻl-oyoqlar — beta-blokatordagi periferik perfuziya kamayishi.',
  'organ.bodyFigure.lungsTitle': 'Oʻpkalar',
  'organ.bodyFigure.lungsHint':
    'Havo yoʻli kengligi beta-2 bandligiga, kapillyar toʻri esa oʻpka AAF inhibisiyasiga bogʻliq. Toʻqima darajasi (T3).',
  'organ.bodyFigure.fev1NotModelled': 'FEV₁ modellashtirilmagan',
  'organ.bodyFigure.beta2Airway': (v: Vars) => `β2 havo yoʻli ${v.value} %`,
  'organ.bodyFigure.noCoughChannel': 'yoʻtal kanali yoʻq',
  'organ.bodyFigure.liverTitle': 'Jigar',
  'organ.bodyFigure.liverHint':
    'CYP2D6 darvozasining kengligi genotip bilan belgilanadi va standart metoprolol dozasi 80,2 ng/mL dan pastda qolishini hal qiladi.',
  'organ.bodyFigure.gateNotModelled': 'CYP2D6 darvozasi —',
  'organ.bodyFigure.cyp2d6GateNormal': (v: Vars) => `CYP2D6 darvozasi ${v.value} × meʼyor`,
  'organ.bodyFigure.kidneysTitle': 'Buyraklar',
  'organ.bodyFigure.kidneysHint':
    'Glomerula ichidagi bosim PROKSI darajasidagi koʻrsatkich boʻlib, hech qachon mutlaq birliklarda koʻrsatilmaydi. eGFR esa koʻrsatiladi.',
  'organ.bodyFigure.egfrNotModelled': 'eGFR modellashtirilmagan',
  'organ.bodyFigure.urineNotModelled': 'siydik modellashtirilmagan',
  'organ.bodyFigure.urineValue': (v: Vars) => `siydik ${v.value} mL/soat`,
  'organ.bodyFigure.limbsTitle': 'Osilib turuvchi oyoqlar',
  'organ.bodyFigure.limbsHint': 'Tortishish kuchiga bogʻliq joylar. Botirish uchun oyoqni bosing.',
  'organ.bodyFigure.oedemaNotModelled': 'shish modellashtirilmagan',
  'organ.bodyFigure.pitting': (v: Vars) => `botiq shish ${v.grade} / 3`,
  'organ.bodyFigure.dependentOedema': 'osilib turuvchi shish',
  'organ.bodyFigure.dizzinessTitle': 'Ortostatik boshning aylanishi',
  'organ.bodyFigure.dizzinessHint':
    'hazards.dizziness_orthostatic ishga tushish chegarasidan yuqori boʻlganda figuraning turishi beqaror boʻladi.',
  'organ.bodyFigure.standingToleranceDown': 'tik turish chidamliligi ↓',
  'organ.bodyFigure.heartTitle': 'Yurak',
  'organ.bodyFigure.heartHint':
    'Urish tezligi haemo.hr ga, urish chuqurligi haemo.contractility_index ga bogʻliq. Toʻqima darajasi (T2).',
  'organ.bodyFigure.hrNotModelled': 'yurak urishi modellashtirilmagan',
  'organ.bodyFigure.bradycardicLt50': 'bradikardiya (< 50)',
  'organ.bodyFigure.coNotModelled': 'yurak minutlik hajmi modellashtirilmagan',
  'organ.bodyFigure.adrenalTitle': 'Buyrak usti bezi qatlami',
  'organ.bodyFigure.adrenalHint':
    'Tashqi qatlam (zona glomerulosa), toʻqima darajasi (T3). Haftalar davomida aldosteronning qisman qaytishi modellashtirilmagan.',
  'organ.bodyFigure.aldosteroneNotModelled': 'aldosteron —',
  'organ.bodyFigure.aldosteroneValue': (v: Vars) => `aldosteron ${v.value} ×`,
  'organ.bodyFigure.conduitTitle': 'Magistral arteriyalar',
  'organ.bodyFigure.conduitHint': 'Devor rangi tizimli qon tomir qarshiligiga bogʻliq. Koʻk rang qarshilik pasayganini bildiradi.',
  'organ.bodyFigure.bpNotModelled': 'qon bosimi modellashtirilmagan',
  'organ.bodyFigure.svrNotModelled': 'SVR modellashtirilmagan',

  // ------------------------------------------------------------- organ.plate (scenePlates)
  'organ.plate.traceBuilds': 'seans davom etar ekan, trend chizigʻi shakllanadi',

  // ---------------------------------------------------- organ.journeyPlate (scenePlates)
  'organ.journeyPlate.routeKidneyUnchanged': 'buyrak · oʻzgarmagan holda',
  'organ.journeyPlate.routeLiverCyp2c9': 'jigar · CYP2C9',
  'organ.journeyPlate.routeMadeInLiver': 'jigarda hosil boʻladi',
  'organ.journeyPlate.routeLiverCyp3a4': 'jigar · CYP3A4',
  'organ.journeyPlate.routeLiverCyp2d6': 'jigar · CYP2D6',
  'organ.journeyPlate.noteLisinopril': 'metabolizmga uchramaydi — siydik bilan oʻzgarmagan holda chiqariladi',
  'organ.journeyPlate.noteLosartan': 'kuchliroq blokator boʻlgan EXP3174 ga aylanadi',
  'organ.journeyPlate.noteExp3174': 'hech qachon yutilmaydi — losartandan yoʻl-yoʻlakay hosil boʻladi',
  'organ.journeyPlate.noteAmlodipine': 'keng metabolizmga uchraydi — sekin chiqadi',
  'organ.journeyPlate.noteHctz': 'bu modelda metabolizmga uchramaydi',
  'organ.journeyPlate.noteMetoprolol': 'darvoza kengligini genotip belgilaydi',
  'organ.journeyPlate.routeTitle':
    'Yutilgan dozaning bosib oʻtadigan yoʻli. Aylanuvchi segmentlardagi zarrachalar zichligi — bu freymdagi dorining plazma kontsentratsiyasi; yutish va darvoza venasi segmentlari punktir yoʻl sifatida chizilgan, chunki bu versiyada ichak orqali oʻtish modellashtirilmagan.',
  'organ.journeyPlate.swallowed': 'yutilgan',
  'organ.journeyPlate.routeOnly': 'faqat yoʻnalish',
  'organ.journeyPlate.firstPass': 'birinchi oʻtish',
  'organ.journeyPlate.inBlood': 'qonda',
  'organ.journeyPlate.densityPlasma': 'zichlik = plazma darajasi',
  'organ.journeyPlate.cleared': 'chiqarilgan',
  'organ.journeyPlate.title': 'Dozaning safari',
  'organ.journeyPlate.sub': 'har bir bosqichda nima saqlanib qoladi, shu freymda',
  'organ.journeyPlate.noneOnBoard': 'Bu freymda organizmda hech qanday dori yoʻq — hali kuzatadigan doza yoʻq.',
  'organ.journeyPlate.plasmaNotModelled': 'plazma modellashtirilmagan',
  'organ.journeyPlate.plasmaValue': (v: Vars) => `plazma ${v.value} ng/mL`,
  'organ.journeyPlate.noFirstPass': 'bu yerda birinchi oʻtish bosqichi yoʻq',
  'organ.journeyPlate.firstPassRemoves': (v: Vars) => `birinchi oʻtish ${v.value} % ni olib tashlaydi`,
  'organ.journeyPlate.gutNote1':
    'Ichak orqali oʻtish bu versiyada modellashtirilmagan — tanadagi yoʻlning punktir qismi',
  'organ.journeyPlate.gutNote2':
    'yoʻnalish uchun chizilgan va hech qanday raqam koʻtarmaydi. Harakatlanayotgan hamma narsa — plazma darajasi.',
  'organ.journeyPlate.noExtraction': 'Bu modda uchun birinchi oʻtish ekstraksiyasi modellashtirilmagan.',
  'organ.journeyPlate.extractionTitle': (v: Vars) =>
    `liver.first_pass_extraction = ${v.value} — darvozaning ochiq qismi qon aylanishiga yetib boradigan miqdordir.`,

  // -------------------------------------------------------- organ.heartPlate (scenePlates)
  'organ.heartPlate.title': 'Yurak',
  'organ.heartPlate.sub': 'tezlik va kuch, va β1 hajmining qancha qismi band ekani',
  'organ.heartPlate.rateTitle': 'Tezlik',
  'organ.heartPlate.rateHint':
    'Figura har siklda 60 / haemo.hr soniyada uradi. Siz koʻrayotgan narsa — modellashtirilgan tezlik, aylanma emas.',
  'organ.heartPlate.notModelled': 'modellashtirilmagan',
  'organ.heartPlate.bradycardicGate': 'bradikardiya — 50 dan pastda ishga tushadi',
  'organ.heartPlate.forceTitle': 'Kuch',
  'organ.heartPlate.forceHint':
    'haemo.contractility_index — asosda 1.00 ga meʼyorlashtirilgan koʻrsatkich, shuning uchun u nisbiy koʻrsatiladi va hech qachon mutlaq birliklarda emas.',
  'organ.heartPlate.outputTitle': 'Hajm',
  'organ.heartPlate.coNotModelled': 'yurak minutlik hajmi modellashtirilmagan',
  'organ.heartPlate.svNotModelled': 'yurak zarbi hajmi modellashtirilmagan',
  'organ.heartPlate.receptorsTitle': 'Retseptorlar',
  'organ.heartPlate.receptorsHint':
    'β1 va β2 alohida shina maydonlari. Metoprolol plazma darajasi yorliq chegarasidan past boʻlgandagina β1-selektiv boʻladi.',
  'organ.heartPlate.beta1NotModelled': 'β1 —',
  'organ.heartPlate.beta1Value': (v: Vars) => `β1 yurakda ${v.value} %`,
  'organ.heartPlate.beta2NotModelled': 'β2 —',
  'organ.heartPlate.beta2Value': (v: Vars) => `β2 havo yoʻlida ${v.value} %`,
  'organ.heartPlate.selectivityFading': '80,2 ng/mL dan yuqori — selektivlik kamaymoqda',
  'organ.heartPlate.traceLabel': 'yurak urishi, shu seansda',
  'organ.heartPlate.note':
    'Toʻqima darajasi (T2). Sinoatrial tugun hudud sifatida chizilgan — hujayra populyatsiyasi nomlanmagan.',

  // ------------------------------------------------------ organ.vesselsPlate (scenePlates)
  'organ.vesselsPlate.title': 'Bitta qarshilik birligi',
  'organ.vesselsPlate.sub': 'kirish, kapillyar toʻr, chiqish — va ular orasidagi bosim',
  'organ.vesselsPlate.pressureTitle': 'Bosim',
  'organ.vesselsPlate.bpNotModelled': 'qon bosimi modellashtirilmagan',
  'organ.vesselsPlate.svrNotModelled': 'SVR modellashtirilmagan',
  'organ.vesselsPlate.inletOutletTitle': 'Kirish va chiqish',
  'organ.vesselsPlate.inletOutletHint':
    'Ikkalasi ham asosda 1.00 ga meʼyorlashtirilgan koʻrsatkich. Digidropiridin birinchisini kuchli, ikkinchisini deyarli oʻzgartirmaydi — bu nomutanosiblik shish mexanizmidir.',
  'organ.vesselsPlate.arteriolePrefix': (v: Vars) => `arteriola ${v.value}`,
  'organ.vesselsPlate.venulePrefix': (v: Vars) => `venula ${v.value}`,
  'organ.vesselsPlate.capillaryTitle': 'Kapillyar bosim',
  'organ.vesselsPlate.capillaryHint':
    'haemo.capillary_hydrostatic_p PROKSI darajasida — kalibrlanmagan, shuning uchun u nisbiy indeks sifatida koʻrsatiladi va hech qachon mmHg da emas.',

  // -------------------------------------------------------- organ.lungsPlate (scenePlates)
  'organ.lungsPlate.title': 'Oʻpkalar',
  'organ.lungsPlate.sub': 'bu yerda nishon organ, tomoshabin emas',
  'organ.lungsPlate.airflowTitle': 'Havo oqimi',
  'organ.lungsPlate.beta2SpilloverTitle': 'β2 toʻlib chiqishi',
  'organ.lungsPlate.beta2SpilloverHint':
    'Havo yoʻli kengligi = asos × (1 − 0.45 × beta2_occupancy). Koeffitsient vizual konstanta; bandlik esa manbali signal.',
  'organ.lungsPlate.notModelled': 'modellashtirilmagan',
  'organ.lungsPlate.occupiedPct': (v: Vars) => `${v.value} % band`,
  'organ.lungsPlate.bradykininTitle': 'Bradikinin',
  'organ.lungsPlate.bradykininHint':
    'Bradikinin va P moddasi AAF substratlari. Ular AAF inhibitorida toʻplanadi va havo yoʻli sezuvchi nervlarini sezgir qiladi — bu yoʻtal kanali boʻlib, u kechikkan holda paydo boʻladi, birinchi dozada emas.',
  'organ.lungsPlate.airwayPrefix': (v: Vars) => `havo yoʻli ${v.value}`,
  'organ.lungsPlate.pulmonaryAceNotModelled': 'oʻpka AAF —',
  'organ.lungsPlate.pulmonaryAceValue': (v: Vars) => `oʻpka AAF ${v.value} % inhibisiya qilingan`,
  'organ.lungsPlate.coughChannel': (v: Vars) => `yoʻtal kanali ${v.value}`,
  'organ.lungsPlate.absenceTitle': 'Yoʻqlik',
  'organ.lungsPlate.absenceHint':
    'ARB fermentning oʻrniga retseptorni bloklaydi, shuning uchun bradikinin hech qachon toʻplanmaydi. Yetishmayotgan qatlam aynan oʻrgatuvchi nuqtadir.',
  'organ.lungsPlate.noBradykininAccumulation': 'bradikinin toʻplanmaydi',
  'organ.lungsPlate.noCoughChannelAtAll': 'shuning uchun yoʻtal kanali umuman yoʻq',
  'organ.lungsPlate.note':
    'Mexanizm xulosa qilingan (T3). Oʻpka endoteliy AAF klassik fiziologiya hisoblanadi; bu versiya uchun olingan ekspressiya maʼlumotlari oʻpkani emas, ichak va urugʻdonni koʻrsatadi, va figura buni aytadi.',

  // -------------------------------------------------------- organ.liverPlate (scenePlates)
  'organ.liverPlate.title': 'Jigar',
  'organ.liverPlate.sub': 'uchta ferment va genotip belgilaydigan bitta darvoza',
  'organ.liverPlate.capacityNotModelled': 'CYP2D6 sigʻimi bu versiyada modellashtirilmagan.',
  'organ.liverPlate.gateNote': (v: Vars) =>
    `Bu bemorda CYP2D6 darvozasi meʼyorga nisbatan ${v.value} ×. Darajani belgilaydigan narsa — doza emas, darvozadir.`,
  'organ.liverPlate.idle': 'Organizmda metoprolol yoʻq, shuning uchun darvoza bu freymda harakatsiz.',
  'organ.liverPlate.aboveThreshold':
    'Metoprolol 80,2 ng/mL dan yuqori — yorliqqa koʻra β1 selektivligi shu kontsentratsiyada kamayadi.',
  'organ.liverPlate.belowThreshold':
    'Metoprolol 80,2 ng/mL dan past, yorliq chegarasidan — bu yerda hali ham β1-selektiv boʻlib turibdi.',

  // ------------------------------------------------------- organ.kidneyPlate (scenePlates)
  'organ.kidneyPlate.title': 'Buyrak',
  'organ.kidneyPlate.sub': 'toʻrtta dori, toʻrtta har xil segment, barchasi bir vaqtda',
  'organ.kidneyPlate.filtrationTitle': 'Filtratsiya',
  'organ.kidneyPlate.filtrationHint':
    'renal.p_glomerular PROKSI darajasida — u buyrakni himoya qilish animatsiyasini boshqaradi, lekin kalibrlanmagan, shuning uchun hech qachon mmHg da koʻrsatilmaydi.',
  'organ.kidneyPlate.pGlomPrefix': (v: Vars) => `P_glom ${v.value}`,
  'organ.kidneyPlate.traceLabel':
    'eGFR, shu seansda — barqarorlashadigan pasayish shikastlanish emas, chiqaruvchi arteriolaning ochilishidir',

  // --------------------------------------------------------- organ.raasPlate (scenePlates)
  'organ.raasPlate.title': 'Qarshi-tartibga solish',
  'organ.raasPlate.sub': 'bosim pasayayotganda qarshilik koʻrsatadigan halqa',
  'organ.raasPlate.reninNotModelled': 'Renin bu versiyada modellashtirilmagan.',
  'organ.raasPlate.reninNote': (v: Vars) =>
    `Renin asosga nisbatan ${v.value} × boʻlib, pasayayotgan bosimga qarshi koʻtarilmoqda. Bu halqaning moʻljallanganidek ishlashi, dori nosozligi emas.`,
  'organ.raasPlate.aldosteroneNotModelled': 'Aldosteron bu versiyada modellashtirilmagan.',
  'organ.raasPlate.aldosteroneNote': (v: Vars) =>
    `Aldosteron asosga nisbatan ${v.value} × — shuning uchun bu kaskad harakatlanganda kaliy ham harakatlanadi.`,
  'organ.raasPlate.dualNote':
    'Bitta kaskadda ikkita toʻxtatish choʻpi: ferment ham, retseptor ham bloklangan. Qoʻshiluvchi chiqaruvchi kengayish, kaliy va GFR har qanday yakka dorinikidan koʻra koʻproq harakatlanadi.',
  'organ.raasPlate.singleNote':
    'Haftalar davomida aldosteronning qisman qaytishi bu versiyada modellashtirilmagan — bu yashirilmagan, aytib qoʻyilgan.',

  // -------------------------------------------------------- organ.limbsPlate (scenePlates)
  'organ.limbsPlate.title': 'Osilib turuvchi oyoqlar',
  'organ.limbsPlate.sub': 'tortishish kuchi suyuqlikni qayerga qoʻyadi, va nega diuretik buni tuzatmaydi',
  'organ.limbsPlate.noSwelling': 'Bu freymda osilib turuvchi shish yoʻq.',
  'organ.limbsPlate.thiazideOnly':
    'Tiazid qabul qilinmoqda va shish deyarli oʻzgarmadi — u bu mexanizmga taʼsir qilmaydi. Ishlamaydigan davolashni koʻrsatish ataylab qilingan.',
  'organ.limbsPlate.raasOn':
    'RAAS blokatori qabul qilinmoqda. U postkapillyar tomonni ham ochadi, shuning uchun kirish/chiqish muvozanati qisman tiklanadi va shish kamayadi.',
  'organ.limbsPlate.default':
    'Kirish ochiq, chiqish esa emas, shuning uchun suyuqlik tortishish kuchi koʻrsatgan joyda kapillyardan chiqib ketmoqda.',
  'organ.limbsPlate.interstitiumTitle': 'Interstitsium',
  'organ.limbsPlate.interstitiumHint':
    'periph.interstitial_volume_index — asosda 1.00 ga meʼyorlashtirilgan koʻrsatkich; undan olingan botiq shish darajasi taqdimot koʻprigi, oʻlchov emas.',
  'organ.limbsPlate.pittingNotModelled': 'botiq shish —',
  'organ.limbsPlate.pittingPresentational': (v: Vars) => `botiq shish ${v.grade} / 3 (taqdimot uchun)`,
  'organ.limbsPlate.capillaryTitle': 'Kapillyar bosim',
  'organ.limbsPlate.whatHappeningTitle': 'Nima roʻy bermoqda',
  'organ.limbsPlate.note':
    'Qayd etilgan chastota 2.5 / 5 / 10 mg da 1.8 / 3.0 / 10.8 % ga qarshi platsebo 0.6 %; ayollarda 14.6 % ga qarshi erkaklarda 5.6 %. FDA yorligʻi, amlodipin bezilat.',

  // ------------------------------------------------------- organ.safetyPlate (scenePlates)
  'organ.safetyPlate.title': 'Xavfsizlik',
  'organ.safetyPlate.sub': 'nima ishga tushdi, tanada qayerda koʻrinadi, va uning ortidagi qayd etilgan chastota',
  'organ.safetyPlate.drivenBy': (v: Vars) => `sabab: ${v.drugs}`,
  'organ.safetyPlate.incidence': (v: Vars) => `chastota: ${v.value}`,
  'organ.safetyPlate.haltedGate': 'Qattiq toʻsiq tomonidan toʻxtatildi',
  'organ.safetyPlate.fetalBarrier': 'Fetal toksiklik toʻsigʻi',
  'organ.safetyPlate.pregnancyNote':
    'AAF inhibitori yoki ARB homiladorlikda kontrendikatsiya qilingan. Berilishi mumkin boʻlmagan dori uchun simulyatsiya doza egri chizigʻini animatsiya qilmaydi.',
  'organ.safetyPlate.contraindicatedNote':
    'Kontrendikatsiya qilingan kombinatsiya soʻralgan edi, shuning uchun doza egri chizigʻi animatsiya qilinmaydi.',
  'organ.safetyPlate.noneAboveThreshold': 'Bu freymda hech qanday nojoʻya taʼsir kanali ishga tushish chegarasidan yuqori emas.',
  'organ.safetyPlate.noRun': 'Simulyatsiya ishlamayapti.',
  'organ.safetyPlate.rareSuffix': '  · kamdan-kam',
  'organ.safetyPlate.note':
    'Manbalar kelishmagan joyda diapazon koʻrsatiladi, hech qachon nuqtaviy baho emas. Ishga tushish chegaralari vizual sozlash konstantalari, klinik chegaralar emas.',

  // -------------------------------------------------------------- organ.scene (scenes)
  'organ.scene.selectorAriaLabel': 'Sahna',
  'organ.scene.clockStatus': (v: Vars) => `t = birinchi dozadan ${v.t} soat oʻtdi`,
  'organ.scene.watch.noRun': 'Simulyatsiya ishlamayapti — figura tinch, davolanmagan asos holatida turibdi.',
  'organ.scene.watch.journeyNone': 'Bu freymda organizmda hech narsa yoʻq, shuning uchun hali kuzatadigan doza yoʻq.',
  'organ.scene.watch.journeyLead': (v: Vars) => `Qonda ${v.n} ta modda bor.`,
  'organ.scene.watch.journeyWithGate': (v: Vars) =>
    `${v.lead} Jigardagi darvozani kuzating — metoprololning ${v.pct} % qon aylanishiga hech qachon yetib bormaydi.`,
  'organ.scene.watch.journeyNoGate': (v: Vars) =>
    `${v.lead} Jigardagi darvozani kuzating: u olib tashlagan narsa qon aylanishiga hech qachon yetib bormaydi.`,
  'organ.scene.watch.heart': (v: Vars) => `Urishni kuzating — u modellashtirilgan tezlikda yuradi, ${v.hr}, β1 esa ${v.b1} band.`,
  'organ.scene.watch.vessels': (v: Vars) => `Kapillyarning ikki uchini kuzating: kirish ${v.inlet}, chiqish ${v.outlet}.`,
  'organ.scene.watch.lungsAbsence':
    'Yetishmayotgan narsani kuzating: ARB havo yoʻllari ustida bradikinin tumanini qoldirmaydi, shuning uchun chizadigan yoʻtal kanali yoʻq.',
  'organ.scene.watch.lungs': (v: Vars) => `Bronxial lumenni kuzating — β2 bandligi koʻtarilgani sayin u torayadi, hozir esa ${v.pct}.`,
  'organ.scene.watch.liverNone': 'Uchta reaktorni kuzating: chapdan kiruvchi narsa oʻngdan chiquvchi narsa bilan bir xil emas.',
  'organ.scene.watch.liver': (v: Vars) =>
    `CYP2D6 darvozasini kuzating — bu bemorda meʼyorga nisbatan ${v.value} ×, va aynan shu narsa darajani belgilaydi, doza emas.`,
  'organ.scene.watch.kidney': (v: Vars) =>
    `Toʻrtta segmentni bir vaqtda kuzating: distal kanalchada NCC ${v.ncc} bloklangan, chiqaruvchi tomonda ACE ${v.ace} va AT1 ${v.at1}.`,
  'organ.scene.watch.raas': (v: Vars) =>
    `Renin ${v.renin} boʻlgan holda oʻrtacha bosim ${v.map} da turganini kuzating. Reninning koʻtarilishi halqaning ishlashi, dori nosozligi emas.`,
  'organ.scene.watch.limbs': (v: Vars) => `Interstitsial hajm ${v.value} ga yetganda toʻpiqning qalinlashishini kuzating.`,
  'organ.scene.watch.safetyNone': 'Bu freymda hech narsa ishga tushish chegarasidan yuqori emas. Bu natija, boʻsh panel emas.',
  'organ.scene.watch.safety': (v: Vars) => `${v.n} ta kanal ishga tushdi — har biri tanada raqamlangan va yonida manbasi koʻrsatilgan.`,
  'organ.scene.watch.default': (v: Vars) => `Figuradagi har bir rang izi — dori nimadir qilayotganini bildiradi. ${v.bp} · yurak urishi ${v.hr} · eGFR ${v.gfr}.`,

  // ---------------------------------------------------- organ.scene.<id> (SCENES list)
  'organ.scene.overview.label': 'Umumiy koʻrinish',
  'organ.scene.overview.blurb':
    'Butun tana bir vaqtda — bu rejim taʼsir qiladigan barcha organlar, sonlari esa chekkada.',
  'organ.scene.journey.label': 'Dozaning safari',
  'organ.scene.journey.blurb':
    'Dorini kuzating: yutiladi, kirishda jigar orqali oʻtadi, qonga chiqadi va chiqarib tashlanadi.',
  'organ.scene.heart.label': 'Yurak',
  'organ.scene.heart.blurb': 'Tezlik, kuch va hajm, va β1 retseptor hajmining qancha qismi hozir band.',
  'organ.scene.vessels.label': 'Tomirlar',
  'organ.scene.vessels.blurb':
    'Bitta qarshilik birligi: arteriola ochiladi, venula esa ochilmaydi, va ular orasidagi bosim toʻpiqlarni tushuntiradi.',
  'organ.scene.lungs.label': 'Oʻpkalar',
  'organ.scene.lungs.blurb':
    'Ikkita dori havo yoʻliga yetib boradi — biri bradikininni toʻplashga imkon beradi, biri β2 ni bloklaydi — va ikkalasini ham qilmaydigani hech narsa qilmayotgani koʻrsatiladi.',
  'organ.scene.liver.label': 'Jigar',
  'organ.scene.liver.blurb': 'Uchta CYP fermenti va genotip belgilaydigan, doza emas, bitta darvoza.',
  'organ.scene.kidney.label': 'Buyrak',
  'organ.scene.kidney.blurb': 'Toʻrtta dori toʻrtta anatomik jihatdan har xil nefron segmentida bir vaqtda taʼsir qiladi.',
  'organ.scene.raas.label': 'Qarshi-tartibga solish',
  'organ.scene.raas.blurb':
    'Qarshilik koʻrsatadigan halqa: qon bosimi pasayayotganda renin koʻtariladi, va bu kutilgan holat.',
  'organ.scene.limbs.label': 'Osilib turuvchi oyoqlar',
  'organ.scene.limbs.blurb':
    'Tortishish kuchi suyuqlikni qayerga qoʻyadi — va nega diuretik aynan shu shishni tuzatmaydi.',
  'organ.scene.safety.label': 'Xavfsizlik',
  'organ.scene.safety.blurb': 'Nima ishga tushdi, tanada qayerda koʻrinadi, va har birining ortidagi qayd etilgan chastota.',

  'common.sourcedRangeTitle': (v: Vars) => `Manba diapazoni ${v.lo}–${v.hi}${v.unit}`,

  // ------------------------------------------------------- chat assistant (src/ui/chat)
  'chat.open': 'AI dan soʻrang',
  'chat.openAria': 'Yordamchini oching va shu sahifa haqida soʻrang',
  'chat.title': 'AI dan soʻrang',
  'chat.sub': 'Faqat shu sahifaga asoslanadi — PilSim allaqachon hisoblagan narsadan javob beradi.',
  'chat.closeAria': 'Yordamchini yopish',
  'chat.panelAria': 'PilSim yordamchisi',
  'chat.notConfigured': 'AI provayderi sozlanmagan',
  'chat.groundedIn': 'Asos',
  'chat.grounded.substance': 'ochilgan modda',
  'chat.grounded.patient': 'tanlangan bemor',
  'chat.grounded.regimen': 'rejim',
  'chat.grounded.run': 'oxirgi simulyatsiya',
  'chat.grounded.rules': 'ishga tushgan qoidalar',
  'chat.grounded.pageOnly': 'faqat shu sahifa — hali hech narsa tanlanmagan',
  'chat.introLead':
    'Shu sahifadagi har qanday narsa haqida soʻrang — modda, bemor, dori yoki simulyatsiya natijasi.',
  'chat.introBoundaryLead': 'U hech narsani oʻylab topa olmaydi.',
  'chat.introBoundary':
    'Javoblar maʼlumotlar bazasi, ishga tushgan qoidalar va dvigatel natijasidan olinadi, har bir raqam shularga solishtiriladi. Agar PilSim biror narsani modellashtirmasa, taxmin qilish oʻrniga shuni aytadi.',
  'chat.noProviderTitle': 'Yordamchi oʻchirilgan',
  'chat.noProviderBody':
    'AI provayderi sozlanmagan, shuning uchun savol yuborib boʻlmaydi. Bu sahifadagi qolgan hamma narsa usiz ham ishlaydi. AI sozlamalari Simulyatsiya sahifasida.',
  'chat.starter.home.a': 'Bu mahsulot aslida nimani simulyatsiya qila oladi?',
  'chat.starter.home.b': 'Maʼlumotlar bazasida qaysi dorilar bor?',
  'chat.starter.substances.a': 'Bu modda nima qiladi va qayerda taʼsir qiladi?',
  'chat.starter.substances.b': 'Bu parametrlarning qaysilari manbadan emas, taxminiy?',
  'chat.starter.pills.a': 'Qoidalar bu tarkibni nega belgiladi?',
  'chat.starter.pills.b': 'Bu dori shu bemor uchun qanday qilib xavfsiz boʻladi?',
  'chat.starter.subject.a': 'Qaysi qoʻshimcha kasallik bu egizakni koʻproq oʻzgartirdi?',
  'chat.starter.subject.b': 'Bu kreatinin doza uchun nimani anglatadi?',
  'chat.starter.simulation.a': 'Dvigatel nega shunday tartibladi?',
  'chat.starter.simulation.b': 'Bu bemorda natijani nima belgiladi?',
  'chat.placeholder': 'Shu sahifa haqida soʻrang…',
  'chat.send': 'Yuborish',
  'chat.stop': 'Toʻxtatish',
  'chat.clear': 'Suhbatni tozalash',
  'chat.you': 'Siz',
  'chat.assistant': 'PilSim yordamchisi',
  'chat.generatedMark': 'Generatsiya qilingan matn',
  'chat.waiting': 'Birinchi token kutilmoqda…',
  'chat.verdictNone': 'Bu javobda raqam yoʻq.',
  'chat.verdictClean': (v: Vars) =>
    `${v.n} ta raqam, har biri modelga berilgan ${v.facts} ta qiymatga bogʻlandi.`,
  'chat.verdictDirty': (v: Vars) =>
    `${v.total} ta raqamdan ${v.unsupported} tasi bu sahifa bermagan qiymatga tegishli — ${v.ids}. Yuqorida chizib tashlangan; ulardan foydalanmang.`,
  'chat.numberFlag': 'kontekstda yoʻq',
  'chat.numberFlagSr': 'Bu raqam modelga berilgan maʼlumotlarda yoʻq edi.',
  'chat.numberTrace': 'Modelga berilgan qiymatga bogʻlandi.',
  'chat.disclaimer': 'Virtual bemorlar. Tibbiy maslahat emas.',

  // -------------------------------------------------------- sidebar: history / settings
  'sidebar.history': 'Tarix',
  'sidebar.historyEmpty': "Hali simulyatsiya ishga tushirilmagan. Tugatgan har bir ishga tushirish shu yerda paydo boʻladi.",
  'sidebar.clearHistory': 'Tarixni tozalash',
  'sidebar.replayRun': (v: Vars) => `${v.regimen} · ${v.subject} ni ochish`,
  'sidebar.historyBp': (v: Vars) => `${v.value} mmHg sistolik`,
  'sidebar.settings': 'Sozlamalar',

  // -------------------------------------------------------- five-year projection hedge
  'sim.limits.noAldosteroneEscape':
    "Haftalar davomida aldosteron eskeypi / breakthrough hodisasi modellashtirilmagan.",
  'sim.limits.noBaroreflexAdaptation':
    "Modellashtirilgan qarshi tartibga solishdan tashqari barorefleks moslashuvi yoʻq.",
  'sim.limits.noPdTolerance': 'Farmakodinamik tolerantlik modellashtirilmagan.',
  'sim.limits.noAdherenceBehaviour':
    "Rioya qilish xatti-harakati modellashtirilmagan — har bir doza qabul qilingan deb hisoblanadi.",
  'sim.limits.noHardOutcomes':
    "Qattiq yurak-qon tomir natijalari (insult, miokard infarkti, oʻlim) modellashtirilmagan. Mahsulot qon bosimi va laboratoriya qiymatlarini modellashtiradi, hodisalarni emas. Uzoq muddatli koʻrinish qon bosimini nazorat qilish va organga tegishli koʻrsatkichlarning PROYEKSIYASI — insult, infarkt yoki oʻlimni bashorat qilish emas.",
  'sim.limits.cellLevelOneTarget':
    "Hujayra darajasidagi aniqlik faqat bitta nishon uchun daʼvo qilinadi: distal ilma-ich naychasi hujayralaridagi NCC / SLC12A3.",
  'sim.limits.fiveYearWording':
    "Besh yillik koʻrinish: qon bosimini nazorat qilish va organga tegishli koʻrsatkichlarning PROYEKSIYASI. Bu insult, infarkt yoki oʻlimni bashorat qilish emas va hech qachon shunday oʻqilmasligi kerak.",

  // ------------------------------------------------------------ dose timing (src/report/timing.ts)
  'sim.timing.heading': 'Kunning qaysi vaqtida qabul qilish',
  'sim.timing.categoryOutcome': 'Natija',
  'sim.timing.categoryTolerability': 'Chidamlilik',
  'sim.timing.categoryPharmacokinetic': 'Farmakokinetik',
  'sim.timing.confidenceHigh': 'Yuqori ishonch',
  'sim.timing.confidenceModerate': 'Oʻrtacha ishonch',
  'sim.timing.confidenceLow': 'Past ishonch',
  'sim.timing.suggestedTimeLabel': 'Tavsiya etilgan vaqt',
  'sim.timing.firstDoseLabel': 'Birinchi doza',
  'sim.timing.timeMorning': 'ertalab',
  'sim.timing.timeEvening': 'kechqurun',
  'sim.timing.timeBedtime': 'yotishdan oldin',
  'sim.timing.timeAnyConsistent': 'har kuni bir xil vaqtda — sizga qulay boʻlgan istalgan soatda',
  'sim.timing.gapsHeading': 'Vaqt tanlash — bu nimaga javob bermaydi',
  'sim.timing.headlineHeading': 'Qachon ichish kerak',
  'sim.timing.headlineDetailLink': 'Nega — toʻliq dalillar quyida ↓',

  // ==========================================================================
  // GENERATED PROSE — src/report/timing.ts, src/report/score.ts
  // ==========================================================================
  // Sinov nomlari (TIME, BedMed, MAPEC, Hygia), jurnal nomlari, PMID/DOI,
  // soʻzma-soʻz keltirilgan sarlavhalar, barcha raqamlar, birliklar,
  // statistikalar va dori nomlari TARJIMA QILINMAYDI — ular oʻqigan kishi bizni
  // manba boʻyicha tekshira olishi uchun ingliz tilida qoladi.
  // ⚠️ Hukm INKOR: kechasi qabul qilish hodisalarning oldini olishi
  //    ISBOTLANMAGAN. "Yordam berishi mumkin" yoki "tavsiya etilmaydi" emas.
  //    Rad javobi qaror boʻlib qoladi: "aniqlanmadi", "maʼlumot yoʻq" emas.

  'sim.timing.text.outcomeVerdict':
    'Qon bosimi dorilarini kechasi qabul qilish yurak xuruji, insult yoki oʻlimning oldini olishi ' +
    'ISBOTLANMAGAN. Agar siz boshqacha eshitgan boʻlsangiz, bu mahsulot bunga qoʻshilmaydi va quyidagi ' +
    'paragraflar sababini aytadi.',
  'sim.timing.text.outcomeTrials':
    'Ikkita yirik randomizatsiyalangan sinov bu foydani qidirdi va topmadi. TIME Buyuk Britaniyadagi 21 104 ' +
    'kattani ertalabki yoki kechki qabulga taqsimladi va ularni median 5.2 yil kuzatdi: qon-tomir sababli ' +
    'oʻlim, yurak xuruji yoki insult kechki guruhdagi 362 (3.4 %) kishida va ertalabki guruhdagi 390 (3.7 %) ' +
    'kishida yuz berdi, hazard ratio 0.95 (95 % CI 0.83–1.10), p=0.53. BedMed Kanadadagi birlamchi ' +
    'boʻgʻindagi 3357 kattani yotishdan oldingi yoki ertalabki qabulga taqsimladi va median 4.6 yil kuzatdi: ' +
    '100 bemor-yiliga 2.3 ga qarshi 2.4 hodisa, tuzatilgan hazard ratio 0.96 (95 % CI 0.77–1.19), p=.70.',
  'sim.timing.text.outcomeContested':
    'Foyda haqidagi daʼvo bitta tadqiqot guruhining ikkita ishidan keladi — MAPEC (2010) va Hygia ' +
    'Chronotherapy Trial (2020), uning sarlavhasi "Bedtime hypertension treatment improves cardiovascular ' +
    'risk reduction". Ularning hech biri chaqirib olinmagan. Hygia European Heart Journal tomonidan ' +
    'chiqarilgan IKKITA Expression of Concern bilan yuradi (2020;41(16):1600 va 2020;41(48):4564), sakkiz ' +
    'nafar gipertenziya tadqiqotchisi esa loyihaga qarshi "Missing Verification of Source Data in ' +
    'Hypertension Research: The HYGIA PROJECT in Perspective" nomli eʼtirozni chop etdi. PilSim Hygia ' +
    'effekt hajmini ataylab keltirmaydi: bahsli maqoladagi aniq va esda qoladigan raqamni unutish uni ' +
    'izohlashdan koʻra qiyinroq.',
  'sim.timing.text.outcomeSafetyMirror':
    'Xavfsizlik xavotiri teskari tomonga ham tegishli va unga ham javob berilgan: BedMed yotishdan oldingi ' +
    'qabulda yiqilish yoki suyak sinishi koʻpaymaganini, yangi glaukoma tashxislari koʻpaymaganini va 18 oyda ' +
    'kognitiv pasayishda farq yoʻqligini aniqladi. Demak, halol xulosa "kechasi qabul qilish xavfli" ham ' +
    'emas — kun vaqti natijani hech qaysi tomonga oʻzgartirmadi.',
  'sim.timing.text.outcomeSurrogate':
    'Haqiqatan ochiq qolgani — tungi qon bosimi raqam sifatida, natija sifatida emas: OMAN sinovi (2025) ' +
    'yotishdan oldingi qabul tungi sistolik bosimni ertalabki qabulga qaraganda taxminan 3 mmHg koʻproq ' +
    'pasaytirganini aniqladi. Bu — surrogat koʻrsatkich. Hech bir sinov oʻsha 3 mmHg ni yopish bemor bilan ' +
    'nima boʻlishini oʻzgartirishini koʻrsatmagan, PilSim esa kimda tungi bosim koʻtarilganini umuman ' +
    'aniqlay olmaydi — u sirkadiy ritmni butunlay modellashtirmaydi.',
  'sim.timing.text.outcomeConsistentTime':
    'Demak: ularni siz doimiy amal qila oladigan vaqtda qabul qiling. TIME ning oʻz maslahati, soʻzma-soʻz — ' +
    '"Patients can be advised that they can take their regular antihypertensive medications at a convenient ' +
    'time that minimises any undesirable effects." Eʼtibor bering: "eng yaxshi soat yoʻq" degani "istalgan ' +
    'kuni istalgan soatda" degani emas: ikkala sinovda ham qatʼiy vaqt belgilangan va unga rioya qilingan, ' +
    'shuning uchun tavsiya — bitta doimiy vaqt, oʻzgaruvchan emas.',

  'sim.timing.text.drugOutcome': (v: Vars) =>
    `${v.name} ni yurak xuruji, insult yoki oʻlimning oldini olishda samaraliroq qiladigan kun vaqti ` +
    `aniqlanmagan. Ertalabki va kechki qabulni taqqoslagan randomizatsiyalangan sinovlar bu natijalarda farq ` +
    `topmadi.`,
  'sim.timing.text.thiazideMorning': (v: Vars) =>
    `${v.name} ni ertalab qabul qiling, shunda uning diurezi siz uygʻoq paytingizda kechadi: yorliqqa koʻra ` +
    `taʼsir dozadan taxminan ${v.onset} soat keyin boshlanadi${v.peakClause}, butun epizod esa ${v.duration} ` +
    `davom etadi. Kechki doza bu oynani tunga tashlaydi va sizni siyish uchun uygʻotadi. Bu sizning uyqungiz ` +
    `haqida, yuragingiz haqida emas — u yurak xuruji yoki insultga taʼsir qilishi haqida hech qanday daʼvo ` +
    `qilmaydi.`,
  'sim.timing.text.thiazidePeakClause': (v: Vars) => `, eng yuqori taʼsiri taxminan ${v.peak} soatda`,
  'sim.timing.text.durationRange': (v: Vars) => `taxminan ${v.lo}–${v.hi} soat`,
  'sim.timing.text.durationSingle': (v: Vars) => `taxminan ${v.value} soat`,
  'sim.timing.text.firstDoseHypotension': (v: Vars) =>
    `${v.name} ning BIRINCHI dozasini yotishdan oldin qabul qiling, keyin esa oʻzingizga qulay istalgan ` +
    `vaqtda: maʼlumotlar toʻplami u uchun gipotenziyani "${v.onset}" boshlanishi bilan qayd etadi, shuning ` +
    `uchun agar oʻsha birinchi doza bosimingizni boshingiz aylanadigan darajada tushirsa, allaqachon yotgan ` +
    `boʻlganingiz maʼqul.${v.mechanismClause} Xavf yorliqda koʻrsatilgan; birinchi dozani yotishdan oldin ` +
    `qabul qilish esa undan CHIQARILGAN xulosa, yorliqdagi koʻrsatma emas — shuning uchun bu yuqori emas, ` +
    `oʻrtacha ishonch bilan aytiladi.`,
  'sim.timing.text.datasetOwnWords': (v: Vars) =>
    ` Maʼlumotlar toʻplamining oʻz soʻzlari bilan: ${v.mechanism}.`,

  'sim.timing.text.pkNegligible': (v: Vars) =>
    `${v.name} uchun soat faqat farmakokinetika nuqtai nazaridan deyarli ahamiyatsiz: ${v.halfLife} soatlik ` +
    `yarim yemirilish davri bilan konsentratsiya dozalar orasidagi ${v.intervalH} soatda atigi ${v.swing} ` +
    `tebranadi va navbatdagi doza vaqti kelganda ham oʻz choʻqqisining ${v.troughPct}% darajasida qoladi, ` +
    `shuning uchun kunning hech bir qismi boshqasidan sezilarli darajada yaxshiroq qoplanmaydi.` +
    `${v.via}${v.perDayNote}`,
  'sim.timing.text.pkMarked': (v: Vars) =>
    `${v.name} dozalar orasidagi ${v.intervalH} soatda ${v.swing} tebranadi va navbatdagi doza vaqtiga kelib ` +
    `oʻz choʻqqisining ${v.troughPct}% darajasiga tushadi, shuning uchun bu tartibda qaysi soatni ` +
    `tanlashingizdan qatʼi nazar, har kunning bir qismi deyarli qoplanmay qoladi. Dozani surish boʻshliqni ` +
    `koʻchiradi, uni yopmaydi — uni yopish dozani boʻlish yoki uzaytirilgan taʼsirli shaklni anglatadi, bu ` +
    `esa vaqt tanlash emas, retsept qarori.${v.via}${v.perDayNote}`,
  'sim.timing.text.pkModerate': (v: Vars) =>
    `${v.name} dozalar orasidagi ${v.intervalH} soatda oʻz choʻqqisining ${v.troughPct}% darajasiga tushadi — ` +
    `${v.swing} tebranish — demak, tamoyil boʻyicha soatning ahamiyati boʻlishi mumkin. Bundan bir soat qon ` +
    `bosimini boshqasidan yaxshiroq nazorat qiladi degan xulosa kelib chiqmaydi: model sirkadiy ritmni ` +
    `hisobga olmaydi, buni tekshirgan sinovlar esa farq topmadi.` +
    `${v.tolerabilityClause}${v.via}${v.perDayNote}`,
  'sim.timing.text.pkSwingFold': (v: Vars) => `${v.value} baravar`,
  'sim.timing.text.pkSwingUnbounded': 'cheksiz',
  'sim.timing.text.pkViaMetabolite': (v: Vars) =>
    ` ${v.name} ning oʻzi qisqa umr koʻradi; interval davomida taʼsir qiladigani uning metaboliti ` +
    `${v.species}, va bu yerda ahamiyatlisi uning ${v.halfLife} soatlik yarim yemirilish davri.`,
  'sim.timing.text.pkPerDayNote': (v: Vars) =>
    ` Bu kuniga ${v.perDay} marta qabul qilinadigan tartib, shuning uchun masala kunning qaysi soati emas, ` +
    `dozalar orasidagi oraliq haqida.`,
  'sim.timing.text.pkHourFromTolerability':
    ' Yuqorida tavsiya etilgan soat farmakokinetika emas, chidamlilik asosida tavsiya etilgan.',
  'sim.timing.text.metoprololContrast': (v: Vars) =>
    `Aniq qilib aytganda: oʻsha ${v.mgPerDay} mg/day metoprolol kuniga bir marta qabul qilinadigan tez ` +
    `taʼsirli tabletka sifatida ${v.ir} baravar, uzaytirilgan taʼsirli suksinat sifatida ${v.er} baravar va ` +
    `ikkiga boʻlingan doza sifatida ${v.bid} baravar tebranadi. Agar sizga tekis profil kerak boʻlsa, richag ` +
    `aynan shu — soat emas.`,

  'sim.timing.text.anyTimeStatement': (v: Vars) =>
    `${v.name}: uni ${v.label} qabul qiling. Bu — javob, yetishmayotgan narsa emas: dalillar bu dori uchun ` +
    `eng yaxshi vaqtni belgilamaydi va unda bir soatni boshqasidan koʻra osonroq koʻtariladigan qiladigan ` +
    `hech narsa yoʻq.`,
  'sim.timing.text.takeAtStatement': (v: Vars) => `${v.name}: uni ${v.label} qabul qiling.`,
  'sim.timing.text.threeKinds':
    'Bu rejadagi vaqt boʻyicha maslahat uch xil boʻladi va ular bir-birining oʻrnini bosmaydi: dalillar ' +
    'NATIJALAR (yurak xuruji va insult) haqida nima deyishi, dorini CHIDASH osonroq qiladigan narsa va ' +
    'FARMAKOKINETIKA nimaga imkon berishi. Tavsiya etilgan soatni faqat ikkinchisi oʻzgartiradi.',
  'sim.timing.text.noGuidelineTiming':
    'PilSim ning oʻz klinik qoidalar qatlamida doza vaqtini tavsiya qiladigan hech narsa yoʻq: ' +
    'data/rules.json beshta moddaning hech biri uchun vaqt taʼsirini chiqarmaydi. Bu yerdagi har bir natija ' +
    'bayonoti bevosita chop etilgan sinovlardan oʻqilgan va klinik qoida tavsiyasi emas, adabiyot sifatida ' +
    'belgilangan.',

  'sim.timing.text.gapNonDipperWhat': 'aynan shu bemor yotishdan oldingi dozadan koʻproq foyda koʻrarmi',
  'sim.timing.text.gapNonDipperWhy':
    'Vaqt masalasi hali ochiq boʻlgan yagona joy — tungi qon bosimining koʻtarilishi va non-dipper turi, ' +
    'PilSim esa ikkalasini ham aniqlay olmaydi: data/patient_model.json faylida "Circadian rhythm in blood ' +
    'pressure — no dipper/non-dipper pattern" `validity_limits.not_modelled` ostida keltirilgan. Mahsulotda ' +
    'sutkalik qon bosimi monitoringi kiritmasi yoʻq va boʻlganda ham oʻqiydigan narsasi boʻlmasdi.',
  'sim.timing.text.gapMorningEveningWhat': 'ertalabki va kechki dozani simulyatsiyada taqqoslash',
  'sim.timing.text.gapMorningEveningWhy':
    'Modelda qon bosimining sirkadiy ritmi yoʻq, shuning uchun ertalabki va kechki doza tuzilishiga koʻra bir ' +
    'xil simulyatsiya natijasini beradi. Yuqoridagi qoplash koʻrsatkichlari doza oraligʻidagi konsentratsiya ' +
    'egri chizigʻining SHAKLINI tasvirlaydi; ular tunda soat 3 da qon bosimi nima qilayotgani haqida hech ' +
    'narsa demaydi, va bu mahsulot javobi oʻz soddalashtirishlarining xossasi boʻlgan taqqoslashni ' +
    'oʻtkazmaydi.',

  'sim.score.text.goalSingle': (v: Vars) =>
    `Bitta simulyatsiya qilingan bemor ${v.target} ga ${v.pct}% ehtimol bilan erishadi (javob tarqalishi ` +
    `faraz qilingan; N = 1)`,
  'sim.score.text.goalPopulation': (v: Vars) =>
    `Simulyatsiya qilingan bemorlarning ${v.pct}% ${v.target} ga erishdi`,
  'sim.score.text.sbpFall': (v: Vars) =>
    `Barqaror holatda sistolik bosim ${v.mmHg} mmHg ga pasayadi`,
  'sim.score.text.riskLine': (v: Vars) => `${v.name} xavfi ${v.pct}%`,
  'sim.score.text.labOutside': (v: Vars) =>
    `${v.name} oʻzining meʼyoriy oraligʻidan chiqdi (${v.value} — meʼyor ${v.lo}–${v.hi})`,
  'sim.score.text.labChance': (v: Vars) =>
    `${v.name} meʼyoriy oraliqdan chiqish ehtimoli ${v.pct}% (${v.lo}–${v.hi})`,
  'sim.score.text.tooCloseToCall':
    'Farqni aniqlab boʻlmaydi: bir balldan kam farq qiladigan variantlarni bu model ajratmaydi. Umumiy ' +
    'balldagi har bir ogʻirlik — taxmin, shuning uchun ularni teng deb hisoblang va ball yonida koʻrsatilgan ' +
    'komponentlar (samaradorlik, xavfsizlik, muvofiqlik) boʻyicha tanlang.',
  'sim.score.text.rankedBelowOverride':
    'Bekor qilish talabi yoʻq har bir variantdan pastda joylashtirilgan — klinik qoida "qoching" deydi, ' +
    '"taqiqlanadi" demaydi',
  'sim.score.text.armNotRanked': (v: Vars) =>
    `Bu variant reytingga kiritilmaydi. ${v.title} ${v.severity} darajasida ishga tushdi. Mutlaq qarshi ` +
    `koʻrsatma yonida xavfsizlik balini chop etish uni murosaga oʻxshab oʻqilishiga chorlaydi. Bu murosa emas.`,
  'sim.score.text.anAbsoluteContraindication': 'Mutlaq qarshi koʻrsatma',
  'sim.score.text.absolutelyContraindicated': 'Mutlaqo qarshi koʻrsatilgan.',
  'sim.score.text.caveatSexByDose':
    'Modellashtirish farazi: jins farqi butun doza oraligʻi boʻylab doimiy proporsional taʼsir sifatida ' +
    'qoʻllaniladi. Yorliq jins va dozani alohida keltiradi va jins-doza oʻzaro taʼsiri boʻyicha raqam ' +
    'bermaydi — bu oʻzaro taʼsir faraz qilingan, yorliqda koʻrsatilmagan.',
  'sim.score.text.caveatGeneric': (v: Vars) => `Modellashtirish farazi: ${v.text}.`,

  'sim.formulation.text.refusal':
    'Eng yaxshi dori shakli: aniqlanmadi. Bu modda uchun faqat tez taʼsir qiluvchi (immediate-release) ogʻiz ' +
    'orqali qattiq shakllar modellashtirilgan. Shakllarni taqqoslash uchun qabul yoʻliga xos ' +
    'bioʻzlashuvchanlik va choʻqqiga chiqish vaqti maʼlumotlari kerak, ular esa bu versiyaning maʼlumotlar ' +
    'toʻplamida yoʻq.',
  'sim.formulation.text.refusalChip': 'Mavjud maʼlumotlar dori shakllarini taqqoslashga imkon bermaydi',
  'sim.formulation.text.noProfile':
    'Eng yaxshi dori shakli: aniqlanmadi. Simulyatsiya konsentratsiya profilini bermadi, shuning uchun ' +
    'eng past/eng yuqori nisbati va tebranish oʻlchanmadi.',
  'sim.formulation.text.tprReason': (v: Vars) => `Eng past/eng yuqori nisbati ${v.value}${v.derived}`,
  'sim.formulation.text.tprDerivedClause': ' (konsentratsiya profilidan)',
  'sim.formulation.text.onceDaily': 'Kuniga bir marta',
  'sim.formulation.text.timesDaily': (v: Vars) => `Kuniga ${v.n} marta qabul`,
  'sim.formulation.text.forgivenessProxy':
    'Oʻtkazib yuborilgan dozadan keyingi zaxira oʻlchanmagan; oʻrniga eng past/eng yuqori nisbati ishlatilgan.',
  'sim.formulation.text.metoprololRanked':
    'Uzaytirilgan taʼsirli shakl afzal. Suksinat ER ning plazmadagi choʻqqi darajasi oddiy metoprololning ' +
    'mos dozasinikidan oʻrtacha toʻrtdan bir — yarmigacha past, bu choʻqqidagi β-blokadani va choʻqqida β2 ga ' +
    'oʻtishni kamaytiradi — nafas yoʻllari arxetipi uchun muhim boʻlgan mexanizm.',
  'sim.formulation.text.amlodipineNotIndicated':
    'Uzaytirilgan taʼsirli shakl keraksiz — dorining 30–50 soatlik yarim yemirilish davri allaqachon tekis ' +
    'konsentratsiya profilini beradi, shuning uchun ER shakli eng past/eng yuqori nisbati va tebranishni ' +
    'deyarli oʻzgartirmaydi.',
}

// ============================================================================
// RUSSIAN — added for a mentor request. Same shape as `uz`: a partial record
// falling back to English for anything not yet translated. Filled in batches
// by key prefix (see comments below), in the same order as `en`/`uz` above.
// Drug/substance names, units, trial names, citations and dataset numbers are
// never translated — see the file header. The two normative hedges (the
// five-year output is a PROJECTION, never a prediction; "too close to call" /
// disagreement language) are preserved deliberately in sim.report.* and
// sim.ranked.* below.
// ============================================================================
/**
 * Russian plural selection (one/few/many), e.g. 1 совпадение, 2 совпадения, 5
 * совпадений. Unlike Uzbek, Russian nouns do inflect for number after a numeral, so
 * this is used wherever the English/Uzbek entry pluralises a count.
 */
function ruPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

const ru: Partial<Record<DictKey, DictValue>> = {
  // ---------------------------------------------------------------- sidebar / shell
  'app.tagline': 'Симулятор лекарств для виртуального пациента',
  'nav.home': 'Обзор',
  'nav.substances': 'Вещества',
  'nav.pills': 'Препараты',
  'nav.subject': 'Тестовые пациенты',
  'nav.simulation': 'Симуляция',
  'sidebar.saved': 'Сохранённые',
  'sidebar.savedEmpty':
    'Пока ничего не сохранено. Всё, что вы составите или соберёте, появится здесь.',
  'sidebar.loading': 'Загрузка данных…',
  'sidebar.error': 'Не удалось загрузить данные',
  'sidebar.researchSimulator': 'Исследовательский симулятор',
  'lang.toggle.label': 'Язык',
  'lang.en': 'English',
  'lang.uz': 'Oʻzbekcha',
  'lang.ru': 'Русский',

  // ------------------------------------------------------------------------- common
  'common.retry': 'Повторить',
  'common.cancel': 'Отмена',
  'common.clear': 'Очистить',
  'common.edited': 'Изменено',
  'common.revert': 'Вернуть исходное значение',
  'common.userEntered': 'Введено пользователем',
  'common.yours': 'Ваше',
  'common.was': (v: Vars) => `было ${v.value}`,
  'common.selectDetail': 'Выбрать',
  'common.selectedDetail': 'Выбрано',
  'common.openDetails': 'Подробнее ›',
  'common.allParameters': 'Все параметры',
  'common.identifiersAndSynonyms': 'Идентификаторы и синонимы',
  'common.synonyms': 'Синонимы',
  'common.name': 'Название',
  'common.role': 'Роль',
  'common.class': 'Класс',
  'common.active': 'Активное вещество',
  'common.excipient': 'Вспомогательное вещество',
  'common.metabolite': 'Активный метаболит',
  'common.na': 'Не применимо.',

  // ---------------------------------------------------------------- status / errors
  'status.loading.title': 'Загрузка набора данных',
  'status.loading.message': 'Получение веществ, продуктов и правил…',
  'status.error.title': 'Не удалось загрузить данные',
  'status.error.message': 'Не удалось прочитать набор данных.',
  'status.empty.title': 'Нечего показать',

  // ---------------------------------------------------------------------- severity
  'severity.info': 'Информация',
  'severity.preferred': 'Предпочтительно',
  'severity.compelling': 'Убедительно',
  'severity.minor': 'Незначительно',
  'severity.moderate': 'Умеренно',
  'severity.major': 'Серьёзно',
  'severity.contraindicated_relative': 'Относительное противопоказание',
  'severity.contraindicated_absolute': 'Абсолютное противопоказание',

  // -------------------------------------------------------------------- provenance
  'prov.status.CITED': 'С источником',
  'prov.status.ESTIMATED': 'Оценочно',
  'prov.status.NOT_FOUND': 'Не найдено',
  'prov.detail.status': 'Статус',
  'prov.detail.source': 'Источник',
  'prov.detail.url': 'URL',
  'prov.detail.quote': 'Цитата',
  'prov.detail.basis': 'Основание',
  'prov.detail.searched': 'Проверено',
  'prov.detail.note': 'Примечание',
  'prov.detail.noSourceRecorded': 'Для этого поля не указаны источник, цитата или обоснование.',
  'prov.detail.noneOnField': 'У этого поля нет объекта происхождения данных.',
  'prov.retrieved': (v: Vars) => `получено ${v.date}`,
  'prov.tier': (v: Vars) => `уровень ${v.tier} — ${v.label}`,
  'prov.confidence': (v: Vars) => `уверенность ${v.value}`,
  'prov.legend.cited': 'со ссылкой',
  'prov.legend.estimated': 'оценочно',
  'prov.legend.notFound': 'не найдено',
  'prov.legend.ofValues': (v: Vars) => `из ${v.total} значений`,

  // -------------------------------------------------------------------------- home
  'home.title': 'Узнайте, что делает препарат, прежде чем кто-то его примет.',
  'home.lede':
    'PilSim даёт смоделированный препарат виртуальному пациенту, симулирует эффект и ранжирует варианты — за каждой цифрой стоит источник или честная пометка «оценочно».',
  'home.start': 'Начать — выбрать препарат',
  'home.pickPatient': 'Выбрать пациента',
  'home.facts': (v: Vars) =>
    `${v.substances} веществ · ${v.products} продуктов · ${v.rules} правил безопасности с источниками`,
  'home.step1.title': 'Выберите препарат',
  'home.step1.text': 'Настоящий продукт или составьте свой.',
  'home.step2.title': 'Выберите пациента',
  'home.step2.text': 'Возраст, почки, заболевания, генотип.',
  'home.step3.title': 'Запустите',
  'home.step3.text': 'Модель интегрирует по часам.',
  'home.step4.title': 'Изучите результат',
  'home.step4.text': 'Варианты ранжированы, польза сопоставлена с вредом.',

  // -------------------------------------------------------------------- substances
  'substances.pageTitle': 'Вещества',
  'substances.pageSub': 'Ищите в каталоге. Ваша полка — это то, из чего собираются препараты.',
  'substances.searchPlaceholder': 'Поиск по каталогу…',
  'substances.newSubstance': '+ Новое вещество',
  'substances.filter.all': 'Все',
  'substances.filter.active': 'Активные вещества',
  'substances.filter.excipient': 'Вспомогательные вещества',
  'substances.status.cited': 'С источником',
  'substances.status.estimated': 'Оценочно',
  'substances.status.notFound': 'Не найдено',
  'substances.noMatch': (v: Vars) => `В каталоге ничего не найдено по запросу «${v.query}».`,
  'substances.catalogue': 'Каталог',
  'substances.matchCount': (v: Vars) =>
    `${v.total}${v.capped ? '+' : ''} ${ruPlural(Number(v.total), 'совпадение', 'совпадения', 'совпадений')}`,
  'substances.noMatchShort': 'нет совпадений',
  'substances.showMore': (v: Vars) => `Показать ещё ${v.n}`,
  'substances.yourShelf': 'Ваша полка',
  'substances.yoursCount': (v: Vars) => `${v.n} ваших`,
  'substances.shelfEmptyTitle': 'На полке пусто',
  'substances.shelfEmptyMessage': 'Ищите в каталоге или создайте своё вещество.',
  'substances.next.putInPill': 'Добавить в препарат',
  'substances.next.compose': 'Далее: составьте из них препарат',
  'substances.goToPills': 'Перейти к препаратам',
  'substances.readingLibrary': 'Загружается библиотека веществ.',
  'substances.loadError': 'Не удалось загрузить данные о веществах',
  'substances.addToShelf': '+ Добавить на полку',
  'substances.removeFromShelf': 'Убрать с полки',
  'substances.backToShelf': '← Полка',
  'substances.identity': 'Общие сведения',
  'substances.classPlaceholder': 'например, ингибитор АПФ',
  'substances.everyValueEstimated': 'Каждое введённое вами значение помечается как оценочное, а не как источник.',
  'substances.delete': 'Удалить',
  'substances.keyParameters': 'Ключевые параметры',
  'substances.resetEdits': (v: Vars) =>
    `Сбросить ${v.n} ${ruPlural(Number(v.n), 'изменение', 'изменения', 'изменений')}`,
  'substances.noMeasuredValues': 'Пока нет измеренных значений.',
  'substances.filterByStatus': 'Фильтр по источнику значения',
  'substances.noFilterMatch': 'Ничего не соответствует этому фильтру.',
  'substances.field': 'Поле',
  'substances.value': 'Значение',
  'substances.rangeSpread': 'Диапазон / разброс',
  'substances.source': 'Источник',
  'substances.showSource': 'Показать источник',
  'substances.hideSource': 'Скрыть источник',
  'substances.substancesSelected': (v: Vars) =>
    `Выбрано ${v.n} ${ruPlural(Number(v.n), 'вещество', 'вещества', 'веществ')}`,
  'substances.removeFromSelection': (v: Vars) => `Убрать ${v.name} из выбора`,
  'substances.createPillFrom': (v: Vars) =>
    `Создать препарат из ${v.n} ${Number(v.n) === 1 ? 'вещества' : 'веществ'}`,
  'substances.noConflictYet': 'Среди выбранного пока нет конфликта на уровне состава.',
  'substances.onShelf': 'на полке',
  'substances.deselect': (v: Vars) => `Убрать выбор с ${v.name}`,
  'substances.select': (v: Vars) => `Выбрать ${v.name}`,
  'substances.userEnteredValues': (v: Vars) =>
    `${v.n} ${ruPlural(Number(v.n), 'значение', 'значения', 'значений')}, введено пользователем`,
  'substances.citedOfTotal': (v: Vars) => `${v.cited} из ${v.total} со ссылкой на источник`,

  // ---------------------------------------------------------------------- section labels
  'section.general': 'Значения уровня записи',
  'section.physchem': 'Физикохимия',
  'section.pk': 'Фармакокинетика',
  'section.pd': 'Фармакодинамика',
  'section.dosing': 'Дозирование',
  'section.formulations': 'Лекарственные формы',
  'section.simulation_hooks': 'Параметры симуляции',
  'section.flags': 'Флаги',
  'section.identifiers': 'Идентификаторы',

  // ------------------------------------------------------------------------- pills
  'pills.pageTitle': 'Препараты',
  'pills.pageSub': 'Восемь настоящих продуктов. Составьте свой — те же правила проверят его.',
  'pills.searchPlaceholder': 'Фильтр по препаратам и компонентам…',
  'pills.compose': '+ Новый препарат',
  'pills.composeTitle': 'Составить препарат',
  'pills.composeEmptyHint': 'Не только эти восемь — составьте свой из любого вещества.',
  'pills.allPills': '← Все препараты',
  'pills.safetyCheck': 'Проверка безопасности',
  'pills.runsOnFirst': 'выполняется по первому веществу',
  'pills.activeExcipientCount': (v: Vars) =>
    `${v.active} активных · ${v.excipient} вспомогательных`,
  'pills.twoActivesHint': 'Два активных вещества из разных классов — самый интересный случай.',
  'pills.duplicateSubstance': 'Одно и то же вещество указано дважды. Объедините количества.',
  'pills.doseEdited': (v: Vars) => `Изменено доз: ${v.n}`,
  'pills.compositionOnly': 'только состав, пациент ещё не выбран',
  'pills.noPillMatch': (v: Vars) => `Ни один препарат не соответствует запросу «${v.query}».`,
  'pills.next.choosePatient': 'Далее: выберите, кто его принимает',
  'pills.next.pickPatient': 'Далее: выберите пациента',
  'pills.pickPatient': 'Выберите пациента',
  'pills.readingLibrary': 'Загружается библиотека продуктов.',
  'pills.loadError': 'Не удалось загрузить данные о продуктах',
  'pills.checkScope.summary': 'Что охватывает эта проверка',
  'pills.checkScope.body':
    'Тот же движок из 48 правил, что использует симуляция. Без пациента он определяет взаимодействия на уровне классов, сочетания компонентов, предельные дозы и вспомогательные вещества. Правила, требующие заболевания, анализа, фенотипа или демографических данных, отмечаются как ожидающие. Ранг 7 блокирует; ранг 6 требует зафиксированного отступления от правил.',

  // -------------------------------------------------------------------- composer
  'composer.newComposition': 'Новый состав',
  'composer.name': 'Название',
  'composer.namePlaceholder': 'например, Lisinopril + amlodipine 10/5',
  'composer.selectSubstance': '— выберите вещество —',
  'composer.yoursGroup': (v: Vars) => `Ваши (${v.n})`,
  'composer.activeGroup': (v: Vars) => `Активные вещества (${v.n})`,
  'composer.excipientGroup': (v: Vars) => `Вспомогательные вещества (${v.n})`,
  'composer.dose': 'Доза',
  'composer.form': 'Форма',
  'composer.addAnother': '+ Добавить ещё вещество',
  'composer.singleSubstanceHint':
    'Одно вещество работает нормально — добавьте второе, чтобы увидеть их взаимодействие.',
  'composer.saveToLibrary': 'Сохранить в библиотеку',
  'composer.clear': 'Очистить',
  'composer.duplicateHint': 'Одно и то же вещество указано дважды',
  'composer.addAtLeastOne': 'Добавьте хотя бы одно вещество',
  'composer.giveItName': 'Дайте название',
  'composer.removeComponent': 'Удалить компонент',
  'composer.formStandard': (v: Vars) => `${v.form} — стандартная`,
  'composer.formNotReal': (v: Vars) => `${v.form} — не реальный продукт`,
  'composer.formPkEquivalent': (v: Vars) =>
    `${v.form} — реальная форма, но измеримых отличий в ФК от стандартной нет`,
  'composer.formDifferent': (v: Vars) => `${v.form} — иной профиль всасывания`,

  // -------------------------------------------------------------------- findings
  'findings.verdict.blocked': 'Заблокировано',
  'findings.verdict.override': 'Требуется отступление',
  'findings.verdict.warn': 'Предупреждения',
  'findings.verdict.clear': 'Конфликтов нет',
  'findings.verdictText.blocked': 'Действует абсолютное противопоказание. Отступление не предлагается.',
  'findings.verdictText.override':
    'Ранг 6 — следует избегать, не противопоказано. Продолжение возможно только через зафиксированное отступление, и такой вариант ранжируется ниже любого разрешённого.',
  'findings.verdictText.warn': 'Разрешено, но перед дозированием необходимо прочитать предупреждения.',
  'findings.verdictText.clear':
    'Среди правил, которые можно оценить без пациента, конфликтов на уровне состава нет.',
  'findings.group.blockers': 'Блокирующие факторы',
  'findings.group.overrides': 'Требует отступления',
  'findings.group.warnings': 'Предупреждения',
  'findings.group.positives': 'Положительные показания',
  'findings.group.info': 'Информация',
  'findings.noRuleFired': 'Ни одно правило не сработало для этого состава.',
  'findings.hideEvidence': 'Скрыть доказательства',
  'findings.evidenceAndEffects': 'Доказательства и эффекты',
  'findings.effectCount': (v: Vars) =>
    `${v.direction} · ${v.n} ${ruPlural(Number(v.n), 'эффект', 'эффекта', 'эффектов')}`,
  'findings.effects': 'Эффекты',
  'findings.deferred.noneRemain': (v: Vars) =>
    `Только состав, по данным ${v.engine}. Правила, зависящие от пациента, сработают, когда появится тестовый пациент.`,
  'findings.deferred.some': (v: Vars) => `Только состав, по данным ${v.engine}.`,
  'findings.deferred.moreRules': (v: Vars) =>
    `Ещё ${v.n} ${ruPlural(Number(v.n), 'правило', 'правила', 'правил')}`,
  'findings.deferred.matchNeedSubject': 'соответствуют компоненту здесь, но требуют пациента.',
  'findings.deferred.hide': 'скрыть',
  'findings.deferred.list': 'показать список',
  'findings.deferred.needs': (v: Vars) => `требует: ${v.needs}`,
  'findings.engine.tier': 'Уровень',
  'findings.engine.doseCaps': 'Предельные дозы',
  'findings.engine.risks': 'Риски',
  'findings.engine.monitor': 'Мониторинг',

  // -------------------------------------------------------------------- pill card
  'pillcard.activeIngredients': (v: Vars) => `Активные вещества · ${v.n}`,
  'pillcard.identity': 'Общие сведения',
  'pillcard.productClass': 'Класс продукта',
  'pillcard.generic': 'Международное название',
  'pillcard.dosageForm': 'Лекарственная форма',
  'pillcard.route': 'Путь введения',
  'pillcard.dosingInterval': 'Интервал приёма',
  'pillcard.every': (v: Vars) => `каждые ${v.h} ч`,
  'pillcard.strengths': 'Дозировки',
  'pillcard.asMarketed': 'как на рынке',
  'pillcard.modelledStrength': 'Смоделированная дозировка',
  'pillcard.referenceBrands': 'Референсные бренды',
  'pillcard.lactose': 'Лактоза',
  'pillcard.excipients': 'Вспомогательные вещества',
  'pillcard.noneInComposition': 'отсутствует в этом составе',
  'pillcard.tradeSecret': (v: Vars) => `${v.n} · количества являются коммерческой тайной`,
  'pillcard.noExcipients': 'В этом составе нет вспомогательных веществ.',
  'pillcard.substance': 'Вещество',
  'pillcard.amount': 'Количество',
  'pillcard.notDisclosed': 'не раскрыто',
  'pillcard.userEntered': 'введено пользователем',
  'pillcard.notes': 'Примечания',
  'pillcard.label': (v: Vars) => `на этикетке ${v.amount}`,
  'pillcard.containsLactose': 'Содержит лактозу',
  'pillcard.excipientCount': (v: Vars) =>
    `${v.n} ${ruPlural(Number(v.n), 'вспомогательное вещество', 'вспомогательных вещества', 'вспомогательных веществ')}${v.interval ? ` · каждые ${v.interval} ч` : ''}`,
  'pillcard.formNote': (v: Vars) => `Форма: ${v.form}`,
  'pillcard.formNotePkEquivalent': ' — реальная форма, но измеримых отличий в ФК от стандартной таблетки нет',
  'pillcard.dose': 'доза',
  'pillcard.baseContent': (v: Vars) => `Указано как ${v.salt} — ${v.base} мг в пересчёте на основание`,

  // ----------------------------------------------------------------------- subject
  'subject.pageTitle': 'Тестовые пациенты',
  'subject.pageSub': 'Выберите пациента для симуляции. Каждый меняет результат.',
  'subject.addSubject': '+ Добавить пациента',
  'subject.restoreScenarios': (v: Vars) =>
    `Восстановить ${v.n} ${ruPlural(Number(v.n), 'сценарий', 'сценария', 'сценариев')}`,
  'subject.isSelected': (v: Vars) => `Выбран: ${v.label}`,
  'subject.runRegimen': ' — запустите режим приёма для этого двойника.',
  'subject.runSimulation': 'Запустить симуляцию',
  'subject.loadingModel': 'Загрузка модели пациента',
  'subject.modelLoadError': (v: Vars) =>
    `Не удалось загрузить patient_model.json (${v.error}). Ни один пресет состояния не может быть применён, поэтому на странице показан только базовый расчётный конвейер.`,
  'subject.library': '← Библиотека',
  'subject.subjectName': 'Имя пациента',
  'subject.hepaticGate': 'Печёночные ворота',
  'subject.hepaticGateNote':
    'В организме ничего нет, поэтому все потоки равны нулю. Раскрытие ворот определяется только генотипом — именно оно решает, останется ли стандартная доза метопролола ниже 80,2 ng/mL, где препарат ещё β1-селективен, или превысит этот порог, где он уже не селективен.',
  'subject.footer':
    'Исследовательский симулятор, а не инструмент клинического принятия решений. Некалиброванные косвенные сигналы показаны как относительные показатели, никогда в абсолютных единицах.',
  'subject.untreatedBaseline': 'Исходный уровень без лечения',
  'subject.pregnancyGate': 'Установлен флаг беременности. Ингибитор АПФ или БРА не будут смоделированы.',
  'subject.affectedAnatomyAria': 'Анатомия исходного уровня без лечения',
  // parameter panel
  'subject.group.who': 'Кто',
  'subject.group.body': 'Тело',
  'subject.group.circulation': 'Кровообращение',
  'subject.group.kidney': 'Почки',
  'subject.group.genotype': 'Генотип',
  'subject.group.genotypeNote': 'задаёт печёночные ворота, через которые должна пройти каждая доза метопролола',
  'subject.group.conditions': 'Заболевания',
  'subject.group.conditionsOn': (v: Vars) =>
    `${v.n} включено — каждое сдвигает именованные переменные состояния`,
  'subject.group.conditionsOff': 'каждое сдвигает именованные переменные состояния',
  'subject.sexAtBirth': 'Пол при рождении',
  'subject.sexCovariate': 'биологическая ковариата',
  'subject.sexTitle':
    'Ковариата в формулах CKD-EPI, Watson, Janmahasatian и Nadler. Не гендерная идентичность.',
  'subject.male': 'Мужской',
  'subject.female': 'Женский',
  'subject.pregnant': 'Беременность',
  'subject.pregnantGateHint': 'жёсткий барьер для любого ингибитора АПФ или БРА',
  'subject.yes': 'Да',
  'subject.no': 'Нет',
  'subject.age': 'Возраст',
  'subject.ageHint': 'только взрослые — созревание у детей не моделируется',
  'subject.weight': 'Вес',
  'subject.height': 'Рост',
  'subject.systolic': 'Систолическое давление',
  'subject.diastolic': 'Диастолическое давление',
  'subject.heartRate': 'Частота сердечных сокращений',
  'subject.reference': (v: Vars) => `норма ${v.lo}–${v.hi}`,
  'subject.serumCreatinine': 'Креатинин сыворотки',
  'subject.cyp2d6': 'CYP2D6',
  'subject.cyp2d6Hint': 'раскрытие ворот',
  'subject.cyp2d6GateTitle': (v: Vars) => `Ворота открываются до ${v.gate}× от нормальной пропускной способности`,
  'subject.cyp2c9': 'CYP2C9',
  'subject.cyp2c9Hint': 'losartan → EXP3174',
  'subject.phenotype.poor': 'Медленный',
  'subject.phenotype.intermediate': 'Промежуточный',
  'subject.phenotype.normal': 'Нормальный',
  'subject.phenotype.ultrarapid': 'Сверхбыстрый',
  'subject.modelNotLoaded': 'patient_model.json не загружен, поэтому ни один пресет не может быть применён.',
  'subject.modifierCount': (v: Vars) =>
    `${v.n} ${ruPlural(Number(v.n), 'модификатор', 'модификатора', 'модификаторов')}`,
  'subject.derived.bsa': 'ППТ',
  'subject.derived.bmi': 'ИМТ',
  'subject.derived.bodyWater': 'Вода в организме',
  'subject.derived.meanPressure': 'Среднее давление',
  'subject.derived.cardiacOutput': 'Сердечный выброс',
  'subject.derived.vascularResistance': 'Сосудистое сопротивление',
  'subject.derived.egfr': 'eGFR',
  'subject.derived.renalBloodFlow': 'Почечный кровоток',
  'subject.derived.ckdStage': 'Стадия ХБП',
  'subject.derived.hepaticGate': 'Печёночные ворота',
  'subject.derived.cyp2d6Phenotype': 'Фенотип CYP2D6',
  // derived panel
  'subject.derivedPanel.title': 'Что вычисляет двойник',
  'subject.derivedPanel.source.engine': 'rules/twin.ts',
  'subject.derivedPanel.source.fallback': 'резервный расчёт страницы — rules/twin.ts не загружен',
  'subject.derivedPanel.whatMoved': 'Что изменили заболевания',
  'subject.derivedPanel.stateVarCount': (v: Vars) =>
    `${v.n} ${ruPlural(Number(v.n), 'переменная состояния', 'переменные состояния', 'переменных состояния')}`,
  'subject.derivedPanel.nothingMoved':
    'Заболевание выбрано, но ничего не изменилось — этот пресет несёт только флаги для движка правил.',
  'subject.derivedPanel.moreShifted': 'Другие изменённые переменные',
  'subject.derivedPanel.allDerived': 'Все вычисленные переменные',
  'subject.derivedPanel.auditTrail': 'Журнал изменений модификаторов',
  'subject.derivedPanel.warnings': 'Предупреждения расчёта',
  'subject.derivedPanel.was': (v: Vars) => `было ${v.value}`,
  // subject card
  'subject.card.pregnant': 'Беременность',
  'subject.card.noComorbidity': 'Без сопутствующих заболеваний',
  'subject.card.bloodPressure': 'Артериальное давление',
  'subject.card.egfr': 'eGFR',
  'subject.card.selected': 'Выбрано',
  'subject.card.edit': 'Изменить',
  'subject.card.duplicate': 'Дублировать',
  'subject.card.delete': 'Удалить',
  'subject.card.confirm': 'Подтвердить',
  'subject.card.confirmDelete': (v: Vars) => `Подтвердить удаление ${v.label}`,
  'subject.card.deleteLabel': (v: Vars) => `Удалить ${v.label}`,
  'subject.card.meta': (v: Vars) => `${v.age} лет · ${v.sex} · ${v.weight} kg`,
  'subject.card.male': 'мужской',
  'subject.card.female': 'женский',
  'subject.card.moreCount': (v: Vars) => `+${v.n}`,

  // ------------------------------------------------------------------ anatomy rail
  'rail.affectedAnatomy': 'Затронутая анатомия',
  'rail.pickSubstance': 'Выберите вещество, чтобы увидеть, где оно действует.',

  // ---------------------------------------------------- UI-A batch 2: rail captions
  'substances.rail.whereActs': (v: Vars) => `Где действует ${v.name}`,
  'substances.rail.shelfCaption': 'Всё на вашей полке',
  'substances.rail.shelfEmpty': 'Добавьте активное вещество на полку, чтобы увидеть, где оно действует.',
  'substances.addShort': '+ Полка',
  'substances.editedCount': (v: Vars) => `${v.n} изменено`,
  'common.amountAria': (v: Vars) => `Количество ${v.name} в миллиграммах`,
  'pills.rail.composeCaption': 'На что подействует этот состав',
  'pills.rail.composeEmpty': 'Выберите активное вещество, и тело покажет, куда оно достигает.',
  'pills.rail.actsOn': (v: Vars) => `На что действует ${v.name}`,
  'pills.rail.libraryCaption': 'Всё в библиотеке',
  'pills.rail.libraryEmpty': 'Составьте препарат, чтобы увидеть, куда он достигает.',

  // ------------------------------------------------ UI-A batch 2: field/card copy
  'field.typicalStartingDose': 'Типичная стартовая доза',
  'field.maxDailyDose': 'Максимальная суточная доза',
  'field.halfLife': 'Период полувыведения',
  'field.timeToPeak': 'Время достижения пика',
  'field.oralBioavailability': 'Пероральная биодоступность',
  'field.systolicBpChange': 'Изменение систолического АД',
  'field.ed50': 'ED50',
  'field.onsetOfEffect': 'Начало действия',
  'field.durationOfEffect': 'Продолжительность действия',
  'field.clearance': 'Клиренс',
  'field.volumeOfDistribution': 'Объём распределения',
  'field.proteinBinding': 'Связывание с белками',
  'field.excretedUnchangedUrine': 'Выводится в неизменном виде с мочой',
  'field.typicalAmountPerTablet': 'Типичное количество на таблетку',
  'field.maximumPerDay': 'Максимум в сутки',
  'field.molecularWeight': 'Молекулярная масса',
  'field.startDose': 'Стартовая доза',
  'field.maxPerDayShort': 'Макс. / сутки',
  'field.bioavailability': 'Биодоступность',
  'field.typicalAmount': 'Типичное количество',

  'field.class.aceInhibitor': 'Ингибитор АПФ',
  'field.plain.aceInhibitor': 'Расслабляет кровеносные сосуды, блокируя АПФ.',
  'field.class.arb': 'БРА',
  'field.plain.arb': 'Блокирует рецептор ангиотензина II, который сужает сосуды.',
  'field.class.ccb': 'Блокатор кальциевых каналов',
  'field.plain.ccb': 'Расширяет артерии, блокируя поступление кальция.',
  'field.class.thiazide': 'Тиазидный диуретик',
  'field.plain.thiazide': 'Заставляет почки выводить соль и воду.',
  'field.class.betaBlocker': 'Бета-блокатор',
  'field.plain.betaBlocker': 'Замедляет сердце и снижает его выброс.',

  'field.fn.filler': 'Придаёт таблетке удобный для обращения размер.',
  'field.fn.disintegrant': 'Обеспечивает распад таблетки после проглатывания.',
  'field.fn.binder': 'Скрепляет таблетку.',
  'field.fn.lubricant': 'Предотвращает прилипание порошка к прессу.',
  'field.fn.glidant': 'Улучшает текучесть порошка при производстве.',
  'field.fn.coating': 'Образует внешнюю оболочку таблетки.',
  'field.fn.colorant': 'Придаёт таблетке цвет.',
  'field.fn.colorant_substrate': 'Носитель красящего пигмента.',
  'field.fn.surfactant': 'Улучшает смачивание и растворение препарата.',
  'field.fn.preservative': 'Предотвращает рост микроорганизмов в жидких формах.',
  'field.fn.sweetener': 'Подслащивает жидкую форму.',
  'field.fn.vehicle': 'Жидкость-носитель препарата.',
  'field.fn.buffer': 'Поддерживает стабильный pH.',
  'field.fn.chelator': 'Связывает следовые металлы, которые могли бы разрушить препарат.',
  'field.fn.viscosity_modifier': 'Загущает жидкую форму.',

  // ------------------------------------------------- simulation: run controls
  'sim.pill.label': 'Препараты для тестирования',
  'sim.pill.selectedCount': ({ n }) => `Выбрано: ${n}`,
  'sim.pill.editPills': 'Изменить препараты',
  'sim.pill.composeOwn': 'Составить свой',
  'sim.pill.composedNote': 'Отметьте один, чтобы запустить, или несколько, чтобы сравнить.',
  'sim.pill.eightProducts': 'Отметьте один, чтобы запустить, или несколько, чтобы сравнить их рядом.',
  'sim.pill.formLabel': 'Лекарственная форма',
  'sim.pill.formNotePkEquivalent': 'Эта форма существует, но ведёт себя так же.',
  'sim.pill.formNoteDifferent': 'Эта форма имеет иной профиль всасывания.',

  // ===== APPENDED BLOCK — simulation arm builder (RunControls PillPicker) =====
  'sim.pill.armsLabel': 'Схемы для сравнения',
  'sim.pill.armCount': ({ n }) => `Схем: ${n}`,
  'sim.pill.rolePrimary': 'Основная',
  'sim.pill.roleComparison': 'Сравнение',
  'sim.pill.removeArm': ({ name }) => `Убрать ${name}`,
  'sim.pill.singleArmNote':
    'Графики и тело следуют за этой схемой. Для запуска нужна хотя бы одна, поэтому добавьте другую, прежде чем убирать эту.',
  'sim.pill.primaryNote':
    'Первая схема — основная: графики и тело следуют за ней. Остальные запускаются рядом и ранжируются относительно неё.',
  'sim.pill.noneConsequence':
    'Схема не выбрана, поэтому запускать нечего. Добавьте её ниже — она появится здесь вместе с лекарственными формами.',
  'sim.pill.addArm': 'Добавить схему',
  'sim.pill.libraryCount': ({ n }) => `в библиотеке: ${n}`,
  'sim.pill.searchPlaceholder': 'Поиск по библиотеке',
  'sim.pill.groupMono': 'Монотерапия',
  'sim.pill.groupCombo': 'Фиксированная комбинация',
  'sim.pill.added': 'Добавлено',
  'sim.pill.noMatch': ({ q }) =>
    `В библиотеке нет ничего, что соответствует «${q}», поэтому добавлять нечего. Очистите поиск, чтобы увидеть всё.`,
  'sim.form.aria': ({ drug }) => `Лекарственная форма для: ${drug}`,
  'sim.form.primaryOnly': 'Лекарственную форму можно задать только у основной схемы.',
  // ===== end appended block =====

  'sim.subject.label': 'Пациент',
  'sim.subject.build': 'Создать пациента',

  'sim.run.run': 'Запустить симуляцию',
  'sim.run.stop': 'Остановить',
  'sim.run.settings': 'Настройки запуска',
  'sim.run.horizon': 'Время симуляции',
  'sim.run.initialConditions': 'Начальная точка',
  'sim.run.steadyState': 'Устойчивое состояние',
  'sim.run.firstDose': 'Первая доза',
  'sim.run.steadyStateNote': 'Хроническое дозирование — корректная основа для сравнения режимов.',
  'sim.run.firstDoseNote':
    'Только первая доза. Амлодипину нужно 7–8 дней, чтобы достичь устойчивого состояния, поэтому сравнение здесь некорректно.',
  'sim.run.population': 'Виртуальные пациенты',
  'sim.run.populationN': ({ n }) => `${n}`,
  'sim.run.singleTwin': 'Только этот пациент',
  'sim.run.populationNote': 'Больше одного — отражает изменчивость между людьми.',
  'sim.run.frameInterval': 'Детализация',
  'sim.run.frameMinutes': ({ n }) => `каждые ${n} мин`,

  // ============================================================ pills/subject wiring
  'pill.compose.nameAria': 'Название состава',
  'subj.cyp2c9Activity': 'Активность CYP2C9',
  'subj.condition.gradeAria': (v: Vars) => `Степень ${v.label}`,
  'subj.readout.bsa': 'Площадь поверхности тела',
  'subj.readout.bmi': 'ИМТ',
  'subj.readout.lbw': 'Тощая масса тела',
  'subj.readout.tbw': 'Общая вода организма',
  'subj.readout.plasmaVolume': 'Объём плазмы',
  'subj.readout.map': 'Среднее артериальное давление',
  'subj.readout.cardiacOutput': 'Сердечный выброс',
  'subj.readout.strokeVolume': 'Ударный объём',
  'subj.readout.svr': 'Сосудистое сопротивление',
  'subj.readout.arterialCompliance': 'Артериальная растяжимость',
  'subj.readout.egfr': 'eGFR',
  'subj.readout.absoluteGfr': 'Абсолютная СКФ',
  'subj.readout.crcl': 'Клиренс креатинина',
  'subj.readout.renalBloodFlow': 'Почечный кровоток',
  'subj.readout.filtrationFraction': 'Фильтрационная фракция',
  'subj.readout.hepaticBloodFlow': 'Печёночный кровоток',
  'subj.readout.plasmaReninActivity': 'Активность ренина плазмы',
  'subj.readout.sympatheticTone': 'Симпатический тонус',
  'subj.readout.allometricClScalar': 'Аллометрический масштаб клиренса',

  // ======================================================================
  // sim.* — UI-SIM wiring (see matching block at the end of `en`/`uz` above).
  // ======================================================================
  'sim.ai.title': 'Клиническое обоснование — текст, сгенерированный ИИ',
  'sim.ai.sub':
    'Языковая модель читает результат работы движка. Она объясняет и предлагает, но ничего не решает, и каждое число, которое она пишет, сверяется с данными, которые ей были предоставлены.',
  'sim.ai.askAgain': 'Спросить снова',
  'sim.ai.explainThis': 'Объяснить это',
  'sim.ai.stop': 'Остановить',
  'sim.ai.hideSettings': 'Скрыть настройки',
  'sim.ai.showSettings': 'Настройки ИИ',
  'sim.ai.notConfigured': 'провайдер не настроен — панель отключена',
  'sim.ai.explainingLabel': 'объясняется:',
  'sim.ai.generatedMark': 'сгенерированный текст — не источник',
  'sim.ai.waitingFirstToken': 'ожидание первого токена…',
  'sim.ai.verdictCleanStrong': (v: Vars) =>
    `${v.n} ${ruPlural(Number(v.n), 'число проверено', 'числа проверено', 'чисел проверено')}, все прослеживаются к источнику.`,
  'sim.ai.verdictCleanRest': (v: Vars) =>
    `Каждое число выше присутствовало среди ${v.facts} значений, переданных модели. Наведите курсор, чтобы увидеть, к чему оно относится.`,
  'sim.ai.verdictDirtyStrong': (v: Vars) =>
    `${v.unsupported} из ${v.total} чисел не прослеживаются к предоставленным данным`,
  'sim.ai.verdictDirtyRest':
    'Они зачёркнуты выше и не должны восприниматься как имеющие источник. Это граница, выполняющая свою работу, а не ошибка отображения: модель сгенерировала цифру, которую движок никогда не вычислял.',
  'sim.ai.worthWatching': 'Стоит обратить внимание:',
  'sim.ai.sceneNote':
    'Сцена — это представление уже завершённого прогона. Переключение на неё меняет ракурс анатомии, но не меняет ни одного числа.',
  'sim.ai.watchIt': 'Смотреть',
  'sim.ai.proposedNext': 'Предложенные следующие симуляции',
  'sim.ai.suggestsNote':
    'Модель предлагает; движок принимает решение. Каждый из этих режимов уже определён этим продуктом — модель выбрала из этого списка по идентификатору и не могла назначить свою дозу. Нажатие запускает детерминированную симуляцию, и результат исходит от движка, а не отсюда.',
  'sim.ai.simulateThis': 'Симулировать это',
  'sim.ai.discarded': (v: Vars) =>
    `Отклонено ${v.n} ${ruPlural(Number(v.n), 'предложение', 'предложения', 'предложений')} с указанием ${v.ids} — такого режима в этом продукте не существует, поэтому запускать нечего и ничего не было придумано, чтобы заполнить пробел.`,
  'sim.ai.failureTitleNoProvider': 'ИИ-провайдер не настроен',
  'sim.ai.failureTitleNetwork': 'Не удалось связаться с моделью',
  'sim.ai.failureTitleRateLimit': 'Провайдер ограничивает частоту запросов',
  'sim.ai.failureTitleServer': 'Провайдер вернул ошибку',
  'sim.ai.failureTitleMalformed': 'Не удалось прочитать ответ',
  'sim.ai.failureTitleAborted': 'Отменено',
  'sim.ai.failureTitleTimeout': 'Модель не ответила вовремя',
  'sim.ai.failureNote':
    'Ничто другое на этой странице не зависит от модели. Симуляция, правила, ранжирование и отчёт не затронуты — и вместо этого не показывается заготовленный текст.',
  'sim.ai.openSettings': 'Открыть настройки ИИ',
  'sim.ai.settingsHeading': 'Провайдер ИИ',
  'sim.ai.close': 'Закрыть',
  'sim.ai.settingsIntro':
    'Какая модель отвечает — это настройка, а не изменение кода. Если один провайдер ограничивает запросы во время демонстрации, переключитесь здесь и спросите снова.',
  'sim.ai.provider': 'Провайдер',
  'sim.ai.automatic': 'Автоматически — первый настроенный',
  'sim.ai.workerEndpoint': 'Адрес Worker',
  'sim.ai.workerShouldCall': 'Worker должен обращаться к',
  'sim.ai.geminiKeyLabel': 'Ключ Gemini — для прямого пути через браузер',
  'sim.ai.geminiKeyPlaceholder': 'вставьте одноразовый ключ',
  'sim.ai.keyWarning':
    'Ключ, вставленный здесь, хранится в этом браузере и виден любому, кто откроет devtools или вкладку network. Это нормально для демонстрации на своей машине с одноразовым ключом. Но это не решение для продакшена — вместо этого направьте Gemini через Worker, где ключ останется на сервере.',

  'sim.bench.orderingSays': 'Что показывает порядок',
  'sim.bench.failed': (v: Vars) => `Тест не пройден: ${v.error}`,
  'sim.bench.syntheticWarning':
    'Эти варианты созданы заглушечным движком, а не src/engine. Порядок ниже — свойство временной модели и не несёт фармакологического утверждения.',
  'sim.bench.singleArmWarning':
    'Оценён только один допустимый вариант. Ранжирование не показывается — рекомендация без альтернативы намеренно скрыта.',
  'sim.bench.bpEffectOnly': 'Только эффект на артериальное давление',
  'sim.bench.effectOnlyNote':
    'Это не ранжирование продукта. Это только ΔSBP — без компонента безопасности, компонента уместности, порога безопасности и уровней правил. Показано, чтобы прогон не пропал впустую, и не должно восприниматься как рекомендация.',

  'sim.chart.noSamplesYet': 'Пока нет данных.',
  'sim.chart.nothingToRankYet': 'Пока нечего ранжировать.',
  'sim.chart.efficacy': 'Эффективность',
  'sim.chart.safety': 'Безопасность',
  'sim.chart.appropriateness': 'Уместность',
  'sim.chart.composite': 'итог',
  'sim.chart.systolicReductionLabel': 'снижение систолического давления, mmHg',
  'sim.chart.plasmaConcentration': 'Концентрация в плазме',
  'sim.chart.concSubtitle':
    'Здесь отображается EXP3174 — активный метаболит лозартана. У лозартана как исходного вещества своя ось.',
  'sim.chart.hoursSinceFirstDose': 'Часы с момента первой дозы',
  'sim.chart.emptyConcentration': 'Запустите симуляцию, чтобы увидеть концентрации.',
  'sim.chart.losartanParentTitle': 'Лозартан (исходное вещество) — отдельная ось',
  'sim.chart.losartanParentSubtitle': 'Показан отдельно, так как отношение пика к минимуму ≈ 2000.',
  'sim.chart.noLosartanInRegimen': 'В этом режиме нет лозартана.',
  'sim.chart.concParentFootnote':
    'Никогда не размещайте эту кривую на общей оси. EXP3174 — фрагмент, несущий 60–85 % эффекта.',
  'sim.chart.haemodynamicResponse': 'Гемодинамический ответ',
  'sim.chart.haemoSubtitle': 'Артериальное давление в mmHg и частота сердечных сокращений в bpm на одной оси.',
  'sim.chart.systolicBp': 'Систолическое артериальное давление',
  'sim.chart.systolicShort': 'Систолическое',
  'sim.chart.diastolicBp': 'Диастолическое артериальное давление',
  'sim.chart.diastolicShort': 'Диастолическое',
  'sim.chart.meanArterialPressure': 'Среднее артериальное давление',
  'sim.chart.meanArterialShort': 'Среднее артериальное',
  'sim.chart.heartRate': 'Частота сердечных сокращений',
  'sim.chart.thisRunSuffix': ' · этот прогон',
  'sim.chart.emptyHaemodynamic': 'Запустите симуляцию, чтобы увидеть гемодинамический ответ.',
  'sim.chart.untreatedBaselineSystolic': (v: Vars) => `Исходное систолическое без лечения — ${v.value} mmHg`,
  'sim.chart.targetEngagement': 'Вовлечённость мишени',
  'sim.chart.engagementSubtitle': 'Доля вовлечённости каждой мишени, 0–1.',
  'sim.chart.fractionEngaged': 'Доля вовлечённости',
  'sim.chart.emptyEngagement': 'Запустите симуляцию, чтобы увидеть вовлечённость мишени.',
  'sim.chart.engagementFootnote':
    'β2-занятость — это канал потери селективности. NCC / SLC12A3 в клетках дистального извитого канальца — единственная мишень, которую эта модель заявляет на клеточном уровне.',
  'sim.chart.engAceInhibitionPlasma': 'Ингибирование АПФ (плазма)',
  'sim.chart.engAt1Blockade': 'Блокада AT1',
  'sim.chart.engCav12Vessel': 'Блокада Cav1.2, гладкая мускулатура сосудов',
  'sim.chart.engCav12Heart': 'Блокада Cav1.2, миокард',
  'sim.chart.engNccInhibition': 'Ингибирование NCC, дистальный извитой каналец',
  'sim.chart.engBeta1Occupancy': 'β1-занятость',
  'sim.chart.engBeta2Occupancy': 'β2-занятость, канал потери селективности',
  'sim.chart.engShortAce': 'Ингибирование АПФ',
  'sim.chart.engShortAt1': 'Блокада AT1',
  'sim.chart.engShortCav12Vessel': 'Cav1.2 — сосуд',
  'sim.chart.engShortCav12Heart': 'Cav1.2 — сердце',
  'sim.chart.engShortNcc': 'Ингибирование NCC',
  'sim.chart.engShortBeta1': 'β1-занятость',
  'sim.chart.engShortBeta2': 'β2-занятость',

  'sim.ranked.declinedToRank': 'От ранжирования отказано',
  'sim.ranked.refusalNote':
    'Отказ и есть результат. Придумать ранжирование здесь было бы самой заметной выдумкой во всём продукте — пути введения и их ФК фармацевт-эксперт знает наизусть.',
  'sim.ranked.tooCloseToCall': 'слишком близко, чтобы делать вывод',
  'sim.ranked.disqualifiedNoRule': 'Дисквалифицировано, но система оценки не указала правило для отображения.',
  'sim.ranked.systolicChange': 'Изменение систолического давления',
  'sim.ranked.reached': (v: Vars) => `Достигнуто ${v.target}`,
  'sim.ranked.safetyPenalties': 'Штрафы за безопасность',
  'sim.ranked.penaltyBreakdown': (v: Vars) => `${v.rule} правило · ${v.risk} риск · ${v.lab} анализ`,
  'sim.ranked.disqualifiedSectionHeading': 'Дисквалифицировано — не ранжируется, баллы не показываются',
  'sim.ranked.rankingUnavailable': 'Ранжирование недоступно',
  'sim.ranked.noRankingDefault': 'Система оценки не вернула ранжирование для этого набора сравнения.',
  'sim.ranked.simOutputRealNote':
    'Результат симуляции реален; ранжирование не придумывается, чтобы заполнить пробел.',
  'sim.ranked.tieBannerStrong': (v: Vars) =>
    `${v.n} ${ruPlural(Number(v.n), 'вариант', 'варианта', 'вариантов')} слишком близки, чтобы делать вывод.`,
  'sim.ranked.tieBannerRest':
    'Они попадают в порог равенства модели, поэтому порядок между ними — результат арифметики, а не рекомендация. Выбирайте, опираясь на компоненты эффективности, безопасности и уместности, показанные рядом с каждым баллом.',

  'sim.report.steadyStateExposure': 'Экспозиция в устойчивом состоянии',
  'sim.report.adverseEventProbability': 'Вероятность нежелательного явления за период наблюдения',
  'sim.report.bestFormulationType': 'Лучший тип лекарственной формы',
  'sim.report.whatModelDoesNotRepresent': 'Что эта модель не отражает',
  'sim.report.twinDerivationWarnings': 'Предупреждения расчёта двойника',
  'sim.report.whyThisResult': 'Почему такой результат',
  'sim.report.modellingAssumptions': 'Допущения моделирования, лежащие в основе этих чисел',
  'sim.report.eyebrow': 'Отчёт симуляции',
  'sim.report.tableMoiety': 'Moiety',
  'sim.report.tablePeak': 'Пик',
  'sim.report.tableTrough': 'Минимум',
  'sim.report.tablePeakTrough': 'Пик:минимум',
  'sim.report.concentrationsUnitNote': 'Концентрации в ng/mL.',
  'sim.report.noAdverseEvents': 'Нет вероятностей нежелательных явлений выше порога отчётности.',
  'sim.report.declinedNoData': 'От ранжирования отказано — данные отсутствуют',
  'sim.report.riskAngioedema': 'Ангиоотёк',
  'sim.report.riskBronchospasm': 'Бронхоспазм',
  'sim.report.riskHyperkalemia': 'Гиперкалиемия',
  'sim.report.riskAcuteGfrDrop': 'Острое снижение СКФ',
  'sim.report.riskBradycardia': 'Брадикардия',
  'sim.report.riskHyponatremia': 'Гипонатриемия',
  'sim.report.riskHypokalemia': 'Гипокалиемия',
  'sim.report.riskDizzinessOrthostatic': 'Головокружение / ортостатическое',
  'sim.report.riskHyperuricemiaGout': 'Гиперурикемия / подагра',
  'sim.report.riskPeripheralEdema': 'Периферические отёки',
  'sim.report.riskCough': 'Кашель',

  // ---------------------------------------------------------------- evidence
  'sim.evidence.aria': 'Доказательная основа этого результата',
  'sim.evidence.heading': 'На чём основан этот результат',
  'sim.evidence.restsOn': (v: Vars) =>
    `Эта рекомендация опирается на ${v.cited} значений с указанным источником и ${v.estimated} оценок.`,
  'sim.evidence.notFoundClause': (v: Vars) =>
    `Для ${v.n} источник не найден — они показаны пустыми, а не заполнены.`,
  'sim.evidence.rulesClause': (v: Vars) => `Сработало правил безопасности: ${v.n}, каждое со своим источником.`,
  'sim.evidence.doseAgainstLabel': 'Доза — в сравнении с официальной инструкцией',
  'sim.evidence.bpHeading': 'Откуда взято прогнозируемое изменение давления',
  'sim.evidence.showAll': 'Все параметры этих препаратов',
  'sim.evidence.openSource': 'Открыть источник',
  'sim.evidence.noQuote': 'Для этого значения дословный текст источника не записан.',
  'sim.evidence.notSourced': 'Поиск проведён, источник не найден. Оставлено пустым, а не заполнено.',
  'sim.evidence.sourceLabel': 'Источник',
  'sim.evidence.tier1': 'Официальная инструкция к препарату',
  'sim.evidence.tier2': 'Рецензируемое исследование',
  'sim.evidence.tier3': 'Химическая / лекарственная база данных',
  'sim.evidence.tier4': 'Вторичный обзор',
  'sim.evidence.doseStart': 'Начальная доза по инструкции',
  'sim.evidence.doseUsual': 'Обычный диапазон по инструкции',
  'sim.evidence.doseMax': 'Максимум в сутки по инструкции',
  'sim.evidence.paramF': 'Пероральная биодоступность',
  'sim.evidence.paramTmax': 'Время до пика в плазме',
  'sim.evidence.paramHalfLife': 'Период полувыведения',
  'sim.evidence.paramVd': 'Объём распределения',
  'sim.evidence.paramClearance': 'Клиренс',
  'sim.evidence.paramRenal': 'Выводится почками в неизменённом виде',
  'sim.evidence.paramSbpDrop': 'Снижение систолического давления по источнику',
  'sim.evidence.paramDbpDrop': 'Снижение диастолического давления по источнику',
  'sim.evidence.paramOnset': 'Начало действия',
  'sim.evidence.paramDuration': 'Длительность действия',
  'sim.evidence.modelDoseResponse': 'Кривая доза–эффект',
  'sim.evidence.modelBaseline': 'Влияние исходного давления',
  'sim.evidence.modelPooling': 'Потолок при комбинации двух препаратов',
  'sim.evidence.modelHomeostasis': 'Коэффициенты сердечно-сосудистой модели',
  'sim.evidence.armBasis': 'Дозы этого варианта — в сравнении с инструкцией',
  'sim.evidence.rankingBasis': 'На чём основана каждая строка этого списка',
  'sim.evidence.rankingBasisNote':
    'Каждая указанная дозировка — зарегистрированная дозировка из инструкции. Изменение давления в каждой ' +
    'строке оценивается той же моделью доза–эффект, что и полная симуляция.',

  'sim.scene.anatomy': 'Анатомия',
  'sim.scene.everySceneNote':
    'Каждая сцена отображает один и тот же прогон. Переключение меняет вид, но никогда не симуляцию.',
  'sim.scene.tablistAria': 'Сцена',
  'sim.scene.staticCaption':
    'Где действует этот режим. Ничего не анимируется, пока прогон не создаст кадры.',

  'sim.topcombos.title': 'Топ-5 комбинаций',
  'sim.topcombos.pickSubject': 'Выберите пациента, чтобы увидеть ранжирование.',
  'sim.topcombos.allBlocked': 'Все возможные комбинации жёстко заблокированы для этого пациента.',
  'sim.topcombos.runThroughSimulation': 'Запустить это через симуляцию',
  'sim.topcombos.diastolicChange': 'Изменение диастолического давления',
  'sim.topcombos.adverseBurden': 'Бремя нежелательных явлений',

  'sim.common.comparisonSet': 'Набор для сравнения',
  'sim.common.excluded': 'Исключено',

  'sim.weights.ariaLabel': 'Веса оценки',
  'sim.weights.estimatedTag': 'ОЦЕНОЧНО',
  'sim.weights.explainerPre': 'Каждое значение на этой панели',
  'sim.weights.explainerPost':
    '. Порядок — это то, что можно обосновать; точные числа — нет. Сдвиньте одно, и ранжирование пересчитается по уже смоделированным прогонам — повторный запуск не нужен.',
  'sim.weights.movedWarning': (v: Vars) =>
    `Отклонено ${v.n} ${ruPlural(Number(v.n), 'вес', 'веса', 'весов')} от значения по умолчанию. Ранжирование ниже — ваше, а не спецификации.`,
  'sim.weights.resetDefaults': 'Сбросить к значениям по умолчанию',
  'sim.weights.rescoring': 'Пересчёт оценки…',
  'sim.weights.rescoreRanking': 'Пересчитать ранжирование',
  'sim.weights.compositeSumWarning': (v: Vars) =>
    `Сумма итоговых весов равна ${v.sum}, а не 1.00. Ранжирование всё равно вычисляется, но итог больше не соответствует шкале 0–100 из спецификации — ориентируйтесь на полосы E, S и A, а не на общий балл.`,
  'sim.weights.specDefault': (v: Vars) => `(значение по умолчанию ${v.def})`,

  'sim.ai.numberFlagNotInContext': 'нет в контексте',
  'sim.ai.numberFlagUnsourcedSr':
    '— этого числа не было в данных, предоставленных модели, и у него нет источника',
  'sim.ai.numberTracePresent': 'присутствует в предоставленном контексте',
  'sim.ai.configured': 'Настроено.',

  // ------------------------------------------------------------ layout zones
  'zone.quickJump': 'Быстрый переход',
  'zone.complete': 'Готово',
  'zone.incomplete': 'Ещё не завершено',
  'zone.doneOfTotal': (v: Vars) => `${v.done} из ${v.total} выполнено`,

  'sim.zone.act': 'Настройте запуск',
  'sim.zone.actLead':
    'Выберите препарат, выберите пациента, нажмите «Запустить». Больше ничего на этой странице нет, пока вы этого не сделаете — рекомендация по дозе является результатом симуляции, а не входными данными для неё.',
  'sim.zone.answer': 'Что показала симуляция',
  'sim.zone.answerLead':
    'Режим, который был запущен, и его результат, а затем лучшие по оценке альтернативы для этого же пациента.',
  'sim.zone.evidence': 'Почему получен такой результат',
  'sim.zone.evidenceLead':
    'Кривые, тело, ранжирование и правила, из которых построен ответ выше.',
  'sim.zone.detail': 'Мелкий шрифт',
  'sim.zone.detailLead':
    'Веса оценки, настройки движка и то, что модель не отражает. Откройте нужное.',

  'sim.pill.why':
    'Вещества и миллиграммы отмеченного препарата — это именно то, что получает движок. Отметьте больше одного, чтобы запустить их как сравнительные варианты.',
  'sim.subject.why':
    'Пациент задаёт функцию почек, генотип печени и заболевания, которые считывают правила — именно это решает, будет ли доза препарата снижена, будет ли он предпочтителен или полностью отклонён.',
  'sim.run.why':
    'Запуск передаёт концентрацию в плазме, вовлечённость мишени и артериальное давление на протяжении выбранного периода. Всё ниже этой карточки считывается из этих кадров.',
  'sim.run.groupTitle': 'Запустите',

  'sim.act.checkPill': 'Препарат отмечен',
  'sim.act.checkPatient': 'Пациент выбран',
  'sim.act.checkRun': 'Симуляция запущена',
  'sim.act.noPillConsequence':
    'Ни один препарат не загружен, поэтому движку нечего дать пациенту. Составьте препарат, и он появится в этом списке.',

  'sim.demos.title': 'Готовые демонстрации',
  'sim.demos.why':
    'Каждая настраивает препарат, пациента и период, чтобы показать одно из свойств модели, и запускает симуляцию за вас.',

  'sim.section.curves': 'Кривые во времени',
  'sim.section.body': 'Тело, во всю ширину',
  'sim.section.alternatives': 'Ранжированные альтернативы',
  'sim.section.bestDose': 'Лучшая доза',
  'sim.section.rulesTables': 'Правила и таблицы экспозиции',
  'sim.section.compare': 'Сравнить прогоны',

  'sim.detail.weights': 'Веса оценки',
  'sim.detail.engine': 'Движок, данные и настройки запуска',
  'sim.detail.limits': 'Что эта модель не отражает',

  'sim.next.title': 'Куда дальше',
  'sim.next.desc':
    'Измените препарат или пациента и запустите снова, либо перенесите этот результат на другую страницу.',

  // -------------------------------------------------------- subject page zones
  'subject.zone.act': 'Выберите или создайте пациента',
  'subject.zone.actLead':
    'Пациент — это набор входных данных. Всё, что продукт показывает о нём, вычисляется из них, поэтому это единственное место, где пациент изменяется.',
  'subject.zone.answer': 'Двойник, который подразумевает этот пациент',
  'subject.zone.answerLead':
    'Физиология, с которой начинается каждая симуляция для этого пациента, до введения любого препарата.',
  'subject.zone.evidence': 'Что изменили заболевания',
  'subject.zone.evidenceLead':
    'Включение заболевания сдвигает именованные переменные состояния на заметные величины. Вот те, что оно сдвинуло.',
  'subject.zone.detail': 'Мелкий шрифт',
  'subject.zone.detailLead':
    'Полное вычисленное состояние, журнал изменений модификаторов и предупреждения расчёта.',
  'subject.editor.zoneAct': 'Изменить этого пациента',
  'subject.editor.zoneActLead':
    'Каждая группа ниже поясняет, что продукт с ней делает. Измените значение — и двойник под ней изменится на ваших глазах.',
  'subject.editor.continue': 'Перейти к симуляции',

  'subject.group.whoWhy':
    'Возраст и пол масштабируют клиренс и входят в уравнение eGFR. Флаг беременности — это жёсткий барьер: ингибитор АПФ или БРА вообще не моделируются для беременной пациентки.',
  'subject.group.bodyWhy':
    'Вес и рост задают площадь поверхности тела, общую воду организма и аллометрический масштаб клиренса — вместе они определяют объём, в котором распределяется доза, и скорость её выведения.',
  'subject.group.circulationWhy':
    'Давление и частота сердечных сокращений без лечения — это исходный уровень, относительно которого измеряется каждое смоделированное изменение, и из них вычисляются среднее давление, сердечный выброс и сосудистое сопротивление.',
  'subject.group.kidneyWhy':
    'Креатинин сыворотки задаёт функцию почек (eGFR), что и определяет, будет ли доза препарата, выводимого почками, снижена или его следует избегать для этого пациента.',
  'subject.group.genotypeWhy':
    'CYP2D6 задаёт печёночные ворота, через которые должна пройти каждая доза метопролола. Медленный метаболизатор при стандартной дозе достигает концентрации, при которой препарат перестаёт быть β1-селективным; нормальный метаболизатор — нет.',
  'subject.group.conditionsWhy':
    'Заболевание применяет набор модификаторов, сдвигающих именованные переменные состояния. Именно эти сдвинутые переменные считывают правила и движок — сама по себе метка ничего не меняет.',
  'subject.group.conditionsNoneConsequence':
    'Нет заболеваний — двойник будет здоровым взрослым этого возраста и веса.',
  'subject.emptyLibrary':
    'Нет пациентов — симулировать некого. Добавьте пациента или восстановите готовые сценарии.',

  'subject.headline.title': 'Вычисленный двойник',
  'subject.headline.untreated':
    'Без лечения. Каждая концентрация препарата и каждая вовлечённость мишени в этом состоянии равны нулю, то есть это тело до первой дозы.',
  'subject.headline.noneSelected':
    'Пациент не выбран, поэтому ничего не вычислено. Выберите пациента выше, и здесь появится его двойник.',
  'subject.form.quickJumpAria': 'Перейти к группе в этой форме',
  'subject.completeness': (v: Vars) => `${v.n} из 6 групп просмотрено`,

  // -------------------------------------------------- UI-C: hardcoded-string pass
  'sim.alert.syntheticTitle': 'Заглушка движка.',
  'sim.alert.syntheticBody': 'Каждая кривая, оценка и вероятность на этом экране — это форма, а не измерение.',
  'sim.alert.dataErrorTitle': 'Файлы данных не загрузились.',
  'sim.alert.dataErrorBody': (v: Vars) =>
    `${v.message} — двойника нельзя вывести, и ни одно правило не сработает. Ничего на этой странице не следует читать, пока это не исправлено.`,
  'sim.chart.logAxis': 'Логарифмическая ось концентрации',
  'sim.chart.showParent': 'Показать исходный лозартан (отдельная ось)',
  'sim.chart.framesStreamed': (v: Vars) => `${v.n} кадров${v.streaming ? ' · передача' : ''}`,
  'sim.bench.comboTitle': 'Рейтинг комбинаций — все десять пар',
  'sim.bench.doseTitle': 'Лучшая доза — лестница амлодипина',
  'sim.bench.labelAsStated': 'В инструкции сказано:',
  'sim.tray.tickToOverlay': 'Отметьте завершённый запуск, чтобы наложить его пунктиром на графики.',
  'sim.tray.day': (v: Vars) => (v.steadyState ? 'день 8' : 'день 1'),
  'sim.weights.rerankNote': 'Пересчитывает уже смоделированные варианты. Рейтинг выше меняется по мере перетаскивания.',
  'sim.weights.runBenchFirst': 'Сначала запустите набор сравнений — пока нечего пересчитывать.',
  'sim.detail.engineLabel': (v: Vars) => `Движок: ${v.source}${v.worker ? ' (Web Worker)' : ''}`,
  'sim.detail.engineNotProbed': 'Движок: ещё не проверен',
  'sim.detail.loadingData': ' · загрузка файлов данных…',
  'sim.detail.dataLoaded': ' · файлы данных загружены',
  'sim.next.buildSubject': 'Создать пациента',

  'sim.report.disclaimerAria': 'Предупреждение',
  'sim.report.endOfRunAria': 'Отчёт по завершении запуска',
  'sim.report.hHorizon': (v: Vars) => `горизонт ${v.h} ч`,
  'sim.report.steadyStateInitial': 'начальные условия — стационарное состояние',
  'sim.report.firstDoseInitial': 'начальные условия — первая доза',
  'sim.report.singleTwin': 'один двойник',
  'sim.report.virtualSubjects': (v: Vars) => `${v.n} виртуальных пациентов`,
  'sim.report.framesEmittedCount': (v: Vars) => `${v.n} кадров`,
  'sim.report.effectTroughPeak': (v: Vars) => ` · отношение эффекта пик:минимум ${v.value}`,
  'sim.report.periodDays': (v: Vars) => `${v.days} дней`,
  'sim.report.periodHours': (v: Vars) => `${v.h} часов`,
  'sim.report.singleVirtualTwin': 'один виртуальный двойник',
  'sim.report.fromSteadyState': 'от стационарного состояния',
  'sim.report.fromFirstDose': 'от первой дозы',
  'sim.report.ledeSentence': (v: Vars) =>
    `За ${v.period} ${v.basis} ${v.regimen} изменил систолическое давление на ${v.dsbp} мм рт.ст. и диастолическое на ${v.ddbp} мм рт.ст. у ${v.who}. Калий сыворотки составил ${v.k} ммоль/л, креатинин — ${v.cr} мг/дл.`,
  'sim.report.unitSystolic': 'мм рт.ст., систолическое',
  'sim.report.unitDiastolic': 'мм рт.ст., диастолическое',
  'sim.report.unitSerumK': 'ммоль/л, калий сыворотки',
  'sim.report.unitCreatinine': 'мг/дл, креатинин',
  'sim.report.spreadP': (v: Vars) => `P05 ${v.p05} · P95 ${v.p95}`,

  'sim.topcombos.ariaLabel': 'Топ-5 комбинаций доз',
  'sim.topcombos.noPatientPre': 'Пациент ещё не выбран, поэтому рейтинг составлен для',
  'sim.topcombos.typicalAdultFallback': 'типичного взрослого с нелеченой гипертонией',
  'sim.topcombos.noPatientPost':
    '— эталонного пациента по умолчанию. Выберите пациента в настройке выше, и этот список пересчитается для него.',
  'sim.topcombos.rankedFor': (v: Vars) => `Ранжировано для ${v.subject}.`,
  'sim.topcombos.everyDrugNote': (v: Vars) =>
    ` Каждый дозируемый препарат в каждой лицензированной дозе, отдельно и в неупорядоченных парах — ${v.total} кандидатов, оценённых аналитически (без симуляции) за миллисекунды и пересчитываемых при смене пациента. Ранжировано по прогнозируемому снижению давления с поправкой на неблагоприятную нагрузку, а не по чистой эффективности.`,
  'sim.topcombos.excludedNote': (v: Vars) =>
    `${v.excluded} из ${v.total} кандидатов полностью заблокированы для этого пациента (ранг 7 — например, ингибитор АПФ или БРА при беременности). Всё остальное, включая двойную блокаду РААС, ранжировано ниже по существу.`,
  'sim.topcombos.rerankedFor': (v: Vars) => `Пересчитано для ${v.subject}`,
  'sim.topcombos.rerankedAgainst': 'относительно эталонного взрослого по умолчанию.',
  'sim.topcombos.moreBlocked': (v: Vars) =>
    `Для этого пациента заблокировано ещё ${v.n} кандидатов по сравнению с эталонным взрослым. `,
  'sim.topcombos.droppedTop5': (v: Vars) => `Выбыли из топ-5: ${v.list}. `,
  'sim.topcombos.newTop5': (v: Vars) => `Новые в топ-5: ${v.list}.`,
  'sim.topcombos.tagDualRaas': 'двойная блокада РААС',
  'sim.topcombos.tagBetaRas': 'пересечение бета- и РАС-блокаторов',
  'sim.topcombos.tagDoseExtrapolated': 'доза экстраполирована',
  'sim.topcombos.reasonPrimary': (v: Vars) =>
    `Прогнозируется ${v.dsbp} мм рт.ст. систолическое, ${v.ddbp} мм рт.ст. диастолическое снижение с поправкой на штраф за неблагоприятную нагрузку в ${v.burden} балла — наибольшее снижение давления не всегда лучший выбор.`,
  'sim.topcombos.reasonDualRaas':
    'Двойная блокада РААС — ингибитор АПФ и БРА действуют на один и тот же насыщаемый путь, поэтому второй препарат даёт немного дополнительного снижения, добавляя собственный риск. Показано здесь, а не скрыто: в этом и смысл.',
  'sim.topcombos.reasonBetaRas':
    'Бета-блокатор плюс ингибитор РАС: часть эффекта бета-блокатора конкурирует с ингибитором РАС за то же пространство подавления ренина.',
  'sim.topcombos.reasonExtrapolated': (v: Vars) =>
    `Доза вне проверенного диапазона 0.25×–4× для ${v.drugs} — эффект ограничен краем аппроксимации, а не экстраполирован за него.`,

  'sim.ai.panelAria': 'ИИ-рассуждение',
  'sim.ai.mark': 'AI',

  'sidebar.primaryNav': 'Главная навигация',

  'substances.metaboliteTag': 'Метаболит',
  'substances.valuePlaceholderNone': 'нет',
  'substances.editedTitle': 'Вы изменили это значение; это не исходное значение из источника.',

  // ---------------------------------------------------------- organ illustrations (Agent ORGANS)
  'organ.common.notModelledInBuild': (v: Vars) => `${v.what} — не моделируется в этой версии`,

  'organ.badges.header': 'Каналы побочных эффектов',
  'organ.badges.firingCount': (v: Vars) => `${v.n} активно`,
  'organ.badges.noneFiring': 'Ни один канал побочных эффектов не превышает порог срабатывания.',
  'organ.badges.noRun': 'Симуляция не выполняется.',
  'organ.badges.rare': 'редко',
  'organ.badges.drivenBy': 'Вызвано:',
  'organ.badges.reportedIncidence': 'Заявленная частота:',
  'organ.badges.thresholdNote': (v: Vars) =>
    `Пороги срабатывания θ_on ${v.on} / θ_off ${v.off} — визуальные настроечные константы, а не клинические пороги.`,

  'organ.selectivity.title': 'Селективность β1 / β2',
  'organ.selectivity.ariaLabel': 'Селективность метопролола',
  'organ.selectivity.svgTitle': 'Концентрация метопролола в плазме относительно порога потери β1-селективности',
  'organ.selectivity.beta1Cardiac': 'β1 сердечный',
  'organ.selectivity.beta2Airway': 'β2 дыхательные пути',
  'organ.selectivity.measuredAnchor': 'измеренная точка отсчёта при 100 мг 2 раза в сутки:',
  'organ.selectivity.cyp2d6NotModelled': 'Ёмкость CYP2D6 не моделируется',
  'organ.selectivity.cyp2d6Value': (v: Vars) => `Ёмкость CYP2D6 ${v.value} × от нормы`,
  'organ.selectivity.concNotModelled': 'Концентрация метопролола не моделируется в этой версии.',
  'organ.selectivity.aboveCrossover': (v: Vars) =>
    `Выше порога. β1-селективность снижается, а β2-блокада нарастает — канал дыхательных путей активен${v.suffix}.`,
  'organ.selectivity.bradycardicSuffix': ', а частота сердечных сокращений в брадикардическом диапазоне',
  'organ.selectivity.belowCrossover':
    'Ниже порога. У этого пациента при этой концентрации препарат ведёт себя как β1-селективный.',
  'organ.selectivity.sourceSummary': 'Откуда взято 80.2 нг/мл',
  'organ.selectivity.sourceNote':
    'Порог — это концентрационные ворота, а не свойство дозы, поэтому он зависит от генотипа. Медленный метаболизатор CYP2D6 может пересечь его при стандартной дозе, тогда как нормальный метаболизатор останется значительно ниже.',

  'organ.adrenal.title':
    'Кора надпочечника — наружный слой (клубочковая зона). Цвет слоя связан с mediators.aldosterone_fold. «Прорыв» альдостерона за недели не моделируется в этой версии.',
  'organ.adrenal.cortexLabel': 'наружный слой (клубочковая зона)',
  'organ.adrenal.aldosteroneNotModelled': 'альдостерон не моделируется',
  'organ.adrenal.aldosteroneValue': (v: Vars) => `альдостерон ${v.value} × от исходного уровня`,
  'organ.adrenal.cortexTitle':
    'Тканевый уровень (T3). Лизиноприл блокирует выработку сигнала; лозартан — его приём. Один и тот же итог, два разных шага одного каскада.',
  'organ.adrenal.raasAndThiazide': 'Блокада РААС и тиазид действуют в противоположных направлениях',
  'organ.adrenal.raasOnly': 'поток истончается → K⁺ перестаёт покидать собирательную трубочку',
  'organ.adrenal.thiazideOnly': 'снижение объёма → активация РААС → K⁺ теряется вдвойне',
  'organ.adrenal.raasAriaLabel': 'Каскад РААС',
  'organ.adrenal.raasTitle': 'Каскад ренин–ангиотензин–альдостерон со стоп-барами препаратов',
  'organ.adrenal.reninRising': 'ренин растёт, пока давление падает — это ожидаемо, а не сбой',
  'organ.adrenal.stopBarNotModelled': (v: Vars) =>
    `Блокада ${v.label} не моделируется — высота столбика отражает долю связывания.`,
  'organ.adrenal.stopBarValue': (v: Vars) =>
    `Блокада ${v.label} ${v.pct} % — высота столбика отражает долю связывания.`,

  'organ.vessels.conduitTitle':
    'Магистральные артерии. Цвет стенки связан с общим сосудистым сопротивлением (bip(norm(svr, 700, 2200), 0.5, 0.5)); синий = сопротивление снижено.',
  'organ.vessels.resistanceTitle':
    'Единица сопротивления. Калибр прекапиллярной артериолы связан с haemo.arteriolar_radius_index, а посткапиллярной венулы — с haemo.venous_tone_index. Амлодипин заметно меняет первую и почти не меняет вторую — эта асимметрия и есть механизм отёка.',
  'organ.vessels.precapillary': 'прекапиллярная артериола',
  'organ.vessels.postcapillary': 'посткапиллярная венула',
  'organ.vessels.notModelled': 'не моделируется',
  'organ.vessels.timesBaseline': (v: Vars) => `${v.value} × от исходного уровня`,
  'organ.vessels.capillaryPressureLabel': 'капиллярное гидростатическое давление',
  'organ.vessels.capillaryPressureNotModelled': '— не моделируется',
  'organ.vessels.capillaryPressureValue': (v: Vars) => `${v.value} × от исходного уровня (относительно)`,
  'organ.vessels.tierNote': 'тканевый уровень (T3) — механизм выведен логически, клеточная популяция не названа',

  'organ.lungs.title':
    'Лёгкие. Плотность лёгочной капиллярной сети связана с engagement.ace_inhibition_pulmonary; калибр дыхательных путей — с engagement.beta2_occupancy. Механизм выведен логически (T3) — показан на тканевом уровне, клеточная популяция не названа.',
  'organ.lungs.capillaryBedTitle': 'Лёгочное капиллярное русло — АПФ ингибирован там, где проходит весь сердечный выброс.',
  'organ.lungs.hazeTitle':
    'Брадикинин и субстанция P накапливаются — оба являются субстратами АПФ. Это сенсибилизирует чувствительные нервы дыхательных путей; это канал кашля, и он отсроченный, а не при первой дозе.',
  'organ.lungs.airwayTitle':
    'Бронхиальное дерево. Просвет = база × (1 − 0.45 × beta2_occupancy). Коэффициент 0.45 — ОЦЕНОЧНАЯ визуальная константа; сама занятость бета-2 — источниковый сигнал.',
  'organ.lungs.noBradykinin': 'накопления брадикинина нет — канала кашля нет',
  'organ.lungs.beta2AirwayLabel': 'β2 (дыхательные пути)',
  'organ.lungs.fev1NotModelled': 'ОФВ₁ —',
  'organ.lungs.fev1Value': (v: Vars) => `ОФВ₁ ${v.value} % от исходного уровня (без лечения)`,
  'organ.lungs.tierNote': 'тканевый уровень (T3) — механизм выведен логически',

  'organ.heart.title':
    'Сердце — частота сокращений связана с haemo.hr, сила сокращения — с haemo.contractility_index, цвет — с блокадой бета-1 и симпатическим тонусом. Показано на тканевом уровне (T2).',
  'organ.heart.saNodeTitle':
    'Синоатриальный узел (область). Уровень T2 — показан на тканевом уровне. По данным HPA на уровне отдельных клеток ADRB1 — «клеточный тип усилен», tau 0.79, лидирует цитотрофобласт, поэтому здесь клеточная популяция не названа.',
  'organ.heart.hrNotModelled': 'ЧСС —',

  'organ.periphery.oedemaNotModelled': 'отёк —',
  'organ.periphery.pitting': (v: Vars) => `питтинг ${v.grade}/3`,
  'organ.periphery.dependentOedema': 'гравитационный отёк',
  'organ.periphery.coldExtremity': 'холодная конечность',
  'organ.periphery.notModelledTitle': 'Зависимая конечность — интерстициальный объём не моделируется в этой версии.',
  'organ.periphery.pittingTitle': (v: Vars) =>
    `Интерстиций зависимой конечности. Степень питтинга ${v.grade} из 3 (презентационный мостик от interstitial_volume_index, а не измерение). Нажмите, чтобы продавить.`,
  'organ.periphery.capPressure': (v: Vars) => `кап. давление ${v.value} × от исходного уровня`,
  'organ.periphery.explainerHeading': (v: Vars) => `Периферический отёк, степень ${v.grade} из 3`,
  'organ.periphery.explainerLead':
    'Прекапиллярные артериолы расширяются без соответствующего изменения посткапиллярных венул, поэтому капиллярное гидростатическое давление повышается, и жидкость перемещается в интерстиций в местах, куда её тянет сила тяжести. Это',
  'organ.periphery.explainerNot': 'не',
  'organ.periphery.explainerTail': 'задержка соли и воды.',
  'organ.periphery.thiazideNegative':
    'Тиазид принят, а отёк почти не изменился — он не воздействует на этот механизм. Показ лечения, которое не работает, сделан намеренно.',
  'organ.periphery.raasPositive':
    'Блокатор РААС принят, он расширяет и посткапиллярную сторону, частично восстанавливая баланс пре/пост, поэтому отёк спадает. Направление хорошо обосновано; процент не приводится, поскольку первичный источник величины не найден.',

  'organ.gauges.potassiumLabel': 'Калий сыворотки',
  'organ.gauges.potassiumNote':
    'Тиазид его теряет; ингибитор АПФ и БРА его удерживают. При комбинации эти эффекты частично компенсируют друг друга.',
  'organ.gauges.urateLabel': 'Урат сыворотки',
  'organ.gauges.urateNote':
    'Ингибирование URAT1 лозартаном снижает его; сокращение объёма на тиазиде повышает его. Противоположные стрелки у одного пациента.',
  'organ.gauges.sodiumLabel': 'Натрий сыворотки',
  'organ.gauges.sodiumNote': 'Риск задержки воды на тиазиде.',
  'organ.gauges.creatinineLabel': 'Креатинин сыворотки',
  'organ.gauges.notModelled': 'не моделируется',
  'organ.gauges.reference': 'норма',

  'organ.figure.restingBaseline': 'Состояние покоя — не результат симуляции.',
  'organ.figure.untreated': 'Без лечения — ни один препарат не принят.',
  'organ.figure.testSubject': 'Испытуемый пациент',
  'organ.figure.haltedShort': 'Остановлено жёстким ограничением.',
  'organ.figure.haltedFull': 'Симуляция остановлена жёстким ограничением.',
  'organ.figure.contraindicatedNote': 'Была запрошена противопоказанная комбинация.',
  'organ.figure.kidneyPanelTitle': 'Почки — сегменты нефрона',
  'organ.figure.kidneyPanelNote':
    'Четыре препарата, четыре анатомически разных участка, все видны одновременно. Мишень тиазида и мишени РААС находятся в разных сегментах — в этом и суть.',
  'organ.figure.t1NoteMid': '— единственная клеточная популяция, названная где-либо в этом интерфейсе.',
  'organ.figure.t1NoteTail': 'Все остальные мишени показаны на тканевом уровне.',
  'organ.figure.liverPanelTitle': 'Печень — три фермента CYP',
  'organ.figure.liverPanelNote': 'Где персонализация становится видимой.',
  'organ.figure.raasPanelTitle': 'Каскад РААС',
  'organ.figure.raasPanelNote': 'Два стоп-бара на одном каскаде — это случай двойной блокады.',
  'organ.figure.resistancePanelTitle': 'Единица сопротивления',
  'organ.figure.resistancePanelNote': 'Артериола против венулы — асимметрия, вызывающая гравитационный отёк.',
  'organ.figure.disclaimer':
    'Исследовательский симулятор. Не инструмент клинического решения и не рекомендация по лечению. Некалиброванные проксисигналы — особенно внутриклубочковое давление — показаны только как относительные индексы и никогда в абсолютных единицах.',
  'organ.figure.noDrugOnBoard': 'ни один препарат не принят',

  'organ.liver.outlineTitle': 'Печень — три реактора CYP. Работающие ферменты отмечаются, а не заставлены светиться.',
  'organ.liver.gateNotModelled': 'Ворота CYP2D6 —',
  'organ.liver.gateValue': (v: Vars) => `Ворота CYP2D6 ${v.value}×`,
  'organ.liver.reactorsAriaLabel': 'Печёночные реакторы CYP',
  'organ.liver.reactorsTitle': 'Печёночные реакторы CYP — CYP3A4, CYP2C9, CYP2D6',
  'organ.liver.portalVein': 'воротная вена',
  'organ.liver.hepaticVein': 'печёночная вена',
  'organ.liver.cyp3a4Sub': 'специфичен для печени, 3367.1 nTPM',
  'organ.liver.cyp3a4Title':
    'CYP3A4 (P08684). Путь амлодипина, с небольшим вкладом лозартана. Когда присутствуют оба препарата, реактор общий — направление обосновано, но количественная величина взаимодействия не подтверждена источником, поэтому число не показано.',
  'organ.liver.sharedReactor': 'общий реактор — очередь',
  'organ.liver.cyp2c9Sub': 'специфичен для печени, 1607.6 nTPM',
  'organ.liver.cyp2c9Title':
    'CYP2C9 (P11712) превращает лозартан в EXP3174, более мощный активный метаболит. Период полувыведения исходного вещества ~2 ч; метаболита 6–9 ч (инструкция FDA).',
  'organ.liver.exp3174MorePotent': 'EXP3174 · более мощный',
  'organ.liver.cyp2d6Sub': 'специфичен для печени, 386.2 nTPM',
  'organ.liver.cyp2d6Title':
    'CYP2D6 (P10635). Полиморфный. Ширина ворот связана с liver.cyp2d6_capacity_fold: одна и та же доза метопролола даёт две заметно разные анимации у двух пациентов.',
  'organ.liver.gateApertureTitle': (v: Vars) =>
    `Ширина ворот CYP2D6 = clamp(cyp2d6_capacity_fold, 0.05, 2.0) x ${v.base} px. Сейчас: ${v.pheno}.`,
  'organ.liver.gateShort': (v: Vars) => `ворота ${v.value}`,
  'organ.liver.passthrough': 'не метаболизируется в этой модели — проходит без изменений',
  'organ.liver.fluxNotModelled': 'поток —',
  'organ.liver.fluxValue': (v: Vars) => `${v.value} мг/ч`,
  'organ.liver.notModelled': 'не моделируется',
  'organ.liver.ultrarapid': 'ультрабыстрый метаболизатор',
  'organ.liver.normal': 'нормальный метаболизатор',
  'organ.liver.intermediate': 'промежуточный метаболизатор',
  'organ.liver.poor': 'медленный метаболизатор',

  'organ.kidney.outlineTitle':
    'Почка. Цвет привязан к renal.p_glomerular (ПРОКСИ — некалиброван, показан только как относительный индекс). Фильтрация никогда не отображается в абсолютных единицах давления.',
  'organ.kidney.egfrNotModelled': 'eGFR —',
  'organ.kidney.nephronAriaLabel': 'Схематичный нефрон',
  'organ.kidney.nephronTitle': 'Схематичный нефрон с четырьмя сегментами, на которые действуют препараты',
  'organ.kidney.dualRaasTitle':
    'Двойная блокада РААС: суммарное расширение выносящей артериолы, непропорциональное снижение СКФ и рост калия. Постоянное наложение согласно §13.',
  'organ.kidney.dualRaasLabel': 'двойная блокада РААС',
  'organ.kidney.afferentArteriole': 'приносящая артериола',
  'organ.kidney.notModelled': 'не моделируется',
  'organ.kidney.timesBaseline': (v: Vars) => `${v.value} × от исходного уровня`,
  'organ.kidney.afferentTitle':
    'Эталонный сосуд. Амлодипин расширяет его слабо; препараты РААС действуют на выносящей стороне.',
  'organ.kidney.jgaTitle':
    'Юкстагломерулярный аппарат — место выработки ренина. При блокаторе РААС ренин РАСТЁТ, пока давление падает. Это ожидаемая компенсаторная реакция, а не сбой препарата. Лозартан 100 мг увеличивает активность ренина плазмы в два-три раза (инструкция FDA).',
  'organ.kidney.reninNotModelled': 'ренин —',
  'organ.kidney.reninValue': (v: Vars) => `ренин ${v.value} ×`,
  'organ.kidney.glomerulusTitle':
    'Клубочковый капиллярный пучок. Цвет привязан к renal.p_glomerular — это индекс уровня ПРОКСИ, некалиброванный, поэтому он показан как относительное значение и никогда в мм рт.ст.',
  'organ.kidney.glomerulus': 'клубочек',
  'organ.kidney.pGlomNotModelled': 'P_glom не моделируется',
  'organ.kidney.pGlomValue': (v: Vars) => `P_glom ${v.value} × от исходного уровня (некалиброван)`,
  'organ.kidney.pGlomTitle':
    'renal.p_glomerular — уровень ПРОКСИ. Он управляет анимацией почечной защиты, но не откалиброван, поэтому никогда не отображается в абсолютных единицах.',
  'organ.kidney.efferentArteriole': 'выносящая артериола',
  'organ.kidney.efferentTitle':
    'Лизиноприл и лозартан расширяют именно этот сосуд, тогда как приносящая артериола остаётся прежней. Именно это снижает внутриклубочковое давление — и вызывает острое снижение eGFR.',
  'organ.kidney.aceRenalLabel': 'ACE (почка)',
  'organ.kidney.proximalTubule': 'проксимальный каналец',
  'organ.kidney.naReabsorbed': (v: Vars) => `Реабсорбция Na⁺ ${v.value}`,
  'organ.kidney.proximalTitle':
    'Проксимальный извитой каналец. Апикальная локализация URAT1 (SLC22A12) здесь классическая, но не подтверждена на клеточном уровне в наших источниках. Уровень T2 — клеточная популяция не названа.',
  'organ.kidney.urateNotModelled': 'урат —',
  'organ.kidney.urateOut': 'урат → наружу',
  'organ.kidney.urateBackIn': 'урат ← обратно',
  'organ.kidney.uricosuric': '(урикозурическое)',
  'organ.kidney.retained': '(удерживается)',
  'organ.kidney.thickAscendingLimb': 'толстый восходящий отдел',
  'organ.kidney.thickAscendingTitle': 'Эталонный сегмент — ни один препарат из этого набора здесь не действует.',
  'organ.kidney.dctTitle': (v: Vars) =>
    `Дистальный извитой каналец. ${v.protein} / ${v.gene} (${v.uniprot}) в ${v.cellPopulation}. ${v.evidence}. ${v.source}. Это единственная мишень во всём наборе препаратов с доказательствами на уровне отдельных клеток, и поэтому единственное место в этом интерфейсе, где названа клеточная популяция.`,
  'organ.kidney.distalConvolutedTubule': 'дистальный извитой каналец',
  'organ.kidney.distalConvolutedTubuleCells': 'клетки дистального извитого канальца · NCC / SLC12A3',
  'organ.kidney.naReabsorbedHere': (v: Vars) => `Реабсорбция Na⁺ здесь ${v.value} · мишень тиазида`,
  'organ.kidney.cdTitle':
    'Соединительный каналец и собирательная трубочка. Увеличенная доставка натрия в дистальный отдел усиливает обмен Na⁺/K⁺, из-за чего калий покидает организм — это побочный эффект, возникающий из самого терапевтического механизма. Механизм выведен логически (T3): здесь клеточная популяция не названа.',
  'organ.kidney.collectingDuct': 'собирательная трубочка',
  'organ.kidney.inferredT3': 'выведено логически (T3)',
  'organ.kidney.kStatus': (v: Vars) => `K⁺ ${v.value}`,
  'organ.kidney.wasting': 'теряется',
  'organ.kidney.retained2': 'удерживается',
  'organ.kidney.baseline': 'исходный уровень',
  'organ.kidney.ureter': 'мочеточник',
  'organ.kidney.rampKey': 'понижен · без лечения · повышен или в стрессе',

  // ---------------------------------------------------- organ.affected (AffectedAnatomy)
  'organ.affected.ariaNone': 'Фигура человека — нет смоделированного действия на органы',
  'organ.affected.ariaActing': (v: Vars) =>
    `Фигура человека с подсвеченными органами, на которые действуют ${v.list}`,
  'organ.affected.noneTitle': 'Нет смоделированного действия на органы.',
  'organ.affected.nothingSelected': 'Пока ничего не выбрано.',
  'organ.affected.excipientNote': (v: Vars) =>
    `${v.names} — это ${ruPlural(Number(v.count), 'вспомогательное вещество', 'вспомогательных вещества', 'вспомогательных веществ')}: они формируют таблетку, а не действуют на пациента.`,
  'organ.affected.noOrganAction': (v: Vars) => `Нет действия на органы: ${v.names}.`,
  'organ.affected.siteCount': (v: Vars) =>
    `${v.n} ${ruPlural(Number(v.n), 'участок', 'участка', 'участков')}`,
  'organ.affected.moreHere': (v: Vars) => `и ещё ${v.n} здесь`,
  'organ.affected.and': 'и',

  // -------------------------------------------------------- organ.bodyFigure (BodyFigure)
  'organ.bodyFigure.ariaLabel': 'Фигура человека с эффектами препаратов на уровне органов',
  'organ.bodyFigure.titleFull': 'Фигура человека с эффектами препаратов на уровне органов, привязанными к шине эффектов',
  'organ.bodyFigure.pregnancyBarrierTitle':
    'Токсичность для плода. Ингибитор АПФ или БРА противопоказан при беременности — симуляция не запускается. Анимировать кривую дозы для противопоказанного препарата было бы неверным посылом медицинского симулятора.',
  'organ.bodyFigure.coldExtremitiesTitle': 'Холодные конечности — сниженная периферическая перфузия на бета-блокаторе.',
  'organ.bodyFigure.lungsTitle': 'Лёгкие',
  'organ.bodyFigure.lungsHint':
    'Калибр дыхательных путей связан с β2-занятостью; капиллярная сеть — с лёгочным ингибированием АПФ. Тканевый уровень (T3).',
  'organ.bodyFigure.fev1NotModelled': 'ОФВ₁ не моделируется',
  'organ.bodyFigure.beta2Airway': (v: Vars) => `β2 дыхательные пути ${v.value} %`,
  'organ.bodyFigure.noCoughChannel': 'нет канала кашля',
  'organ.bodyFigure.liverTitle': 'Печень',
  'organ.bodyFigure.liverHint':
    'Апертура ворот CYP2D6 задаётся генотипом и определяет, останется ли стандартная доза метопролола ниже 80.2 нг/мл.',
  'organ.bodyFigure.gateNotModelled': 'Ворота CYP2D6 —',
  'organ.bodyFigure.cyp2d6GateNormal': (v: Vars) => `Ворота CYP2D6 ${v.value} × нормы`,
  'organ.bodyFigure.kidneysTitle': 'Почки',
  'organ.bodyFigure.kidneysHint':
    'Внутриклубочковое давление — индекс уровня ПРОКСИ и никогда не показывается в абсолютных единицах. eGFR показывается.',
  'organ.bodyFigure.egfrNotModelled': 'eGFR не моделируется',
  'organ.bodyFigure.urineNotModelled': 'моча не моделируется',
  'organ.bodyFigure.urineValue': (v: Vars) => `моча ${v.value} мл/ч`,
  'organ.bodyFigure.limbsTitle': 'Отвисающие конечности',
  'organ.bodyFigure.limbsHint': 'Места, зависящие от силы тяжести. Нажмите на конечность, чтобы продавить отёк.',
  'organ.bodyFigure.oedemaNotModelled': 'отёк не моделируется',
  'organ.bodyFigure.pitting': (v: Vars) => `ямочный отёк ${v.grade} / 3`,
  'organ.bodyFigure.dependentOedema': 'гравитационный отёк',
  'organ.bodyFigure.dizzinessTitle': 'Ортостатическое головокружение',
  'organ.bodyFigure.dizzinessHint':
    'Поза фигуры неустойчива, пока hazards.dizziness_orthostatic выше порога срабатывания.',
  'organ.bodyFigure.standingToleranceDown': 'переносимость вертикального положения ↓',
  'organ.bodyFigure.heartTitle': 'Сердце',
  'organ.bodyFigure.heartHint':
    'Частота сокращений связана с haemo.hr, сила — с haemo.contractility_index. Тканевый уровень (T2).',
  'organ.bodyFigure.hrNotModelled': 'ЧСС не моделируется',
  'organ.bodyFigure.bradycardicLt50': 'брадикардия (< 50)',
  'organ.bodyFigure.coNotModelled': 'сердечный выброс не моделируется',
  'organ.bodyFigure.adrenalTitle': 'Кора надпочечника',
  'organ.bodyFigure.adrenalHint':
    'Наружный слой (клубочковая зона), тканевый уровень (T3). «Прорыв» альдостерона за недели не моделируется.',
  'organ.bodyFigure.aldosteroneNotModelled': 'альдостерон —',
  'organ.bodyFigure.aldosteroneValue': (v: Vars) => `альдостерон ${v.value} ×`,
  'organ.bodyFigure.conduitTitle': 'Магистральные артерии',
  'organ.bodyFigure.conduitHint': 'Цвет стенки связан с общим сосудистым сопротивлением. Синий означает снижение сопротивления.',
  'organ.bodyFigure.bpNotModelled': 'АД не моделируется',
  'organ.bodyFigure.svrNotModelled': 'SVR не моделируется',

  // ------------------------------------------------------------- organ.plate (scenePlates)
  'organ.plate.traceBuilds': 'кривая формируется по мере выполнения',

  // ---------------------------------------------------- organ.journeyPlate (scenePlates)
  'organ.journeyPlate.routeKidneyUnchanged': 'почка · без изменений',
  'organ.journeyPlate.routeLiverCyp2c9': 'печень · CYP2C9',
  'organ.journeyPlate.routeMadeInLiver': 'образуется в печени',
  'organ.journeyPlate.routeLiverCyp3a4': 'печень · CYP3A4',
  'organ.journeyPlate.routeLiverCyp2d6': 'печень · CYP2D6',
  'organ.journeyPlate.noteLisinopril': 'не метаболизируется — выводится с мочой в неизменном виде',
  'organ.journeyPlate.noteLosartan': 'превращается в EXP3174, более мощный блокатор',
  'organ.journeyPlate.noteExp3174': 'никогда не принимается внутрь — образуется из лозартана по пути',
  'organ.journeyPlate.noteAmlodipine': 'интенсивно метаболизируется — медленно выводится',
  'organ.journeyPlate.noteHctz': 'в этой модели не метаболизируется',
  'organ.journeyPlate.noteMetoprolol': 'генотип определяет размер ворот',
  'organ.journeyPlate.routeTitle':
    'Путь, который проходит проглоченная доза. Плотность спрайтов на циркулирующих сегментах — это концентрация препарата в плазме в данном кадре; сегменты глотания и воротной вены нарисованы пунктирным маршрутом, потому что транзит через кишечник в этой версии не моделируется.',
  'organ.journeyPlate.swallowed': 'проглочено',
  'organ.journeyPlate.routeOnly': 'только маршрут',
  'organ.journeyPlate.firstPass': 'первое прохождение',
  'organ.journeyPlate.inBlood': 'в крови',
  'organ.journeyPlate.densityPlasma': 'плотность = уровень в плазме',
  'organ.journeyPlate.cleared': 'выведено',
  'organ.journeyPlate.title': 'Путь дозы',
  'organ.journeyPlate.sub': 'что выживает на каждом шаге, в этом кадре',
  'organ.journeyPlate.noneOnBoard': 'В этом кадре в организме нет препарата — пока нет дозы, которую можно проследить.',
  'organ.journeyPlate.plasmaNotModelled': 'плазма не моделируется',
  'organ.journeyPlate.plasmaValue': (v: Vars) => `плазма ${v.value} нг/мл`,
  'organ.journeyPlate.noFirstPass': 'здесь нет этапа первого прохождения',
  'organ.journeyPlate.firstPassRemoves': (v: Vars) => `первое прохождение убирает ${v.value} %`,
  'organ.journeyPlate.gutNote1':
    'Транзит через кишечник в этой версии не моделируется — пунктирная часть маршрута на теле',
  'organ.journeyPlate.gutNote2':
    'нарисована для ориентира и не несёт числового значения. Всё, что движется, — это уровень в плазме.',
  'organ.journeyPlate.noExtraction': 'Для этого вещества экстракция первого прохождения не моделируется.',
  'organ.journeyPlate.extractionTitle': (v: Vars) =>
    `liver.first_pass_extraction = ${v.value} — открытая часть ворот определяет, что достигает кровотока.`,

  // -------------------------------------------------------- organ.heartPlate (scenePlates)
  'organ.heartPlate.title': 'Сердце',
  'organ.heartPlate.sub': 'ритм и сила, и какая доля пула β1 занята',
  'organ.heartPlate.rateTitle': 'Ритм',
  'organ.heartPlate.rateHint':
    'Фигура бьётся раз в 60 / haemo.hr секунд за цикл. То, что вы видите, — смоделированная частота, а не цикл анимации.',
  'organ.heartPlate.notModelled': 'не моделируется',
  'organ.heartPlate.bradycardicGate': 'брадикардия — срабатывает ниже 50',
  'organ.heartPlate.forceTitle': 'Сила',
  'organ.heartPlate.forceHint':
    'haemo.contractility_index — индекс, нормированный к 1.00 на исходном уровне, поэтому он показан относительно и никогда в абсолютных единицах.',
  'organ.heartPlate.outputTitle': 'Выброс',
  'organ.heartPlate.coNotModelled': 'CO не моделируется',
  'organ.heartPlate.svNotModelled': 'SV не моделируется',
  'organ.heartPlate.receptorsTitle': 'Рецепторы',
  'organ.heartPlate.receptorsHint':
    'β1 и β2 — отдельные поля шины. Метопролол β1-селективен только пока уровень в плазме остаётся ниже порога, указанного в инструкции.',
  'organ.heartPlate.beta1NotModelled': 'β1 —',
  'organ.heartPlate.beta1Value': (v: Vars) => `β1 сердечный ${v.value} %`,
  'organ.heartPlate.beta2NotModelled': 'β2 —',
  'organ.heartPlate.beta2Value': (v: Vars) => `β2 дыхательные пути ${v.value} %`,
  'organ.heartPlate.selectivityFading': 'выше 80.2 нг/мл — селективность снижается',
  'organ.heartPlate.traceLabel': 'частота сердечных сокращений, этот запуск',
  'organ.heartPlate.note':
    'Тканевый уровень (T2). Синоатриальный узел нарисован как область — клеточная популяция не названа.',

  // ------------------------------------------------------ organ.vesselsPlate (scenePlates)
  'organ.vesselsPlate.title': 'Единица сопротивления',
  'organ.vesselsPlate.sub': 'вход, капиллярное русло, выход — и давление между ними',
  'organ.vesselsPlate.pressureTitle': 'Давление',
  'organ.vesselsPlate.bpNotModelled': 'АД не моделируется',
  'organ.vesselsPlate.svrNotModelled': 'SVR не моделируется',
  'organ.vesselsPlate.inletOutletTitle': 'Вход и выход',
  'organ.vesselsPlate.inletOutletHint':
    'Оба — индексы, нормированные к 1.00 на исходном уровне. Дигидропиридин заметно меняет первый и почти не меняет второй — эта асимметрия и есть механизм отёка.',
  'organ.vesselsPlate.arteriolePrefix': (v: Vars) => `артериола ${v.value}`,
  'organ.vesselsPlate.venulePrefix': (v: Vars) => `венула ${v.value}`,
  'organ.vesselsPlate.capillaryTitle': 'Капиллярное давление',
  'organ.vesselsPlate.capillaryHint':
    'haemo.capillary_hydrostatic_p — уровень ПРОКСИ, некалиброван, поэтому показан как относительный индекс и никогда в мм рт.ст.',

  // -------------------------------------------------------- organ.lungsPlate (scenePlates)
  'organ.lungsPlate.title': 'Лёгкие',
  'organ.lungsPlate.sub': 'здесь орган-мишень, а не сторонний наблюдатель',
  'organ.lungsPlate.airflowTitle': 'Воздушный поток',
  'organ.lungsPlate.beta2SpilloverTitle': 'Перекрёстное действие на β2',
  'organ.lungsPlate.beta2SpilloverHint':
    'Калибр дыхательных путей = база × (1 − 0.45 × beta2_occupancy). Коэффициент — визуальная константа; занятость — источниковый сигнал.',
  'organ.lungsPlate.notModelled': 'не моделируется',
  'organ.lungsPlate.occupiedPct': (v: Vars) => `${v.value} % занято`,
  'organ.lungsPlate.bradykininTitle': 'Брадикинин',
  'organ.lungsPlate.bradykininHint':
    'Брадикинин и субстанция P — субстраты АПФ. Они накапливаются на ингибиторе АПФ и сенсибилизируют чувствительные нервы дыхательных путей — это канал кашля, и он отсроченный, а не при первой дозе.',
  'organ.lungsPlate.airwayPrefix': (v: Vars) => `дыхательные пути ${v.value}`,
  'organ.lungsPlate.pulmonaryAceNotModelled': 'лёгочный АПФ —',
  'organ.lungsPlate.pulmonaryAceValue': (v: Vars) => `лёгочный АПФ ${v.value} % ингибирован`,
  'organ.lungsPlate.coughChannel': (v: Vars) => `канал кашля ${v.value}`,
  'organ.lungsPlate.absenceTitle': 'Отсутствие',
  'organ.lungsPlate.absenceHint':
    'БРА блокирует рецептор вместо фермента, поэтому брадикинин никогда не накапливается. Недостающий слой и есть педагогическая суть.',
  'organ.lungsPlate.noBradykininAccumulation': 'накопления брадикинина нет',
  'organ.lungsPlate.noCoughChannelAtAll': 'значит, канала кашля нет вообще',
  'organ.lungsPlate.note':
    'Механизм выведен логически (T3). Лёгочный эндотелиальный АПФ — классическая физиология; данные экспрессии, взятые для этой версии, указывают на кишечник и яички, а не на лёгкие, и фигура об этом говорит.',

  // -------------------------------------------------------- organ.liverPlate (scenePlates)
  'organ.liverPlate.title': 'Печень',
  'organ.liverPlate.sub': 'три фермента и одни ворота, размер которых задаёт генотип',
  'organ.liverPlate.capacityNotModelled': 'Ёмкость CYP2D6 в этой версии не моделируется.',
  'organ.liverPlate.gateNote': (v: Vars) =>
    `У этого пациента ворота CYP2D6 в ${v.value} × от нормы. Уровень определяет не доза — а ворота.`,
  'organ.liverPlate.idle': 'Метопролола в организме нет, поэтому в этом кадре ворота бездействуют.',
  'organ.liverPlate.aboveThreshold':
    'Метопролол выше 80.2 нг/мл — концентрации, при которой, согласно инструкции, β1-селективность снижается.',
  'organ.liverPlate.belowThreshold':
    'Метопролол ниже 80.2 нг/мл, порога из инструкции, — здесь он всё ещё ведёт себя как β1-селективный.',

  // ------------------------------------------------------- organ.kidneyPlate (scenePlates)
  'organ.kidneyPlate.title': 'Почка',
  'organ.kidneyPlate.sub': 'четыре препарата, четыре разных сегмента, все одновременно',
  'organ.kidneyPlate.filtrationTitle': 'Фильтрация',
  'organ.kidneyPlate.filtrationHint':
    'renal.p_glomerular — уровень ПРОКСИ: управляет анимацией почечной защиты, но не откалиброван, поэтому никогда не отображается в мм рт.ст.',
  'organ.kidneyPlate.pGlomPrefix': (v: Vars) => `P_glom ${v.value}`,
  'organ.kidneyPlate.traceLabel':
    'eGFR, этот запуск — снижение, которое стабилизируется, это открытие выносящей артериолы, а не повреждение',

  // --------------------------------------------------------- organ.raasPlate (scenePlates)
  'organ.raasPlate.title': 'Контррегуляция',
  'organ.raasPlate.sub': 'петля, которая сопротивляется, пока давление падает',
  'organ.raasPlate.reninNotModelled': 'Ренин в этой версии не моделируется.',
  'organ.raasPlate.reninNote': (v: Vars) =>
    `Ренин составляет ${v.value} × от исходного уровня и растёт на фоне падающего давления. Это петля работает так, как задумано, а не сбой препарата.`,
  'organ.raasPlate.aldosteroneNotModelled': 'Альдостерон в этой версии не моделируется.',
  'organ.raasPlate.aldosteroneNote': (v: Vars) =>
    `Альдостерон ${v.value} × от исходного уровня — вот почему калий движется всякий раз, когда движется этот каскад.`,
  'organ.raasPlate.dualNote':
    'Два стоп-бара на одном каскаде: заблокированы и фермент, и рецептор. Суммарное расширение выносящей артериолы, а калий и eGFR смещаются сильнее, чем от любого препарата по отдельности.',
  'organ.raasPlate.singleNote':
    '«Прорыв» альдостерона за недели в этой версии не моделируется — это заявлено, а не скрыто.',

  // -------------------------------------------------------- organ.limbsPlate (scenePlates)
  'organ.limbsPlate.title': 'Отвисающие конечности',
  'organ.limbsPlate.sub': 'куда сила тяжести направляет жидкость, и почему диуретик это не исправляет',
  'organ.limbsPlate.noSwelling': 'В этом кадре нет гравитационного отёка.',
  'organ.limbsPlate.thiazideOnly':
    'Тиазид принят, а отёк почти не изменился — он не воздействует на этот механизм. Показ лечения, которое не работает, сделан намеренно.',
  'organ.limbsPlate.raasOn':
    'Блокатор РААС принят. Он открывает и посткапиллярную сторону, поэтому баланс вход/выход частично восстанавливается, и отёк спадает.',
  'organ.limbsPlate.default':
    'Вход открыт, а выход нет, поэтому жидкость покидает капилляр там, куда её тянет сила тяжести.',
  'organ.limbsPlate.interstitiumTitle': 'Интерстиций',
  'organ.limbsPlate.interstitiumHint':
    'periph.interstitial_volume_index — индекс, нормированный к 1.00 на исходном уровне; выведенная из него степень ямочного отёка — презентационный мост, а не измерение.',
  'organ.limbsPlate.pittingNotModelled': 'ямочный отёк —',
  'organ.limbsPlate.pittingPresentational': (v: Vars) => `ямочный отёк ${v.grade} / 3 (презентационно)`,
  'organ.limbsPlate.capillaryTitle': 'Капиллярное давление',
  'organ.limbsPlate.whatHappeningTitle': 'Что происходит',
  'organ.limbsPlate.note':
    'Зарегистрированная частота 1.8 / 3.0 / 10.8 % при 2.5 / 5 / 10 мг против 0.6 % на плацебо; у женщин 14.6 % против 5.6 % у мужчин. Инструкция FDA, амлодипина безилат.',

  // ------------------------------------------------------- organ.safetyPlate (scenePlates)
  'organ.safetyPlate.title': 'Безопасность',
  'organ.safetyPlate.sub': 'что сработало, где это проявляется на теле, и зарегистрированная частота за этим',
  'organ.safetyPlate.drivenBy': (v: Vars) => `вызвано: ${v.drugs}`,
  'organ.safetyPlate.incidence': (v: Vars) => `частота: ${v.value}`,
  'organ.safetyPlate.haltedGate': 'Остановлено жёстким барьером',
  'organ.safetyPlate.fetalBarrier': 'Барьер токсичности для плода',
  'organ.safetyPlate.pregnancyNote':
    'Ингибитор АПФ или БРА противопоказан при беременности. Симуляция не анимирует кривую дозы для препарата, который нельзя назначать.',
  'organ.safetyPlate.contraindicatedNote':
    'Была запрошена противопоказанная комбинация, поэтому кривая дозы не анимируется.',
  'organ.safetyPlate.noneAboveThreshold': 'Ни один канал побочных эффектов не превышает порог срабатывания в этом кадре.',
  'organ.safetyPlate.noRun': 'Симуляция не запущена.',
  'organ.safetyPlate.rareSuffix': '  · редко',
  'organ.safetyPlate.note':
    'Там, где источники расходятся, показан диапазон, а не точечная оценка. Пороги срабатывания — визуальные настроечные константы, а не клинические пороги.',

  // -------------------------------------------------------------- organ.scene (scenes)
  'organ.scene.selectorAriaLabel': 'Сцена',
  'organ.scene.clockStatus': (v: Vars) => `t = ${v.t} ч с первой дозы`,
  'organ.scene.watch.noRun': 'Симуляция не запущена — фигура удерживает состояние покоя без лечения.',
  'organ.scene.watch.journeyNone': 'В этом кадре в организме ничего нет, поэтому пока нет дозы, которую можно проследить.',
  'organ.scene.watch.journeyLead': (v: Vars) =>
    `${v.n} ${ruPlural(Number(v.n), 'вещество', 'вещества', 'веществ')} в крови.`,
  'organ.scene.watch.journeyWithGate': (v: Vars) =>
    `${v.lead} Наблюдайте за воротами в печени — ${v.pct} % метопролола никогда не достигает кровотока.`,
  'organ.scene.watch.journeyNoGate': (v: Vars) =>
    `${v.lead} Наблюдайте за воротами в печени: то, что они убирают, никогда не достигает кровотока.`,
  'organ.scene.watch.heart': (v: Vars) => `Наблюдайте за ударом — он идёт со смоделированной частотой, ${v.hr}, а β1 занят на ${v.b1}.`,
  'organ.scene.watch.vessels': (v: Vars) => `Наблюдайте за двумя концами капилляра: вход ${v.inlet}, выход ${v.outlet}.`,
  'organ.scene.watch.lungsAbsence':
    'Наблюдайте за тем, чего нет: БРА не оставляет дымки брадикинина над дыхательными путями, поэтому канала кашля здесь нет.',
  'organ.scene.watch.lungs': (v: Vars) => `Наблюдайте за бронхиальным просветом — он сужается по мере роста занятости β2, и сейчас она ${v.pct}.`,
  'organ.scene.watch.liverNone': 'Наблюдайте за тремя реакторами: то, что входит слева, не то же самое, что выходит справа.',
  'organ.scene.watch.liver': (v: Vars) =>
    `Наблюдайте за воротами CYP2D6 — у этого пациента они в ${v.value} × от нормы, и именно это задаёт уровень, а не доза.`,
  'organ.scene.watch.kidney': (v: Vars) =>
    `Наблюдайте за четырьмя сегментами одновременно: NCC ${v.ncc} заблокирован в дистальном канальце, ACE ${v.ace} и AT1 ${v.at1} на выносящей стороне.`,
  'organ.scene.watch.raas': (v: Vars) =>
    `Наблюдайте за ренином ${v.renin} на фоне среднего давления ${v.map}. Рост ренина — это работа петли, а не сбой препарата.`,
  'organ.scene.watch.limbs': (v: Vars) => `Наблюдайте, как утолщается лодыжка по мере того, как интерстициальный объём достигает ${v.value}.`,
  'organ.scene.watch.safetyNone': 'Ничего не превышает порог срабатывания в этом кадре. Это результат, а не пустая панель.',
  'organ.scene.watch.safety': (v: Vars) =>
    `${v.n} ${ruPlural(Number(v.n), 'канал сработал', 'канала сработало', 'каналов сработало')} — каждый пронумерован на теле и снабжён источником рядом.`,
  'organ.scene.watch.default': (v: Vars) =>
    `Каждый след цвета на фигуре — это препарат, который что-то делает. ${v.bp} · ЧСС ${v.hr} · eGFR ${v.gfr}.`,

  // ---------------------------------------------------- organ.scene.<id> (SCENES list)
  'organ.scene.overview.label': 'Обзор',
  'organ.scene.overview.blurb':
    'Всё тело сразу — каждый орган, которого достигает эта схема лечения, с цифрами на полях.',
  'organ.scene.journey.label': 'Путь дозы',
  'organ.scene.journey.blurb':
    'Проследите за препаратом: проглочен, проходит через печень на входе, выходит в кровь и выводится.',
  'organ.scene.heart.label': 'Сердце',
  'organ.scene.heart.blurb': 'Ритм, сила и выброс, и какая доля пула рецепторов β1 занята сейчас.',
  'organ.scene.vessels.label': 'Сосуды',
  'organ.scene.vessels.blurb':
    'Единица сопротивления: артериола открывается, венула нет, и давление между ними объясняет отёк лодыжек.',
  'organ.scene.lungs.label': 'Лёгкие',
  'organ.scene.lungs.blurb':
    'Два препарата достигают дыхательных путей — один даёт накапливаться брадикинину, другой блокирует β2 — а тот, что не делает ни того, ни другого, показан именно так.',
  'organ.scene.liver.label': 'Печень',
  'organ.scene.liver.blurb': 'Три фермента CYP и одни ворота, размер которых задаёт генотип, а не доза.',
  'organ.scene.kidney.label': 'Почка',
  'organ.scene.kidney.blurb': 'Четыре препарата действуют в четырёх анатомически разных сегментах нефрона одновременно.',
  'organ.scene.raas.label': 'Контррегуляция',
  'organ.scene.raas.blurb':
    'Петля, которая сопротивляется: ренин растёт, пока давление падает, и это ожидаемо.',
  'organ.scene.limbs.label': 'Отвисающие конечности',
  'organ.scene.limbs.blurb':
    'Куда сила тяжести направляет жидкость — и почему диуретик не устраняет именно этот отёк.',
  'organ.scene.safety.label': 'Безопасность',
  'organ.scene.safety.blurb': 'Что сработало, где это проявляется на теле, и зарегистрированная частота за каждым.',

  'common.sourcedRangeTitle': (v: Vars) => `Диапазон источника ${v.lo}–${v.hi}${v.unit}`,

  // ------------------------------------------------------- chat assistant (src/ui/chat)
  'chat.open': 'Спросить ИИ',
  'chat.openAria': 'Открыть помощника и спросить об этой странице',
  'chat.title': 'Спросить ИИ',
  'chat.sub': 'Опирается только на эту страницу — отвечает лишь тем, что PilSim уже вычислил.',
  'chat.closeAria': 'Закрыть помощника',
  'chat.panelAria': 'Помощник PilSim',
  'chat.notConfigured': 'ИИ-провайдер не настроен',
  'chat.groundedIn': 'Основание',
  'chat.grounded.substance': 'открытое вещество',
  'chat.grounded.patient': 'выбранный пациент',
  'chat.grounded.regimen': 'режим',
  'chat.grounded.run': 'последний расчёт',
  'chat.grounded.rules': 'сработавшие правила',
  'chat.grounded.pageOnly': 'только эта страница — ничего пока не выбрано',
  'chat.introLead':
    'Спросите о чём угодно на этой странице — о веществе, пациенте, препарате или результате расчёта.',
  'chat.introBoundaryLead': 'Он не может ничего выдумать.',
  'chat.introBoundary':
    'Ответы берутся из набора данных, сработавших правил и вывода движка, и каждое число сверяется с ними. Если PilSim чего-то не моделирует, он так и скажет, а не станет догадываться.',
  'chat.noProviderTitle': 'Помощник выключен',
  'chat.noProviderBody':
    'ИИ-провайдер не настроен, поэтому вопрос пока отправить нельзя. Всё остальное на этой странице работает и без него. Настройки ИИ — на странице «Симуляция».',
  'chat.starter.home.a': 'Что этот продукт на самом деле умеет моделировать?',
  'chat.starter.home.b': 'Какие препараты есть в наборе данных?',
  'chat.starter.substances.a': 'Что делает это вещество и где оно действует?',
  'chat.starter.substances.b': 'Какие из этих параметров оценочные, а не взятые из источника?',
  'chat.starter.pills.a': 'Почему правила отметили этот состав?',
  'chat.starter.pills.b': 'Что сделало бы этот препарат безопасным для этого пациента?',
  'chat.starter.subject.a': 'Какая сопутствующая болезнь сильнее всего изменила двойника?',
  'chat.starter.subject.b': 'Что этот креатинин означает для дозирования?',
  'chat.starter.simulation.a': 'Почему движок расставил варианты именно так?',
  'chat.starter.simulation.b': 'Что у этого пациента определило результат?',
  'chat.placeholder': 'Спросите об этой странице…',
  'chat.send': 'Отправить',
  'chat.stop': 'Стоп',
  'chat.clear': 'Очистить диалог',
  'chat.you': 'Вы',
  'chat.assistant': 'Помощник PilSim',
  'chat.generatedMark': 'Сгенерированный текст',
  'chat.waiting': 'Ожидание первого токена…',
  'chat.verdictNone': 'В этом ответе нет чисел.',
  'chat.verdictClean': (v: Vars) => {
    const n = Number(v.n)
    return `${n} ${ruPlural(n, 'число', 'числа', 'чисел')}, и каждое прослежено до ${v.facts} значений, переданных модели.`
  },
  'chat.verdictDirty': (v: Vars) =>
    `${v.unsupported} из ${v.total} чисел не восходят ни к чему, что дала эта страница — ${v.ids}. Выше они зачёркнуты; не используйте их.`,
  'chat.numberFlag': 'нет в контексте',
  'chat.numberFlagSr': 'Этого числа не было в данных, переданных модели.',
  'chat.numberTrace': 'Прослежено до значения, переданного модели.',
  'chat.disclaimer': 'Виртуальные пациенты. Не медицинская рекомендация.',

  // -------------------------------------------------------- sidebar: history / settings
  'sidebar.history': 'История',
  'sidebar.historyEmpty': 'Ещё не было ни одной симуляции. Каждый завершённый запуск появится здесь.',
  'sidebar.clearHistory': 'Очистить историю',
  'sidebar.replayRun': (v: Vars) => `Открыть ${v.regimen} · ${v.subject}`,
  'sidebar.historyBp': (v: Vars) => `${v.value} мм рт.ст., систолическое`,
  'sidebar.settings': 'Настройки',

  // -------------------------------------------------------- five-year projection hedge
  'sim.limits.noAldosteroneEscape': 'Не моделируется альдостероновый эскейп / прорыв на протяжении недель.',
  'sim.limits.noBaroreflexAdaptation': 'Нет адаптации барорефлекса сверх смоделированной контррегуляции.',
  'sim.limits.noPdTolerance': 'Нет фармакодинамической толерантности.',
  'sim.limits.noAdherenceBehaviour': 'Не моделируется приверженность лечению — каждая доза считается принятой.',
  'sim.limits.noHardOutcomes':
    'Нет жёстких сердечно-сосудистых исходов (инсульт, инфаркт миокарда, смертность). Продукт моделирует артериальное давление и лабораторные показатели, а не события. Долгосрочный обзор — это ПРОЕКЦИЯ контроля давления и органоспецифичных показателей, а не предсказание инсультов, инфарктов или смертей.',
  'sim.limits.cellLevelOneTarget':
    'Разрешение на уровне клетки заявлено только для одной мишени: NCC / SLC12A3 в клетках дистального извитого канальца.',
  'sim.limits.fiveYearWording':
    'Пятилетний обзор: проекция контроля артериального давления и органоспецифичных показателей. Это не предсказание инсультов, инфарктов или смертей, и никогда не должно читаться как таковое.',

  // ------------------------------------------------------------ dose timing (src/report/timing.ts)
  'sim.timing.heading': 'В какое время суток принимать',
  'sim.timing.categoryOutcome': 'Исход',
  'sim.timing.categoryTolerability': 'Переносимость',
  'sim.timing.categoryPharmacokinetic': 'Фармакокинетика',
  'sim.timing.confidenceHigh': 'Высокая достоверность',
  'sim.timing.confidenceModerate': 'Умеренная достоверность',
  'sim.timing.confidenceLow': 'Низкая достоверность',
  'sim.timing.suggestedTimeLabel': 'Рекомендуемое время',
  'sim.timing.firstDoseLabel': 'Первая доза',
  'sim.timing.timeMorning': 'утром',
  'sim.timing.timeEvening': 'вечером',
  'sim.timing.timeBedtime': 'перед сном',
  'sim.timing.timeAnyConsistent': 'в одно и то же время каждый день — в любой удобный час',
  'sim.timing.gapsHeading': 'Время приёма — на что это не отвечает',
  'sim.timing.headlineHeading': 'Когда принимать',
  'sim.timing.headlineDetailLink': 'Почему — подробные доказательства ниже ↓',

  // ==========================================================================
  // GENERATED PROSE — src/report/timing.ts, src/report/score.ts
  // ==========================================================================
  // Названия исследований (TIME, BedMed, MAPEC, Hygia), названия журналов,
  // PMID/DOI, дословно цитируемые заголовки, все числа, единицы, статистика и
  // названия препаратов НЕ ПЕРЕВОДЯТСЯ — читатель должен иметь возможность
  // сверить нас с источником.
  // ⚠️ Вердикт ОТРИЦАТЕЛЬНЫЙ: приём на ночь НЕ доказал предотвращения событий.
  //    Не «может помочь» и не «не рекомендуется». Отказ остаётся решением:
  //    «не определена», а не «нет данных».

  'sim.timing.text.outcomeVerdict':
    'Приём таблеток от давления на ночь НЕ доказал способности предотвращать инфаркты, инсульты или ' +
    'смерть. Если вы слышали обратное, этот продукт с этим не согласен, и абзацы ниже объясняют почему.',
  'sim.timing.text.outcomeTrials':
    'Два крупных рандомизированных исследования искали эту пользу и не нашли её. TIME распределило 21 104 ' +
    'взрослых в Великобритании на утренний или вечерний приём и наблюдало их в среднем (медиана) 5.2 года: ' +
    'сосудистая смерть, инфаркт или инсульт произошли у 362 (3.4 %) в вечерней группе и у 390 (3.7 %) в ' +
    'утренней, hazard ratio 0.95 (95 % CI 0.83–1.10), p=0.53. BedMed распределило 3357 взрослых первичного ' +
    'звена в Канаде на приём перед сном или утром и наблюдало их в среднем 4.6 года: 2.3 против 2.4 события ' +
    'на 100 пациенто-лет, скорректированный hazard ratio 0.96 (95 % CI 0.77–1.19), p=.70.',
  'sim.timing.text.outcomeContested':
    'Утверждение о пользе исходит из двух работ одной исследовательской группы — MAPEC (2010) и Hygia ' +
    'Chronotherapy Trial (2020), название которой — "Bedtime hypertension treatment improves cardiovascular ' +
    'risk reduction". Ни одна из них не отозвана. В отношении Hygia European Heart Journal опубликовал ДВА ' +
    'Expression of Concern (2020;41(16):1600 и 2020;41(48):4564), а восемь исследователей гипертензии ' +
    'опубликовали возражение проекту под названием "Missing Verification of Source Data in Hypertension ' +
    'Research: The HYGIA PROJECT in Perspective". PilSim намеренно не воспроизводит размер эффекта Hygia: ' +
    'точное запоминающееся число из спорной статьи труднее забыть, чем оговорить.',
  'sim.timing.text.outcomeSafetyMirror':
    'Опасение по безопасности работает и в обратную сторону, и на него тоже получен ответ: BedMed не выявил ' +
    'ни увеличения падений и переломов, ни увеличения новых диагнозов глаукомы, ни разницы в когнитивном ' +
    'снижении через 18 месяцев при приёме перед сном. Значит, честный вывод — и не "приём на ночь опасен": ' +
    'время суток не изменило исход ни в одну, ни в другую сторону.',
  'sim.timing.text.outcomeSurrogate':
    'По-настоящему открытым остаётся ночное давление как число, а не как исход: исследование OMAN (2025) ' +
    'показало, что приём перед сном снижает ночное систолическое давление примерно на 3 mmHg больше, чем ' +
    'утренний. Это суррогатный показатель. Ни одно исследование не показало, что устранение этих 3 mmHg ' +
    'меняет то, что происходит с пациентом, а PilSim в принципе не может определить, у кого повышено ночное ' +
    'давление, — он вообще не моделирует циркадный ритм.',
  'sim.timing.text.outcomeConsistentTime':
    'Итак: принимайте их в то время, которого вы сможете надёжно придерживаться. Собственный совет TIME, ' +
    'дословно — "Patients can be advised that they can take their regular antihypertensive medications at a ' +
    'convenient time that minimises any undesirable effects." Обратите внимание: "нет лучшего часа" — это не ' +
    '"любой час в любой день": в обоих исследованиях время назначалось фиксированным и соблюдалось, поэтому ' +
    'рекомендация — одно постоянное время, а не плавающее.',

  'sim.timing.text.drugOutcome': (v: Vars) =>
    `Не установлено времени суток, которое делало бы ${v.name} эффективнее в предотвращении инфарктов, ` +
    `инсультов или смерти. Рандомизированные исследования утреннего приёма против вечернего не нашли ` +
    `разницы в этих исходах.`,
  'sim.timing.text.thiazideMorning': (v: Vars) =>
    `Принимайте ${v.name} утром, чтобы диурез пришёлся на время, когда вы на ногах: инструкция указывает ` +
    `начало действия примерно через ${v.onset} ч после приёма${v.peakClause}, а весь эпизод — ` +
    `${v.duration}. Вечерняя доза переносит это окно на ночь и будит вас помочиться. Это про ваш сон, а не ` +
    `про ваше сердце — здесь нет никакого утверждения о влиянии на инфаркты или инсульты.`,
  'sim.timing.text.thiazidePeakClause': (v: Vars) => `, пик — примерно через ${v.peak} ч`,
  'sim.timing.text.durationRange': (v: Vars) => `примерно ${v.lo}–${v.hi} ч`,
  'sim.timing.text.durationSingle': (v: Vars) => `примерно ${v.value} ч`,
  'sim.timing.text.firstDoseHypotension': (v: Vars) =>
    `Принимайте ПЕРВУЮ дозу ${v.name} перед сном, а дальше — в любое удобное вам время: набор данных ` +
    `фиксирует для него гипотензию с началом "${v.onset}", поэтому если первая доза действительно снизит ` +
    `давление настолько, что закружится голова, лучше, чтобы вы уже лежали.${v.mechanismClause} Опасность ` +
    `указана в инструкции; приём первой дозы перед сном — это вывод ИЗ неё, а не указание инструкции, ` +
    `поэтому это сказано с умеренной, а не высокой достоверностью.`,
  'sim.timing.text.datasetOwnWords': (v: Vars) => ` Формулировка самого набора данных: ${v.mechanism}.`,

  'sim.timing.text.pkNegligible': (v: Vars) =>
    `Для ${v.name} час приёма почти не имеет значения уже по одной фармакокинетике: при периоде ` +
    `полувыведения ${v.halfLife} ч концентрация колеблется всего ${v.swing} за ${v.intervalH} ч между дозами ` +
    `и к моменту следующей дозы остаётся на уровне ${v.troughPct}% от пика, так что ни одна часть суток не ` +
    `покрыта заметно лучше другой.${v.via}${v.perDayNote}`,
  'sim.timing.text.pkMarked': (v: Vars) =>
    `${v.name} колеблется ${v.swing} за ${v.intervalH} ч между дозами и к моменту следующей дозы падает до ` +
    `${v.troughPct}% от пика, поэтому при такой схеме часть каждых суток покрыта плохо, какой бы час вы ни ` +
    `выбрали. Перенос дозы смещает провал, но не закрывает его — закрыть его означает разделить дозу или ` +
    `перейти на форму с замедленным высвобождением, а это решение о назначении, а не о времени приёма.` +
    `${v.via}${v.perDayNote}`,
  'sim.timing.text.pkModerate': (v: Vars) =>
    `${v.name} за ${v.intervalH} ч между дозами падает до ${v.troughPct}% от пика — колебание ${v.swing} — ` +
    `так что в принципе час приёма мог бы иметь значение. Из этого не следует, что один час контролирует ` +
    `давление лучше другого: модель не учитывает циркадный ритм, а исследования, которые это проверяли, ` +
    `разницы не нашли.${v.tolerabilityClause}${v.via}${v.perDayNote}`,
  'sim.timing.text.pkSwingFold': (v: Vars) => `в ${v.value} раза`,
  'sim.timing.text.pkSwingUnbounded': 'неограниченно',
  'sim.timing.text.pkViaMetabolite': (v: Vars) =>
    ` Сам ${v.name} живёт недолго; на протяжении интервала действует его метаболит ${v.species}, и здесь ` +
    `важен именно его период полувыведения ${v.halfLife} ч.`,
  'sim.timing.text.pkPerDayNote': (v: Vars) =>
    ` Это схема ${v.perDay} раза в сутки, поэтому вопрос в интервалах между дозами, а не в том, какой это ` +
    `час суток.`,
  'sim.timing.text.pkHourFromTolerability':
    ' Час, рекомендованный выше, рекомендован по переносимости, а не по фармакокинетике.',
  'sim.timing.text.metoprololContrast': (v: Vars) =>
    `Конкретно: те же ${v.mgPerDay} mg/day метопролола колеблются в ${v.ir} раза как таблетка немедленного ` +
    `высвобождения раз в сутки, в ${v.er} раза как сукцинат с замедленным высвобождением и в ${v.bid} раза ` +
    `при делении на два приёма. Если вам нужен ровный профиль, рычаг именно здесь — а не в часах приёма.`,

  'sim.timing.text.anyTimeStatement': (v: Vars) =>
    `${v.name}: принимайте ${v.label}. Это и есть ответ, а не пропуск: доказательства не устанавливают ` +
    `лучшего времени для этого препарата, и ничто в нём не делает один час переносимее другого.`,
  'sim.timing.text.takeAtStatement': (v: Vars) => `${v.name}: принимайте ${v.label}.`,
  'sim.timing.text.threeKinds':
    'Рекомендации по времени в этом плане бывают трёх видов, и они не взаимозаменяемы: что доказательства ' +
    'говорят об ИСХОДАХ (инфаркты и инсульты), что делает препарат легче ПЕРЕНОСИМЫМ и что позволяет ' +
    'ФАРМАКОКИНЕТИКА. Рекомендуемый час сдвигает только второе.',
  'sim.timing.text.noGuidelineTiming':
    'Ничто в собственном слое клинических правил PilSim не рекомендует время приёма: data/rules.json не ' +
    'выдаёт эффекта времени ни для одного из пяти веществ. Каждое утверждение об исходах здесь прочитано ' +
    'напрямую из опубликованных исследований и помечено как литература, а не как рекомендация руководства.',

  'sim.timing.text.gapNonDipperWhat': 'станет ли именно этому пациенту лучше от приёма перед сном',
  'sim.timing.text.gapNonDipperWhy':
    'Единственное место, где вопрос времени всё ещё открыт, — это повышенное ночное давление и профиль ' +
    'non-dipper, и PilSim не может определить ни того, ни другого: в data/patient_model.json пункт ' +
    '"Circadian rhythm in blood pressure — no dipper/non-dipper pattern" указан в ' +
    '`validity_limits.not_modelled`. В продукте нет ввода данных суточного мониторирования давления, и даже ' +
    'будь он, читать было бы нечего.',
  'sim.timing.text.gapMorningEveningWhat': 'смоделированное сравнение утренней и вечерней дозы',
  'sim.timing.text.gapMorningEveningWhy':
    'В модели нет циркадного ритма артериального давления, поэтому утренняя и вечерняя доза по построению ' +
    'дают одинаковый результат симуляции. Приведённые выше показатели покрытия описывают ФОРМУ кривой ' +
    'концентрации на протяжении интервала между дозами; они ничего не говорят о том, что происходит с ' +
    'давлением в 3 часа ночи, и этот продукт не станет проводить сравнение, ответ на которое — свойство его ' +
    'собственных упрощений.',

  'sim.score.text.goalSingle': (v: Vars) =>
    `Один смоделированный пациент достигает ${v.target} с вероятностью ${v.pct}% (разброс ответа принят ` +
    `допущением; N = 1)`,
  'sim.score.text.goalPopulation': (v: Vars) =>
    `${v.pct}% смоделированных пациентов достигли ${v.target}`,
  'sim.score.text.sbpFall': (v: Vars) =>
    `В равновесном состоянии систолическое давление снижается на ${v.mmHg} mmHg`,
  'sim.score.text.riskLine': (v: Vars) => `Риск ${v.name} ${v.pct}%`,
  'sim.score.text.labOutside': (v: Vars) =>
    `${v.name} вышел за референсный диапазон (${v.value} против ${v.lo}–${v.hi})`,
  'sim.score.text.labChance': (v: Vars) =>
    `Вероятность ${v.pct}%, что ${v.name} выйдет за референсный диапазон (${v.lo}–${v.hi})`,
  'sim.score.text.tooCloseToCall':
    'Слишком близко, чтобы делать вывод: варианты в пределах одного балла эта модель не разделяет. Каждый ' +
    'вес в составной оценке — допущение, поэтому считайте их равнозначными и выбирайте по компонентам ' +
    '(эффективность, безопасность, уместность), показанным рядом с баллом.',
  'sim.score.text.rankedBelowOverride':
    'Помещён ниже каждого варианта без требования подтверждения — руководство говорит «избегать», а не ' +
    '«запрещено»',
  'sim.score.text.armNotRanked': (v: Vars) =>
    `Этот вариант не ранжируется. ${v.title} сработало с уровнем ${v.severity}. Печатать оценку ` +
    `безопасности рядом с абсолютным противопоказанием — приглашать прочитать её как компромисс. Это не ` +
    `компромисс.`,
  'sim.score.text.anAbsoluteContraindication': 'Абсолютное противопоказание',
  'sim.score.text.absolutelyContraindicated': 'Абсолютно противопоказано.',
  'sim.score.text.caveatSexByDose':
    'Допущение модели: половое различие применяется как постоянный пропорциональный эффект во всём ' +
    'диапазоне доз. Инструкция сообщает пол и дозу по отдельности и не приводит показателя «пол × доза» — ' +
    'это взаимодействие принято допущением, а не указано в инструкции.',
  'sim.score.text.caveatGeneric': (v: Vars) => `Допущение модели: ${v.text}.`,

  'sim.formulation.text.refusal':
    'Лучшая лекарственная форма: не определена. Для этого вещества моделировались только твёрдые ' +
    'пероральные формы немедленного высвобождения. Сравнение форм требует данных о биодоступности и ' +
    'времени достижения пика для конкретного пути введения, которых нет в наборе данных этой сборки.',
  'sim.formulation.text.refusalChip': 'Имеющиеся данные не позволяют сравнить лекарственные формы',
  'sim.formulation.text.noProfile':
    'Лучшая лекарственная форма: не определена. Запуск не дал профиля концентрации, поэтому отношение ' +
    '«остаточная/пиковая» и колебания измерить не удалось.',
  'sim.formulation.text.tprReason': (v: Vars) =>
    `Отношение «остаточная/пиковая» ${v.value}${v.derived}`,
  'sim.formulation.text.tprDerivedClause': ' (из профиля концентрации)',
  'sim.formulation.text.onceDaily': 'Один раз в сутки',
  'sim.formulation.text.timesDaily': (v: Vars) => `Приём ${v.n}× в сутки`,
  'sim.formulation.text.forgivenessProxy':
    'Запас прочности при пропущенной дозе не измерялся; вместо него использовано отношение ' +
    '«остаточная/пиковая».',
  'sim.formulation.text.metoprololRanked':
    'Предпочтительна форма с замедленным высвобождением. Пиковые концентрации сукцината ER в плазме в ' +
    'среднем составляют от одной четверти до половины от соответствующей дозы обычного метопролола, что ' +
    'снижает пиковую β-блокаду и уменьшает β2-переход на пике — механизм, важный для архетипа дыхательных ' +
    'путей.',
  'sim.formulation.text.amlodipineNotIndicated':
    'Форма с замедленным высвобождением не показана — период полувыведения препарата 30–50 ч уже даёт ' +
    'ровный профиль концентрации, поэтому ER-форма изменила бы отношение «остаточная/пиковая» и колебания ' +
    'незначительно.',
}

export const dictionaries: { en: Record<DictKey, DictValue>; uz: Partial<Record<DictKey, DictValue>>; ru: Partial<Record<DictKey, DictValue>> } = {
  en,
  uz,
  ru,
}

// ---------------------------------------------------------------------------
// The non-hook resolver, for the modules that cannot call `useT()`
// ---------------------------------------------------------------------------

/**
 * `src/report/**` is framework-agnostic — it is run by tests, by the AI context
 * builder and by the worker as well as by React — so it cannot call `useT()`.
 * Those modules take a `Translate` as an INJECTED argument, exactly the way
 * `buildTiming` already takes `nameOf`, and default to `englishText` when the
 * caller has none. The fallback chain is the same one `useT` implements:
 * current language -> English -> the key itself.
 *
 * `TFunction` (useT.ts) is assignable to this type, so a component passes its
 * own `t` straight in.
 */
export type Translate = (key: DictKey, vars?: Vars) => string

export function translator(lang: Lang): Translate {
  return (key, vars = {}) => {
    const localized = lang === 'en' ? undefined : dictionaries[lang][key]
    const entry = localized ?? en[key]
    if (entry === undefined) return key
    return typeof entry === 'function' ? entry(vars) : entry
  }
}

/**
 * The default every report module falls back to. English is the source of
 * truth, so a builder called without a `t` produces exactly the sentences it
 * produced before this indirection existed — which is what keeps the plain-text
 * export, the AI context and the whole report test suite unchanged.
 */
export const englishText: Translate = translator('en')
