// ===========================================================================
// @dynaep/core - Type Definitions
// Central type re-exports for the dynAEP validation bridge.
// ===========================================================================

// TA-1: Temporal Authority types
export type { ClockConfig, BridgeTimestamp, ClockHealth } from "./temporal/clock";
export type {
  TemporalValidationResult,
  TemporalViolation,
  TemporalValidatorConfig,
} from "./temporal/validator";
export type {
  CausalEvent,
  CausalOrderResult,
  CausalViolation,
  CausalConfig,
} from "./temporal/causal";
export type {
  ForecastConfig,
  TemporalForecast,
  ForecastPoint,
  RuntimeCoordinates,
  RuntimeCoordinateEvent,
  AnomalyResult,
} from "./temporal/forecast";
export type {
  ClockSyncEvent,
  TemporalStampEvent,
  TemporalRejectionEvent,
  CausalViolationEvent,
  TemporalForecastEvent,
  TemporalAnomalyEvent,
  TemporalResetEvent,
  TemporalEvent,
} from "./temporal/events";

// Bridge types (re-exported for convenience)
export type { DynAEPBridgeConfig, DynAEPRejection } from "./bridge";
