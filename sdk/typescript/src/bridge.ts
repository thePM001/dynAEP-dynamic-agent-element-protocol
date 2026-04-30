// ===========================================================================
// @dynaep/core - dynAEP Validation Bridge
// Sits between AG-UI event stream and AEP frontend renderer.
// Every AG-UI event targeting an AEP element is validated before application.
// Agents NEVER mint IDs. The bridge mints all IDs.
// Agents NEVER own the clock. The bridge stamps all events.
// ===========================================================================

import type {
  AEPConfig,
  AEPElement,
  AEPRegistryEntry,
  AEPTheme,
  AEPValidationResult,
} from "@aep/core";
import { zBandForPrefix, prefixFromId, isTemplateInstance, validateJIT } from "@aep/core";

// TA-1: Temporal Authority imports
import { BridgeClock, type ClockConfig, type BridgeTimestamp } from "./temporal/clock";
import { TemporalValidator, type TemporalValidatorConfig, type TemporalValidationResult } from "./temporal/validator";
import { CausalOrderingEngine, type CausalConfig, type CausalEvent } from "./temporal/causal";
import { ForecastSidecar, type ForecastConfig } from "./temporal/forecast";
import {
  type TemporalRejectionEvent,
  type TemporalStampEvent,
  type ClockSyncEvent,
  type TemporalResetEvent,
  createTemporalRejectionEvent,
  createTemporalResetEvent,
  createClockSyncEvent,
} from "./temporal/events";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DynAEPBridgeConfig {
  validation: {
    mode: "strict" | "permissive" | "log_only";
    jit_on_every_delta: boolean;
  };
  runtime_reflection: {
    enabled: boolean;
    method: "observer" | "polling";
    debounce_ms: number;
    broadcast_to_agent: boolean;
  };
  approval_policy: Record<string, "auto" | "require_approval">;
  conflict_resolution: {
    mode: "last_write_wins" | "optimistic_locking";
  };
  id_minting: {
    enabled: boolean;
    counters_persist: boolean;
  };
  // TA-1: Temporal Authority configuration
  timekeeping?: ClockConfig;
  temporal_validation?: TemporalValidatorConfig;
  causal_ordering?: CausalConfig;
  forecast?: ForecastConfig;
}

export interface DynAEPRejection {
  type: "CUSTOM";
  dynaep_type: "DYNAEP_REJECTION";
  target_id: string;
  error: string;
  original_event_timestamp: number;
}

interface AGUIEvent {
  type: string;
  timestamp?: number;
  delta?: Array<{ op: string; path: string; value?: any; from?: string }>;
  dynaep_type?: string;
  target_id?: string;
  mutation?: Record<string, any>;
  query?: string;
  expected_version?: number;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Prefix-to-Type Mapping (for ID minting from type name)
// ---------------------------------------------------------------------------

const TYPE_TO_PREFIX: Record<string, string> = {
  shell: "SH", panel: "PN", component: "CP", navigation: "NV",
  cell_zone: "CZ", cell_node: "CN", toolbar: "TB", widget: "WD",
  overlay: "OV", modal: "MD", dropdown: "DD", tooltip: "TT",
  form: "FM", icon: "IC",
};

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

export class DynAEPBridge {
  private config: AEPConfig;
  private liveElements: Record<string, AEPElement>;
  private bridgeConfig: DynAEPBridgeConfig;
  private idCounters: Record<string, number> = {};
  private elementVersions: Record<string, number> = {};
  private reflectionTimer: ReturnType<typeof setInterval> | null = null;
  private observers: Map<string, ResizeObserver> = new Map();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // TA-1: Temporal Authority subsystems
  private bridgeClock: BridgeClock;
  private temporalValidator: TemporalValidator;
  private causalEngine: CausalOrderingEngine;
  private forecastSidecar: ForecastSidecar;
  private clockSyncTimer: ReturnType<typeof setInterval> | null = null;
  private agentSequenceCounters: Record<string, number> = {};
  private eventEmitter: ((event: any) => void) | null = null;

  constructor(config: AEPConfig, bridgeConfig: DynAEPBridgeConfig) {
    this.config = config;
    this.liveElements = structuredClone(config.scene.elements);
    this.bridgeConfig = bridgeConfig;

    // Initialise ID counters from existing elements
    for (const id of Object.keys(this.liveElements)) {
      try {
        const prefix = prefixFromId(id);
        const num = parseInt(id.substring(3), 10);
        if (!isNaN(num)) {
          this.idCounters[prefix] = Math.max(this.idCounters[prefix] ?? 0, num);
        }
      } catch {
        // Skip malformed IDs
      }
    }

    // Initialise element versions
    for (const id of Object.keys(this.liveElements)) {
      this.elementVersions[id] = 1;
    }

    // TA-1: Initialise temporal authority subsystems
    const clockConfig: ClockConfig = bridgeConfig.timekeeping ?? {
      protocol: "system",
      source: "pool.ntp.org",
      syncIntervalMs: 30000,
      maxDriftMs: 50,
      bridgeIsAuthority: true,
    };
    this.bridgeClock = new BridgeClock(clockConfig);

    const temporalConfig: TemporalValidatorConfig = bridgeConfig.temporal_validation ?? {
      maxDriftMs: clockConfig.maxDriftMs,
      maxFutureMs: 500,
      maxStalenessMs: 5000,
      overwriteTimestamps: clockConfig.bridgeIsAuthority,
      logRejections: true,
      mode: bridgeConfig.validation.mode,
    };
    this.temporalValidator = new TemporalValidator(this.bridgeClock, temporalConfig);

    const causalConfig: CausalConfig = bridgeConfig.causal_ordering ?? {
      maxReorderBufferSize: 64,
      maxReorderWaitMs: 200,
      conflictResolution: bridgeConfig.conflict_resolution.mode,
      enableVectorClocks: true,
      enableElementHistory: true,
      historyDepth: 100,
    };
    this.causalEngine = new CausalOrderingEngine(causalConfig);

    const forecastConfig: ForecastConfig = bridgeConfig.forecast ?? {
      enabled: false,
      timesfmEndpoint: null,
      timesfmMode: "local",
      contextWindow: 64,
      forecastHorizon: 12,
      anomalyThreshold: 3.0,
      debounceMs: 250,
      maxTrackedElements: 500,
    };
    this.forecastSidecar = new ForecastSidecar(forecastConfig);

    // Attempt initial clock sync (non-blocking)
    this.bridgeClock.sync().catch(() => {
      console.warn("[dynAEP-TA] Initial clock sync failed, using system clock fallback");
    });
  }

  // -------------------------------------------------------------------------
  // ID Minting
  // -------------------------------------------------------------------------

  mintElementId(type: string): string {
    const prefix = TYPE_TO_PREFIX[type];
    if (!prefix) {
      throw new Error(`Unknown element type: "${type}". Valid types: ${Object.keys(TYPE_TO_PREFIX).join(", ")}`);
    }
    const next = (this.idCounters[prefix] ?? 0) + 1;
    this.idCounters[prefix] = next;
    return `${prefix}-${String(next).padStart(5, "0")}`;
  }

  getNextAvailableId(prefix: string): string {
    const next = (this.idCounters[prefix] ?? 0) + 1;
    return `${prefix}-${String(next).padStart(5, "0")}`;
  }

  // -------------------------------------------------------------------------
  // Process incoming AG-UI event
  // -------------------------------------------------------------------------

  processEvent(event: AGUIEvent): AGUIEvent | DynAEPRejection {
    // TA-1 Step 1: Temporal stamp with bridge clock
    const temporalResult = this.temporalValidator.validate(event);

    // TA-1 Step 2: Reject on temporal violations in strict mode
    if (!temporalResult.accepted) {
      const rejection: TemporalRejectionEvent = createTemporalRejectionEvent({
        targetId: event.target_id ?? event.dynaep_type ?? "unknown",
        error: temporalResult.violations.map((v) => v.detail).join("; "),
        violations: temporalResult.violations,
        originalEventTimestamp: event.timestamp ?? null,
        bridgeTimestamp: temporalResult.bridgeTimestamp,
      });
      return rejection as unknown as DynAEPRejection;
    }

    // TA-1 Step 3: Causal ordering check (for events with agent context)
    if (event._agentId && event._sequenceNumber !== undefined) {
      const causalEvent: CausalEvent = {
        eventId: event._eventId ?? `evt-${temporalResult.bridgeTimestamp.bridgeTimeMs}`,
        agentId: event._agentId,
        bridgeTimeMs: temporalResult.bridgeTimestamp.bridgeTimeMs,
        targetElementId: event.target_id ?? "",
        sequenceNumber: event._sequenceNumber,
        vectorClock: event._vectorClock ?? {},
        causalDependencies: event._causalDependencies ?? [],
      };
      const causalResult = this.causalEngine.process(causalEvent);
      if (!causalResult.ordered && causalResult.violations.length > 0) {
        const hasRegression = causalResult.violations.some(
          (v) => v.type === "agent_clock_regression"
        );
        if (hasRegression) {
          const rejection: TemporalRejectionEvent = createTemporalRejectionEvent({
            targetId: event.target_id ?? "unknown",
            error: causalResult.violations.map((v) => v.detail).join("; "),
            violations: causalResult.violations.map((v) => ({
              type: "causal_violation" as const,
              detail: v.detail,
              agentTimeMs: event.timestamp ?? null,
              bridgeTimeMs: temporalResult.bridgeTimestamp.bridgeTimeMs,
              thresholdMs: 0,
            })),
            originalEventTimestamp: event.timestamp ?? null,
            bridgeTimestamp: temporalResult.bridgeTimestamp,
          });
          return rejection as unknown as DynAEPRejection;
        }
      }
    }

    // TA-1 Step 4: Forecast anomaly check (async, non-blocking for normal flow)
    if (
      event.type === "CUSTOM" &&
      event.dynaep_type === "AEP_RUNTIME_COORDINATES" &&
      event.target_id &&
      event.coordinates
    ) {
      this.forecastSidecar.ingest(event as any);
    }

    // Proceed with structural validation (existing pipeline)
    let structuralResult: AGUIEvent | DynAEPRejection;

    if (event.type === "STATE_DELTA") {
      structuralResult = this.processStateDelta(event);
    } else if (event.type === "CUSTOM" && typeof event.dynaep_type === "string") {
      structuralResult = this.processDynAEPEvent(event);
    } else if (event.type === "TOOL_CALL_START" || event.type === "TOOL_CALL_END") {
      structuralResult = event;
    } else {
      structuralResult = event;
    }

    // TA-1 Step 5: Attach temporal metadata to accepted events
    if ((structuralResult as any).dynaep_type !== "DYNAEP_REJECTION") {
      (structuralResult as any)._temporal = temporalResult.bridgeTimestamp;
    }

    return structuralResult;
  }

  // -------------------------------------------------------------------------
  // STATE_DELTA: Three-layer path routing
  // -------------------------------------------------------------------------

  private processStateDelta(event: AGUIEvent): AGUIEvent | DynAEPRejection {
    if (!this.bridgeConfig.validation.jit_on_every_delta) return event;

    const deltas = event.delta;
    if (!Array.isArray(deltas)) return event;

    for (const op of deltas) {
      if (typeof op.path !== "string") continue;
      const parts = op.path.split("/").filter(Boolean);
      if (parts.length < 2) continue;

      const layer = parts[0];
      const targetId = parts[1];
      const field = parts.length > 2 ? parts[2] : undefined;

      let result: AEPValidationResult;

      if (layer === "elements") {
        // Layer 1: Structure
        result = this.validateStructureDelta(targetId, field, op.value);
      } else if (layer === "registry") {
        // Layer 2: Behaviour
        result = this.validateBehaviourDelta(targetId, field);
      } else if (layer === "theme" && parts[1] === "component_styles") {
        // Layer 3: Skin
        const styleKey = parts[2] ?? "";
        result = this.validateSkinDelta(styleKey);
      } else {
        continue;
      }

      if (!result.valid) {
        return this.createRejection(targetId, result.errors.join("; "), event.timestamp);
      }

      // Optimistic locking check
      if (
        this.bridgeConfig.conflict_resolution.mode === "optimistic_locking" &&
        layer === "elements" &&
        event.expected_version !== undefined
      ) {
        const currentVersion = this.elementVersions[targetId] ?? 0;
        if (event.expected_version !== currentVersion) {
          return this.createRejection(
            targetId,
            `Optimistic lock conflict: expected version ${event.expected_version} but current is ${currentVersion}`,
            event.timestamp,
          );
        }
      }
    }

    // All valid: apply deltas
    for (const op of deltas) {
      const parts = op.path.split("/").filter(Boolean);
      if (parts[0] === "elements" && parts.length >= 3) {
        const id = parts[1];
        const field = parts[2];
        const el = this.liveElements[id];
        if (el && field in el) {
          (el as Record<string, any>)[field] = op.value;
          this.elementVersions[id] = (this.elementVersions[id] ?? 0) + 1;
        }
      }
    }

    return event;
  }

  private validateStructureDelta(
    targetId: string,
    field: string | undefined,
    value: any,
  ): AEPValidationResult {
    const errors: string[] = [];

    if (!this.liveElements[targetId] && !isTemplateInstance(targetId, this.config.registry)) {
      errors.push(`Unregistered element: ${targetId} does not exist in scene`);
      return { valid: false, errors, warnings: [] };
    }

    if (field === "z" && typeof value === "number") {
      try {
        const prefix = prefixFromId(targetId);
        const [minZ, maxZ] = zBandForPrefix(prefix);
        if (value < minZ || value > maxZ) {
          errors.push(`z-band violation: ${targetId} z=${value} outside band ${minZ}-${maxZ}`);
        }
      } catch (e: any) {
        errors.push(e.message);
      }
    }

    if (field === "parent" && value !== null && typeof value === "string") {
      if (!this.liveElements[value]) {
        errors.push(`${targetId} references non-existent parent ${value}`);
      }
    }

    return { valid: errors.length === 0, errors, warnings: [] };
  }

  private validateBehaviourDelta(targetId: string, _field: string | undefined): AEPValidationResult {
    if (!this.config.registry[targetId] && !isTemplateInstance(targetId, this.config.registry)) {
      return {
        valid: false,
        errors: [`Cannot mutate behaviour: ${targetId} has no registry entry`],
        warnings: [],
      };
    }
    return { valid: true, errors: [], warnings: [] };
  }

  private validateSkinDelta(styleKey: string): AEPValidationResult {
    // Skin deltas targeting existing keys are always valid (theme is mutable)
    // Only warn if key doesn't exist yet (could be an addition)
    if (!this.config.theme.component_styles[styleKey]) {
      return { valid: true, errors: [], warnings: [`New skin key: ${styleKey} does not exist yet`] };
    }
    return { valid: true, errors: [], warnings: [] };
  }

  // -------------------------------------------------------------------------
  // Custom dynAEP events
  // -------------------------------------------------------------------------

  private processDynAEPEvent(event: AGUIEvent): AGUIEvent | DynAEPRejection {
    switch (event.dynaep_type) {
      case "AEP_MUTATE_STRUCTURE":
        return this.handleStructureMutation(event);
      case "AEP_MUTATE_BEHAVIOUR":
        return this.handleBehaviourMutation(event);
      case "AEP_MUTATE_SKIN":
        return this.handleSkinMutation(event);
      case "AEP_QUERY":
        return this.handleQuery(event);
      default:
        return event;
    }
  }

  // -------------------------------------------------------------------------
  // Structure mutation
  // -------------------------------------------------------------------------

  private handleStructureMutation(event: AGUIEvent): AGUIEvent | DynAEPRejection {
    const targetId = event.target_id ?? "";
    const mutation = event.mutation ?? {};
    const errors: string[] = [];

    if (!this.liveElements[targetId] && !isTemplateInstance(targetId, this.config.registry)) {
      errors.push(`Unknown element: ${targetId}`);
    }

    if (mutation.parent && !this.liveElements[mutation.parent]) {
      errors.push(`Cannot move ${targetId}: parent ${mutation.parent} does not exist`);
    }

    if (mutation.anchors && typeof mutation.anchors === "object") {
      for (const [dir, anchor] of Object.entries(mutation.anchors as Record<string, string>)) {
        if (typeof anchor !== "string") continue;
        const anchorTarget = anchor.split(".")[0];
        if (anchorTarget !== "viewport" && !this.liveElements[anchorTarget]) {
          errors.push(`Invalid anchor: ${targetId} ${dir} -> non-existent ${anchorTarget}`);
        }
      }
    }

    if (mutation.skin_binding && !this.config.theme.component_styles[mutation.skin_binding]) {
      errors.push(`${targetId} skin_binding "${mutation.skin_binding}" not found in theme`);
    }

    if (errors.length > 0) {
      return this.createRejection(targetId, errors.join("; "), event.timestamp);
    }

    // Apply
    const el = this.liveElements[targetId];
    if (el) {
      if (mutation.parent) {
        // Remove from old parent
        const oldParent = el.parent ? this.liveElements[el.parent] : null;
        if (oldParent) {
          oldParent.children = oldParent.children.filter((c) => c !== targetId);
        }
        // Set new parent
        el.parent = mutation.parent;
        // Add to new parent
        const newParent = this.liveElements[mutation.parent];
        if (newParent && !newParent.children.includes(targetId)) {
          newParent.children.push(targetId);
        }
      }
      if (mutation.anchors && el.layout) {
        el.layout.anchors = mutation.anchors;
      }
      this.elementVersions[targetId] = (this.elementVersions[targetId] ?? 0) + 1;
    }

    return event;
  }

  // -------------------------------------------------------------------------
  // Behaviour mutation
  // -------------------------------------------------------------------------

  private handleBehaviourMutation(event: AGUIEvent): AGUIEvent | DynAEPRejection {
    const targetId = event.target_id ?? "";

    if (!this.config.registry[targetId] && !isTemplateInstance(targetId, this.config.registry)) {
      return this.createRejection(
        targetId,
        `Cannot mutate behaviour: ${targetId} has no registry entry`,
        event.timestamp,
      );
    }

    return event;
  }

  // -------------------------------------------------------------------------
  // Skin mutation
  // -------------------------------------------------------------------------

  private handleSkinMutation(event: AGUIEvent): AGUIEvent | DynAEPRejection {
    const targetId = event.target_id ?? "";

    if (!this.config.theme.component_styles[targetId]) {
      return this.createRejection(
        targetId,
        `Cannot mutate skin: "${targetId}" does not exist in component_styles`,
        event.timestamp,
      );
    }

    return event;
  }

  // -------------------------------------------------------------------------
  // Query handler
  // -------------------------------------------------------------------------

  private handleQuery(event: AGUIEvent): AGUIEvent {
    const query = event.query ?? "";
    const targetId = event.target_id ?? "";
    let result: any = null;

    const el = this.liveElements[targetId];

    switch (query) {
      case "children_of":
        result = el?.children ?? [];
        break;
      case "parent_of":
        result = el?.parent ?? null;
        break;
      case "z_band_of":
        try {
          result = zBandForPrefix(prefixFromId(targetId));
        } catch {
          result = [0, 99];
        }
        break;
      case "visible_at_breakpoint":
        result = el?.responsive_matrix ?? { all: el?.visible ?? false };
        break;
      case "full_element":
        result = {
          scene: el ?? null,
          registry: this.config.registry[targetId] ?? null,
          version: this.elementVersions[targetId] ?? 0,
        };
        break;
      case "next_available_id":
        // targetId here is used as the prefix (e.g., "CP")
        result = this.getNextAvailableId(targetId);
        break;
    }

    return {
      type: "CUSTOM",
      dynaep_type: "AEP_QUERY_RESULT",
      target_id: targetId,
      result,
    };
  }

  // -------------------------------------------------------------------------
  // Schema Reload
  // -------------------------------------------------------------------------

  reloadConfig(newConfig: AEPConfig): AGUIEvent {
    const oldRevision = this.config.meta.reg_schema_revision;
    this.config = newConfig;
    this.liveElements = structuredClone(newConfig.scene.elements);

    // Re-initialise counters
    for (const id of Object.keys(this.liveElements)) {
      try {
        const prefix = prefixFromId(id);
        const num = parseInt(id.substring(3), 10);
        if (!isNaN(num)) {
          this.idCounters[prefix] = Math.max(this.idCounters[prefix] ?? 0, num);
        }
      } catch { /* skip */ }
    }

    // TA-1: Reset causal ordering on schema reload
    const oldVectorClock = this.causalEngine.getVectorClock();
    this.causalEngine.reset();
    const newVectorClock = this.causalEngine.getVectorClock();

    // Prune forecast tracking for removed elements
    const activeIds = Object.keys(this.liveElements);
    this.forecastSidecar.prune(activeIds);

    // Emit temporal reset event if emitter is available
    if (this.eventEmitter) {
      const resetEvent = createTemporalResetEvent({
        reason: "schema_reload",
        oldVectorClock,
        newVectorClock,
        resetAt: this.bridgeClock.now(),
      });
      this.eventEmitter(resetEvent);
    }

    return {
      type: "CUSTOM",
      dynaep_type: "DYNAEP_SCHEMA_RELOAD",
      old_revision: oldRevision,
      new_revision: newConfig.meta.reg_schema_revision,
      aep_version: newConfig.scene.aep_version,
    };
  }

  // -------------------------------------------------------------------------
  // Runtime Reflection (ResizeObserver, SSR-safe)
  // -------------------------------------------------------------------------

  startReflection(emitEvent: (event: any) => void): void {
    if (!this.bridgeConfig.runtime_reflection.enabled) return;
    if (typeof document === "undefined" || typeof ResizeObserver === "undefined") return;

    const debounceMs = this.bridgeConfig.runtime_reflection.debounce_ms;

    const measure = (id: string) => {
      const el = document.querySelector(`[data-aep-id="${id}"]`);
      if (!el) return;

      // Debounce per element
      const existing = this.debounceTimers.get(id);
      if (existing) clearTimeout(existing);

      this.debounceTimers.set(id, setTimeout(() => {
        const rect = el.getBoundingClientRect();
        const w = typeof window !== "undefined" ? window.innerWidth : 1024;
        let bp = "vp-lg";
        if (w < 640) bp = "base";
        else if (w < 1024) bp = "vp-md";

        emitEvent({
          type: "CUSTOM",
          dynaep_type: "AEP_RUNTIME_COORDINATES",
          target_id: id,
          coordinates: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            rendered_at: bp,
            visible: rect.width > 0 && rect.height > 0,
          },
        });
        this.debounceTimers.delete(id);
      }, debounceMs));
    };

    // Observe all existing elements
    for (const id of Object.keys(this.liveElements)) {
      const el = document.querySelector(`[data-aep-id="${id}"]`);
      if (el) {
        const observer = new ResizeObserver(() => measure(id));
        observer.observe(el);
        this.observers.set(id, observer);
      }
    }
  }

  stopReflection(): void {
    for (const observer of this.observers.values()) {
      observer.disconnect();
    }
    this.observers.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  // -------------------------------------------------------------------------
  // Scene Snapshot
  // -------------------------------------------------------------------------

  getSceneSnapshot(): Record<string, AEPElement> {
    return structuredClone(this.liveElements);
  }

  getLiveElements(): Record<string, AEPElement> {
    return this.liveElements;
  }

  getElementVersion(id: string): number {
    return this.elementVersions[id] ?? 0;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private createRejection(targetId: string, error: string, ts?: number): DynAEPRejection {
    return {
      type: "CUSTOM",
      dynaep_type: "DYNAEP_REJECTION",
      target_id: targetId,
      error,
      original_event_timestamp: ts ?? Date.now(),
    };
  }

  // -------------------------------------------------------------------------
  // AG-UI Frontend Tool Definitions
  // -------------------------------------------------------------------------

  getToolDefinitions(): any[] {
    return [
      {
        name: "aep_add_element",
        description: "Propose a new element to the AEP scene graph. The bridge assigns and returns the official AEP ID.",
        parameters: {
          type: "object",
          properties: {
            type: { type: "string", description: "Element type (shell, panel, component, cell_zone, etc)" },
            parent: { type: "string", description: "AEP ID of the parent element" },
            z: { type: "integer", description: "z-index (must fall within correct band for type prefix)" },
            skin_binding: { type: "string", description: "Key mapping to component_styles in theme" },
            label: { type: "string", description: "Human-readable name" },
            layout: { type: "object", description: "Layout constraints (anchors, width, height)" },
          },
          required: ["type", "parent", "z", "skin_binding"],
        },
      },
      {
        name: "aep_move_element",
        description: "Change the parent or anchors of an existing AEP element",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string" },
            new_parent: { type: "string" },
            anchors: { type: "object" },
          },
          required: ["id"],
        },
      },
      {
        name: "aep_query_graph",
        description: "Query the AEP scene graph for element relationships, z-bands or viewport visibility",
        parameters: {
          type: "object",
          properties: {
            query_type: {
              type: "string",
              enum: ["children_of", "parent_of", "z_band_of", "visible_at_breakpoint", "full_element", "next_available_id"],
            },
            target_id: { type: "string" },
          },
          required: ["query_type", "target_id"],
        },
      },
      {
        name: "aep_swap_theme",
        description: "Replace the active AEP theme",
        parameters: {
          type: "object",
          properties: { theme_name: { type: "string" } },
          required: ["theme_name"],
        },
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Tool Call Handler
  // -------------------------------------------------------------------------

  handleToolCall(
    toolName: string,
    args: Record<string, any>,
  ): { success: boolean; element_id?: string; result?: any; errors?: string[] } {
    switch (toolName) {
      case "aep_add_element":
        return this.handleAddElement(args);
      case "aep_move_element":
        return this.handleMoveElement(args);
      case "aep_query_graph":
        return this.handleQueryTool(args);
      case "aep_swap_theme":
        return { success: true, result: `Theme swap to "${args.theme_name}" requested` };
      default:
        return { success: false, errors: [`Unknown tool: ${toolName}`] };
    }
  }

  private handleAddElement(args: Record<string, any>): {
    success: boolean; element_id?: string; errors?: string[];
  } {
    const { type, parent, z, skin_binding, label, layout } = args;
    const errors: string[] = [];

    // Validate type
    if (!TYPE_TO_PREFIX[type]) {
      errors.push(`Unknown element type: "${type}"`);
      return { success: false, errors };
    }

    // Validate parent exists
    if (!this.liveElements[parent]) {
      errors.push(`Parent ${parent} does not exist`);
      return { success: false, errors };
    }

    // Validate skin_binding resolves
    if (!this.config.theme.component_styles[skin_binding]) {
      errors.push(`skin_binding "${skin_binding}" not found in theme`);
      return { success: false, errors };
    }

    // Validate z-band
    const prefix = TYPE_TO_PREFIX[type];
    const [minZ, maxZ] = zBandForPrefix(prefix);
    if (typeof z !== "number" || z < minZ || z > maxZ) {
      errors.push(`z=${z} outside band ${minZ}-${maxZ} for prefix ${prefix}`);
      return { success: false, errors };
    }

    // Mint ID
    const newId = this.mintElementId(type);

    // Create element
    const newElement: AEPElement = {
      id: newId,
      type,
      label: label ?? newId,
      z,
      visible: true,
      parent,
      layout: layout ?? {},
      children: [],
    };

    // Apply to live scene
    this.liveElements[newId] = newElement;
    this.elementVersions[newId] = 1;

    // Add to parent children
    const parentEl = this.liveElements[parent];
    if (parentEl && !parentEl.children.includes(newId)) {
      parentEl.children.push(newId);
      this.elementVersions[parent] = (this.elementVersions[parent] ?? 0) + 1;
    }

    return { success: true, element_id: newId };
  }

  private handleMoveElement(args: Record<string, any>): {
    success: boolean; element_id?: string; errors?: string[];
  } {
    const { id, new_parent, anchors } = args;

    if (!this.liveElements[id]) {
      return { success: false, errors: [`Element ${id} not found`] };
    }

    if (new_parent) {
      if (!this.liveElements[new_parent]) {
        return { success: false, errors: [`Parent ${new_parent} not found`] };
      }

      const el = this.liveElements[id];
      // Remove from old parent
      if (el.parent && this.liveElements[el.parent]) {
        this.liveElements[el.parent].children = this.liveElements[el.parent].children.filter((c) => c !== id);
        this.elementVersions[el.parent] = (this.elementVersions[el.parent] ?? 0) + 1;
      }
      // Set new parent
      el.parent = new_parent;
      // Add to new parent
      if (!this.liveElements[new_parent].children.includes(id)) {
        this.liveElements[new_parent].children.push(id);
        this.elementVersions[new_parent] = (this.elementVersions[new_parent] ?? 0) + 1;
      }
    }

    if (anchors && this.liveElements[id].layout) {
      this.liveElements[id].layout.anchors = anchors;
    }

    this.elementVersions[id] = (this.elementVersions[id] ?? 0) + 1;
    return { success: true, element_id: id };
  }

  private handleQueryTool(args: Record<string, any>): {
    success: boolean; result?: any; errors?: string[];
  } {
    const queryEvent = this.handleQuery({
      type: "CUSTOM",
      dynaep_type: "AEP_QUERY",
      query: args.query_type,
      target_id: args.target_id,
    });
    return { success: true, result: (queryEvent as any).result };
  }

  // -------------------------------------------------------------------------
  // TA-1: Temporal Authority Accessors
  // -------------------------------------------------------------------------

  getClock(): BridgeClock {
    return this.bridgeClock;
  }

  getTemporalValidator(): TemporalValidator {
    return this.temporalValidator;
  }

  getCausalEngine(): CausalOrderingEngine {
    return this.causalEngine;
  }

  getForecastSidecar(): ForecastSidecar {
    return this.forecastSidecar;
  }

  // -------------------------------------------------------------------------
  // TA-1: Clock Sync Broadcasting
  // -------------------------------------------------------------------------

  startClockSync(emitEvent: (event: any) => void): void {
    this.eventEmitter = emitEvent;
    const syncIntervalMs = this.bridgeConfig.timekeeping?.syncIntervalMs ?? 30000;

    const doSync = async () => {
      const syncResult = await this.bridgeClock.sync();
      if (syncResult.success && this.eventEmitter) {
        const health = this.bridgeClock.health();
        const syncEvent: ClockSyncEvent = createClockSyncEvent({
          bridgeTimeMs: this.bridgeClock.now(),
          source: health.protocol,
          offsetMs: health.currentOffsetMs,
          syncedAt: health.lastSyncAt,
        });
        this.eventEmitter(syncEvent);
      }
    };

    doSync().catch(() => {
      console.warn("[dynAEP-TA] Clock sync broadcast failed");
    });
    this.clockSyncTimer = setInterval(() => {
      doSync().catch(() => {
        console.warn("[dynAEP-TA] Periodic clock sync failed");
      });
    }, syncIntervalMs);
  }

  stopClockSync(): void {
    if (this.clockSyncTimer) {
      clearInterval(this.clockSyncTimer);
      this.clockSyncTimer = null;
    }
    this.eventEmitter = null;
  }
}
