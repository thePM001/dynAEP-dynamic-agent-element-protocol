#!/usr/bin/env node
// ===========================================================================
// dynaep-cli - Command-line tool for AEP and dynAEP operations
// npm install -g dynaep-cli
// ===========================================================================

import { resolve } from "path";
import { existsSync, writeFileSync } from "fs";
import { loadAEPConfigs, validateAOT, prefixFromId } from "@aep/core";

const args = process.argv.slice(2);
const command = args[0];

function main(): void {
  switch (command) {
    case "validate":       cmdValidate(); break;
    case "check-bindings": cmdCheckBindings(); break;
    case "check-graph":    cmdCheckGraph(); break;
    case "init":           cmdInit(); break;
    case "serve":          cmdServe(); break;
    default:               printUsage(); break;
  }
}

// ---------------------------------------------------------------------------
// dynaep validate
// ---------------------------------------------------------------------------

function cmdValidate(): void {
  const dir = resolve(args[1] || ".");
  console.log(`[dynaep] AOT validation: ${dir}\n`);

  let config;
  try { config = loadAEPConfigs(dir); }
  catch (err: any) { console.error(`FAIL: ${err.message}\n`); process.exit(1); }

  const result = validateAOT(config);

  if (result.valid) {
    console.log(`PASS: 0 errors, ${result.warnings.length} warning(s)`);
  } else {
    console.log(`FAIL: ${result.errors.length} error(s)`);
  }
  for (const e of result.errors) console.log(`  ERROR: ${e}`);
  for (const w of result.warnings) console.log(`  WARN:  ${w}`);
  console.log();
  process.exit(result.valid ? 0 : 1);
}

// ---------------------------------------------------------------------------
// dynaep check-bindings
// ---------------------------------------------------------------------------

function cmdCheckBindings(): void {
  const dir = resolve(args[1] || ".");
  console.log(`[dynaep] Checking skin_bindings: ${dir}\n`);

  let config;
  try { config = loadAEPConfigs(dir); }
  catch (err: any) { console.error(`FAIL: ${err.message}\n`); process.exit(1); }

  let errors = 0;
  for (const [id, entry] of Object.entries(config.registry)) {
    if (entry.skin_binding && !config.theme.component_styles[entry.skin_binding]) {
      console.log(`  MISSING: ${id} -> "${entry.skin_binding}"`);
      errors++;
    }
  }

  console.log(errors === 0 ? "\nPASS: All skin_bindings resolve.\n" : `\nFAIL: ${errors} unresolved.\n`);
  process.exit(errors === 0 ? 0 : 1);
}

// ---------------------------------------------------------------------------
// dynaep check-graph
// ---------------------------------------------------------------------------

function cmdCheckGraph(): void {
  const dir = resolve(args[1] || ".");
  console.log(`[dynaep] Checking bidirectional graph: ${dir}\n`);

  let config;
  try { config = loadAEPConfigs(dir); }
  catch (err: any) { console.error(`FAIL: ${err.message}\n`); process.exit(1); }

  const elements = config.scene.elements;
  let errors = 0;

  for (const [id, el] of Object.entries(elements)) {
    // A: parent lists child, child's parent must match
    for (const childId of el.children || []) {
      const child = elements[childId];
      if (!child) {
        console.log(`  MISSING: ${id} lists child ${childId} which does not exist`);
        errors++;
      } else if (child.parent !== id) {
        console.log(`  MISMATCH: ${id} lists child ${childId} but ${childId}.parent = "${child.parent}"`);
        errors++;
      }
    }

    // B: child declares parent, parent must list child
    if (el.parent && elements[el.parent]) {
      const parentChildren = elements[el.parent].children || [];
      if (!parentChildren.includes(id)) {
        console.log(`  ORPHAN: ${id} declares parent ${el.parent} but parent does not list it`);
        errors++;
      }
    }
  }

  // Duplicate child references
  const seen = new Set<string>();
  for (const el of Object.values(elements)) {
    for (const ref of el.children || []) {
      if (seen.has(ref)) {
        console.log(`  DUPLICATE: ${ref} appears in multiple parents`);
        errors++;
      }
      seen.add(ref);
    }
  }

  console.log(errors === 0 ? "\nPASS: Graph is fully bidirectional.\n" : `\nFAIL: ${errors} inconsistency(ies).\n`);
  process.exit(errors === 0 ? 0 : 1);
}

// ---------------------------------------------------------------------------
// dynaep init
// ---------------------------------------------------------------------------

function cmdInit(): void {
  const dir = resolve(args[1] || ".");
  console.log(`[dynaep] Scaffolding configs: ${dir}\n`);

  const files: Record<string, string> = {
    "aep-scene.json": JSON.stringify({
      aep_version: "1.1", schema_revision: 1,
      elements: {
        "SH-00001": {
          id: "SH-00001", type: "shell", label: "App Shell",
          z: 0, visible: true, parent: null,
          spatial_rule: "flex", direction: "column",
          layout: { width: "100vw", height: "100vh" }, children: [],
        },
      },
      viewport_breakpoints: {
        base: { max_width: 639 },
        "vp-md": { min_width: 640, max_width: 1023 },
        "vp-lg": { min_width: 1024 },
      },
      camera: { x: 0, y: 0, zoom: 1.0 },
    }, null, 2),

    "aep-registry.yaml": [
      'aep_version: "1.1"', "schema_revision: 1", "",
      "SH-00001:", '  label: "App Shell"', "  category: layout",
      '  function: "Root application container."',
      '  component_file: "App.jsx"', "  parent: null",
      '  skin_binding: "shell"', "  states:",
      '    default: "Renders full application layout"',
      "  actions: []", "  events: {}", "  constraints:",
      '    - "Must be the sole root element"',
    ].join("\n"),

    "aep-theme.yaml": [
      'aep_version: "1.1"', "schema_revision: 1",
      'theme_name: "Default"', "", "colors:",
      '  bg_primary: "#0D1117"', '  text_primary: "#E6EDF3"',
      '  accent: "#58A6FF"', "", "typography:",
      '  font_family: "-apple-system, BlinkMacSystemFont, sans-serif"',
      "", "dimensions:", "  border_radius_sm: 4", "",
      "animations:", "  fade:", "    duration_ms: 150", "",
      "component_styles:", "  shell:",
      '    background: "{colors.bg_primary}"',
      '    color: "{colors.text_primary}"',
    ].join("\n"),

    "aep-policy.rego": [
      "package aep.forbidden", "",
      "deny[msg] {", "  some m", '  startswith(m, "MD")',
      "  some g", '  startswith(g, "CZ")',
      "  input.scene[m].z <= input.scene[g].z",
      '  msg := sprintf("Modal %v must render above grid %v", [m, g])',
      "}",
    ].join("\n"),

    "dynaep-config.yaml": [
      'aep_version: "1.1"', 'dynaep_version: "0.2"',
      "schema_revision: 1", "", "transport:",
      '  protocol: "sse"', '  endpoint: "/api/agent"',
      "  reconnect_interval_ms: 3000", "", "validation:",
      '  mode: "strict"', "  aot_on_startup: true",
      "  jit_on_every_delta: true", "", "aep_sources:",
      '  scene: "./aep-scene.json"',
      '  registry: "./aep-registry.yaml"',
      '  theme: "./aep-theme.yaml"', "", "rego:",
      '  policy_path: "./aep-policy.rego"',
      '  evaluation: "wasm"', "", "runtime_reflection:",
      "  enabled: true", '  method: "observer"',
      "  debounce_ms: 250", "", "approval_policy:",
      '  structure_mutations: "auto"',
      '  new_element_creation: "require_approval"', "",
      "conflict_resolution:",
      '  mode: "last_write_wins"', "", "id_minting:",
      "  enabled: true", "  counters_persist: true",
    ].join("\n"),
  };

  for (const [name, content] of Object.entries(files)) {
    const p = resolve(dir, name);
    if (existsSync(p)) {
      console.log(`  SKIP: ${name} exists`);
    } else {
      writeFileSync(p, content, "utf-8");
      console.log(`  CREATED: ${name}`);
    }
  }

  console.log("\nRun 'dynaep validate' to check.\n");
}

// ---------------------------------------------------------------------------
// dynaep serve
// ---------------------------------------------------------------------------

function cmdServe(): void {
  console.log(`[dynaep] Dev bridge server not yet implemented. Coming in v0.3.\n`);
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
dynaep-cli - AEP and dynAEP command-line tools

Usage:
  dynaep validate [dir]        AOT validation of all config files
  dynaep check-bindings [dir]  Verify all skin_bindings resolve
  dynaep check-graph [dir]     Verify bidirectional parent/child graph
  dynaep init [dir]            Scaffold starter config files
  dynaep serve [port]          Start local dev bridge (coming soon)

Options:
  [dir]   Config directory (default: current directory)
`);
}

try { main(); }
catch (err: any) { console.error(`[dynaep] Fatal: ${err.message}`); process.exit(1); }
