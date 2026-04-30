// ===========================================================================
// @dynaep/core - Temporal Event Types
// Defines the seven dynAEP temporal event types used to coordinate clock
// synchronization, causal ordering, anomaly detection, forecasting, and
// temporal resets across the bridge-agent event stream.
// ===========================================================================

import type { BridgeTimestamp } from "./clock";
import type { TemporalViolation } from "./validator";
import type { ForecastPoint, RuntimeCoordinates } from "./forecast";

// ---------------------------------------------------------------------------
// Event Interfaces
// ---------------------------------------------------------------------------

/**
 * Emitted when the bridge clock completes a synchronization cycle.
 * Carries the resolved offset and the time source that was used.
 */
export interface ClockSyncEvent {
  type: "CUSTOM";
  dynaep_type: "AEP_CLOCK_SYNC";
  bridgeTimeMs: number;
  source: "ntp" | "ptp" | "system";
  offsetMs: number;
  syncedAt: number;
}

/**
 * Wraps any AG-UI event with a bridge-authoritative temporal stamp,
 * causal position counter, and a vector clock snapshot for distributed
 * ordering across multiple agents.
 */
export interface TemporalStampEvent {
  type: "CUSTOM";
  dynaep_type: "AEP_TEMPORAL_STAMP";
  originalEventType: string;
  targetId: string;
  bridgeTimestamp: BridgeTimestamp;
  causalPosition: number;
  vectorClock: Record<string, number>;
}

/**
 * Sent back to the agent when an incoming event fails temporal
 * validation. Includes the full list of violations and the original
 * event timestamp (if available) so the agent can diagnose the issue.
 */
export interface TemporalRejectionEvent {
  type: "CUSTOM";
  dynaep_type: "DYNAEP_TEMPORAL_REJECTION";
  targetId: string;
  error: string;
  violations: TemporalViolation[];
  originalEventTimestamp: number | null;
  bridgeTimestamp: BridgeTimestamp;
}

/**
 * Raised when the causal ordering layer detects a gap or
 * out-of-sequence delivery from an agent. The event records
 * the expected vs received sequence numbers and whether the
 * out-of-order event was buffered for later replay or dropped.
 */
export interface CausalViolationEvent {
  type: "CUSTOM";
  dynaep_type: "DYNAEP_CAUSAL_VIOLATION";
  eventId: string;
  agentId: string;
  expectedSequence: number;
  receivedSequence: number;
  missingDependencies: string[];
  bufferStatus: "buffered" | "dropped";
}

/**
 * Contains a set of predicted future coordinates for an element,
 * produced by the temporal forecasting layer. Agents can use this
 * to pre-position layout or pre-fetch data before the predicted
 * state materializes.
 */
export interface TemporalForecastEvent {
  type: "CUSTOM";
  dynaep_type: "AEP_TEMPORAL_FORECAST";
  targetId: string;
  horizonMs: number;
  predictions: ForecastPoint[];
  confidence: number;
  forecastedAt: number;
}

/**
 * Emitted when runtime coordinates diverge from the forecasted
 * values beyond an acceptable threshold. Includes the predicted
 * and actual coordinate snapshots plus an action recommendation.
 */
export interface TemporalAnomalyEvent {
  type: "CUSTOM";
  dynaep_type: "AEP_TEMPORAL_ANOMALY";
  targetId: string;
  anomalyScore: number;
  predicted: Partial<RuntimeCoordinates>;
  actual: Partial<RuntimeCoordinates>;
  recommendation: "pass" | "warn" | "require_approval";
  bridgeTimestamp: BridgeTimestamp;
}

/**
 * Broadcast when the temporal layer performs a full reset of its
 * vector clocks. This can happen on schema reload, clock resync,
 * or manual operator intervention. Agents receiving this event
 * should discard any buffered causal state and re-derive from the
 * new vector clock.
 */
export interface TemporalResetEvent {
  type: "CUSTOM";
  dynaep_type: "AEP_TEMPORAL_RESET";
  reason: "schema_reload" | "clock_resync" | "manual";
  oldVectorClock: Record<string, number>;
  newVectorClock: Record<string, number>;
  resetAt: number;
}

// ---------------------------------------------------------------------------
// Union Type
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all seven temporal event types. Use the
 * dynaep_type field to narrow to a specific variant.
 */
export type TemporalEvent =
  | ClockSyncEvent
  | TemporalStampEvent
  | TemporalRejectionEvent
  | CausalViolationEvent
  | TemporalForecastEvent
  | TemporalAnomalyEvent
  | TemporalResetEvent;

// ---------------------------------------------------------------------------
// Type Guard Functions
// ---------------------------------------------------------------------------

/**
 * Returns true if the given event is a ClockSyncEvent.
 */
export function isClockSyncEvent(e: unknown): e is ClockSyncEvent {
  if (typeof e !== "object" || e === null) return false;
  const obj = e as Record<string, unknown>;
  return obj.type === "CUSTOM" && obj.dynaep_type === "AEP_CLOCK_SYNC";
}

/**
 * Returns true if the given event is a TemporalStampEvent.
 */
export function isTemporalStampEvent(e: unknown): e is TemporalStampEvent {
  if (typeof e !== "object" || e === null) return false;
  const obj = e as Record<string, unknown>;
  return obj.type === "CUSTOM" && obj.dynaep_type === "AEP_TEMPORAL_STAMP";
}

/**
 * Returns true if the given event is a TemporalRejectionEvent.
 */
export function isTemporalRejectionEvent(e: unknown): e is TemporalRejectionEvent {
  if (typeof e !== "object" || e === null) return false;
  const obj = e as Record<string, unknown>;
  return obj.type === "CUSTOM" && obj.dynaep_type === "DYNAEP_TEMPORAL_REJECTION";
}

/**
 * Returns true if the given event is a CausalViolationEvent.
 */
export function isCausalViolationEvent(e: unknown): e is CausalViolationEvent {
  if (typeof e !== "object" || e === null) return false;
  const obj = e as Record<string, unknown>;
  return obj.type === "CUSTOM" && obj.dynaep_type === "DYNAEP_CAUSAL_VIOLATION";
}

/**
 * Returns true if the given event is a TemporalForecastEvent.
 */
export function isTemporalForecastEvent(e: unknown): e is TemporalForecastEvent {
  if (typeof e !== "object" || e === null) return false;
  const obj = e as Record<string, unknown>;
  return obj.type === "CUSTOM" && obj.dynaep_type === "AEP_TEMPORAL_FORECAST";
}

/**
 * Returns true if the given event is a TemporalAnomalyEvent.
 */
export function isTemporalAnomalyEvent(e: unknown): e is TemporalAnomalyEvent {
  if (typeof e !== "object" || e === null) return false;
  const obj = e as Record<string, unknown>;
  return obj.type === "CUSTOM" && obj.dynaep_type === "AEP_TEMPORAL_ANOMALY";
}

/**
 * Returns true if the given event is a TemporalResetEvent.
 */
export function isTemporalResetEvent(e: unknown): e is TemporalResetEvent {
  if (typeof e !== "object" || e === null) return false;
  const obj = e as Record<string, unknown>;
  return obj.type === "CUSTOM" && obj.dynaep_type === "AEP_TEMPORAL_RESET";
}

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------

/**
 * Parameters accepted by createClockSyncEvent. The type and dynaep_type
 * fields are set automatically by the factory.
 */
export interface ClockSyncParams {
  bridgeTimeMs: number;
  source: "ntp" | "ptp" | "system";
  offsetMs: number;
  syncedAt: number;
}

/**
 * Create a ClockSyncEvent with the correct type discriminators.
 */
export function createClockSyncEvent(params: ClockSyncParams): ClockSyncEvent {
  return {
    type: "CUSTOM",
    dynaep_type: "AEP_CLOCK_SYNC",
    bridgeTimeMs: params.bridgeTimeMs,
    source: params.source,
    offsetMs: params.offsetMs,
    syncedAt: params.syncedAt,
  };
}

/**
 * Parameters accepted by createTemporalRejectionEvent. The type and
 * dynaep_type fields are set automatically by the factory.
 */
export interface TemporalRejectionParams {
  targetId: string;
  error: string;
  violations: TemporalViolation[];
  originalEventTimestamp: number | null;
  bridgeTimestamp: BridgeTimestamp;
}

/**
 * Create a TemporalRejectionEvent with the correct type discriminators.
 */
export function createTemporalRejectionEvent(params: TemporalRejectionParams): TemporalRejectionEvent {
  return {
    type: "CUSTOM",
    dynaep_type: "DYNAEP_TEMPORAL_REJECTION",
    targetId: params.targetId,
    error: params.error,
    violations: params.violations,
    originalEventTimestamp: params.originalEventTimestamp,
    bridgeTimestamp: params.bridgeTimestamp,
  };
}

/**
 * Parameters accepted by createCausalViolationEvent. The type and
 * dynaep_type fields are set automatically by the factory.
 */
export interface CausalViolationParams {
  eventId: string;
  agentId: string;
  expectedSequence: number;
  receivedSequence: number;
  missingDependencies: string[];
  bufferStatus: "buffered" | "dropped";
}

/**
 * Create a CausalViolationEvent with the correct type discriminators.
 */
export function createCausalViolationEvent(params: CausalViolationParams): CausalViolationEvent {
  return {
    type: "CUSTOM",
    dynaep_type: "DYNAEP_CAUSAL_VIOLATION",
    eventId: params.eventId,
    agentId: params.agentId,
    expectedSequence: params.expectedSequence,
    receivedSequence: params.receivedSequence,
    missingDependencies: params.missingDependencies,
    bufferStatus: params.bufferStatus,
  };
}

/**
 * Parameters accepted by createTemporalResetEvent. The type and
 * dynaep_type fields are set automatically by the factory.
 */
export interface TemporalResetParams {
  reason: "schema_reload" | "clock_resync" | "manual";
  oldVectorClock: Record<string, number>;
  newVectorClock: Record<string, number>;
  resetAt: number;
}

/**
 * Create a TemporalResetEvent with the correct type discriminators.
 */
export function createTemporalResetEvent(params: TemporalResetParams): TemporalResetEvent {
  return {
    type: "CUSTOM",
    dynaep_type: "AEP_TEMPORAL_RESET",
    reason: params.reason,
    oldVectorClock: params.oldVectorClock,
    newVectorClock: params.newVectorClock,
    resetAt: params.resetAt,
  };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Recursively sort all object keys in a value so that JSON output
 * is deterministic regardless of property insertion order.
 */
function sortKeysDeep(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      sorted[key] = sortKeysDeep(obj[key]);
    }
    return sorted;
  }

  return value;
}

/**
 * Serialize a TemporalEvent to a JSON string with deterministic
 * key ordering. This produces stable output suitable for hashing,
 * logging, and wire transmission where byte-level reproducibility
 * is required.
 */
export function serializeTemporalEvent(event: TemporalEvent): string {
  const sorted = sortKeysDeep(event);
  return JSON.stringify(sorted);
}
