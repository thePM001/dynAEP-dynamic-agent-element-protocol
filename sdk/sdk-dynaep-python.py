# ===========================================================================
# dynaep - dynAEP Python SDK
# Server-side validation bridge for AG-UI event streams against AEP configs.
# Agents NEVER mint IDs. The bridge mints all IDs.
# pip install dynaep aep pyyaml
# ===========================================================================

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Optional

from aep import (
    AEPConfig,
    AEPElement,
    AEPRegistryEntry,
    ValidationResult,
    validate_jit,
    prefix_from_id,
    z_band_for_prefix,
    AEPIDError,
)


# ---------------------------------------------------------------------------
# Prefix-to-Type Mapping
# ---------------------------------------------------------------------------

TYPE_TO_PREFIX: dict[str, str] = {
    "shell": "SH", "panel": "PN", "component": "CP", "navigation": "NV",
    "cell_zone": "CZ", "cell_node": "CN", "toolbar": "TB", "widget": "WD",
    "overlay": "OV", "modal": "MD", "dropdown": "DD", "tooltip": "TT",
    "form": "FM", "icon": "IC",
}


# ---------------------------------------------------------------------------
# Bridge Configuration
# ---------------------------------------------------------------------------

@dataclass
class DynAEPBridgeConfig:
    validation_mode: str = "strict"
    jit_on_every_delta: bool = True
    conflict_resolution: str = "last_write_wins"   # last_write_wins | optimistic_locking
    reflection_enabled: bool = True
    reflection_debounce_ms: int = 250
    approval_policy: dict[str, str] = field(default_factory=lambda: {
        "structure_mutations": "auto",
        "behaviour_mutations": "auto",
        "skin_mutations": "auto",
        "new_element_creation": "require_approval",
    })


# ---------------------------------------------------------------------------
# Rejection
# ---------------------------------------------------------------------------

@dataclass
class DynAEPRejection:
    target_id: str
    error: str
    original_event_timestamp: float

    def to_ag_ui_event(self) -> dict:
        return {
            "type": "CUSTOM",
            "dynaep_type": "DYNAEP_REJECTION",
            "target_id": self.target_id,
            "error": self.error,
            "original_event_timestamp": self.original_event_timestamp,
        }


# ---------------------------------------------------------------------------
# Tool Call Result
# ---------------------------------------------------------------------------

@dataclass
class ToolCallResult:
    success: bool
    element_id: Optional[str] = None
    result: Any = None
    errors: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Bridge
# ---------------------------------------------------------------------------

class DynAEPBridge:
    def __init__(self, config: AEPConfig, bridge_config: Optional[DynAEPBridgeConfig] = None):
        self.config = config
        self.bridge_config = bridge_config or DynAEPBridgeConfig()
        self.live_elements: dict[str, AEPElement] = {
            k: AEPElement(
                id=v.id, type=v.type, label=v.label, z=v.z,
                visible=v.visible, parent=v.parent, layout=dict(v.layout),
                children=list(v.children), spatial_rule=v.spatial_rule,
                direction=v.direction, responsive_matrix=v.responsive_matrix,
            )
            for k, v in config.elements.items()
        }
        self.element_versions: dict[str, int] = {k: 1 for k in self.live_elements}
        self.id_counters: dict[str, int] = {}

        # Initialise counters from existing elements
        for el_id in self.live_elements:
            try:
                prefix = prefix_from_id(el_id)
                num = int(el_id[3:])
                self.id_counters[prefix] = max(self.id_counters.get(prefix, 0), num)
            except (AEPIDError, ValueError):
                pass

    # -----------------------------------------------------------------------
    # ID Minting
    # -----------------------------------------------------------------------

    def mint_element_id(self, element_type: str) -> str:
        prefix = TYPE_TO_PREFIX.get(element_type)
        if not prefix:
            raise ValueError(
                f'Unknown element type: "{element_type}". '
                f"Valid types: {', '.join(TYPE_TO_PREFIX.keys())}"
            )
        next_num = self.id_counters.get(prefix, 0) + 1
        self.id_counters[prefix] = next_num
        return f"{prefix}-{next_num:05d}"

    def get_next_available_id(self, prefix: str) -> str:
        next_num = self.id_counters.get(prefix, 0) + 1
        return f"{prefix}-{next_num:05d}"

    # -----------------------------------------------------------------------
    # Process Event
    # -----------------------------------------------------------------------

    def process_event(self, event: dict) -> dict | DynAEPRejection:
        event_type = event.get("type")

        if event_type == "STATE_DELTA":
            return self._process_state_delta(event)

        if event_type == "CUSTOM" and isinstance(event.get("dynaep_type"), str):
            return self._process_dynaep_event(event)

        return event

    # -----------------------------------------------------------------------
    # STATE_DELTA: Three-layer routing
    # -----------------------------------------------------------------------

    def _process_state_delta(self, event: dict) -> dict | DynAEPRejection:
        if not self.bridge_config.jit_on_every_delta:
            return event

        deltas = event.get("delta")
        if not isinstance(deltas, list):
            return event

        for op in deltas:
            path = op.get("path", "")
            if not isinstance(path, str):
                continue
            parts = [p for p in path.split("/") if p]
            if len(parts) < 2:
                continue

            layer = parts[0]
            target_id = parts[1]
            field_name = parts[2] if len(parts) > 2 else None

            if layer == "elements":
                changes: dict[str, Any] = {}
                if field_name:
                    changes[field_name] = op.get("value")
                result = validate_jit(self.config, target_id, changes)
                if not result.valid:
                    return DynAEPRejection(
                        target_id=target_id,
                        error="; ".join(result.errors),
                        original_event_timestamp=event.get("timestamp", time.time()),
                    )

                # Optimistic locking
                if self.bridge_config.conflict_resolution == "optimistic_locking":
                    expected = event.get("expected_version")
                    if expected is not None:
                        current = self.element_versions.get(target_id, 0)
                        if expected != current:
                            return DynAEPRejection(
                                target_id=target_id,
                                error=f"Optimistic lock conflict: expected {expected} but current is {current}",
                                original_event_timestamp=event.get("timestamp", time.time()),
                            )

            elif layer == "registry":
                if target_id not in self.config.registry and not self.config.is_template_instance(target_id):
                    return DynAEPRejection(
                        target_id=target_id,
                        error=f"Cannot mutate behaviour: {target_id} has no registry entry",
                        original_event_timestamp=event.get("timestamp", time.time()),
                    )

        # Apply structure deltas
        for op in deltas:
            parts = [p for p in op.get("path", "").split("/") if p]
            if parts[0:1] == ["elements"] and len(parts) >= 3:
                el_id = parts[1]
                field_name = parts[2]
                el = self.live_elements.get(el_id)
                if el and hasattr(el, field_name):
                    setattr(el, field_name, op.get("value"))
                    self.element_versions[el_id] = self.element_versions.get(el_id, 0) + 1

        return event

    # -----------------------------------------------------------------------
    # Custom dynAEP events
    # -----------------------------------------------------------------------

    def _process_dynaep_event(self, event: dict) -> dict | DynAEPRejection:
        dt = event.get("dynaep_type")

        if dt == "AEP_MUTATE_STRUCTURE":
            return self._validate_structure_mutation(event)
        if dt == "AEP_MUTATE_BEHAVIOUR":
            return self._validate_behaviour_mutation(event)
        if dt == "AEP_MUTATE_SKIN":
            return self._validate_skin_mutation(event)
        if dt == "AEP_QUERY":
            return self._handle_query(event)

        return event

    def _validate_structure_mutation(self, event: dict) -> dict | DynAEPRejection:
        target_id = event.get("target_id", "")
        mutation = event.get("mutation", {})
        errors: list[str] = []

        if target_id not in self.live_elements and not self.config.is_template_instance(target_id):
            errors.append(f"Unknown element: {target_id}")

        parent = mutation.get("parent")
        if parent and parent not in self.live_elements:
            errors.append(f"Cannot move {target_id}: parent {parent} does not exist")

        anchors = mutation.get("anchors", {})
        if isinstance(anchors, dict):
            for direction, anchor in anchors.items():
                if not isinstance(anchor, str):
                    continue
                anchor_target = anchor.split(".")[0]
                if anchor_target != "viewport" and anchor_target not in self.live_elements:
                    errors.append(f"Invalid anchor: {target_id} {direction} -> {anchor_target}")

        sb = mutation.get("skin_binding")
        if sb and sb not in self.config.component_styles:
            errors.append(f'{target_id} skin_binding "{sb}" not found in theme')

        if errors:
            return DynAEPRejection(
                target_id=target_id,
                error="; ".join(errors),
                original_event_timestamp=event.get("timestamp", time.time()),
            )

        # Apply
        el = self.live_elements.get(target_id)
        if el and parent:
            if el.parent and el.parent in self.live_elements:
                old_parent = self.live_elements[el.parent]
                if target_id in old_parent.children:
                    old_parent.children.remove(target_id)
            el.parent = parent
            new_parent_el = self.live_elements.get(parent)
            if new_parent_el and target_id not in new_parent_el.children:
                new_parent_el.children.append(target_id)

        if el and anchors:
            el.layout["anchors"] = anchors

        if target_id in self.element_versions:
            self.element_versions[target_id] += 1

        return event

    def _validate_behaviour_mutation(self, event: dict) -> dict | DynAEPRejection:
        target_id = event.get("target_id", "")
        if target_id not in self.config.registry and not self.config.is_template_instance(target_id):
            return DynAEPRejection(
                target_id=target_id,
                error=f"Cannot mutate behaviour: {target_id} has no registry entry",
                original_event_timestamp=event.get("timestamp", time.time()),
            )
        return event

    def _validate_skin_mutation(self, event: dict) -> dict | DynAEPRejection:
        target_id = event.get("target_id", "")
        if target_id not in self.config.component_styles:
            return DynAEPRejection(
                target_id=target_id,
                error=f'Cannot mutate skin: "{target_id}" not in component_styles',
                original_event_timestamp=event.get("timestamp", time.time()),
            )
        return event

    def _handle_query(self, event: dict) -> dict:
        query = event.get("query", "")
        target_id = event.get("target_id", "")
        result: Any = None
        el = self.live_elements.get(target_id)

        if query == "children_of":
            result = el.children if el else []
        elif query == "parent_of":
            result = el.parent if el else None
        elif query == "z_band_of":
            try:
                result = list(z_band_for_prefix(prefix_from_id(target_id)))
            except AEPIDError:
                result = [0, 99]
        elif query == "visible_at_breakpoint":
            result = el.responsive_matrix if el and el.responsive_matrix else {"all": el.visible if el else False}
        elif query == "full_element":
            entry = self.config.registry.get(target_id)
            result = {
                "scene": {"id": el.id, "z": el.z, "parent": el.parent, "children": el.children} if el else None,
                "registry": {"label": entry.label, "skin_binding": entry.skin_binding} if entry else None,
                "version": self.element_versions.get(target_id, 0),
            }
        elif query == "next_available_id":
            result = self.get_next_available_id(target_id)

        return {
            "type": "CUSTOM",
            "dynaep_type": "AEP_QUERY_RESULT",
            "target_id": target_id,
            "result": result,
        }

    # -----------------------------------------------------------------------
    # Tool Call Handler
    # -----------------------------------------------------------------------

    def handle_tool_call(self, tool_name: str, args: dict) -> ToolCallResult:
        if tool_name == "aep_add_element":
            return self._handle_add_element(args)
        if tool_name == "aep_move_element":
            return self._handle_move_element(args)
        if tool_name == "aep_query_graph":
            r = self._handle_query({
                "type": "CUSTOM", "dynaep_type": "AEP_QUERY",
                "query": args.get("query_type", ""), "target_id": args.get("target_id", ""),
            })
            return ToolCallResult(success=True, result=r.get("result"))
        if tool_name == "aep_swap_theme":
            return ToolCallResult(success=True, result=f"Theme swap to \"{args.get('theme_name')}\" requested")
        return ToolCallResult(success=False, errors=[f"Unknown tool: {tool_name}"])

    def _handle_add_element(self, args: dict) -> ToolCallResult:
        el_type = args.get("type", "")
        parent = args.get("parent", "")
        z = args.get("z")
        skin_binding = args.get("skin_binding", "")
        label = args.get("label", "")

        errors: list[str] = []

        if el_type not in TYPE_TO_PREFIX:
            errors.append(f'Unknown element type: "{el_type}"')
            return ToolCallResult(success=False, errors=errors)

        if parent not in self.live_elements:
            errors.append(f"Parent {parent} does not exist")
            return ToolCallResult(success=False, errors=errors)

        if skin_binding not in self.config.component_styles:
            errors.append(f'skin_binding "{skin_binding}" not found in theme')
            return ToolCallResult(success=False, errors=errors)

        prefix = TYPE_TO_PREFIX[el_type]
        min_z, max_z = z_band_for_prefix(prefix)
        if not isinstance(z, int) or z < min_z or z > max_z:
            errors.append(f"z={z} outside band {min_z}-{max_z} for prefix {prefix}")
            return ToolCallResult(success=False, errors=errors)

        new_id = self.mint_element_id(el_type)

        new_el = AEPElement(
            id=new_id, type=el_type, label=label or new_id, z=z,
            visible=True, parent=parent,
            layout=args.get("layout") or {}, children=[],
        )

        self.live_elements[new_id] = new_el
        self.element_versions[new_id] = 1

        parent_el = self.live_elements.get(parent)
        if parent_el and new_id not in parent_el.children:
            parent_el.children.append(new_id)
            self.element_versions[parent] = self.element_versions.get(parent, 0) + 1

        return ToolCallResult(success=True, element_id=new_id)

    def _handle_move_element(self, args: dict) -> ToolCallResult:
        el_id = args.get("id", "")
        new_parent = args.get("new_parent")

        if el_id not in self.live_elements:
            return ToolCallResult(success=False, errors=[f"Element {el_id} not found"])

        el = self.live_elements[el_id]

        if new_parent:
            if new_parent not in self.live_elements:
                return ToolCallResult(success=False, errors=[f"Parent {new_parent} not found"])

            if el.parent and el.parent in self.live_elements:
                old = self.live_elements[el.parent]
                if el_id in old.children:
                    old.children.remove(el_id)
                    self.element_versions[el.parent] = self.element_versions.get(el.parent, 0) + 1

            el.parent = new_parent
            np = self.live_elements[new_parent]
            if el_id not in np.children:
                np.children.append(el_id)
                self.element_versions[new_parent] = self.element_versions.get(new_parent, 0) + 1

        anchors = args.get("anchors")
        if anchors:
            el.layout["anchors"] = anchors

        self.element_versions[el_id] = self.element_versions.get(el_id, 0) + 1
        return ToolCallResult(success=True, element_id=el_id)

    # -----------------------------------------------------------------------
    # Schema Reload
    # -----------------------------------------------------------------------

    def reload_config(self, new_config: AEPConfig) -> dict:
        old_rev = self.config.reg_schema_revision
        self.config = new_config
        self.live_elements = {
            k: AEPElement(
                id=v.id, type=v.type, label=v.label, z=v.z,
                visible=v.visible, parent=v.parent, layout=dict(v.layout),
                children=list(v.children), spatial_rule=v.spatial_rule,
                direction=v.direction, responsive_matrix=v.responsive_matrix,
            )
            for k, v in new_config.elements.items()
        }
        return {
            "type": "CUSTOM",
            "dynaep_type": "DYNAEP_SCHEMA_RELOAD",
            "old_revision": old_rev,
            "new_revision": new_config.reg_schema_revision,
            "aep_version": new_config.scene_aep_version,
        }


# ---------------------------------------------------------------------------
# AG-UI Middleware
# ---------------------------------------------------------------------------

def create_ag_ui_middleware(
    config: AEPConfig,
    bridge_config: Optional[DynAEPBridgeConfig] = None,
):
    """
    Returns a middleware function that validates AG-UI events against AEP.

    Usage:
        middleware = create_ag_ui_middleware(config)

        @app.post("/api/agent")
        async def agent_endpoint(request):
            for event in run_agent(request):
                validated = middleware(event)
                if isinstance(validated, DynAEPRejection):
                    yield validated.to_ag_ui_event()
                else:
                    yield validated
    """
    bridge = DynAEPBridge(config, bridge_config)

    def middleware(event: dict) -> dict | DynAEPRejection:
        return bridge.process_event(event)

    return middleware
