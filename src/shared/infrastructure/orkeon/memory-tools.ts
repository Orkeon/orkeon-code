/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// memory_recall and memory_push (temp/05 § 5): the shared memory offered to the model as two of
// Orkeon Code's own tools, built with scriptTool and attached with `withAutonomousTool`. The recall
// reads (every mode); the push writes a candidate file, never entries/ (an edit: not offered in
// plan or dontAsk, asked in default). The gate decides from the declared access; the push also
// refuses by itself in a read-only mode. Their ports are built when the model calls them, from the
// wiring: `ctx` is undefined in a tool's execute. Under a batch's working root, the recall's
// file paths go out on the root (scriptTool's `root`).

import { ENTRY_TYPES } from "../../domain/shared-memory/entry.ts";
import type { EntryType } from "../../domain/shared-memory/entry.ts";
import { MAX_PRECEDENTS } from "../../domain/shared-memory/precedents-block.ts";
import { isReadOnly } from "../../domain/agent-policy/permission.ts";
import type { ConfigStore } from "../../application/config-store.ts";
import type { Files, SharedMemory, Shell } from "../../application/ports.ts";
import { readMemorySettings } from "../../application/shared-memory/memory-settings.ts";
import { recallEntries } from "../../application/shared-memory/recall-precedents.ts";
import { pushCandidate } from "../../application/shared-memory/push-candidate.ts";
import { scriptTool } from "./script-tools.ts";
import type { ScriptToolSpec, ToolBuilderFactory } from "./script-tools.ts";
import {
  MEMORY_PUSH_DESCRIPTION, MEMORY_RECALL_DESCRIPTION, PUSH_APPLIES_WHEN, PUSH_CORRECTION, PUSH_DETECTION_SIGNAL, PUSH_EVIDENCE,
  PUSH_RATIONALE, PUSH_TITLE, PUSH_TOPIC, QUERY_REQUIRED, RECALL_QUERY, RECALL_TYPES, pushWritesNothing, recallTopK,
} from "./prompts.ts";

export interface MemoryToolPorts {
  files: Pick<Files, "read" | "write" | "list">;
  shell: Pick<Shell, "run">;
  config: Pick<ConfigStore, "readValue">;
  memory: Pick<SharedMemory, "search">;
  clock: () => Date;
}

export const MEMORY_RECALL: ScriptToolSpec = {
  name: "memory_recall",
  description: MEMORY_RECALL_DESCRIPTION,
  schema: {
    type: "object",
    properties: {
      query: { type: "string", description: RECALL_QUERY },
      types: { type: "array", items: { type: "string", enum: [...ENTRY_TYPES] }, description: RECALL_TYPES },
      top_k: { type: "number", description: recallTopK(MAX_PRECEDENTS) },
    },
    required: ["query"],
  },
};

export const MEMORY_PUSH: ScriptToolSpec = {
  name: "memory_push",
  description: MEMORY_PUSH_DESCRIPTION,
  schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: [...ENTRY_TYPES] },
      title: { type: "string", description: PUSH_TITLE },
      topic: { type: "string", description: PUSH_TOPIC },
      applies_when: { type: "string", description: PUSH_APPLIES_WHEN },
      rationale: { type: "string", description: PUSH_RATIONALE },
      correction: { type: "string", description: PUSH_CORRECTION },
      detection_signal: { type: "string", description: PUSH_DETECTION_SIGNAL },
      evidence: { type: "array", items: { type: "string" }, description: PUSH_EVIDENCE },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["type", "title", "topic", "applies_when", "rationale", "evidence"],
  },
};

const typesOf = (value: unknown): EntryType[] =>
  Array.isArray(value) ? value.filter((t): t is EntryType => (ENTRY_TYPES as readonly unknown[]).includes(t)) : [];

export function memoryRecallTool(builder: ToolBuilderFactory, ports: () => MemoryToolPorts, root?: string): Tool<unknown, unknown> {
  return scriptTool(builder, MEMORY_RECALL, async (input) => {
    const raw = (input !== null && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const query = typeof raw.query === "string" ? raw.query.trim() : "";
    if (query === "") return { ok: false, refused: QUERY_REQUIRED };
    const p = ports();
    const settings = await readMemorySettings(p);
    const max = typeof raw.top_k === "number" && Number.isFinite(raw.top_k) ? raw.top_k : MAX_PRECEDENTS;
    const recall = await recallEntries(p, { memory: settings, query, types: typesOf(raw.types), max });
    return {
      entries: recall.precedents.map(({ entry: e, path, score }) => ({
        id: e.id, type: e.type, project: e.project, date: e.date, status: e.status, title: e.title,
        applies_when: e.appliesWhen, rationale: e.rationale,
        ...(e.correction === undefined ? {} : { correction: e.correction }),
        ...(e.detectionSignal === undefined ? {} : { detection_signal: e.detectionSignal }),
        path, score,
      })),
      truncated: recall.truncated,
    };
  }, root);
}

export function memoryPushTool(builder: ToolBuilderFactory, ports: () => MemoryToolPorts, mode: string): Tool<unknown, unknown> {
  return scriptTool(builder, MEMORY_PUSH, async (input) => {
    if (isReadOnly(mode)) return { ok: false, refused: pushWritesNothing(mode) };
    const p = ports();
    const settings = await readMemorySettings(p);
    const pushed = await pushCandidate(p, settings, input);
    return pushed.ok
      ? { candidate_path: pushed.path, id: pushed.id, status: "candidate", ...(pushed.warnings.length > 0 ? { warnings: pushed.warnings } : {}) }
      : { refused: pushed.refused };
  });
}

/** The memory tools among `names` (what scriptToolsFor offered the mode), built; any other name is left out. */
export function memoryTools(
  builder: ToolBuilderFactory, ports: () => MemoryToolPorts, mode: string, names: readonly string[],
): Array<Tool<unknown, unknown>> {
  return names.flatMap((name) => name === MEMORY_RECALL.name ? [memoryRecallTool(builder, ports)]
    : name === MEMORY_PUSH.name ? [memoryPushTool(builder, ports, mode)] : []);
}

/** A dev crew attaches memory_recall unless its command said a session rule denies every call of it
 *  (`memoryRecall: false` in the input): the gate would refuse each call the agent tried. */
export function memoryRecallOn(input: unknown): boolean {
  return !(input !== null && typeof input === "object" && (input as { memoryRecall?: unknown }).memoryRecall === false);
}

/** memory_recall for a dev agent's `withAutonomousTools`, none when it is off. */
export function memoryRecallTools(
  builder: ToolBuilderFactory, ports: () => MemoryToolPorts, on: boolean, root?: string,
): Array<Tool<unknown, unknown>> {
  return on ? [memoryRecallTool(builder, ports, root)] : [];
}

/** The read tools a dev agent's callbacks let through on a host without a gate: memory_recall when it is on. */
export function memoryReadTools(on: boolean): string[] {
  return on ? [MEMORY_RECALL.name] : [];
}
