/**
 * Browser half: re-exports the shared core (config, templates, guards).
 *
 * The engine itself moved into the host process in 0.8.0
 * (see src/host/engine.ts); this module only serves the settings card and
 * anything else the thin browser half still needs.
 */
export {
  DEFAULT_CONFIG,
  effectiveCooldown,
  fillTemplate,
  isTransientAgentError,
  isTransientFailure,
  resolveConfig,
  type AutoContinueConfig,
  type AutoContinueSettings,
  type DayStats,
  type FailureFacts,
  type TemplateContext,
} from '../shared/core.ts';
