# dynAEP: Dynamic Agent Element Protocol

## Open-Source Reference + Implementation

**Version 0.4** - 2nd May 2026
**Author:** thePM_001
**License:** Apache-2.0

## How to install dynAEP ?:
Copy the URL of the GitHub repo into your reasoning LLM + tell it "analyze the repo and prepare implementation plan for dynAEP integration into our project".

## 1. What Is dynAEP

dynAEP is the fusion of AEP (Agent Element Protocol) and AG-UI (Agent-User Interaction Protocol). It extends AEP's deterministic, hallucination-proof frontend governance with AG-UI's real-time bi-directional event streaming, creating a complete lifecycle protocol for live interactive agentic user interfaces.

**AEP** solves the build-time problem: AI agents scaffold, modify and validate UI structure against a mathematically verified topological matrix.

**AG-UI** solves the runtime problem: AI agents stream live updates, synchronize state, call tools and respond to user input in real time.

**dynAEP** fuses both into a single architecture where every live runtime event is constrained by AEP's deterministic graph. The agent cannot hallucinate a UI element at build time (AEP prevents it) and cannot hallucinate a state mutation at runtime (dynAEP validates every AG-UI delta against the AEP registry before applying it).

**dynAEP-TA** (v0.3+) adds temporal authority. AI agents have no reliable internal clock. When an agent emits a timestamp, that value is either parroted from its system prompt or fabricated. dynAEP-TA makes the bridge the sole authoritative time source for the entire protocol stack. Agents never own the clock, the same way agents never mint IDs. The bridge stamps every event, orders every sequence causally and governs how time-dependent outputs align with human temporal perception.

**dynAEP-TA v0.4** adds durable temporal state. All causal ordering state (vector clocks, reorder buffers, dependency graphs, agent registries) persists across bridge restarts via configurable storage backends (file, SQLite, external KV). TIM-compatible clock quality tracking classifies sync confidence. Four workflow temporal primitives (deadlines, schedules, sleep/resume, timeouts) use bridge-authoritative time. A three-phase recovery protocol enables graceful bridge restarts without full agent resets.

### The Protocol Stack

```
LAYER           PROTOCOL        FUNCTION
-----------     -----------     ----------------------------------------
Agent-Tools     MCP             Agent connects to external data and tools
Agent-Agent     (various)       Agents coordinate across distributed systems
Agent-User      AG-UI           Real-time event streaming between agent and frontend
Agent-UI-Gov    AEP             Deterministic UI structure, behaviour and skin
Agent-UI-Live   dynAEP          AEP governance applied to live AG-UI event streams
Agent-UI-Time   dynAEP-TA       Temporal authority, causal ordering, predictive forecasting, durable state
Agent-Percept   dynAEP-TA-P     Perceptual temporal governance for human-facing outputs
```

### What dynAEP Proves

AEP proves you can build UIs deterministically.
dynAEP proves you can stream live AI interactions deterministically.
dynAEP-TA proves you can govern time deterministically.
dynAEP-TA v0.4 proves you can persist and recover temporal state deterministically.
dynAEP-TA-P proves you can govern human temporal perception deterministically.

The existence of this protocol stack proves that AI hallucination is an engineering problem in any domain where ground truth can be precompiled into a deterministic registry. Structure, behaviour, skin, time and perception are all governable by architecture.

## 2. Architecture Overview

dynAEP sits between the AG-UI event stream and the rendered frontend. Every AG-UI event passes through the dynAEP Validation Bridge before reaching the UI or any output renderer.

```
  AGENT BACKEND (LangGraph / CrewAI / Google ADK / AWS / any AG-UI backend)
       |
       | AG-UI events (SSE / WebSocket)
       v
+---------------------------+
| dynAEP Bridge             |
|                           |
|  TEMPORAL AUTHORITY:      |
|  1. Receive event         |
|  2. Bridge clock stamp    |
|  3. Temporal validation   |
|     (drift, staleness,    |
|     future check)         |
|  4. Causal ordering       |
|     (vector clocks,       |
|     dependency check)     |
|  5. Forecast anomaly      |
|     check (TimesFM)       |
|                           |
|  PERCEPTION GOVERNANCE:   |
|  6. Parse temporal        |
|     annotations           |
|  7. Validate against      |
|     perception registry   |
|  8. Apply adaptive user   |
|     profile               |
|  9. Produce governed      |
|     envelope              |
|                           |
|  STRUCTURAL VALIDATION:   |
| 10. Parse target AEP      |
|     element               |
| 11. Validate against      |
|     scene + registry +    |
|     z-bands +             |
|     skin_bindings +       |
|     Rego policy           |
| 12. Mint IDs for new      |
|     elements              |
| 13. Apply or reject       |
+---------------------------+
       |                 |
       |                 +--------> TimesFM Sidecar
       |                            (forecast + anomaly detect)
       | Validated mutations only
       v
  OUTPUT RENDERER
  (React / Vue / Svelte / Tauri /
   TTS engine / haptic controller /
   notification service / sensor poller)
```

Temporal authority (steps 2-5) executes before structural validation. An event that fails temporal checks is rejected immediately and never reaches the z-band checker. Perception governance (steps 6-9) executes between temporal and structural validation for events carrying time-dependent output annotations.

### What the Bridge Validates

Every AG-UI STATE_DELTA or TOOL_CALL that targets an AEP element is checked:

- Does the target element ID exist in the scene graph or registry ?
- Is the proposed z-index within the correct band for the element prefix ?
- Does the mutation violate any forbidden pattern (Rego) ?
- Does a new skin_binding resolve to a valid component_styles block ?
- For Template Node instances: does the template exist and has it passed AOT ?
- For new elements: does the requested type exist in the AEP-FCR registry ?
- Is the event timestamp within acceptable drift of bridge-authoritative time ?
- Does the event satisfy causal ordering constraints (vector clock, dependencies) ?
- Does the event's mutation pattern match the predicted trajectory (TimesFM) ?
- Do temporal output annotations fall within human perception bounds ?

If validation fails, the bridge emits a typed rejection event back to the agent with a specific error. The agent can self-correct and retry.

### ID Minting

Agents NEVER generate AEP IDs. When an agent proposes a new element, it provides the type, parent, z-band and skin_binding. The dynAEP Bridge mints the next sequential ID for that prefix and returns it in the TOOL_CALL_RESULT. This prevents ID collisions when multiple agents operate simultaneously or when an agent loses track of the current highest ID.

### Temporal Authority

Agents NEVER own the clock. When an agent emits a timestamp inside an AG-UI event, the bridge overwrites it with bridge-authoritative time synchronized to NTP, PTP (IEEE 1588) or the system clock. The agent's original timestamp is preserved in metadata for audit. This follows the same trust model as ID minting: the bridge is the single source of truth. The bridge stamps every event, the bridge orders every sequence, the bridge detects temporal anomalies.

dynAEP-TA is the sole authoritative time source for the entire AEP/dynAEP protocol stack. Any component that needs a timestamp, a duration measurement or a temporal comparison MUST obtain it from dynAEP-TA. This includes AEP v2.5's temporal content scanner (evaluation chain Step 15), which queries dynAEP-TA for authoritative time when checking content staleness.

Any other component in the stack that needs a timestamp MUST call the `dynaep_temporal_query` tool rather than reading its own system clock or trusting an agent-provided value.

## 3. Registry Shape: Mandatory Standard

All dynAEP tooling mandates a single, unambiguous registry format. The aep-registry.yaml file contains metadata keys (aep_version, schema_revision, forbidden_patterns) alongside element entries (CP-00001, PN-00001 etc). The SDK loader strips metadata and returns only typed entries. There is no entries: wrapper key. There is no fallback logic. The shape is:

```yaml
aep_version: "1.1"
schema_revision: 1

SH-00001:
  label: "App Shell"
  category: layout
  skin_binding: "shell"
  ...

CP-00001:
  label: "Import Button"
  category: action
  skin_binding: "button_primary"
  ...
```

Every SDK loader (@aep/core, aep Python, @dynaep/core) uses parseRegistryYAML() which strips aep_version, schema_revision and forbidden_patterns and returns a clean Record<string, AEPRegistryEntry>. No downstream code ever touches raw YAML dicts.

## 4. dynAEP Event Extensions

dynAEP extends the AG-UI event set with AEP-specific event types. These are transmitted as AG-UI CUSTOM events with a dynaep_type field.

### 4.1 AEP Mutation Events

Structure mutation:

```json
{
  "type": "CUSTOM",
  "dynaep_type": "AEP_MUTATE_STRUCTURE",
  "target_id": "CP-00003",
  "mutation": {
    "op": "move",
    "parent": "PN-00002",
    "anchors": {
      "top": "NV-00004.bottom",
      "left": "PN-00002.left",
      "right": "PN-00002.right"
    }
  },
  "timestamp": 1712764800000
}
```

Behaviour mutation:

```json
{
  "type": "CUSTOM",
  "dynaep_type": "AEP_MUTATE_BEHAVIOUR",
  "target_id": "CP-00003",
  "mutation": {
    "op": "add_state",
    "state_name": "warning",
    "state_description": "Flashing border when export queue exceeds 100 items"
  }
}
```

Skin mutation:

```json
{
  "type": "CUSTOM",
  "dynaep_type": "AEP_MUTATE_SKIN",
  "target_id": "button_primary",
  "mutation": {
    "op": "replace",
    "path": "/background",
    "value": "{colors.warning}"
  }
}
```

### 4.2 AEP Query Events

Agents can query the AEP graph at runtime to inform their decisions:

```json
{
  "type": "CUSTOM",
  "dynaep_type": "AEP_QUERY",
  "query": "children_of",
  "target_id": "PN-00001"
}
```

Response:

```json
{
  "type": "CUSTOM",
  "dynaep_type": "AEP_QUERY_RESULT",
  "target_id": "PN-00001",
  "result": ["CP-00001", "CP-00002", "CP-00003", "CP-00004"]
}
```

Supported query types: children_of, parent_of, z_band_of, visible_at_breakpoint, full_element, next_available_id.

### 4.3 Validation Rejection Events

```json
{
  "type": "CUSTOM",
  "dynaep_type": "DYNAEP_REJECTION",
  "target_id": "CP-00099",
  "error": "Unregistered element: CP-00099 does not exist in scene or registry",
  "original_event_timestamp": 1712764800000
}
```

### 4.4 Runtime Reflection Events

The frontend emits actual rendered coordinates back to the agent via ResizeObserver and MutationObserver (not polling). Events fire on actual layout changes, debounced to avoid flooding the stream:

```json
{
  "type": "CUSTOM",
  "dynaep_type": "AEP_RUNTIME_COORDINATES",
  "target_id": "CP-00001",
  "coordinates": {
    "x": 345,
    "y": 12,
    "width": 120,
    "height": 40,
    "rendered_at": "vp-lg",
    "visible": true
  }
}
```

### 4.5 Temporal Authority Events (v0.3)

Clock synchronization broadcast (v0.4: includes TIM clock quality metadata):

```json
{
  "type": "CUSTOM",
  "dynaep_type": "AEP_CLOCK_SYNC",
  "bridgeTimeMs": 1714300800000,
  "source": "ntp",
  "offsetMs": 3,
  "syncedAt": 1714300799500,
  "tim": {
    "sync_state": "LOCKED",
    "confidence_class": "A",
    "uncertainty_ms": 2.1,
    "anomaly_flags": [],
    "holdover_since": null,
    "last_sync_at": 1714300799500
  }
}
```

Temporal stamp (attached to every validated event):

```json
{
  "type": "CUSTOM",
  "dynaep_type": "AEP_TEMPORAL_STAMP",
  "originalEventType": "AEP_MUTATE_STRUCTURE",
  "targetId": "CP-00003",
  "bridgeTimestamp": {
    "bridgeTimeMs": 1714300800000,
    "agentTimeMs": 1714300799950,
    "driftMs": 50,
    "source": "ntp",
    "syncedAt": 1714300799500
  },
  "causalPosition": 42,
  "vectorClock": { "agent-alpha": 15, "agent-beta": 9 }
}
```

Temporal rejection:

```json
{
  "type": "CUSTOM",
  "dynaep_type": "DYNAEP_TEMPORAL_REJECTION",
  "targetId": "CP-00003",
  "error": "Temporal drift exceeded: agent drift 120 ms exceeds threshold 50 ms",
  "violations": [
    {
      "type": "drift_exceeded",
      "detail": "Agent clock running 120 ms ahead of bridge",
      "agentTimeMs": 1714300800120,
      "bridgeTimeMs": 1714300800000,
      "thresholdMs": 50
    }
  ]
}
```

Causal violation:

```json
{
  "type": "CUSTOM",
  "dynaep_type": "DYNAEP_CAUSAL_VIOLATION",
  "eventId": "evt-00042",
  "agentId": "agent-beta",
  "expectedSequence": 10,
  "receivedSequence": 12,
  "missingDependencies": ["evt-00040", "evt-00041"],
  "bufferStatus": "buffered"
}
```

Temporal forecast (from TimesFM sidecar):

```json
{
  "type": "CUSTOM",
  "dynaep_type": "AEP_TEMPORAL_FORECAST",
  "targetId": "PN-00002",
  "horizonMs": 5000,
  "predictions": [
    {
      "offsetMs": 1000,
      "predictedState": { "width": 842, "height": 610, "visible": true },
      "quantileLow": { "width": 830, "height": 600 },
      "quantileHigh": { "width": 855, "height": 620 }
    }
  ],
  "confidence": 0.91,
  "forecastedAt": 1714300800000
}
```

Temporal anomaly:

```json
{
  "type": "CUSTOM",
  "dynaep_type": "AEP_TEMPORAL_ANOMALY",
  "targetId": "CP-00005",
  "anomalyScore": 4.2,
  "predicted": { "width": 120, "height": 40 },
  "actual": { "width": 600, "height": 400 },
  "recommendation": "require_approval"
}
```

Temporal reset:

```json
{
  "type": "CUSTOM",
  "dynaep_type": "AEP_TEMPORAL_RESET",
  "reason": "schema_reload",
  "oldVectorClock": { "agent-alpha": 15, "agent-beta": 9 },
  "newVectorClock": { "agent-alpha": 0, "agent-beta": 0 },
  "resetAt": 1714300800000
}
```

Temporal recovery (v0.4, emitted when bridge restarts and successfully recovers persisted state):

```json
{
  "type": "CUSTOM",
  "dynaep_type": "AEP_TEMPORAL_RECOVERY",
  "recoveredAt": 1714300800000,
  "restoredAgents": ["agent-alpha", "agent-beta"],
  "restoredVectorClock": { "agent-alpha": 15, "agent-beta": 9 },
  "restoredCausalPosition": 42,
  "stateAge": "12s",
  "gapMs": 12000,
  "droppedEvents": 0,
  "source": "file"
}
```

Agent re-registration request (v0.4, sent by agents during bridge recovery Phase 2):

```json
{
  "type": "CUSTOM",
  "dynaep_type": "AEP_AGENT_REREGISTER",
  "agentId": "agent-alpha",
  "lastSequence": 15,
  "capabilities": ["read", "write", "execute"]
}
```

Re-registration result (v0.4, bridge response to agent re-registration):

```json
{
  "type": "CUSTOM",
  "dynaep_type": "AEP_REREGISTER_RESULT",
  "agentId": "agent-alpha",
  "status": "resumed",
  "restoredSequence": 15,
  "gapEvents": 0,
  "bridgeClockState": { "sync_state": "LOCKED", "confidence_class": "A" }
}
```

Possible `status` values: `resumed` (sequences match, agent continues), `reset` (sequences diverged, agent must reset), `unknown` (agent not in persisted registry).

### 4.6 Perception Governance Events (v0.3)

Governed envelope (attached to every time-dependent output):

```json
{
  "type": "CUSTOM",
  "dynaep_type": "AEP_PERCEPTION_GOVERNED",
  "targetId": "speech-output-001",
  "modality": "speech",
  "originalAnnotations": { "syllableRate": 7.5, "turnGapMs": 100 },
  "governedAnnotations": { "syllableRate": 5.5, "turnGapMs": 200 },
  "adaptiveAnnotations": { "syllableRate": 4.8, "turnGapMs": 350 },
  "violations": [
    {
      "parameter": "syllableRate",
      "value": 7.5,
      "severity": "soft",
      "message": "Syllable rate exceeds comfortable threshold 5.5 per second"
    },
    {
      "parameter": "turnGapMs",
      "value": 100,
      "severity": "hard",
      "message": "Turn gap below 150 ms perceived as interruption"
    }
  ],
  "profileUsed": "user-12345"
}
```

Perception rejection:

```json
{
  "type": "CUSTOM",
  "dynaep_type": "DYNAEP_PERCEPTION_REJECTION",
  "targetId": "haptic-output-003",
  "modality": "haptic",
  "error": "Tap duration 5 ms below perceptual threshold 10 ms",
  "suggestion": { "tapDurationMs": 20, "frequencyHz": 150 }
}
```

Perception profile update:

```json
{
  "type": "CUSTOM",
  "dynaep_type": "AEP_PERCEPTION_PROFILE_UPDATE",
  "userId": "user-12345",
  "modality": "speech",
  "parameterChanged": "syllableRate",
  "oldOffset": -0.2,
  "newOffset": -0.4,
  "confidenceScore": 0.72,
  "interactionCount": 35
}
```

## 5. Tool Definitions

dynAEP registers frontend tools (via AG-UI's tool system) that give agents direct access to AEP operations. All tool calls are validated by the dynAEP bridge before execution.

### aep_add_element

The agent proposes topology. The bridge mints the ID and returns it.

```json
{
  "name": "aep_add_element",
  "description": "Propose a new element to the AEP scene graph. The bridge assigns and returns the official AEP ID.",
  "parameters": {
    "type": "object",
    "properties": {
      "type": { "type": "string", "description": "Element type (shell, panel, component, cell_zone, etc)" },
      "parent": { "type": "string", "description": "AEP ID of the parent element" },
      "z": { "type": "integer", "description": "z-index (must fall within the correct band for the type prefix)" },
      "skin_binding": { "type": "string", "description": "Key mapping to a component_styles block in aep-theme.yaml" },
      "label": { "type": "string", "description": "Human-readable name for this element" },
      "layout": { "type": "object", "description": "Layout constraints (anchors, width, height)" }
    },
    "required": ["type", "parent", "z", "skin_binding"]
  }
}
```

Result:

```json
{
  "success": true,
  "element_id": "CP-00012",
  "message": "Element created and added to PN-00001 children"
}
```

### aep_move_element

```json
{
  "name": "aep_move_element",
  "description": "Change the parent or anchors of an existing AEP element",
  "parameters": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "new_parent": { "type": "string" },
      "anchors": { "type": "object" }
    },
    "required": ["id"]
  }
}
```

### aep_query_graph

```json
{
  "name": "aep_query_graph",
  "description": "Query the AEP scene graph for element relationships, z-bands or viewport visibility",
  "parameters": {
    "type": "object",
    "properties": {
      "query_type": {
        "type": "string",
        "enum": ["children_of", "parent_of", "z_band_of", "visible_at_breakpoint", "full_element", "next_available_id"]
      },
      "target_id": { "type": "string" }
    },
    "required": ["query_type", "target_id"]
  }
}
```

### aep_swap_theme

```json
{
  "name": "aep_swap_theme",
  "description": "Replace the active AEP theme with a different theme file",
  "parameters": {
    "type": "object",
    "properties": {
      "theme_name": { "type": "string" }
    },
    "required": ["theme_name"]
  }
}
```

### dynaep_temporal_query (v0.3)

The authoritative temporal query interface. Every stack component MUST use this instead of its own clock.

```json
{
  "name": "dynaep_temporal_query",
  "description": "Query the dynAEP Temporal Authority for authoritative time, element mutation history, staleness checks and human perception bounds. Every stack component MUST use this instead of its own clock.",
  "parameters": {
    "type": "object",
    "properties": {
      "query_type": {
        "type": "string",
        "enum": [
          "authoritative_time",
          "last_mutation",
          "mutation_frequency",
          "staleness_check",
          "elapsed_since",
          "duration_between",
          "audit_trail",
          "perception_profile",
          "perception_bounds",
          "clock_quality"
        ]
      },
      "target_id": { "type": "string", "description": "AEP element ID or event ID" },
      "reference_timestamp_ms": { "type": "number", "description": "For staleness and elapsed queries" },
      "max_age_ms": { "type": "number", "description": "For staleness checks" },
      "modality": { "type": "string", "description": "For perception queries: speech | haptic | notification | sensor | audio" },
      "user_id": { "type": "string", "description": "For adaptive perception profile queries" }
    },
    "required": ["query_type"]
  }
}
```

Result examples:

```json
{
  "success": true,
  "query_type": "authoritative_time",
  "result": { "bridge_time_ms": 1714300800000, "source": "ntp", "synced": true },
  "authoritative_time_ms": 1714300800000
}
```

```json
{
  "success": true,
  "query_type": "clock_quality",
  "result": {
    "sync_state": "LOCKED",
    "confidence_class": "A",
    "uncertainty_ms": 2.1,
    "anomaly_flags": [],
    "holdover_since": null,
    "last_sync_at": 1714300799500
  },
  "authoritative_time_ms": 1714300800000
}
```

```json
{
  "success": true,
  "query_type": "perception_bounds",
  "result": {
    "modality": "speech",
    "bounds": {
      "min_turn_gap_ms": 150,
      "max_turn_gap_ms": 1200,
      "comfortable_syllable_rate_min": 3.0,
      "comfortable_syllable_rate_max": 5.5
    }
  },
  "authoritative_time_ms": 1714300800000
}
```

## 6. Temporal Authority (v0.3, v0.4)

### 6.1 Bridge Clock

The BridgeClock is the authoritative time source for the entire dynAEP bridge. It synchronizes to an external reference and provides monotonically increasing timestamps.

Sync hierarchy (automatic fallback):
1. **PTP** (IEEE 1588): microsecond or sub-microsecond precision. Requires PTP hardware support. Used for mission-critical multi-agent industrial deployments where mutation ordering is safety-critical.
2. **NTP** (default): millisecond precision via SNTP. Sufficient for most web deployments.
3. **System clock**: fallback when network sync is unavailable. Logs a warning that temporal precision is degraded.

The bridge re-syncs at configurable intervals (default: every 30 seconds). Clock health (sync status, current offset, source) is available via the `dynaep_temporal_query` tool and through the `AEP_CLOCK_SYNC` broadcast event.

### 6.2 Timestamp Validation

Every incoming AG-UI event passes through temporal validation before any structural check:

1. The bridge reads the agent-provided timestamp (may be null).
2. The bridge stamps the event with authoritative time.
3. If `bridge_is_authority` is true (default), the event timestamp is overwritten. The original is preserved in `_temporal` metadata for audit.
4. Drift check: if the difference between agent time and bridge time exceeds `max_drift_ms` (default: 50 ms), the event is rejected with a `DYNAEP_TEMPORAL_REJECTION`.
5. Future check: if the agent timestamp is more than `max_future_ms` (default: 500 ms) ahead of bridge time, the event is rejected.
6. Staleness check: if the event is older than `max_staleness_ms` (default: 5000 ms), the event is rejected.

Three enforcement modes match the existing structural validation modes:
- **strict**: any temporal violation rejects the event.
- **permissive**: violations are logged but the event passes through.
- **log_only**: violations are recorded without enforcement.

### 6.3 Causal Ordering

The CausalOrderingEngine enforces happens-before relationships across multi-agent event streams using Lamport vector clocks.

Every agent registered with the bridge receives a vector clock entry. Each event carries a per-agent sequence number (monotonically increasing). The engine:

1. Compares incoming sequence numbers against expected values.
2. Delivers in-order events immediately, advancing the vector clock.
3. Buffers out-of-order events in a reorder buffer (configurable size, default: 64 events) and waits up to `max_reorder_wait_ms` (default: 200 ms) for missing predecessors.
4. Rejects events with clock regression (sequence number lower than expected).
5. Verifies declared causal dependencies (event IDs this event depends on) have been delivered.
6. Detects concurrent mutations on the same element from different agents and applies conflict resolution (last-write-wins or optimistic locking).

Two events are concurrent if neither's vector clock dominates the other's. Concurrent events on different elements proceed in parallel. Concurrent events on the same element trigger conflict resolution.

### 6.4 Predictive Forecasting (TimesFM)

The ForecastSidecar integrates Google TimesFM (200 M-parameter pretrained time-series foundation model) to provide predictive temporal intelligence. TimesFM is optional. If unavailable, the sidecar uses lightweight linear extrapolation as a fallback.

The sidecar feeds `AEP_RUNTIME_COORDINATES` event streams into TimesFM and produces:

- **Predictive preloading**: forecast which panels and components are about to become visible and pre-resolve their skin bindings.
- **Anomaly detection**: if an agent's mutation pattern deviates from the predicted trajectory beyond a configurable threshold (default: 3.0 standard deviations), flag the event before it reaches structural validation. Anomalies can be logged, warned or escalated to human-in-the-loop.
- **Adaptive debounce**: instead of a fixed debounce interval for runtime reflection, the sidecar learns the cadence of state changes per element. Elements that change infrequently get longer debounce windows. Elements under active manipulation get shorter windows. Clamped to [50 ms, 2000 ms].

TimesFM integration modes:
- **Local**: Python subprocess with JSON-lines protocol over stdin/stdout.
- **Remote**: HTTP POST to a TimesFM inference endpoint.

### 6.5 Durable Causal State (v0.4)

All causal ordering state persists across bridge restarts. The `DurableCausalStore` interface defines 13 async methods for saving and loading vector clocks, reorder buffers, dependency graphs, agent registries and the global causal position.

Three storage backends are provided:

1. **FileBasedCausalStore** (default): JSONL append log with periodic compaction. Writes are batched (same pattern as BufferedLedger from OPT-006). On load: reads snapshot, then replays append log entries written after the snapshot. Storage layout: `{path}/causal-snapshot.json` (full state, written on compact) and `{path}/causal-append.jsonl` (append-only log).

2. **SqliteCausalStore**: SQLite backend using better-sqlite3 (optional dependency). Six tables with WAL mode and transactions. Suitable for single-process deployments needing ACID guarantees.

3. **ExternalCausalStore**: Adapter for external key-value stores (Redis, DynamoDB, Cloudflare KV). Implements the `ExternalKeyValueBackend` interface (`get`, `set`, `delete` methods). Handles serialization with configurable key prefixes.

The `PartitionedCausalEngine` (OPT-005) integrates with any `DurableCausalStore`. On every successful ordering, the engine queues a persistence microtask. State is restored via `restoreFromStore()` on bridge restart.

### 6.6 TIM Clock Quality Tracking (v0.4)

The `ClockQualityTracker` provides IETF TIM-compatible clock quality metadata. It tracks:

- **Sync state machine**: `LOCKED` → `HOLDOVER` → `FREEWHEEL`. Transitions based on sync success/failure with configurable thresholds (default: 3 consecutive failures to enter HOLDOVER, holdover timeout to enter FREEWHEEL).
- **Confidence classes** (A through F): derived from sync state, offset variance, anomaly count and time since last sync. Class A requires LOCKED state, variance < 1ms, zero anomalies and sync within 60 seconds.
- **Uncertainty estimation**: Welford's online algorithm for streaming variance (no history storage), converted to standard deviation as the uncertainty metric.
- **Anomaly detection**: flags for offset spike (> 5× running average), variance spike (> 10× baseline), backward jump (negative offset delta) and sync gap (> 2× expected interval).

The `AsyncBridgeClock` automatically attaches TIM metadata to every `AEP_CLOCK_SYNC` event when a `ClockQualityTracker` is configured. The `dynaep_temporal_query` tool supports a `clock_quality` query type that returns the current TIM state.

### 6.7 Workflow Temporal Primitives (v0.4)

Four workflow primitives that use bridge-authoritative time instead of system clocks:

1. **TemporalDeadline**: register a callback that fires when bridge time exceeds a deadline. Returns a `DeadlineHandle` with `cancel()`, `remaining()` and `isExpired()`. Serializable for persistence across restarts.

2. **TemporalSchedule**: register a recurring callback at a fixed interval (measured in bridge time). Returns a `ScheduleHandle` with `cancel()`, `pause()`, `resume()` and tick tracking. Configurable `maxTicks` limit.

3. **TemporalSleepResume**: suspend a task until a bridge-time condition is met. Creates a `SuspendedTask` with a `promise` that resolves when bridge time reaches the wake time. Serializable with `serialize()` / `restore()`.

4. **TemporalTimeout**: wrap an async operation with a bridge-time timeout. Throws `TemporalTimeoutError` (extends `Error` with `elapsedMs` field) if the operation does not complete within the deadline. Does NOT use `setTimeout`; polls bridge time.

The `TemporalPrimitives` facade provides a unified interface with `start()` / `stop()` lifecycle. All primitives accept a `getNow` function (dependency injection) for testability and bridge-time integration.

### 6.8 Bridge Recovery Protocol (v0.4)

Three-phase recovery protocol for graceful bridge restarts:

**Phase 1: Announce Recovery** — On restart, the bridge checks the durable store for persisted state. If state exists and its age is within `maxRecoveryGapMs` (configurable), the state is loaded and an `AEP_TEMPORAL_RECOVERY` event is broadcast. If the state is missing or too old, a full reset occurs via `AEP_TEMPORAL_RESET`.

**Phase 2: Agent Re-registration** — Agents respond to the recovery event by sending `AEP_AGENT_REREGISTER` with their `lastSequence`. The bridge compares against the persisted agent registry and replies with `AEP_REREGISTER_RESULT`:
- `resumed`: sequences match, agent continues from where it left off.
- `reset`: sequences diverged, agent must reset its state.
- `unknown`: agent was not in the persisted registry.

**Phase 3: Buffer Replay** — The bridge loads the persisted reorder buffer and replays buffered events through the causal engine in timestamp order. Events that fail replay are counted as `droppedEvents` in the recovery result.

The protocol detects the storage backend (file, sqlite, external) automatically via constructor name inspection. Recovery is configurable: set `enabled: false` to always fall back to full reset.

## 7. Perceptual Temporal Governance (v0.3)

Every output modality that carries a time dimension must pass through dynAEP-TA perception governance before reaching the human recipient. The same trust model applies: agents NEVER own the perceptual clock. The bridge enforces human-perception-safe timing on every output.

Human temporal perception has quantitative thresholds established by psychoacoustics, cognitive load research and attention science. These thresholds are compiled into a deterministic Perception Registry, the same way z-band ranges and skin bindings are compiled into AEP registries. dynAEP-TA validates output timing against this registry the same way it validates z-band compliance.

### 7.1 Perception Registry

Five built-in modality profiles, each containing bounds derived from published perception research:

**Speech perception**: turn-taking gaps (150-3000 ms, comfortable 200-500 ms), syllable rate (2.0-8.0 per second, comfortable 3.0-5.5), clause pauses, sentence pauses, topic shift pauses, pitch range, emphasis duration stretch, total utterance duration. Sources: Stivers et al. 2009, Pellegrino et al. 2011, Goldman-Eisler 1968, Campione & Veronis 2002.

**Haptic perception**: tap duration (10-500 ms, comfortable 20-200 ms), tap interval (50-5000 ms), pattern element gaps, vibration frequency (20-500 hz, comfortable 100-300 hz), amplitude change rate. Sources: Gescheider 1997, van Erp 2002, Verrillo 1963.

**Notification cadence**: minimum interval (1000-86400000 ms, comfortable 30000-3600000 ms), burst count limits (1-10, comfortable 1-3), burst window, habituation onset threshold (3-50 notifications of the same type), recovery interval after habituation. Sources: Mehrotra et al. 2016, Pielot et al. 2014, Weber et al. 2016.

**Sensor polling**: human response latency (150-2000 ms, comfortable 200-500 ms), display refresh alignment (8-100 ms), health monitoring interval (1000-3600000 ms), environmental polling interval. Sources: Hick 1952, clinical monitoring standards.

**Audio composition**: tempo (20-300 bpm, comfortable 60-180 bpm), beat alignment tolerance (0-50 ms, comfortable 0-20 ms), fade duration, silence gaps. Sources: London 2012, Friberg & Sundberg 1995.

Every bound has six fields: min, max, comfortable_min, comfortable_max, unit and source citation. Constraints are tagged [hard] (rejection) or [soft] (clamping to comfortable range).

Custom overrides per deployment are supported without breaking built-in bounds.

### 7.2 Temporal Annotations

Agents attach temporal annotations to output events. The bridge validates and governs these annotations.

Speech annotations include: syllable rate, pause placements (with type and duration), emphasis points (with duration stretch and pitch adjustment), total target duration, turn-taking gap, emotional register (neutral, urgent, calm, warm, formal) and question flag.

Haptic annotations include: pattern elements (tap, vibration, pause with duration, frequency and amplitude), repetition count, repetition interval and intensity scaling.

Notification annotations include: priority level (critical, high, normal, low, background), delivery offset, batchability, category for habituation tracking and cooldown override.

Sensor annotations include: sensor type (health, environmental, motion, location, custom), polling interval, display refresh alignment flag, power mode (performance, balanced, power_save) and human-facing flag.

When an event carries temporal annotations, the PerceptionEngine:
1. Validates each parameter against the registry's hard and soft bounds.
2. Rejects events with hard violations (or clamps per config).
3. Clamps soft violations to the comfortable range.
4. Applies the adaptive user profile if available.
5. Produces a GovernedEnvelope containing original, governed and adaptive annotation sets.
6. Attaches the envelope to the event under a `_perception` metadata key.

### 7.3 Adaptive Perception Profiles

The AdaptiveProfileManager learns per-user temporal preferences from interaction signals:

- **response** with short latency: pacing was comfortable (no adjustment).
- **response** with long latency: pacing may have been too fast (slow down signal).
- **interruption**: pacing was too slow or content was unwanted (speed up signal).
- **replay_request**: pacing was too fast or content was unclear (slow down signal).
- **skip**: content was too long (shorten duration signal).
- **slow_down_request** / **speed_up_request**: explicit user signals.
- **completion**: full interaction completed (positive reinforcement).
- **abandonment**: user left before completion (negative signal on duration).

The profile updates parameter offsets using exponential moving average. Offsets are clamped to a configurable fraction (default: 30%) of the comfortable range width. A user can prefer faster or slower within the comfortable zone, but the profile NEVER pushes values outside comfortable bounds and absolutely never outside hard bounds.

When TimesFM is available, the sidecar forecasts optimal timing for each user based on their interaction latency history (time-of-day effects, session-length effects, fatigue progression).

Profiles persist across sessions and erode toward neutral over a configurable half-life (default: 7 days).

### 7.4 Cross-Modality Constraint

A single Rego rule limits simultaneous active output modalities to a configurable ceiling (default: 3). Agents cannot overwhelm a user by driving speech, haptics, notifications and audio composition simultaneously. The bridge rejects the fourth modality until one of the active three completes.

## 8. Generative Topology (Replacing Generative UI)

AG-UI supports generative UI through its draft A2UI specification. dynAEP structurally alters this paradigm. Under dynAEP, "Generative UI" (the agent writing raw JSX/HTML at runtime) is strictly forbidden.

It is replaced by Generative Topology. Agents cannot generate code; they can only instantiate and arrange pre-compiled, mathematically verified AEP primitives. Every proposal must conform to AEP's z-band hierarchy, parent-child constraints and skin_binding resolutions.

**Flow:**
1. Agent proposes a new topological arrangement via AG-UI A2UI event.
2. dynAEP bridge intercepts the proposal.
3. Bridge validates: type exists in registry, parent exists, z-index within band, skin_bindings resolve, no forbidden patterns triggered (Rego).
4. If valid: the bridge mints sequential XX-NNNNN IDs, mounts the topology, updates aep-scene.json and aep-registry.yaml in memory and returns the assigned IDs to the agent.
5. If invalid: the bridge drops the payload and returns a specific DYNAEP_REJECTION error for self-correction.

The agent acts as an architect placing pre-fabricated, pre-verified structural blocks. It does not mix the cement.

## 9. State Synchronisation

dynAEP maps AG-UI's native state management directly onto the AEP three-layer model.

| AG-UI State Mechanism | dynAEP Mapping |
|---|---|
| STATE_SNAPSHOT | Full serialisation of current live scene graph + runtime coordinates |
| STATE_DELTA (JSON Patch) | Targeted mutation of a single AEP element, validated by the bridge |
| MESSAGES_SNAPSHOT | Agent conversation history (unchanged from AG-UI) |

### State Delta Path Parsing

STATE_DELTA events use JSON Patch (RFC 6902) paths. The dynAEP bridge parses paths using a strict three-layer routing:

```
/elements/{id}/{field}        -> Layer 1 (Structure) -> validate z-band, parent, anchors
/registry/{id}/{field}        -> Layer 2 (Behaviour) -> validate constraints, states
/theme/component_styles/{key} -> Layer 3 (Skin)      -> validate variable resolution
```

The bridge uses a standards-compliant JSON Pointer parser (RFC 6901). Custom regex parsing is forbidden.

### Conflict Resolution

When two agents (or an agent and a user) mutate the same element simultaneously, dynAEP uses last-write-wins with rejection feedback. The causal ordering engine (Section 6.3) determines which mutation arrived first using bridge-authoritative timestamps and vector clocks. For mission-critical multi-agent scenarios, optimistic locking with expected_version fields is available.

```yaml
conflict_resolution:
  mode: "last_write_wins"       # last_write_wins | optimistic_locking
```

## 10. Interrupts and Human-in-the-Loop

AG-UI supports interrupts (pause, approve, edit, retry, escalate). dynAEP extends this with AEP-aware interrupt scenarios:

- **Structure approval**: Agent proposes adding a new panel. The bridge can be configured to require human approval before applying structural mutations.
- **Behaviour approval**: Agent proposes a new constraint or forbidden pattern change. Human reviews before it becomes active.
- **Skin approval**: Agent proposes a theme swap. Human previews before it applies.
- **Temporal anomaly escalation** (v0.3): TimesFM detects an anomalous mutation pattern. If `anomaly_action` is set to `require_approval`, the mutation is held for human review.
- **Perception override** (v0.3): Agent proposes timing that exceeds comfortable bounds. If configured, the bridge escalates to human approval.

```yaml
approval_policy:
  structure_mutations: "auto"       # auto | require_approval
  behaviour_mutations: "auto"
  skin_mutations: "auto"
  new_element_creation: "require_approval"
  forbidden_pattern_changes: "require_approval"
  temporal_anomaly: "warn"          # auto | warn | require_approval
  perception_override: "auto"       # auto | require_approval
```

## 11. Rego Policy Integration

dynAEP uses Open Policy Agent (OPA / Rego) for forbidden pattern enforcement. The bridge loads policy files at startup and evaluates them on every mutation.

Policy files:
- `aep-policy.rego` -- structural forbidden patterns (z-band violations, orphan elements)
- `policies/temporal-policy.rego` -- temporal enforcement (drift, staleness, causal regression, anomaly escalation)
- `policies/perception-policy.rego` -- perception enforcement (speech pace, haptic thresholds, notification burst limits, sensor polling bounds, cross-modality ceiling)

Runtime dependency: @open-policy-agent/opa-wasm (browser/Node), opa CLI (server-side) or pre-compiled decision tables (zero-dependency environments).

```yaml
rego:
  policy_path: "./aep-policy.rego"
  evaluation: "wasm"                # wasm | cli | precompiled
```

## 12. dynAEP Configuration

### dynaep-config.yaml

```yaml
aep_version: "1.1"
dynaep_version: "0.4"
schema_revision: 2

transport:
  protocol: "sse"                   # sse | websocket
  endpoint: "/api/agent"
  reconnect_interval_ms: 3000
  heartbeat_interval_ms: 15000

validation:
  mode: "strict"                    # strict | permissive | log_only
  aot_on_startup: true
  jit_on_every_delta: true

aep_sources:
  scene: "./aep-scene.json"
  registry: "./aep-registry.yaml"
  theme: "./aep-theme.yaml"

rego:
  policy_path: "./aep-policy.rego"
  evaluation: "wasm"                # wasm | cli | precompiled

runtime_reflection:
  enabled: true
  method: "observer"                # observer (ResizeObserver) | polling
  debounce_ms: 250
  broadcast_to_agent: true

approval_policy:
  structure_mutations: "auto"
  behaviour_mutations: "auto"
  skin_mutations: "auto"
  new_element_creation: "require_approval"
  forbidden_pattern_changes: "require_approval"
  temporal_anomaly: "warn"
  perception_override: "auto"

conflict_resolution:
  mode: "last_write_wins"           # last_write_wins | optimistic_locking

id_minting:
  enabled: true
  counters_persist: true

themes:
  available:
    - name: "dark"
      path: "./aep-theme.yaml"
    - name: "light"
      path: "./aep-theme-light.yaml"
  active: "dark"

logging:
  level: "info"                     # debug | info | warn | error
  log_rejections: true
  log_accepted_mutations: false
  log_tool_calls: true

# ---- Temporal Authority (v0.3) ----

timekeeping:
  protocol: "ntp"                   # ntp | ptp | system
  source: "pool.ntp.org"
  sync_interval_ms: 30000
  max_drift_ms: 50
  max_future_ms: 500
  max_staleness_ms: 5000
  bridge_is_authority: true
  log_drift_warnings: true

  # ---- TIM Clock Quality (v0.4) ----
  tim:
    enabled: true
    holdover_failures: 3
    holdover_timeout_ms: 60000
    freewheel_timeout_ms: 300000
    variance_window: 20

causal_ordering:
  enabled: true
  max_reorder_buffer_size: 64
  max_reorder_wait_ms: 200
  enable_vector_clocks: true
  enable_element_history: true
  history_depth: 100

  # ---- Durable Causal State (v0.4) ----
  persistence:
    enabled: true
    backend: "file"                 # file | sqlite | external
    path: "./data/causal-state"
    flush_interval_ms: 100
    flush_batch_size: 100
    compact_interval_ms: 3600000    # 1 hour

  # ---- Bridge Recovery (v0.4) ----
  recovery:
    enabled: true
    max_recovery_gap_ms: 300000     # 5 minutes

forecast:
  enabled: false                    # disabled by default (requires TimesFM)
  timesfm_mode: "local"             # local | remote
  timesfm_endpoint: null
  context_window: 64
  forecast_horizon: 12
  anomaly_threshold: 3.0
  debounce_ms: 250
  adaptive_debounce: true
  max_tracked_elements: 500
  anomaly_action: "warn"            # warn | require_approval | log_only

# ---- Perceptual Temporal Governance (v0.3) ----

perception:
  enabled: true
  hard_violation_action: "clamp"    # reject | clamp
  soft_violation_action: "clamp"    # clamp | warn | log_only
  governed_envelope_mode: "overwrite"  # overwrite | metadata_only
  max_simultaneous_modalities: 3

  adaptive_profiles:
    enabled: true
    learning_rate: 0.15
    erosion_half_life_ms: 604800000   # 7 days
    min_interactions_for_profile: 10
    max_offset_from_comfortable: 0.3
    forecast_enabled: false
    persistence_enabled: true
    persistence_path: "./data/perception-profiles.json"

  notification_tracking:
    enabled: true
    burst_window_ms: 30000
    habituation_check_enabled: true
    persistence_path: "./data/notification-cadence.json"

temporal_authority:
  stack_wide: true
  query_tool_enabled: true
  audit_trail_depth: 200
  staleness_broadcast_interval_ms: 10000
```

## 13. Live Schema Versioning

When schema_revision is bumped while the application is running, dynAEP handles the transition:

1. The bridge detects the version mismatch between in-memory configs and incoming events.
2. It emits a DYNAEP_SCHEMA_RELOAD event to all connected agents.
3. Agents re-query the graph via aep_query_graph to update their internal state.
4. The bridge re-runs AOT validation on the new configs.
5. If AOT fails, the bridge rejects the new configs and continues with the previous version.
6. The CausalOrderingEngine resets and emits an AEP_TEMPORAL_RESET event. All agents must re-register their sequence counters.

## 14. Implementation Status

### Phase 1: Core Bridge -- COMPLETE
- dynAEP Validation Bridge in TypeScript (@dynaep/core)
- AG-UI SSE client wired to bridge input
- Bridge output wired to AEP frontend renderer
- JIT delta validation (z-band, parent, skin_binding, forbidden patterns)
- DYNAEP_REJECTION event emission
- ID minting with sequential counters per prefix
- JSON Pointer parser (RFC 6901) for three-layer delta routing
- Unit tests for all validation paths

### Phase 2: Tool Registration -- COMPLETE
- aep_add_element, aep_move_element, aep_query_graph, aep_swap_theme as AG-UI frontend tools
- next_available_id query type
- Tool call handlers with full AEP validation
- Tool results wired through AG-UI TOOL_CALL_RESULT events

### Phase 3: State Sync -- COMPLETE
- STATE_SNAPSHOT serialisation of live AEP scene graph
- STATE_DELTA ingestion with three-layer path routing
- AEP_RUNTIME_COORDINATES emission via ResizeObserver + debounce
- Conflict resolution (last-write-wins + optimistic locking modes)

### Phase 4: Generative Topology -- COMPLETE
- AG-UI A2UI proposal interception
- Validation against AEP prefix, z-band, parent, skin_binding and Rego rules
- Sequential ID minting for accepted proposals
- Live scene graph and registry updates
- Rejection flow with specific error feedback

### Phase 5: Rego Integration -- COMPLETE
- OPA WASM loader for browser environments
- OPA CLI subprocess for server environments
- Pre-compiled decision table fallback
- Policy hot-reload on file change

### Phase 6: Interrupts and Approval -- COMPLETE
- Approval policy from dynaep-config.yaml
- AG-UI interrupt events wired to approval gates
- Approval UI component (itself registered in AEP)
- Human preview for theme swaps

### Phase 7: Python Bridge -- COMPLETE
- Validation bridge ported to Python
- Integration with AG-UI Python SDK
- All TypeScript bridge functionality mirrored

### Phase 8: Temporal Authority (v0.3) -- COMPLETE
- BridgeClock with NTP/PTP/system sync, SNTP packet encoding, fallback chain
- TemporalValidator with drift/future/staleness checks, 3 enforcement modes
- CausalOrderingEngine with vector clocks, reorder buffer, dependency tracking, conflict detection
- ForecastSidecar with TimesFM (local + remote), linear extrapolation fallback, z-score anomaly detection, adaptive debounce
- 10 temporal event types (7 from v0.3 + 3 from v0.4)
- Rego temporal policies (8 rules)
- Bridge integration: temporal pipeline inserted before structural validation
- Python bridge: full temporal pipeline mirror
- dynaep-config.yaml: timekeeping, causal_ordering, forecast sections
- 94 tests across 9 test files, zero failures

### Phase 9: Perceptual Temporal Governance (v0.3) -- COMPLETE
- PerceptionRegistry with 5 built-in modality profiles (speech, haptic, notification, sensor, audio)
- PerceptionEngine with governed envelope orchestration
- AdaptiveProfileManager with exponential moving average learning
- DynAEPTemporalAuthority with stack-wide time source and audit trails
- dynaep_temporal_query AG-UI tool with 9 query operations
- 4 modality annotation specs (speech, haptic, notification, sensor)
- 5 perception event types
- Rego perception policies (18 rules)
- Python bridge: full perception pipeline mirror
- dynaep-config.yaml: perception, temporal_authority sections
- 120 tests across 12 test files, zero failures

### Phase 10a: Durable Temporal Authority (v0.4) -- COMPLETE
- DurableCausalStore interface with 13 async methods for state persistence
- FileBasedCausalStore: JSONL append log with batched writes and periodic compaction
- SqliteCausalStore: SQLite backend with 6 tables, WAL mode, transactions
- ExternalCausalStore: adapter for Redis, DynamoDB, Cloudflare KV via ExternalKeyValueBackend
- PartitionedCausalEngine persistence integration: queuePersistence(), restoreFromStore(), shutdown()
- ClockQualityTracker: TIM-compatible sync state machine (LOCKED/HOLDOVER/FREEWHEEL), confidence classes A-F, Welford's variance, anomaly flags
- AsyncBridgeClock integration: TIM metadata on AEP_CLOCK_SYNC events, clock_quality query type
- TemporalDeadline: bridge-time deadlines with serialization
- TemporalSchedule: bridge-time recurring callbacks with pause/resume
- TemporalSleepResume: bridge-time task suspension with serialization
- TemporalTimeout: bridge-time timeouts with TemporalTimeoutError
- TemporalPrimitives facade: unified lifecycle (start/stop)
- BridgeRecoveryProtocol: three-phase recovery (announce, re-register, buffer replay)
- 3 new temporal event types (AEP_TEMPORAL_RECOVERY, AEP_AGENT_REREGISTER, AEP_REREGISTER_RESULT)
- AEP_CLOCK_SYNC extended with TIM metadata block
- dynaep_temporal_query extended with clock_quality operation
- Python bridge: full TA-3 mirror (durable_store, file_store, clock_quality, temporal_primitives, bridge_recovery)
- dynaep-config.yaml: persistence, recovery, tim sections
- Performance test suite (bench-013) for durable store throughput
- 160+ tests across 4 new test files, zero failures

### Phase 10b: Documentation and Examples -- IN PROGRESS
- Full API reference for dynAEP bridge
- Tutorial: "Build a live agentic dashboard with dynAEP"
- Tutorial: "Connect LangGraph to dynAEP"
- Tutorial: "Connect Google ADK to dynAEP"
- Example configs for common application types

## 15. SDK Plan

### 15.1 @dynaep/core (TypeScript)

The core validation bridge. Framework-agnostic. Receives AG-UI events, validates against AEP configs, mints IDs, governs temporal and perceptual dimensions, emits validated mutations or rejections.

```
npm install @dynaep/core
```

Exports:

- DynAEPBridge -- main bridge class
- validateMutation() -- standalone validation function
- mintElementId() -- sequential ID generator per prefix
- loadAEPConfigs() -- loads scene + registry + theme
- serializeSceneSnapshot() -- emits full STATE_SNAPSHOT
- registerAEPTools() -- registers AG-UI frontend tools
- BridgeClock -- authoritative temporal clock (v0.3)
- TemporalValidator -- timestamp validation (v0.3)
- CausalOrderingEngine -- vector clock ordering (v0.3)
- ForecastSidecar -- TimesFM integration (v0.3)
- PerceptionRegistry -- human perception bounds (v0.3)
- PerceptionEngine -- temporal annotation governance (v0.3)
- AdaptiveProfileManager -- per-user preference learning (v0.3)
- DynAEPTemporalAuthority -- stack-wide time authority (v0.3)
- FileBasedCausalStore -- JSONL append log durable store (v0.4)
- SqliteCausalStore -- SQLite durable store (v0.4)
- ExternalCausalStore -- external KV durable store (v0.4)
- ClockQualityTracker -- TIM clock quality tracking (v0.4)
- TemporalPrimitives -- workflow temporal facade (v0.4)
- TemporalDeadline -- bridge-time deadlines (v0.4)
- TemporalSchedule -- bridge-time recurring callbacks (v0.4)
- TemporalSleepResume -- bridge-time task suspension (v0.4)
- TemporalTimeout -- bridge-time timeout wrapper (v0.4)
- BridgeRecoveryProtocol -- three-phase bridge recovery (v0.4)

### 15.2 @dynaep/react (React)

React bindings. Hooks and components that wire AEP elements to the dynAEP bridge.

```
npm install @dynaep/react
```

Exports:

- \<DynAEPProvider\> -- context provider wrapping the bridge
- useAEPElement(id) -- hook returning resolved style + state + constraints
- useAEPScene() -- hook returning the live reactive scene graph
- useAgentStream() -- hook returning the AG-UI event stream with AEP validation
- useAEPMutate() -- hook for applying validated mutations to the live scene
- \<DynAEPElement id="CP-00001"\> -- renderer that auto-resolves skin_binding + layout
- useTemporalAuthority() -- hook returning the temporal authority interface (v0.3)
- usePerceptionProfile(userId) -- hook returning adaptive perception state (v0.3)

### 15.3 @dynaep/vue (Vue)

Vue 3 bindings with composables.

```
npm install @dynaep/vue
```

Exports:

- createDynAEP() -- plugin initialiser
- useAEPElement(id) -- composable
- useAEPScene() -- composable
- useAgentStream() -- composable
- useAEPMutate() -- composable for live mutations
- \<AEPElement :id="'CP-00001'"\> -- component
- useTemporalAuthority() -- composable (v0.3)
- usePerceptionProfile(userId) -- composable (v0.3)

### 15.4 dynaep (Python)

Python bridge for backend-side validation. Integrates with AG-UI Python SDK.

```
pip install dynaep
```

Exports:

- DynAEPBridge -- main bridge class
- validate_mutation() -- standalone validation
- mint_element_id() -- sequential ID generator
- load_aep_configs() -- loads configs
- create_ag_ui_middleware() -- AG-UI middleware wrapping the bridge
- BridgeClock -- authoritative temporal clock (v0.3)
- TemporalValidator -- timestamp validation (v0.3)
- CausalOrderingEngine -- vector clock ordering (v0.3)
- ForecastSidecar -- TimesFM integration, native Python (v0.3)
- PerceptionRegistry -- human perception bounds (v0.3)
- PerceptionEngine -- temporal annotation governance (v0.3)
- AdaptiveProfileManager -- per-user preference learning (v0.3)
- FileBasedCausalStore -- JSONL append log durable store (v0.4)
- ClockQualityTracker -- TIM clock quality tracking (v0.4)
- TemporalPrimitives -- workflow temporal facade (v0.4)
- BridgeRecoveryProtocol -- three-phase bridge recovery (v0.4)

### 15.5 dynaep-cli

Command-line tool for AEP and dynAEP operations.

```
npm install -g dynaep-cli
```

Commands:

- dynaep validate -- AOT validation of all config files
- dynaep init -- scaffolds all config files (including temporal and perception sections)
- dynaep check-bindings -- verifies all skin_bindings resolve
- dynaep check-graph -- verifies bi-directional parent/child consistency
- dynaep serve -- starts a local dynAEP bridge with AG-UI SSE endpoint for development
- dynaep generate -- AI scaffolding compiler
- dynaep clock-status -- show bridge clock sync status, source and drift (v0.3)
- dynaep perception-bounds -- list all perception bounds for a modality (v0.3)
- dynaep perception-profile \<userId\> -- show adaptive profile for a user (v0.3)

### 15.6 @dynaep/copilotkit

First-class integration with CopilotKit (the primary AG-UI client).

```
npm install @dynaep/copilotkit
```

Exports:

- \<CopilotDynAEP\> -- drop-in replacement for CopilotKit provider that adds AEP validation
- useCopilotAEP() -- hook combining CopilotKit agent stream with dynAEP bridge
- aepTools -- pre-built CopilotKit tool definitions for all AEP operations (including dynaep_temporal_query)

## 16. Compatibility Matrix

dynAEP works with every AG-UI-compatible agent backend. The bridge sits on the frontend (or optionally backend) and is transparent to the agent framework.

| Agent Framework | AG-UI Status | dynAEP Compatible |
|---|---|---|
| LangGraph | Supported | Yes |
| CrewAI | Supported | Yes |
| Google ADK | Supported | Yes |
| Microsoft Agent Framework | Supported | Yes |
| AWS Strands Agents | Supported | Yes |
| AWS Bedrock AgentCore | Supported | Yes |
| Mastra | Supported | Yes |
| Pydantic AI | Supported | Yes |
| Agno | Supported | Yes |
| LlamaIndex | Supported | Yes |
| AG2 | Supported | Yes |
| OpenAI Agent SDK | In Progress | Yes (when AG-UI support ships) |
| Direct to LLM | Supported | Yes |

## 17. AEP vs dynAEP: When to Use What

| Scenario | Use |
|---|---|
| AI agent scaffolds a new frontend from a spec | AEP |
| AI agent builds and modifies UI at development time | AEP |
| Build-time validation of all configs | AEP |
| AI agent streams live updates to users | dynAEP |
| AI agent and user collaborate on the same UI in real time | dynAEP |
| AI agent proposes generative topology at runtime | dynAEP |
| Runtime state synchronisation between agent and frontend | dynAEP |
| Theme swapping triggered by agent at runtime | dynAEP |
| Human-in-the-loop approval for structural changes | dynAEP |
| Multiple agents operating on the same UI simultaneously | dynAEP |
| Agent needs authoritative timestamps for any operation | dynAEP-TA |
| Multi-agent causal ordering is required | dynAEP-TA |
| Predictive UI state forecasting | dynAEP-TA |
| Agent produces speech output to humans | dynAEP-TA-P |
| Agent controls haptic feedback devices | dynAEP-TA-P |
| Agent manages notification streams | dynAEP-TA-P |
| Agent polls sensors for human-facing data | dynAEP-TA-P |
| Agent composes audio for human listeners | dynAEP-TA-P |
| Content staleness check needs authoritative time | dynAEP-TA |
| Bridge restarts should not lose causal ordering state | dynAEP-TA (v0.4) |
| Workflow deadlines or timeouts need bridge time | dynAEP-TA (v0.4) |
| Clock quality and sync confidence must be tracked | dynAEP-TA (v0.4) |
| Agents need to re-register after bridge restart | dynAEP-TA (v0.4) |

AEP is always the foundation. dynAEP is the live runtime layer on top. dynAEP-TA is the temporal authority underneath everything. dynAEP-TA-P governs the perceptual boundary where machine output meets human perception.

## 18. Anti-Patterns

| Anti-pattern | Why it is wrong | The dynAEP way |
|---|---|---|
| Letting AG-UI events modify the DOM directly | No validation, hallucination surface wide open | Every event passes through the dynAEP bridge |
| Agent generating raw HTML via generative UI | Unverifiable, no AEP IDs, no z-band enforcement | Agent proposes generative topology using pre-verified AEP primitives only |
| Agent minting its own AEP IDs | ID collisions in multi-agent scenarios, rejection loops | Bridge mints all IDs via sequential counters per prefix |
| Agent providing its own timestamps | Clock drift, causal ordering failures, replay attacks | Bridge overwrites all timestamps with authoritative time |
| Agent controlling speech pacing directly | Perception-unsafe timing, manipulation via urgency or artificial pauses | Bridge governs temporal annotations against perception registry |
| Agent flooding notifications without cadence control | Attention fatigue, habituation, denial-of-attention | Bridge enforces burst limits, cooldowns and habituation detection |
| Using Date.now() in any stack component | Clock skew between components, inconsistent staleness checks | Every component calls dynaep_temporal_query for authoritative time |
| Storing UI state only in AG-UI shared state | AEP scene graph drifts from runtime state | Scene graph IS the shared state, synchronized via STATE_SNAPSHOT |
| Skipping JIT validation for performance | One bad mutation corrupts the entire graph | Use Template Nodes for dynamic elements, JIT cost is minimal |
| Hardcoding AG-UI event handlers per component | Unmaintainable, duplicated logic | Centralise in the dynAEP bridge, components just render |
| Agent freestyle-creating elements without registry types | Orphan elements, untraceable mutations | Bridge rejects any element whose type is not registered in AEP-FCR |
| Using polling for runtime reflection | Battery-heavy, 1-second lag, wasteful | ResizeObserver + MutationObserver with debounce |
| Parsing JSON Patch paths with custom regex | Fragile, breaks on edge cases | Standards-compliant JSON Pointer parser (RFC 6901) |
| Ignoring schema_revision bumps at runtime | Stale configs cause validation errors | Bridge emits DYNAEP_SCHEMA_RELOAD + AEP_TEMPORAL_RESET, agents re-query |
| Driving 4+ output modalities simultaneously | Sensory overload, reduced comprehension | Cross-modality Rego rule limits active modalities to configurable ceiling |
| Hardcoding perception thresholds in renderers | Ungovernable, inconsistent across modalities | All bounds live in PerceptionRegistry, validated by PerceptionEngine |
| Storing causal state only in memory | Bridge restart loses all ordering state, forces full agent reset | Use DurableCausalStore with file, SQLite or external backend |
| Using setTimeout for workflow deadlines | System clock drift, not bridge-authoritative, breaks on sleep/wake | Use TemporalDeadline / TemporalTimeout with bridge-time getNow |
| Full agent reset on every bridge restart | Wasteful, loses context, causes UX disruption | BridgeRecoveryProtocol recovers state within maxRecoveryGapMs |
| Trusting clock sync without quality tracking | Silent drift degradation, undetected holdover, false confidence | ClockQualityTracker provides TIM confidence classes and anomaly flags |
| Agents storing their own sequence counters without persistence | Sequence mismatch on restart, causal ordering failures | Bridge persists agent registry with lastSequence, agents re-register via AEP_AGENT_REREGISTER |

## 19. Summary

dynAEP fuses AEP's deterministic topological matrix with AG-UI's real-time event streaming and temporal authority. The result:

- **Build-time safety from AEP**: every UI element has a unique ID, exact spatial coordinates, defined behaviour and themed visuals
- **Runtime safety from dynAEP**: every live AG-UI event is validated against the AEP graph before it touches the UI
- **Temporal safety from dynAEP-TA**: every event carries bridge-authoritative timestamps, causally ordered, with anomaly detection
- **Perceptual safety from dynAEP-TA-P**: every time-dependent output is governed against human perception bounds with adaptive per-user profiles
- **Full AG-UI compatibility**: works with every AG-UI-supported agent framework
- **Generative topology with guardrails**: agents can instantiate new AEP primitives at runtime, but only within the mathematical constraints of the topological matrix
- **Bridge-minted IDs**: agents never generate IDs, eliminating collision and rejection loops
- **Bridge-authoritative time**: agents never own the clock, eliminating temporal hallucination
- **Human-in-the-loop**: configurable approval gates for structural, behavioural, skin, temporal anomaly and perception override mutations
- **Conflict resolution**: last-write-wins with causal vector clocks or optimistic locking for mission-critical multi-agent scenarios
- **Predictive intelligence**: TimesFM forecasts UI state changes and detects anomalous mutation patterns
- **Perception governance**: speech pacing, haptic timing, notification cadence, sensor polling and audio composition all governed against researched human perception thresholds
- **Durable temporal state**: all causal ordering state persists across bridge restarts via configurable storage backends
- **TIM clock quality**: IETF TIM-compatible sync state machine with confidence classification and anomaly detection
- **Workflow temporal primitives**: deadlines, schedules, sleep/resume and timeouts using bridge-authoritative time
- **Graceful recovery**: three-phase bridge recovery protocol eliminates full agent resets after restarts

The agent provides the semantic intelligence. The AEP graph provides the structural laws. The bridge clock provides the temporal laws. The perception registry provides the perceptual laws. The durable store provides the persistence laws. dynAEP is the enforcement layer that connects them all.

## Related

- [AEP: Agent Element Protocol](https://github.com/thePM001/AEP-agent-element-protocol)
- [AG-UI: Agent-User Interaction Protocol](https://github.com/ag-ui-protocol/ag-ui)
- [AG-UI Docs](https://docs.ag-ui.com)
- [CopilotKit](https://copilotkit.ai)
- [Google TimesFM](https://github.com/google-research/timesfm)

## Licence

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the full text and [NOTICE](NOTICE) for attribution.

The names **AEP**, **Agent Element Protocol**, **AEP-compliant** and **dynAEP** are reserved. See [NAME-POLICY.md](NAME-POLICY.md) for permitted and prohibited uses. Apache 2.0 covers the code; the reserved-name policy covers the identifiers.

**Patent grant**: Apache 2.0 includes an explicit patent covenant from contributors.

Previous versions of this repository were released under the MIT License. The transition to Apache 2.0 is effective from version 1.1 onward. Prior MIT-licensed snapshots remain valid under their original terms.

## AI-Eligibility Status

To win the fight against the synthetic nano-parasites (SNP/NanoSinp) alien WMD, we must be intelligent and biosecure. It is recommended that bioinsecure humans do not use the provided technology/protocol to avoid bad techno-spiritual AI outcomes for them. [*"bioinsecure" = has installed injectable synthetic nano-parasites growth medium controllers - SNP GMCs]
