// /memory-admit [<id>…] | --refuse <id> [<motif>] | --list — the operator's gate of the shared memory
// (temp/05 § 3). Listing and refusing are a few reads and writes, answered here; an admission is
// confirmed here, one candidate at a time, then applied by the crew shared-memory-admit, which also
// re-indexes entries/. A session that cannot prompt admits nothing (as /commit refuses headless):
// only an audited candidate admits without a question, when memory.autoAdmitAudited is true.

import type { Files, Shell } from "../../shared/application/ports.ts";
import type { ConfigStore } from "../../shared/application/config-store.ts";
import { readMemorySettings } from "../../shared/application/shared-memory/memory-settings.ts";
import type { MemorySettings } from "../../shared/application/shared-memory/memory-settings.ts";
import { pendingCandidates } from "../../shared/application/shared-memory/memory-files.ts";
import type { StoredEntry } from "../../shared/application/shared-memory/memory-files.ts";
import { admitEntries, admitReport } from "../../shared/application/shared-memory/admit-entries.ts";
import { admissionProblem, asksConfirmation } from "../../shared/domain/shared-memory/gate.ts";
import { candidatesList } from "../../shared/domain/shared-memory/candidates.ts";

export const MEMORY_ADMIT_CREW = "shared-memory-admit";
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_MOTIF_CHARS = 200;
const SHOWN_BODY_LINES = 6;

export type MemoryAdmitArgs =
  | { kind: "list" }
  | { kind: "refuse"; id: string; motif?: string }
  | { kind: "admit"; ids: string[] };

export function parseMemoryAdmitArgs(tokens: readonly string[]): { ok: true; args: MemoryAdmitArgs } | { ok: false; text: string } {
  if (tokens[0] === "--list") {
    return tokens.length === 1 ? { ok: true, args: { kind: "list" } } : { ok: false, text: "memory-admit: --list takes nothing else" };
  }
  if (tokens[0] === "--refuse") {
    const id = tokens[1];
    if (id === undefined || !ID.test(id)) return { ok: false, text: "memory-admit: --refuse <id> [<motif>]: the id of a pending candidate" };
    const motif = tokens.slice(2).join(" ").replace(/\s+/g, " ").trim();
    if (Array.from(motif).length > MAX_MOTIF_CHARS) return { ok: false, text: `memory-admit: a motif of at most ${MAX_MOTIF_CHARS} characters` };
    return { ok: true, args: motif === "" ? { kind: "refuse", id } : { kind: "refuse", id, motif } };
  }
  for (const tok of tokens) {
    if (tok.startsWith("--")) return { ok: false, text: `memory-admit: unknown option '${tok}' (--list, --refuse)` };
    if (!ID.test(tok)) return { ok: false, text: `memory-admit: '${tok}' is not a candidate id` };
  }
  return { ok: true, args: { kind: "admit", ids: [...new Set(tokens)] } };
}

export interface MemoryAdmitDeps {
  files: Pick<Files, "read" | "write" | "list">;
  config: Pick<ConfigStore, "readValue">;
  shell: Pick<Shell, "run">;
  clock: () => Date;
}

/** What the session offers the command: a line out, and the confirm prompt (throws when it cannot ask). */
export interface MemoryAdmitIo {
  writeLine(text: string): void;
  confirm(question: string): Promise<unknown>;
}

export type MemoryAdmitResult =
  | { message: string }
  | { refused: string }
  | { admit: string[]; settings: MemorySettings };

/** What the operator reads before deciding: the candidate's fields and the first lines of its body. */
export function candidateNotice(c: StoredEntry): string {
  const e = c.entry;
  const lines = [`${e.id} (${e.type}, topic ${e.topic})`, `  title: ${e.title}`, `  applies when: ${e.appliesWhen}`,
    `  rationale: ${e.rationale}`];
  if (e.correction !== undefined) lines.push(`  correction: ${e.correction}`);
  if (e.detectionSignal !== undefined) lines.push(`  signal: ${e.detectionSignal}`);
  if (e.supersedes.length > 0) lines.push(`  supersedes: ${e.supersedes.join(", ")}`);
  lines.push(`  source: ${e.source}`, `  file: ${c.path}`);
  const body = e.body.split("\n").filter((l) => l.trim() !== "").slice(0, SHOWN_BODY_LINES);
  return [...lines, ...body.map((l) => `  | ${l}`)].join("\n");
}

const HEADLESS = "refused: /memory-admit asks before admitting and this session cannot prompt: nothing was admitted. " +
  "Run it in an interactive session (an audited candidate admits unasked when memory.autoAdmitAudited is true).";

export async function runMemoryAdmit(args: MemoryAdmitArgs, deps: MemoryAdmitDeps, io: MemoryAdmitIo): Promise<MemoryAdmitResult> {
  const settings = await readMemorySettings(deps);
  for (const warning of settings.warnings) io.writeLine(`warning: ${warning}`);
  const pending = await pendingCandidates(deps.files, settings.layout);
  if (args.kind === "list") {
    return { message: pending.length === 0 ? `No pending candidate in ${settings.layout.candidates}.` : candidatesList(pending.map((c) => c.entry)).trimEnd() };
  }
  if (args.kind === "refuse") {
    const outcome = await admitEntries({ ...deps, memory: { ingest: async () => { throw new Error("no ingestion on a refusal"); } } },
      settings, { admit: [], refuse: [{ id: args.id, ...(args.motif === undefined ? {} : { motif: args.motif }) }] });
    return outcome.refused.length > 0 ? { message: admitReport(outcome) } : { refused: admitReport(outcome) };
  }
  const chosen: StoredEntry[] = [];
  for (const id of args.ids) {
    const hit = pending.find((c) => c.entry.id === id);
    if (hit === undefined) io.writeLine(`${id}: not a pending candidate (/memory-admit --list)`);
    else chosen.push(hit);
  }
  const asked = args.ids.length === 0 ? pending : chosen;
  if (asked.length === 0) return { message: args.ids.length === 0 ? `No pending candidate in ${settings.layout.candidates}.` : "Nothing admitted." };
  const admit: string[] = [];
  for (const c of asked) {
    io.writeLine(candidateNotice(c));
    const problem = admissionProblem(c.entry);
    if (problem !== undefined) { io.writeLine(`  not admissible: ${problem}`); continue; }
    if (!asksConfirmation(c.entry, settings.autoAdmitAudited)) {
      io.writeLine("  admitted without a question (audited, memory.autoAdmitAudited is true)");
      admit.push(c.entry.id);
      continue;
    }
    let answer: unknown;
    try {
      answer = await io.confirm(`Admit ${c.entry.id} into the shared memory?`);
    } catch {
      return { refused: HEADLESS };
    }
    if (typeof answer !== "boolean") return { refused: HEADLESS };
    if (answer) admit.push(c.entry.id);
    else io.writeLine("  left as a candidate");
  }
  return admit.length === 0 ? { message: "Nothing admitted." } : { admit, settings };
}
