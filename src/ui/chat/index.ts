/**
 * The chat assistant. Mount it once, at the app shell, beside the router:
 *
 *     import { ChatAssistant } from './ui/chat'
 *     ...
 *     <ChatAssistant context={{ page, patient, regimen, run, rules, catalogue }} />
 *
 * It renders a floating button on every page and, when opened, a panel that
 * docks beside the page rather than over it. Everything it needs comes in
 * through `context`; it reads no other module's state.
 */

export { ChatAssistant, type ChatAssistantProps } from './ChatDock'
export {
  EMPTY_CHAT_CONTEXT,
  type ChatCatalogue,
  type ChatContext,
  type ChatPage,
  type ChatPatient,
  type ChatRegimen,
  type ChatRule,
  type ChatRun,
  type ChatSubstance,
} from '../../ai/chatContext'
export { dockGeometry, type ChatMode, type DockGeometry } from './dock'
