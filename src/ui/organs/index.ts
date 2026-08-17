/**
 * Public surface of the organ animation layer.
 *
 * The component Agent UI-C drives during a run takes exactly one required prop:
 *
 *     <OrganFigure frame={frame} />        // frame: EffectFrame | null
 *
 * It is also exported as `HumanFigure`, `AnimatedHuman`, `Organs` and as the module
 * default, so any reasonable import name resolves. All of them are the same component.
 */

export { OrganFigure, OrganFigure as HumanFigure, OrganFigure as AnimatedHuman, OrganFigure as Organs, default } from './OrganFigure'
export type { OrganFigureProps } from './OrganFigure'

/**
 * THE SCENE SYSTEM — a place to stand while a run plays.
 *
 * One body, several lenses, one camera. Every scene draws the same body from the same
 * EffectFrame stream; what changes is where the camera stands and which diagram is open
 * beside it. A scene is never a different simulation.
 *
 *     import { SCENES, OrganScene } from './ui/organs'
 *
 *     <OrganScene scene="kidney" frame={frame} history={frames} caption="Regimen A" />
 *
 * `scene` may be any SceneId; an unknown one falls back to the overview rather than
 * rendering nothing. `frame === null` holds a resting untreated baseline and says so.
 * Optional extras — refRanges, gates, autoAdvance, onSceneChange, showSelector — are all
 * defaulted, so the four documented props are enough on their own.
 */
export { OrganScene, SCENES, SceneSelector, DEFAULT_SCENE, sceneDef, sceneCamera, sceneWatch, scenesFor, suggestScene, SCENE_GEOMETRY, useReducedMotion } from './scenes'
export type { SceneId, SceneDef, SceneGeom, OrganSceneProps } from './scenes'

/**
 * The static "where does this drug work" view. Takes NO EffectFrame — it is knowledge,
 * not a run, so it renders on the substance and pill pages before anything is simulated.
 *
 *     <AffectedAnatomy substanceIds={['amlodipine']} />
 *     <AffectedAnatomy substanceIds={pill.actives} caption="…" variant="inline" />
 */
export { AffectedAnatomy } from './AffectedAnatomy'
export type { AffectedAnatomyProps } from './AffectedAnatomy'
export {
  ORGAN_ACTIONS,
  ORGAN_SITES,
  ACTING_SUBSTANCES,
  hasOrganAction,
  organActions,
  substanceLabel,
} from './effectMap'
export type { OrganAction, OrganSite, OrganSiteId } from './effectMap'

// Sub-elements, in case a page wants one mechanism panel on its own.
export { BodyFigure, BodySilhouette } from './BodyFigure'
export { Nephron, KidneyOutline } from './Kidney'
export { LiverReactors, LiverOutline } from './Liver'
export { Lungs } from './Lungs'
export { Heart } from './Heart'
export { Adrenal, RaasCascade } from './Adrenal'
export { Ankle, EdemaExplainer, derivedEdemaGrade } from './Periphery'
export { Conduit, ResistanceUnit } from './Vessels'
export { SelectivityPanel } from './Selectivity'
export { ChemistryGauges, Gauge } from './Gauges'
export { BadgeStrip, useBadges, useCoughEvents } from './Badges'

// The channel vocabulary, for callers that need the same normalisations.
export {
  norm,
  bip,
  clamp,
  tint,
  tintWash,
  ORGAN,
  DRUGS,
  DRUG_ORDER,
  ION,
  BADGES,
  FALLBACK_REF,
  baselineFrame,
  formatSignal,
  isProxy,
  PROXY_FIELDS,
  T1_CELL_POPULATION,
  METOPROLOL_BETA2_CROSSOVER_NG_ML,
} from './channels'
export type { RefRanges, DrugIdentity, BadgeSpec, AnatomicalTier, TintWash } from './channels'
