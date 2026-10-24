// MainLoop use case — one turn of the interactive loop: run in the mode the
// launching command resolved, keep the session buffer, compact around the turn,
// assemble the prompt (F4) and run the autonomous act() call. The prompt pair is
// built by ./turn-prompt, the breaker by ./auto-compact; every dependency comes
// in through the ports.

import {
  MEMORY_TOOLS, catalogueFor, parseStoredRule, resolvePermissionMode, scriptToolsFor,
} from "../../../shared/domain/agent-policy/permission.ts";
import type { CatalogueDecision, ExtraTool } from "../../../shared/domain/agent-policy/permission.ts";
import { parseExtraTools } from "../../../shared/domain/agent-policy/extra-tools.ts";
import {
  DEFAULT_BEHAVIOR_FLAGS, describeActiveFlags, maxIterationsFor,
} from "../../../shared/domain/agent-policy/behavior-flags.ts";
import type { BehaviorFlags } from "../../../shared/domain/agent-policy/behavior-flags.ts";
import type { Llm, Logger, ToolCatalogue } from "../../../shared/application/ports.ts";
import {
  applyPrelude, epilogueArgs, failureText, parseEpilogue, parsePrelude, resultText, toolFailure,
} from "../../../shared/domain/prelude.ts";
import type { PreludeCall } from "../../../shared/domain/prelude.ts";
import type { SessionIo } from "../../../shared/application/session-io.ts";
import { readBehaviorFlags } from "./context-gather.ts";
import { autoCompactGuarded } from "./auto-compact.ts";
import type { AutoCompactDeps } from "./auto-compact.ts";
import { buildTurnPrompt } from "./turn-prompt.ts";
import type { TurnContextDeps, TurnPrompt } from "./turn-prompt.ts";
import {
  STOP_GUARDS, TURN_START_GUARDS, buildStopRetryPrompt, buildTurnContextMessage, readClosingLine, refusedTurnText,
  runChain,
} from "../domain/turn-chains.ts";
import type { Guard, StopFacts, TurnStartFacts } from "../domain/turn-chains.ts";
import { readStartOutput } from "../../../shared/domain/session-start.ts";

/** The crew's input, as launchMainLoop (/assistant, /summary, /transcribe --then, /voice send and --go) passes it. */
export interface MainLoopInputs {
  prompt?: unknown;
  /** The mode of the turn, resolved by the launching command: the request's
   *  `mode:` prefix, else the session's. Absent, the turn runs in `default`. */
  permissionMode?: unknown;
  /** Where a mode the request did not name came from ("session default via /mode"). */
  permissionModeVia?: unknown;
  /** The session's rules ("deny file_write"), threaded by launchMainLoop, which
   *  has handed them to the host gate already. */
  permissionRules?: unknown[];
  /** The extra tools the host registers ("search_issues:write"), filtered by launchMainLoop. */
  extraTools?: unknown[];
  /** A tool call the launching command asks for before the turn ({ tool, args, label, as? }):
   *  /transcribe --then hands over the transcription this way, its result following the
   *  request under its label in the message the model reads and the session keeps;
   *  /voice --go its dictation, which is the request itself (`as: "request"`). */
  prelude?: unknown;
  /** A tool call the launching command asks for after the turn, with the answer
   *  ({ tool, args, textArg, label }): voice.reply reads the answer aloud this way.
   *  A failure is a warning; the turn and its answer stand. */
  epilogue?: unknown;
  /** What the session's start script printed ({ script, lines }), on the first free-text
   *  turn of a session only: /assistant takes it off the runtime's raw input. */
  sessionStart?: unknown;
  /** The text a line of the answer must start with: an answer without it goes back once. */
  closingLine?: unknown;
}

/** The tool catalogue the agent is built with, the mode it was built for, and the
 *  extra tools it was built with. */
export interface LoadedCatalogue {
  mode: string;
  extras: ExtraTool[];
  catalogue: CatalogueDecision;
  /** Orkeon Code's own tools the mode offers under the rules (the shared memory's), attached by name. */
  scriptTools: string[];
}

/**
 * The catalogue, decided at load time — module scope is synchronous — from the
 * inputs alone: the launching command resolved the mode (the session's too) and
 * the extra tools before the crew loads, so the catalogue, the act call and the
 * host gate all run in the same mode. Launched without a mode (scripts/run-crew.sh),
 * the turn runs in `default`. That run is headless: no operator to ask and no
 * session rules, so a gate turned on (the example settings do) REFUSES each call
 * the mode would ask about — every write, every command, every network read — and
 * the model reads `DENIED: …`. A `permissionMode` input lets them run
 * (`--inputs '{"prompt":"…","permissionMode":"bypassPermissions"}'`).
 *
 * The rules are the host gate's to enforce (launchMainLoop handed them over);
 * the catalogue only drops the tools a deny rule covers whole, so the model is
 * not offered a tool whose every call would be refused.
 */
export function loadCatalogue(input: MainLoopInputs): LoadedCatalogue {
  const mode = resolvePermissionMode(input.permissionMode);
  const extras = parseExtraTools(input.extraTools ?? []).tools;
  const extraNames = extras.map((t) => t.name);
  const rules = (input.permissionRules ?? [])
    .map((raw) => parseStoredRule(raw, extraNames))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  return { mode, extras, catalogue: catalogueFor(mode, rules, extras), scriptTools: scriptToolsFor(mode, MEMORY_TOOLS, rules) };
}

/** Where the mode of the turn came from, when the request did not name it. */
function modeOrigin(input: MainLoopInputs): string | null {
  if (typeof input.permissionModeVia === "string" && input.permissionModeVia.length > 0) return input.permissionModeVia;
  return input.permissionMode == null ? "no mode given at launch, built-in 'default'" : null;
}

/** Append one turn to the session buffer (best-effort — continuity across runs).
 *  Stores the RAW prompt, never the assembled one: the buffer is the conversation
 *  thread — embedding assembled prompts would re-nest quadratically and break the
 *  byte-stable cache prefix. */
export async function appendTurn(session: Pick<SessionIo, "appendMessage">, role: string, content: string): Promise<void> {
  try {
    await session.appendMessage(role, content);
  } catch { /* session buffer optional */ }
}

/**
 * Run the autonomous tool-use loop and return its text output.
 *
 * `permissionMode` is consumed by the host's per-tool-call gate, which reads the
 * session's rules first and asks the operator when the mode says so. `maxIterations` and, when /effort stored a level,
 * the provider's `effort` come from `/effort` (B-9, A-3), and the optional
 * model from `/model` (B-10) — the latter PATCHES the provider's own
 * configuration, so the boot credentials and endpoint are preserved and only the
 * model name changes for this call.
 */
export async function runAct(
  deps: { llm: Pick<Llm, "act">; log: Logger },
  turn: TurnPrompt,
  mode: string,
  flags: BehaviorFlags = DEFAULT_BEHAVIOR_FLAGS,
): Promise<string> {
  const active = describeActiveFlags(flags);
  // Anything off-default is announced: a turn that stops after 10 iterations, or
  // answers from a different model, must not read as the model being erratic.
  if (active) deps.log.info(`session flags — ${active}`);
  const maxIterations = maxIterationsFor(flags.effort);
  // A level /effort stored reaches the provider (A-3); the line says what this act was given.
  if (flags.thinking !== null) deps.log.info(`act — effort: ${flags.thinking}, maxIterations: ${maxIterations}`);

  return await deps.llm.act(turn.user, {
    maxIterations,
    ...(flags.thinking === null ? {} : { effort: flags.thinking }),
    permissionMode: mode,
    // The static header rides as a REAL system message (ActOptions.system):
    // identity and tool policy outrank user text and tool results, and the
    // provider's native system handling (Anthropic top-level `system`,
    // cache_control) finally applies.
    system: turn.system,
    model: flags.model,
  });
}

/** The ports one turn runs on. */
export interface MainLoopDeps extends TurnContextDeps, Omit<AutoCompactDeps, "session"> {
  session: SessionIo;
  llm: Pick<Llm, "act" | "permissionGateEnabled">;
  /** The calls of a prelude and an epilogue, by the registered name the launching command found. */
  tools: Pick<ToolCatalogue, "call">;
  /** The guards of the two chains; absent, the built-in ones (domain/turn-chains). */
  chains?: { turnStart?: ReadonlyArray<Guard<TurnStartFacts>>; stop?: ReadonlyArray<Guard<StopFacts>> };
}

/** The request once the prelude's call answered (applyPrelude). */
async function withPreludeResult(request: string, prelude: PreludeCall, deps: Pick<MainLoopDeps, "tools" | "log">): Promise<string> {
  deps.log.info(`${prelude.label}: ${prelude.tool}, before the turn`);
  let raw: unknown;
  try {
    raw = await deps.tools.call(prelude.tool, prelude.args);
  } catch (error) {
    throw toolFailure(prelude.tool, error);
  }
  return applyPrelude(request, prelude, resultText(raw));
}

/** The epilogue the input names, with the answer; a failure is logged, never thrown. */
async function runEpilogue(value: unknown, answer: string, deps: Pick<MainLoopDeps, "tools" | "log">): Promise<void> {
  const epilogue = parseEpilogue(value);
  if (epilogue === null || answer.trim().length === 0) return;
  try {
    const result = resultText(await deps.tools.call(epilogue.tool, epilogueArgs(epilogue, answer))).trim();
    deps.log.info(`${epilogue.label}: ${result || epilogue.tool}`);
  } catch (error) {
    deps.log.warn(`${epilogue.label}: ${epilogue.tool} failed: ${failureText(error)}`);
  }
}

/** The session state key remembering that the operator was told the gate is off. */
const GATE_WARNED_KEY = "gate.warned";

/** The line the operator reads ONCE per session when the host says its permission gate
 *  is off (Orkeon #128): every tool call of the turn runs unchecked, whatever the mode
 *  promises. Nothing in bypassPermissions, which promises nothing, nor on a host that
 *  cannot say. Shown above the answer, logged, never stored in the transcript. */
async function gateWarning(mode: string, deps: Pick<MainLoopDeps, "llm" | "session" | "log">): Promise<string | null> {
  if (mode === "bypassPermissions" || deps.llm.permissionGateEnabled() !== false) return null;
  if (await deps.session.readState(GATE_WARNED_KEY) !== null) return null;
  await deps.session.writeState(GATE_WARNED_KEY, "1");
  const text = "⚠ the host's permission gate is off (Orkeon:Security:PermissionGate:Enabled is not true): " +
    `mode '${mode}' and the session's rules check nothing, every tool call runs. /permissions shows it.`;
  deps.log.warn(text);
  return text;
}

/** The answer once the stop chain read it: a refused answer goes back to the model ONCE,
 *  with the reason, and the second answer stands whatever the chain would say of it. When that
 *  retry throws, a first answer that is not blank stands, with a warning. */
async function stopChecked(
  deps: Pick<MainLoopDeps, "llm" | "log" | "chains">, turn: TurnPrompt, mode: string, flags: BehaviorFlags,
  request: string, closingLine: string | null,
): Promise<string> {
  const answer = await runAct(deps, turn, mode, flags);
  const stop = runChain("stop", deps.chains?.stop ?? STOP_GUARDS, { request, answer, closingLine });
  if (stop.refusedBy === undefined) return answer;
  deps.log.info(`stop check '${stop.refusedBy}': the answer goes back once (${stop.reason})`);
  try {
    return await runAct(deps, { ...turn, user: buildStopRetryPrompt(turn.user, answer, stop.reason ?? "") }, mode, flags);
  } catch (error) {
    // A retry that fails (a provider error) never costs the turn an answer it had: the first one stands, said.
    if (answer.trim().length === 0) throw error;
    deps.log.warn(`stop check '${stop.refusedBy}': the retry failed (${failureText(error)}); the first answer stands`);
    return answer;
  }
}

/** One turn: the answer, or why there was none. */
export async function runMainLoop(input: MainLoopInputs, loaded: LoadedCatalogue, deps: MainLoopDeps): Promise<string> {
  const { session, log } = deps;
  const request = String(input.prompt ?? "").trim();
  const prelude = parsePrelude(input.prelude);
  if (request.length === 0 && prelude?.as !== "request") return "No prompt provided.";
  // The prelude runs first, as the launching command's call (the gate does not ask):
  // a failure fails the run before any message is stored or any model is called.
  const prompt = prelude === null ? request : await withPreludeResult(request, prelude, deps);
  if (prompt.length === 0) return `Nothing to send: ${prelude?.label ?? "the request"} came back empty.`;

  // The mode the catalogue was built for: the "mode:" prefix, else the session
  // default set by /mode, else the fallback (B-2 — built-in 'default' like the
  // original, or the opt-in 'permissions.fallback'), as the command resolved it.
  const { mode } = loaded;
  // Logged on EVERY turn the request did not name the mode of, not only when
  // /mode set one: a session running the fallback is exactly the case that used
  // to say nothing.
  const origin = modeOrigin(input);
  if (origin) log.info(`permission mode '${mode}' — ${origin}`);
  // A rule that changed the catalogue must announce itself. A catalogue silently
  // short of a tool is indistinguishable from a mode that never had it.
  const { catalogue } = loaded;
  if (catalogue.deniedByRule.length > 0) {
    log.warn(`permission rules removed: ${catalogue.deniedByRule.join(", ")}`);
  }
  for (const r of catalogue.inert) log.warn(`permission rule without effect: ${r.reason}`);
  const warning = await gateWarning(mode, deps);

  // B-9 / B-10: the persisted behavior flags, read ONCE per turn so prompt
  // assembly and the act() call cannot disagree about them mid-turn.
  const flags = await readBehaviorFlags(session);

  // turn-start: a refusal ends the turn before anything is stored or any model is
  // called; the context lines are stored just before the request, so this turn and
  // the later ones read them in the history.
  const start = runChain("turn-start", deps.chains?.turnStart ?? TURN_START_GUARDS, {
    request: prompt, sessionStart: readStartOutput(input.sessionStart),
  });
  if (start.refusedBy !== undefined) {
    const text = refusedTurnText(start);
    log.warn(text);
    return text;
  }
  if (start.context.length > 0) await appendTurn(session, "user", buildTurnContextMessage(start.context));

  await appendTurn(session, "user", prompt);
  // Head-of-turn auto-compaction (F3): act() starts from a healthy buffer.
  await autoCompactGuarded(deps);
  const assembled = await buildTurnPrompt(prompt, mode, flags, deps, loaded.extras);
  // A turn the provider failed throws (LlmFailure), as any failure of act does:
  // no answer is stored, the tail compaction does not run (the breaker counts
  // compactions, not turns), and the run fails with the provider's error, which
  // /assistant shows. The user's message stays in the buffer.
  const answer = await stopChecked(deps, assembled, mode, flags, prompt, readClosingLine(input.closingLine));
  await appendTurn(session, "assistant", answer);
  await runEpilogue(input.epilogue, answer, deps);
  // Tail-of-turn: a verbose act() must not bequeath a saturated buffer.
  await autoCompactGuarded(deps);
  return warning === null ? answer : `${warning}\n\n${answer}`;
}
