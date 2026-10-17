// The act() prompt pair of one main-loop turn (F4): the reads of context-gather,
// rendered by the pure ../domain/prompt-assembly. The permission/toolset logic is
// pure in shared/domain/agent-policy/permission.

import { buildActPrompt, toolsetFor } from "../../../shared/domain/agent-policy/permission.ts";
import { proactiveSuffix } from "../../../shared/domain/agent-policy/behavior-flags.ts";
import type { BehaviorFlags } from "../../../shared/domain/agent-policy/behavior-flags.ts";
import {
  assemblePrompt,
  buildGaugeBlock,
  buildHistoryBlock,
  buildMemoryBlock,
  buildStaticHeader,
  buildUserContextBlock,
  windowHistory,
  buildPreferencesBlock,
  buildSkillsBlock,
  buildHooksBlock,
} from "../domain/prompt-assembly.ts";
import {
  readClaudeMd, readGauge, readGitContext, readMemoryByCategory,
  readOutputStyle, readHooks,
} from "./context-gather.ts";
import { readAttachedSkills } from "../../../shared/application/attached-skills.ts";
import type { AttachedSkill } from "../../../shared/application/attached-skills.ts";
import type { Files, MemoryStore, SessionStore, Shell, Telemetry } from "../../../shared/application/ports.ts";
import type { SessionMsg } from "../../../shared/domain/types.ts";
import type { ExtraTool } from "../../../shared/domain/agent-policy/permission.ts";

/** The ports the prompt of a turn is gathered from. */
export interface TurnContextDeps {
  shell: Shell;
  session: SessionStore;
  files: Files;
  telemetry: Telemetry;
  memory: MemoryStore;
}

/** One act() turn's prompt pair: the byte-stable system prompt + the volatile user body. */
export interface TurnPrompt {
  system: string;
  user: string;
}

/**
 * Assemble the act() prompt pair for this turn (F4): the byte-stable static
 * header (identity + tools + CLAUDE.md) is the SYSTEM prompt, the volatile
 * blocks (memory, git context, windowed history, budget gauge, the task last)
 * are the USER body.
 */
export async function buildTurnPrompt(
  prompt: string,
  mode: string,
  flags: BehaviorFlags,
  deps: TurnContextDeps,
  extras: readonly ExtraTool[] = [],
): Promise<TurnPrompt> {
  // B-9 /fast: skip the two advisory reads entirely, not just their rendering.
  // Rendering-only would keep paying for the memory listing and every skill file
  // read — the latency the flag exists to buy.
  const wantAdvisory = !flags.fast;
  const { shell, session, files, telemetry } = deps;
  const [claudeMd, memory, git, history, gauge, outputStyle, hooks, skills] = await Promise.all([
    readClaudeMd(files),
    wantAdvisory ? readMemoryByCategory(deps.memory) : Promise.resolve({} as Record<string, string[]>),
    readGitContext(shell),
    session.readMessages().then((read) => read.messages).catch(() => [] as SessionMsg[]),
    readGauge(session, telemetry),
    readOutputStyle(session),
    readHooks(session),
    wantAdvisory ? readAttachedSkills(session, files) : Promise.resolve([] as AttachedSkill[]),
  ]);

  return {
    system: buildStaticHeader({ toolNames: toolsetFor(mode, extras), claudeMd }),
    user: assemblePrompt({
      // B-7 / B-13 — all volatile, all in the user body. An unconfigured
      // session renders none of them, so its body is byte-identical to before.
      preferences: buildPreferencesBlock({ outputStyle }),
      skills: buildSkillsBlock(skills),
      memory: buildMemoryBlock(memory),
      hooks: buildHooksBlock(hooks),
      userContext: buildUserContextBlock(git),
      history: buildHistoryBlock(windowHistory(history)),
      gauge: buildGaugeBlock(gauge),
      // B-9 /proactive: the clause rides with the task, the last thing the model reads.
      task: buildActPrompt(prompt, mode) + proactiveSuffix(flags.proactive),
    }),
  };
}

// Freshness note (PLAN C4): the loop deliberately has NO post-edit reindex step.
// Coordination lives host-side — file_write marks the path dirty (the store hook),
// shell edits are caught by the git working-tree probe, and the search tools
// reindex the union BEFORE answering (lazy, grouped, single-flight). Adding a loop
// step here would double the work and re-introduce the "agent must remember"
// failure mode the lazy design exists to remove.
