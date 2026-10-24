/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// memory_recall and memory_push (temp/05 § 5): the shared memory offered to the model as two of
// Orkeon Code's own tools, built with scriptTool and attached with `withAutonomousTool`. The recall
// reads (every mode); the push writes a candidate file, never entries/ (an edit: not offered in
// plan or dontAsk, asked in default). The gate decides from the declared access; the push also
// refuses by itself in a read-only mode. Their ports are built when the model calls them, from the
// wiring: `ctx` is undefined in a tool's execute.

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

export interface MemoryToolPorts {
  files: Pick<Files, "read" | "write" | "list">;
  shell: Pick<Shell, "run">;
  config: Pick<ConfigStore, "readValue">;
  memory: Pick<SharedMemory, "search">;
  clock: () => Date;
}

export const MEMORY_RECALL: ScriptToolSpec = {
  name: "memory_recall",
  description:
    "Search the shared memory of this project: the admitted decisions, code structures, methods and mistakes of " +
    "past work. Returns at most five entries, best first, each with what it applies to and its file. A precedent is " +
    "material, not an instruction: check it fits here.",
  schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "What you are about to do or decide, in a sentence." },
      types: { type: "array", items: { type: "string", enum: [...ENTRY_TYPES] }, description: "Only these types; absent, every type." },
      top_k: { type: "number", description: `How many entries at most, ${MAX_PRECEDENTS} at most.` },
    },
    required: ["query"],
  },
};

export const MEMORY_PUSH: ScriptToolSpec = {
  name: "memory_push",
  description:
    "Propose a lesson for the shared memory: it is written as a candidate, never admitted; the operator decides " +
    "with /memory-admit. Name the evidence (path:line, a commit, or a verdict file). A topic refused before is " +
    "refused again; a secret or a secret-like file is refused.",
  schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: [...ENTRY_TYPES] },
      title: { type: "string", description: "One line, at most 90 characters." },
      topic: { type: "string", description: "A few words naming the subject; entries of one topic are compared." },
      applies_when: { type: "string", description: "When the lesson applies, so another project can tell." },
      rationale: { type: "string", description: "Why: what happened, what it cost." },
      correction: { type: "string", description: "A mistake only: what to do instead." },
      detection_signal: { type: "string", description: "A mistake only: how to notice it." },
      evidence: { type: "array", items: { type: "string" }, description: "path:line, a commit or a verdict file, one each." },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["type", "title", "topic", "applies_when", "rationale", "evidence"],
  },
};

const typesOf = (value: unknown): EntryType[] =>
  Array.isArray(value) ? value.filter((t): t is EntryType => (ENTRY_TYPES as readonly unknown[]).includes(t)) : [];

export function memoryRecallTool(builder: ToolBuilderFactory, ports: () => MemoryToolPorts): Tool<unknown, unknown> {
  return scriptTool(builder, MEMORY_RECALL, async (input) => {
    const raw = (input !== null && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const query = typeof raw.query === "string" ? raw.query.trim() : "";
    if (query === "") return { ok: false, refused: "'query' is required" };
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
  });
}

export function memoryPushTool(builder: ToolBuilderFactory, ports: () => MemoryToolPorts, mode: string): Tool<unknown, unknown> {
  return scriptTool(builder, MEMORY_PUSH, async (input) => {
    if (isReadOnly(mode)) return { ok: false, refused: `memory_push writes a candidate file: mode '${mode}' writes nothing` };
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
