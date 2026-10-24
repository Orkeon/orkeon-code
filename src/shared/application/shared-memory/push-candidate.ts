// pushCandidate: a candidate of the shared memory from what the model or a crew proposes (the
// memory_push tool). It writes candidates/<id>.md only, never entries/: admission is
// /memory-admit's. Refused, with the reason and nothing written: a topic refused.md holds, an
// entry the domain finds invalid (shape, secrets), an unreadable refused list, a failed write.

import type { Files } from "../ports.ts";
import { ENTRY_TYPES, entryIdPrefix, entryProblems } from "../../domain/shared-memory/entry.ts";
import type { EntryType, MemoryEntry } from "../../domain/shared-memory/entry.ts";
import { topicOf } from "../../domain/shared-memory/refused.ts";
import { candidatePath, entryPath } from "../../domain/shared-memory/layout.ts";
import type { MemoryLayout } from "../../domain/shared-memory/layout.ts";
import { readOrNull, refreshCandidatesList, refusedTopics, writeCandidateFile } from "./memory-files.ts";

export interface PushInput {
  type: EntryType;
  title: string;
  topic: string;
  appliesWhen: string;
  rationale: string;
  correction?: string;
  detectionSignal?: string;
  /** path:line, a commit, or a verdict file: one item each. */
  evidence: string[];
  tags: string[];
  /** Absent: human:<date> memory_push. */
  source?: string;
}

export type PushOutcome =
  | { ok: true; id: string; path: string; warnings: string[] }
  | { ok: false; refused: string };

export interface PushDeps {
  files: Pick<Files, "read" | "write" | "list">;
  clock: () => Date;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter((v) => v !== "") : [];

/** The tool's input (snake_case, as the model writes it) read as a PushInput, or why not. */
export function readPushInput(input: unknown): { ok: true; input: PushInput } | { ok: false; refused: string } {
  const raw = (input !== null && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const type = text(raw.type);
  if (!(ENTRY_TYPES as readonly string[]).includes(type)) return { ok: false, refused: `type must be one of ${ENTRY_TYPES.join(", ")}` };
  const missing = ["title", "topic", "applies_when", "rationale"].filter((key) => text(raw[key]) === "");
  if (missing.length > 0) return { ok: false, refused: `${missing.join(", ")} required` };
  const evidence = list(raw.evidence);
  if (evidence.length === 0) return { ok: false, refused: "evidence required: at least one path:line, commit or verdict file" };
  const pushed: PushInput = {
    type: type as EntryType, title: text(raw.title), topic: text(raw.topic), appliesWhen: text(raw.applies_when),
    rationale: text(raw.rationale), evidence, tags: list(raw.tags).map((t) => t.toLowerCase()),
  };
  if (text(raw.correction) !== "") pushed.correction = text(raw.correction);
  if (text(raw.detection_signal) !== "") pushed.detectionSignal = text(raw.detection_signal);
  return { ok: true, input: pushed };
}

const day = (date: Date): string => date.toISOString().slice(0, 10);

/** The candidate entry, its id not yet made unique. */
export function candidateEntry(input: PushInput, project: string, date: string): MemoryEntry {
  const entry: MemoryEntry = {
    id: `${entryIdPrefix(project, input.type, date)}${topicOf(input.title)}`,
    type: input.type, title: input.title, project, date, topic: topicOf(input.topic),
    appliesWhen: input.appliesWhen, rationale: input.rationale,
    source: input.source ?? `human:${date} memory_push`, status: "candidate", supersedes: [], tags: input.tags, stack: [],
    body: ["## Context", input.appliesWhen, "", "## Content", input.rationale,
      ...(input.correction === undefined ? [] : ["", `Instead: ${input.correction}`]), "", "## Evidence",
      ...input.evidence.map((e) => `- \`${e.replace(/`/g, "'")}\``)].join("\n") + "\n",
  };
  if (input.correction !== undefined) entry.correction = input.correction;
  if (input.detectionSignal !== undefined) entry.detectionSignal = input.detectionSignal;
  return entry;
}

/** The id itself when no candidate or entry holds it, else the first free `-2` … `-9`; null when none is. */
async function freeId(files: Pick<Files, "read">, layout: MemoryLayout, entry: MemoryEntry): Promise<string | null> {
  for (let n = 1; n <= 9; n++) {
    const id = n === 1 ? entry.id : `${entry.id}-${n}`;
    const taken = (await readOrNull(files, candidatePath(layout, id))) !== null
      || (await readOrNull(files, entryPath(layout, entry.type, id))) !== null;
    if (!taken) return id;
  }
  return null;
}

const firstLine = (error: unknown): string => String((error as Error)?.message ?? error).split("\n")[0];

/** Writes `entry` as a candidate after the checks: refused topic, validity, a free id. */
export async function writeCandidate(
  deps: Pick<PushDeps, "files">, memory: { layout: MemoryLayout }, entry: MemoryEntry,
): Promise<PushOutcome> {
  try {
    if ((await refusedTopics(deps.files, memory.layout)).has(entry.topic)) {
      return { ok: false, refused: `topic '${entry.topic}' was refused (refused.md): it is never proposed again` };
    }
  } catch (error) {
    return { ok: false, refused: `refused.md cannot be read (${firstLine(error)}): nothing was written` };
  }
  const problems = entryProblems(entry);
  if (problems.length > 0) return { ok: false, refused: `not a valid entry: ${problems.join("; ")}` };
  let id: string | null;
  try {
    id = await freeId(deps.files, memory.layout, entry);
  } catch (error) {
    return { ok: false, refused: `${memory.layout.candidates} cannot be read (${firstLine(error)})` };
  }
  if (id === null) return { ok: false, refused: `nine candidates or entries already hold the id ${entry.id}` };
  let path: string;
  try {
    path = await writeCandidateFile(deps.files, memory.layout, { ...entry, id });
  } catch (error) {
    return { ok: false, refused: `${memory.layout.candidates} is not writable (${firstLine(error)}): nothing was written` };
  }
  const listed = await refreshCandidatesList(deps.files, memory.layout);
  return { ok: true, id, path, warnings: listed === null ? [] : [listed] };
}

/** memory_push: the input read, the candidate built and written. */
export async function pushCandidate(
  deps: PushDeps, memory: { layout: MemoryLayout; project: string }, raw: unknown,
): Promise<PushOutcome> {
  const read = readPushInput(raw);
  if (!read.ok) return read;
  return writeCandidate(deps, memory, candidateEntry(read.input, memory.project, day(deps.clock())));
}
