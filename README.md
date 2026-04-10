# dynAEP: Dynamic Agent Element Protocol
# Open-Source Reference + Implementation Plan
### Version 0.2 - 11 April 2026
### Author: thePM / [@thePM_001](https://github.com/thePM001)
### License: MIT

---

> To win the fight against the synthetic nano-parasites (SNP/NanoSinp) alien WMD, we must be intelligent and biosecurely unvaccinated. 
It is recommended that bioinsecure vaccinated humans do not use the provided technology/protocol to avoid bad AI outcomes for them. 
[*"vaccinated" = has installed injectable synthetic nano-parasites growth medium controllers - SNP GMCs]

---

## 1. What Is dynAEP

dynAEP is the fusion of **AEP** (Agent Element Protocol) and **AG-UI** (Agent-User Interaction Protocol). It extends AEP's deterministic, hallucination-proof frontend governance with AG-UI's real-time bi-directional event streaming, creating a complete lifecycle protocol for live interactive agentic user interfaces.

**AEP** solves the build-time problem: AI agents scaffold, modify and validate UI structure against a mathematically verified topological matrix.

**AG-UI** solves the runtime problem: AI agents stream live updates, synchronise state, call tools and respond to user input in real time.

**dynAEP** fuses both into a single architecture where every live runtime event is constrained by AEP's deterministic graph. The agent cannot hallucinate a UI element at build time (AEP prevents it) and cannot hallucinate a state mutation at runtime (dynAEP validates every AG-UI delta against the AEP registry before applying it).

### The Protocol Stack

```
LAYER           PROTOCOL        FUNCTION
-----------     -----------     ----------------------------------------
Agent-Tools     MCP             Agent connects to external data and tools
Agent-Agent     A2A             Agents coordinate across distributed systems
Agent-User      AG-UI           Real-time event streaming between agent and frontend
Agent-UI-Gov    AEP             Deterministic UI structure, behaviour and skin
Agent-UI-Live   dynAEP          AEP governance applied to live AG-UI event streams
```

### What dynAEP Proves

1. **AEP** proves you can build UIs deterministically.
2. **dynAEP** proves you can stream live AI interactions deterministically.

The existence of this protocol stack proves that AI hallucination is not a fundamental limitation. It is an engineering problem. In any domain where ground truth can be precompiled into a deterministic registry, hallucination is eliminable by architecture.

---

## 2. Architecture Overview

dynAEP sits between the AG-UI event stream and the rendered frontend. Every AG-UI event passes through the **dynAEP Validation Bridge** before reaching the UI.

```
  AGENT BACKEND (LangGraph / CrewAI / Google ADK / AWS / any AG-UI backend)
       |
       | AG-UI events (SSE / WebSocket)
       v
+---------------------+
| dynAEP Bridge       |
|                     |
|  1. Receive event   |
|  2. Parse target    |
|     AEP element     |
|  3. Validate        |
|     against scene + |
|     registry +      |
|     z-bands +       |
|     skin_bindings + |
|     Rego policy     |
|  4. Mint IDs for    |
|     new elements    |
|  5. Apply or reject |
+---------------------+
       |
       | Validated mutations only
       v
  AEP FRONTEND RENDERER
  (React / Vue / Svelte / Tauri)
```

### What the Bridge Validates

Every AG-UI `STATE_DELTA` or `TOOL_CALL` that targets an AEP element is checked:

- Does the target element ID exist in the scene graph or registry ?
- Is the proposed z-index within the correct band for the element prefix ?
- Does the mutation violate any forbidden pattern (Rego) ?
- Does a new skin_binding resolve to a valid component_styles block ?
- For Template Node instances: does the template exist and has it passed AOT ?
- For new elements: does the requested `type` exist in the AEP-FCR registry ?

If validation fails, the bridge emits a `DYNAEP_REJECTION` event back to the agent with a specific error. The agent can self-correct and retry.

### ID Minting

Agents NEVER generate AEP IDs. When an agent proposes a new element, it provides the type, parent, z-band and skin_binding. The **dynAEP Bridge** mints the next sequential ID for that prefix and returns it in the `TOOL_CALL_RESULT`. This prevents ID collisions when multiple agents operate simultaneously or when an agent loses track of the current highest ID.

---

## 3. Registry Shape: Mandatory Standard

All dynAEP tooling mandates a single, unambiguous registry format. The `aep-registry.yaml` file contains metadata keys (`aep_version`, `schema_revision`, `forbidden_patterns`) alongside element entries (`CP-00001`, `PN-00001` etc). The SDK loader strips metadata and returns only typed entries. There is no `entries:` wrapper key. There is no fallback logic. The shape is:

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

Every SDK loader (`@aep/core`, `aep` Python, `@dynaep/core`) uses `parseRegistryYAML()` which strips `aep_version`, `schema_revision` and `forbidden_patterns` and returns a clean `Record<string, AEPRegistryEntry>`. No downstream code ever touches raw YAML dicts.

---

## 4. dynAEP Event Extensions

dynAEP extends the AG-UI event set with AEP-specific event types. These are transmitted as AG-UI `CUSTOM` events with a `dynaep_type` field.

### 4.1 AEP Mutation Events

**Structure mutation:**
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

**Behaviour mutation:**
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

**Skin mutation:**
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

Supported query types: `children_of`, `parent_of`, `z_band_of`, `visible_at_breakpoint`, `full_element`, `next_available_id`.

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

The frontend emits actual rendered coordinates back to the agent via `ResizeObserver` and `MutationObserver` (not polling). Events fire on actual layout changes, debounced to avoid flooding the stream:

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

---

## 5. Tool Definitions

dynAEP registers **frontend tools** (via AG-UI's tool system) that give agents direct access to AEP operations. All tool calls are validated by the dynAEP bridge before execution.

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

---

## 6. Generative Topology (Replacing Generative UI)

AG-UI supports generative UI through its draft A2UI specification. dynAEP structurally alters this paradigm. Under dynAEP, "Generative UI" (the agent writing raw JSX/HTML at runtime) is strictly forbidden.

It is replaced by **Generative Topology**. Agents cannot generate code; they can only instantiate and arrange pre-compiled, mathematically verified AEP primitives. Every proposal must conform to AEP's z-band hierarchy, parent-child constraints and skin_binding resolutions.

### Flow

1. Agent proposes a new topological arrangement via AG-UI A2UI event.
2. dynAEP bridge intercepts the proposal.
3. Bridge validates:
   - The requested component `type` exists in the AEP-FCR registry as a registered type or Template Node.
   - Every element has a valid, existing `parent`.
   - Proposed z-indexes fall strictly within prefix z-bands.
   - skin_bindings resolve to verified theme definitions.
   - No forbidden patterns are triggered (Rego).
4. If valid: the bridge mints sequential XX-NNNNN IDs, mounts the topology, updates `aep-scene.json` and `aep-registry.yaml` in memory and returns the assigned IDs to the agent.
5. If invalid: the bridge drops the payload and returns a specific `DYNAEP_REJECTION` error for self-correction.

The agent acts as an architect placing pre-fabricated, pre-verified structural blocks. It does not mix the cement.

---

## 7. State Synchronisation

dynAEP maps AG-UI's native state management directly onto the AEP three-layer model.

| AG-UI State Mechanism | dynAEP Mapping |
|------------------------|----------------|
| `STATE_SNAPSHOT` | Full serialisation of current live scene graph + runtime coordinates |
| `STATE_DELTA` (JSON Patch) | Targeted mutation of a single AEP element, validated by the bridge |
| `MESSAGES_SNAPSHOT` | Agent conversation history (unchanged from AG-UI) |

### State Delta Path Parsing

STATE_DELTA events use JSON Patch (RFC 6902) paths. The dynAEP bridge parses paths using a strict three-layer routing:

```
/elements/{id}/{field}        -> Layer 1 (Structure) -> validate z-band, parent, anchors
/registry/{id}/{field}        -> Layer 2 (Behaviour) -> validate constraints, states
/theme/component_styles/{key} -> Layer 3 (Skin)      -> validate variable resolution
```

The bridge uses a standards-compliant JSON Pointer parser (RFC 6901). Custom regex parsing is forbidden.

### Conflict Resolution

When two agents (or an agent and a user) mutate the same element simultaneously, dynAEP uses **last-write-wins with rejection feedback**:

1. The first mutation arrives, passes validation, is applied.
2. The second mutation arrives. If it still passes validation against the now-updated scene graph, it is applied.
3. If the second mutation is now invalid (because the first mutation changed the element's parent, z-band or visibility), it is rejected with a `DYNAEP_REJECTION` event containing the specific conflict. The agent receives the rejection and can re-query the graph before retrying.

For mission-critical multi-agent scenarios, the bridge can be configured to use **optimistic locking**: each mutation must include an `expected_version` field. If the element's version has changed since the agent last read it, the mutation is rejected.

```yaml
conflict_resolution:
  mode: "last_write_wins"       # last_write_wins | optimistic_locking
```

---

## 8. Interrupts and Human-in-the-Loop

AG-UI supports interrupts (pause, approve, edit, retry, escalate). dynAEP extends this with AEP-aware interrupt scenarios:

- **Structure approval**: Agent proposes adding a new panel. The bridge can be configured to require human approval before applying structural mutations.
- **Behaviour approval**: Agent proposes a new constraint or forbidden pattern change. Human reviews before it becomes active.
- **Skin approval**: Agent proposes a theme swap. Human previews before it applies.

Configuration:

```yaml
approval_policy:
  structure_mutations: "auto"       # auto | require_approval
  behaviour_mutations: "auto"
  skin_mutations: "auto"
  new_element_creation: "require_approval"
  forbidden_pattern_changes: "require_approval"
```

---

## 9. Rego Policy Integration

dynAEP uses Open Policy Agent (OPA / Rego) for forbidden pattern enforcement. The bridge loads `aep-policy.rego` at startup and evaluates it on every mutation.

**Runtime dependency:** The bridge requires either:
- `@open-policy-agent/opa-wasm` (browser/Node, ~200KB WASM module)
- `opa` CLI (server-side, called via subprocess)
- A pre-compiled Rego decision table (for zero-dependency environments)

The `dynaep-config.yaml` specifies the evaluation mode:

```yaml
rego:
  policy_path: "./aep-policy.rego"
  evaluation: "wasm"                # wasm | cli | precompiled
```

For environments where OPA is too heavy, the bridge falls back to a built-in rule engine that evaluates the most critical invariants (z-band, parent existence, skin_binding resolution) without Rego.

---

## 10. dynAEP Configuration

### `dynaep-config.yaml`

```yaml
aep_version: "1.1"
dynaep_version: "0.2"
schema_revision: 1

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

conflict_resolution:
  mode: "last_write_wins"           # last_write_wins | optimistic_locking

id_minting:
  enabled: true                     # bridge mints IDs, agents never generate them
  counters_persist: true            # persist ID counters across restarts

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
```

---

## 11. Live Schema Versioning

When `schema_revision` is bumped while the application is running (e.g., an agent adds new element types or the developer deploys updated configs), dynAEP handles the transition:

1. The bridge detects the version mismatch between in-memory configs and incoming events.
2. It emits a `DYNAEP_SCHEMA_RELOAD` event to all connected agents.
3. Agents re-query the graph via `aep_query_graph` to update their internal state.
4. The bridge re-runs AOT validation on the new configs.
5. If AOT fails, the bridge rejects the new configs and continues with the previous version.

```json
{
  "type": "CUSTOM",
  "dynaep_type": "DYNAEP_SCHEMA_RELOAD",
  "old_revision": 1,
  "new_revision": 2,
  "aep_version": "1.1"
}
```

---

## 12. Implementation Plan

### Phase 1: Core Bridge (Weeks 1-3)

- [ ] dynAEP Validation Bridge in TypeScript (`@dynaep/core`)
- [ ] Wire AG-UI SSE client to bridge input
- [ ] Wire bridge output to AEP frontend renderer
- [ ] Implement JIT delta validation (z-band, parent, skin_binding, forbidden patterns)
- [ ] Implement `DYNAEP_REJECTION` event emission
- [ ] Implement ID minting with sequential counters per prefix
- [ ] JSON Pointer parser (RFC 6901) for three-layer delta routing
- [ ] Unit tests for all validation paths

### Phase 2: Tool Registration (Weeks 3-4)

- [ ] Register `aep_add_element` (bridge mints ID), `aep_move_element`, `aep_query_graph`, `aep_swap_theme` as AG-UI frontend tools
- [ ] Implement `next_available_id` query type
- [ ] Implement tool call handlers with full AEP validation
- [ ] Wire tool results back through AG-UI `TOOL_CALL_RESULT` events
- [ ] Integration tests with mock agent

### Phase 3: State Sync (Weeks 4-5)

- [ ] Implement `STATE_SNAPSHOT` serialisation of live AEP scene graph
- [ ] Implement `STATE_DELTA` ingestion with three-layer path routing
- [ ] Implement `AEP_RUNTIME_COORDINATES` emission via ResizeObserver + debounce
- [ ] Implement conflict resolution (last-write-wins + optimistic locking modes)

### Phase 4: Generative Topology (Weeks 5-6)

- [ ] Intercept AG-UI A2UI proposals
- [ ] Validate against AEP prefix, z-band, parent, skin_binding and Rego rules
- [ ] Mint sequential IDs for accepted proposals
- [ ] Implement live scene graph and registry updates for accepted proposals
- [ ] Implement rejection flow with specific error feedback

### Phase 5: Rego Integration (Week 6)

- [ ] OPA WASM loader for browser environments
- [ ] OPA CLI subprocess for server environments
- [ ] Pre-compiled decision table fallback
- [ ] Policy hot-reload on file change

### Phase 6: Interrupts and Approval (Week 7)

- [ ] Implement approval policy from `dynaep-config.yaml`
- [ ] Wire AG-UI interrupt events to approval gates
- [ ] Build approval UI component (itself registered in AEP)
- [ ] Human preview for theme swaps

### Phase 7: Python Bridge (Week 8)

- [ ] Port validation bridge to Python for backend-side validation
- [ ] Integrate with AG-UI Python SDK
- [ ] Mirror all TypeScript bridge functionality

### Phase 8: Documentation and Examples (Week 9)

- [ ] Full API reference for dynAEP bridge
- [ ] Tutorial: "Build a live agentic dashboard with dynAEP"
- [ ] Tutorial: "Connect LangGraph to dynAEP"
- [ ] Tutorial: "Connect Google ADK to dynAEP"
- [ ] Example configs for common application types

---

## 13. SDK Plan

### 13.1 `@dynaep/core` (TypeScript)

The core validation bridge. Framework-agnostic. Receives AG-UI events, validates against AEP configs, mints IDs, emits validated mutations or rejections.

```
npm install @dynaep/core
```

Exports:
- `DynAEPBridge` - main bridge class
- `validateMutation()` - standalone validation function
- `mintElementId()` - sequential ID generator per prefix
- `loadAEPConfigs()` - loads scene + registry + theme
- `serializeSceneSnapshot()` - emits full STATE_SNAPSHOT
- `registerAEPTools()` - registers AG-UI frontend tools

### 13.2 `@dynaep/react` (React)

React bindings. Provides hooks and components that wire AEP elements to the dynAEP bridge.

```
npm install @dynaep/react
```

Exports:
- `<DynAEPProvider>` - context provider wrapping the bridge
- `useAEPElement(id)` - hook returning resolved style + state + constraints
- `useAEPScene()` - hook returning the live reactive scene graph
- `useAgentStream()` - hook returning the AG-UI event stream with AEP validation
- `useAEPMutate()` - hook for applying validated mutations to the live scene
- `<DynAEPElement id="CP-00001">` - renderer that auto-resolves skin_binding + layout

### 13.3 `@dynaep/vue` (Vue)

Vue 3 bindings with composables.

```
npm install @dynaep/vue
```

Exports:
- `createDynAEP()` - plugin initialiser
- `useAEPElement(id)` - composable
- `useAEPScene()` - composable
- `useAgentStream()` - composable
- `useAEPMutate()` - composable for live mutations
- `<AEPElement :id="'CP-00001'">` - component

### 13.4 `dynaep` (Python)

Python bridge for backend-side validation. Integrates with AG-UI Python SDK.

```
pip install dynaep
```

Exports:
- `DynAEPBridge` - main bridge class
- `validate_mutation()` - standalone validation
- `mint_element_id()` - sequential ID generator
- `load_aep_configs()` - loads configs
- `create_ag_ui_middleware()` - AG-UI middleware wrapping the bridge

### 13.5 `dynaep-cli`

Command-line tool for AEP and dynAEP operations.

```
npm install -g dynaep-cli
```

Commands:
- `dynaep validate` - AOT validation of all config files
- `dynaep init` - scaffolds all config files
- `dynaep check-bindings` - verifies all skin_bindings resolve
- `dynaep check-graph` - verifies bi-directional parent/child consistency
- `dynaep serve` - starts a local dynAEP bridge with AG-UI SSE endpoint for development
- `dynaep generate` - AI scaffolding compiler (requires LLM endpoint, outputs strict AEP configs from natural language UI descriptions)

### 13.6 `@dynaep/copilotkit`

First-class integration with CopilotKit (the primary AG-UI client).

```
npm install @dynaep/copilotkit
```

Exports:
- `<CopilotDynAEP>` - drop-in replacement for CopilotKit provider that adds AEP validation
- `useCopilotAEP()` - hook combining CopilotKit agent stream with dynAEP bridge
- `aepTools` - pre-built CopilotKit tool definitions for all AEP operations

---

## 14. Compatibility Matrix

dynAEP works with every AG-UI-compatible agent backend. The bridge sits on the frontend (or optionally backend) and is transparent to the agent framework.

| Agent Framework | AG-UI Status | dynAEP Compatible |
|-----------------|--------------|-------------------|
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

---

## 15. AEP vs dynAEP: When to Use What

| Scenario | Use |
|----------|-----|
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

AEP is always the foundation. dynAEP is the live runtime layer on top.

---

## 16. Anti-Patterns

| Anti-pattern | Why it's wrong | The dynAEP way |
|-------------|---------------|----------------|
| Letting AG-UI events modify the DOM directly | No validation, hallucination surface wide open | Every event passes through the dynAEP bridge |
| Agent generating raw HTML via generative UI | Unverifiable, no AEP IDs, no z-band enforcement | Agent proposes generative topology using pre-verified AEP primitives only |
| Agent minting its own AEP IDs | ID collisions in multi-agent scenarios, rejection loops | Bridge mints all IDs via sequential counters per prefix |
| Storing UI state only in AG-UI shared state | AEP scene graph drifts from runtime state | Scene graph IS the shared state, synchronised via STATE_SNAPSHOT |
| Skipping JIT validation for performance | One bad mutation corrupts the entire graph | Use Template Nodes for dynamic elements, JIT cost is minimal |
| Hardcoding AG-UI event handlers per component | Unmaintainable, duplicated logic | Centralise in the dynAEP bridge, components just render |
| Agent freestyle-creating elements without registry types | Orphan elements, untraceable mutations | Bridge rejects any element whose type is not registered in AEP-FCR |
| Using polling for runtime reflection | Battery-heavy, 1-second lag, wasteful | ResizeObserver + MutationObserver with debounce |
| Parsing JSON Patch paths with custom regex | Fragile, breaks on edge cases | Standards-compliant JSON Pointer parser (RFC 6901) |
| Ignoring schema_revision bumps at runtime | Stale configs cause validation errors | Bridge emits DYNAEP_SCHEMA_RELOAD, agents re-query graph |

---

## 17. What's In This Repo

```
README.md                    This document (full protocol reference + implementation plan)
dynaep-config.yaml           Configuration for the validation bridge
dynaep-bridge.ts             Reference implementation of the validation bridge (TypeScript)
aep-scene.json               Example AEP Layer 1 (Structure)
aep-registry.yaml            Example AEP Layer 2 (Behaviour)
aep-theme.yaml               Example AEP Layer 3 (Skin)
aep-policy.rego              Example OPA/Rego forbidden patterns policy
sdk/                         SDK reference implementations
  sdk-aep-core.ts            @aep/core (TypeScript)
  sdk-aep-react.tsx          @aep/react (React)
  sdk-aep-vue.ts             @aep/vue (Vue 3)
  sdk-aep-python.py          aep (Python)
  sdk-dynaep-core.ts         @dynaep/core (TypeScript)
  sdk-dynaep-react.tsx       @dynaep/react (React)
  sdk-dynaep-python.py       dynaep (Python)
  sdk-dynaep-copilotkit.tsx  @dynaep/copilotkit (CopilotKit)
  sdk-dynaep-cli.ts          dynaep-cli (CLI)
```

---

## 18. Summary

dynAEP fuses AEP's deterministic topological matrix with AG-UI's real-time event streaming. The result:

1. **Build-time safety** from AEP: every UI element has a unique ID, exact spatial coordinates, defined behaviour and themed visuals
2. **Runtime safety** from dynAEP: every live AG-UI event is validated against the AEP graph before it touches the UI
3. **Full AG-UI compatibility**: works with every AG-UI-supported agent framework
4. **Generative topology with guardrails**: agents can instantiate new AEP primitives at runtime, but only within the mathematical constraints of the topological matrix
5. **Bridge-minted IDs**: agents never generate IDs, eliminating collision and rejection loops in multi-agent environments
6. **Human-in-the-loop**: configurable approval gates for structural, behavioural and skin mutations
7. **Conflict resolution**: last-write-wins with rejection feedback or optimistic locking for mission-critical multi-agent scenarios

The agent provides the semantic intelligence. The AEP graph provides the physical laws. dynAEP is the enforcement layer that connects them.

---

## Related

- [AEP: Agent Element Protocol](https://github.com/thePM001/AEP-agent-element-protocol)
- [AG-UI: Agent-User Interaction Protocol](https://github.com/ag-ui-protocol/ag-ui)
- [AG-UI Docs](https://docs.ag-ui.com)
- [CopilotKit](https://www.copilotkit.ai)

## License

MIT
