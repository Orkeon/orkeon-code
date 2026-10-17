// Context gathering for the main-loop prompt assembly — orchestration + IO.
// Collects the data the pure ../domain/prompt-assembly renders: the project's
// instructions file, the memory categories, git context, the budget/cost gauge,
// the session preferences and registries. Every read is best-effort: a missing
// tool or file yields an omitted block, never a crash.
//
// The body performs ONE act() per crew run, so gathering here, lazily, costs the
// same as seeding at crew start — the prefix cache plays on the byte-stability of
// the assembled header, not on avoiding these reads.

import type { Files, MemoryStore, SessionStore, Shell, Telemetry } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { INSTRUCTIONS_FILES } from "../../../shared/domain/instructions-file.ts";
import type { InstructionsFile } from "../../../shared/domain/instructions-file.ts";
import { ANSWER_LANGUAGE_CONFIG_KEY } from "../../../shared/domain/agent-policy/output-styles.ts";
import { readJsonArray } from "../../../shared/application/session-state.ts";
import {
  OUTPUT_STYLE_STATE_KEY, HOOKS_STATE_KEY,
  EFFORT_STATE_KEY, PASSES_STATE_KEY, FAST_MODE_STATE_KEY,
  PROACTIVE_STATE_KEY, MODEL_PREFERENCE_STATE_KEY,
} from "../../../shared/domain/session-keys.ts";
import { MAX_MEMORY_ENTRIES_PER_CATEGORY } from "../domain/prompt-assembly.ts";
import { MEMORY_CATEGORIES } from "../../../shared/domain/agent-policy/memory-categories.ts";
import { resolveBehaviorFlags } from "../../../shared/domain/agent-policy/behavior-flags.ts";
import type { BehaviorFlags } from "../../../shared/domain/agent-policy/behavior-flags.ts";

/** The project's instructions file: the first of INSTRUCTIONS_FILES present and
 *  not blank (AGENTS.md, then CLAUDE.md); undefined when the project has none. */
export async function readInstructionsFile(files: Files): Promise<InstructionsFile | undefined> {
  for (const file of INSTRUCTIONS_FILES) {
    try {
      const content = await files.read("/workspace/" + file);
      if (content.trim().length > 0) return { file, content };
    } catch { /* absent or unreadable → the next one */ }
  }
  return undefined;
}

/** The `answer.language` setting; "" when unset, unreadable or without a store. */
export async function readLanguage(config: Pick<ConfigStore, "readValue"> | undefined): Promise<string> {
  if (config === undefined) return "";
  try {
    return String((await config.readValue(ANSWER_LANGUAGE_CONFIG_KEY)).value ?? "").trim();
  } catch {
    return "";
  }
}

/** Memory entries per category (best-effort, per-category isolation). */
export async function readMemoryByCategory(memory: MemoryStore): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  for (const category of MEMORY_CATEGORIES) {
    try {
      result[category] = (await memory.list(category))
        .map((e) => e.content)
        .filter((c) => c.length > 0)
        .slice(0, MAX_MEMORY_ENTRIES_PER_CATEGORY);
    } catch { /* category unavailable → omitted */ }
  }
  return result;
}

/** cwd + `git status --porcelain=v1 -b` (read-only, legitimate in plan mode too). */
export async function readGitContext(shell: Shell): Promise<{ cwd: string; gitStatus?: string }> {
  try {
    const r = await shell.run("git status --porcelain=v1 -b");
    return { cwd: "/workspace", gitStatus: r.exitCode === 0 ? r.stdout : undefined };
  } catch {
    return { cwd: "/workspace" };
  }
}

/** Budget + cost gauge inputs (token_budget + session_stats). */
export async function readGauge(session: SessionStore, telemetry: Telemetry): Promise<{
  usedTokens: number;
  contextWindow: number;
  costUsd: number;
  totalTokens: number;
  totalCalls: number;
}> {
  let usedTokens = 0;
  let contextWindow = 0;
  let costUsd = 0;
  let totalTokens = 0;
  let totalCalls = 0;
  try {
    const b = await session.readBudget();
    usedTokens = b.used;
    contextWindow = b.window;
  } catch { /* gauge degrades to zeros */ }
  try {
    const s = await telemetry.readStats();
    costUsd = s.costUsd ?? 0;
    totalTokens = s.totalTokens ?? 0;
    totalCalls = s.totalCalls ?? 0;
  } catch { /* gauge degrades to zeros */ }
  return { usedTokens, contextWindow, costUsd, totalTokens, totalCalls };
}

// ── The session preferences and registries the assembly renders ──
//
// These reads are best-effort in the same way as the rest of this module: an
// unavailable session store yields an omitted block, never a failed turn. The
// attached skills are read by shared/application/attached-skills.ts, which the
// compaction shares.

// State keys come from shared/domain/session-keys.ts: the writer is a command,
// the reader is here, and a duplicated literal would let the two desync silently.

/** The /output-style session preference; "default" when unset (renders nothing). */
export async function readOutputStyle(session: SessionStore): Promise<string> {
  try {
    return (await session.readState(OUTPUT_STYLE_STATE_KEY)) ?? "default";
  } catch {
    return "default";
  }
}

/**
 * The five behavior flags plus the /model override, in ONE read.
 *
 * Read together and resolved by the pure `resolveBehaviorFlags` so the turn gets
 * a consistent snapshot and every fallback lives in one tested place. A session
 * store that is absent yields the defaults — i.e. exactly the pre-B-9 behaviour.
 */
export async function readBehaviorFlags(session: SessionStore): Promise<BehaviorFlags> {
  const read = async (key: string) => {
    try {
      return await session.readState(key);
    } catch {
      return null;
    }
  };
  const [effort, passes, fast, proactive, model] = await Promise.all([
    read(EFFORT_STATE_KEY), read(PASSES_STATE_KEY), read(FAST_MODE_STATE_KEY),
    read(PROACTIVE_STATE_KEY), read(MODEL_PREFERENCE_STATE_KEY),
  ]);
  return resolveBehaviorFlags({ effort, passes, fast, proactive, model });
}

/** The declared /hooks registry (rendered with its not-running status). */
export async function readHooks(session: SessionStore): Promise<Array<{ event?: string; command?: string }>> {
  return (await readJsonArray(session, HOOKS_STATE_KEY))
    .filter((h): h is { event?: string; command?: string } => !!h && typeof h === "object");
}
