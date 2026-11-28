// Presentation helpers shared by the slash-command handlers. Kept under
// commands/_lib/ — the loader's SearchPattern is "*.cmd.ts", so this file is
// never loaded as a command (it is only bundled into the handlers that import
// it). No domain logic here; just the control-plane glue (SPEC §2). The entry
// point wires the crew host and the permission gate from its context
// (createCrewHost(ctx.services), createPermissionRules(ctx.services)) and hands
// them over with the command's log.

import { routeAgent } from "../../shared/application/agents/route-agent.ts";
import type { RouteDeps, RouteTask } from "../../shared/application/agents/route-agent.ts";
import type { CrewHost, CrewLaunchOptions, PermissionRules, ToolCatalogue } from "../../shared/application/ports.ts";
import type { ConfigStore } from "../../shared/application/config-store.ts";
import type { SessionIo } from "../../shared/application/session-io.ts";
import { configuredNames, resolveExtraTools } from "../../shared/application/extra-tools.ts";
import { readAgentsProfile, readCrewProfile, readLlmProfile } from "../../shared/application/llm-profile.ts";
import { readToolFamilies } from "../../shared/application/tool-families.ts";
import { builtInRules, syncPermissionRules } from "../../shared/application/permission-rules.ts";
import { readMemoryDir } from "../../shared/application/shared-memory/memory-settings.ts";
import { listsOf } from "../../shared/application/host-context.ts";
import type { HostSource } from "../../shared/application/host-context.ts";
import type { EffortLevel } from "../../shared/domain/agent-policy/behavior-flags.ts";
import { formatRule } from "../../shared/domain/agent-policy/permission.ts";
import { chainDepthLine, chainDepthRefusal } from "../../shared/domain/agents/chain.ts";
import { exclusiveLine, exclusiveRefusal } from "../../shared/domain/agents/exclusive.ts";
import { sameProfile } from "../../shared/domain/agents/model-route.ts";
import { AGENTS_PROFILE_INPUT_KEY, LLM_PROFILE_FALLBACK_INPUT_KEY, LLM_PROFILE_INPUT_KEY } from "../../shared/domain/llm-profile.ts";
import { errorText } from "../../shared/domain/prelude.ts";
import type { EpilogueCall, PreludeCall } from "../../shared/domain/prelude.ts";
import type { StartOutput } from "../../shared/domain/session-start.ts";
import { SPEAK_TOOL, VOICE_REPLY_CONFIG_KEY, voiceReplyEpilogue, voiceReplyOn } from "../../shared/domain/speech.ts";
import { EXTRA_TOOLS_CONFIG_KEY, formatExtraTool } from "../../shared/domain/agent-policy/extra-tools.ts";
import { EXTRA_TOOL_ENTRY_RULE } from "../../shared/domain/agent-policy/messages.ts";
import {
  extraToolIgnored, extraToolMissing, extraToolsUnreadable, invalidPermissionEntries, NO_SESSION_RULES, ruleDormant,
  ruleOverridden, voiceReplyNoSpeakTool, voiceReplyUnreadable,
} from "./messages.ts";

/** The command's log as the runtime hands it to a command: a line and its details. */
export interface CommandLog {
  info(message: string, data?: object): void;
  warn(message: string, data?: object): void;
}

/** What a crew launch needs: the host that runs crews, the command's log, and the profile the crew runs on when
 *  the command read it (withLlmProfile: `agents.profile`, else `llm.profile`; the main loop: `llm.profile` alone):
 *  the crew input then carries it as `llmProfile`, and every agent of the crew runs on that profile. Undefined or
 *  null, the input carries nothing and the agents run on the host's default model. */
export interface LaunchDeps {
  crews: Pick<CrewHost, "launch">;
  log: Pick<CommandLog, "info">;
  llmProfile?: string | null;
  /** Set when the routing picked `llmProfile`: the session's own profile ("" for the host's default model), which the
   *  crew falls back on when the host declares no profile of the routed name. */
  llmProfileFallback?: string;
  /** Set when the routing picked the thinking level (`route.effort`): it replaces the `effort` of the crew input, the
   *  level `/effort` stored. */
  effort?: EffortLevel;
}

/** `deps` with the profile a crew other than the main loop runs on: the session's `agents.profile`, else its
 *  `llm.profile`; what every command hands launchCrew. A setting that cannot be read, or holds no profile name, is
 *  warned about and the launch goes on without it. */
export async function withLlmProfile<D extends LaunchDeps & { log: Pick<CommandLog, "warn"> }>(
  deps: D, config: Pick<ConfigStore, "readValue" | "readFile">,
): Promise<D & { llmProfile: string | null }> {
  const read = await readCrewProfile(config);
  for (const warning of read.warnings) deps.log.warn(warning);
  return { ...deps, llmProfile: read.profile };
}

/** `deps` with the session's `llm.profile` read: what the main loop's turn runs on, whatever `agents.profile` says. */
async function withTurnProfile<D extends LaunchDeps & { log: Pick<CommandLog, "warn"> }>(
  deps: D, config: Pick<ConfigStore, "readValue" | "readFile">,
): Promise<D & { llmProfile: string | null }> {
  const read = await readLlmProfile(config);
  if (read.warning !== undefined) deps.log.warn(read.warning);
  return { ...deps, llmProfile: read.profile };
}

/** `deps` with the profile the launch of `task.crew` runs on: the session's `agents.profile`, else its `llm.profile`,
 *  then, with `route.agents` on, the rung of `route.ladder` the runtime's System One pick answers for the command
 *  (shared/application/agents/route-agent); and, for a task that takes one with `route.effort` on, the thinking level
 *  the same pick decided. */
export async function withRoutedProfile<D extends LaunchDeps & { log: Pick<CommandLog, "warn" | "info"> }>(
  deps: D, config: Pick<ConfigStore, "readValue" | "readFile">, routing: Omit<RouteDeps, "config" | "log">, task: RouteTask,
): Promise<D & { llmProfile: string | null; effort?: EffortLevel }> {
  const profiled = await withLlmProfile(deps, config);
  const routed = await routeAgent({ ...routing, config, log: deps.log }, task, profiled.llmProfile);
  const moved = sameProfile(routed.profile, profiled.llmProfile)
    ? profiled
    : { ...profiled, llmProfile: routed.profile, llmProfileFallback: profiled.llmProfile ?? "" };
  return routed.effort === null ? moved : { ...moved, effort: routed.effort };
}

/** A crew's completion, as an async command's `completed` receives it; `intent` names the crew that answered,
 *  `streamed` says the console already showed the answer as it was generated (Orkeon #228). */
export interface CrewCompletion {
  success: boolean;
  intent?: string;
  payload?: string;
  error?: string;
  streamed?: boolean;
  /** The value the launch attached (`CrewLaunchOptions.state`), handed back to its own completion; absent when none. */
  state?: unknown;
}

/** What a launch hands back to the runtime: the ticket, or the refusal of a hop past MaxChainDepth or of a crew
 *  already running; the runtime prints `message`. */
export type LaunchResult = { ticket: string } | { refused: string; message: string };

/** Launch a crew on the script-host and return its ticket (async commands). The
 *  launch is logged with the ticket, plus `details` when the caller has any. A
 *  launch from a `completed` past the chain's limit (V-A5, shared/domain/agents/chain.ts,
 *  `chain depth <d> reached (MaxChainDepth <l>, /<command>)`) comes back as `{ refused }`
 *  with the line saying so, as does a crew launched with `{ exclusive: true }` while its
 *  previous launch runs (Orkeon #239, shared/domain/agents/exclusive.ts, `crew '<name>'
 *  already running (ticket <t>)`); any other failure throws. A driver relaunching its own
 *  work passes `{ chain: "continue" }` as `options` (Orkeon #221) and keeps the parent's depth. */
export function launchCrew(
  deps: LaunchDeps,
  crew: string,
  input: Record<string, unknown> = {},
  details: Record<string, unknown> = {},
  options?: CrewLaunchOptions,
): LaunchResult {
  const profile = deps.llmProfile ?? null;
  if (profile !== null) {
    input = { ...input, [LLM_PROFILE_INPUT_KEY]: profile };
    if (deps.llmProfileFallback !== undefined) input = { ...input, [LLM_PROFILE_FALLBACK_INPUT_KEY]: deps.llmProfileFallback };
    details = { ...details, llmProfile: profile };
  }
  if (deps.effort !== undefined) {
    input = { ...input, effort: deps.effort };
    details = { ...details, effort: deps.effort };
  }
  let ticket: string;
  try {
    ticket = deps.crews.launch(crew, input, options);
  } catch (error) {
    const busy = exclusiveRefusal(error);
    if (busy !== null) {
      const line = exclusiveLine(busy);
      deps.log.info(line, { ...busy, ...details });
      return { refused: line, message: line };
    }
    const refusal = chainDepthRefusal(error);
    if (refusal === null) throw error;
    const line = chainDepthLine(crew, refusal);
    deps.log.info(line, { ...refusal, ...details });
    return { refused: line, message: line };
  }
  deps.log.info(crew + " launched", { ticket, ...details });
  return { ticket };
}

/** What launching the main loop reads: the session (its mode and rules), the
 *  `tools.extra` setting and the tools the host registers; and what it drives:
 *  the host's permission gate and the crew launch. */
export interface MainLoopLaunchDeps extends LaunchDeps {
  log: CommandLog;
  session: Pick<SessionIo, "readState" | "resolveEffectiveSessionMode">;
  config: Pick<ConfigStore, "readValue" | "readFile">;
  /** The tools the host registers: the extra tools it has, and `chat_accounts`, called to know whether the chat
   *  family is offered. */
  catalogue: Pick<ToolCatalogue, "find" | "call">;
  gate: PermissionRules;
  /** This run's host context, for its path lists (paths.deny in the gate); absent: no list. */
  host?: HostSource;
}

/**
 * Launch the main loop with everything that decides its tool catalogue, which
 * the crew builds at load time, synchronously, from its inputs alone:
 *  - the mode: the request's `mode:` prefix, else the session's (/mode, else the
 *    fallback), resolved here, with where it came from for the crew to log;
 *  - the extra tools the host registers, each configured one it does not
 *    register warned about and left out;
 *  - the session's rules, handed to the host gate first, so the turn runs under
 *    the rules the session holds whatever the gate kept from an earlier command,
 *    then the built-in denies on the shared memory's candidates and entries;
 *  - the chat family, offered when the host's `chat_accounts` lists one account
 *    at least (`chatTools: true`, absent otherwise; a failed call is no account).
 * The turn runs on the session's `llm.profile`; `agents.profile`, when the session names one, rides along as
 * `agentsLlmProfile`: the agents the turn spawns run on it.
 * A `prelude` (a tool call the crew makes before the turn: /transcribe --then,
 * /voice --go) rides along as it is. With voice.reply on, an epilogue has the crew read the
 * answer aloud with the speech server's speak, when the host registers it. The start
 * script's output (`sessionStart`, the first turn of a session) rides along too.
 * `planApproval` (/assistant, on a console with panels) tells a plan turn that its plan is approved after it;
 * `state`, when given, is attached to the launch and handed back to its own completion.
 */
export async function launchMainLoop(
  deps: MainLoopLaunchDeps,
  input: {
    prompt: string; permissionMode: string | null; prelude?: PreludeCall; sessionStart?: StartOutput | null;
    planApproval?: boolean; state?: unknown;
  },
): Promise<LaunchResult> {
  const { session, log } = deps;
  const resolved = input.permissionMode === null ? await session.resolveEffectiveSessionMode() : null;
  const permissionMode = resolved ? resolved.mode : input.permissionMode;

  const extras = await resolveExtraTools(deps);
  for (const tool of extras.missing) log.warn(extraToolMissing(tool.name));
  for (const entry of extras.invalid) {
    log.warn(extraToolIgnored(EXTRA_TOOLS_CONFIG_KEY, entry, EXTRA_TOOL_ENTRY_RULE));
  }
  if (extras.unreadable !== undefined) {
    log.warn(extraToolsUnreadable(EXTRA_TOOLS_CONFIG_KEY, extras.unreadable));
  }

  const builtIn = builtInRules((await readMemoryDir(deps.config)).dir, await listsOf(deps.host));
  const sync = await syncPermissionRules({ session, gate: deps.gate, extraNames: configuredNames(extras), builtIn });
  for (const rule of sync.overridden) log.warn(ruleOverridden(formatRule(rule)));
  for (const rule of sync.dormant) log.warn(ruleDormant(rule, EXTRA_TOOLS_CONFIG_KEY));
  if (sync.invalid.length > 0) log.warn(invalidPermissionEntries(sync.invalid.length));
  if (!sync.applied) log.warn(NO_SESSION_RULES);
  const families = await readToolFamilies(deps.catalogue);
  const epilogue = await voiceReply(deps);
  const profiled = deps.llmProfile === undefined ? await withTurnProfile(deps, deps.config) : deps;
  const agents = await readAgentsProfile(deps.config);
  if (agents.warning !== undefined) log.warn(agents.warning);
  return launchCrew(
    profiled,
    "main-loop",
    {
      prompt: input.prompt,
      permissionMode,
      ...(resolved ? { permissionModeVia: resolved.via } : {}),
      permissionRules: sync.rules.map(formatRule),
      extraTools: extras.present.map(formatExtraTool),
      ...(families.chat ? { chatTools: true } : {}),
      ...(agents.profile !== null ? { [AGENTS_PROFILE_INPUT_KEY]: agents.profile } : {}),
      ...(input.prelude ? { prelude: input.prelude } : {}),
      ...(epilogue ? { epilogue } : {}),
      ...(input.sessionStart ? { sessionStart: input.sessionStart } : {}),
      ...(input.planApproval === true ? { planApproval: true } : {}),
    },
    {
      permissionMode, permissionRules: sync.rules.length, extraTools: extras.present.length,
      ...(input.planApproval === true ? { planApproval: true } : {}),
      ...(families.chat ? { chatTools: true } : {}),
      ...(agents.profile !== null ? { [AGENTS_PROFILE_INPUT_KEY]: agents.profile } : {}),
      ...(input.prelude ? { prelude: input.prelude.tool } : {}),
      ...(epilogue ? { epilogue: epilogue.tool } : {}),
      ...(input.sessionStart ? { sessionStartLines: input.sessionStart.lines.length } : {}),
    },
    { onMain: true, ...(input.state !== undefined ? { state: input.state } : {}) },
  );
}

/** The epilogue voice.reply asks for: speak under its registered name when the setting
 *  is on and the host registers it; none otherwise, with a warning when it is on. */
async function voiceReply(deps: Pick<MainLoopLaunchDeps, "config" | "catalogue" | "log">): Promise<EpilogueCall | undefined> {
  let value: string | undefined;
  try {
    value = (await deps.config.readValue(VOICE_REPLY_CONFIG_KEY)).value;
  } catch (error) {
    deps.log.warn(voiceReplyUnreadable(VOICE_REPLY_CONFIG_KEY, errorText(error)));
    return undefined;
  }
  if (!voiceReplyOn(value)) return undefined;
  const speak = deps.catalogue.find(SPEAK_TOOL);
  if (speak === undefined) {
    deps.log.warn(voiceReplyNoSpeakTool(VOICE_REPLY_CONFIG_KEY, SPEAK_TOOL));
    return undefined;
  }
  return voiceReplyEpilogue(speak);
}

/** The opening of a markdown block a prefix on the same line would turn into plain text. */
const OPENS_ON_A_BLOCK = /^\s*(#{1,6}\s|```|~~~|[-*+]\s|\d+\.\s|>|\|)/;

/** `<okPrefix><payload>`, the prefix on its own line when the payload opens on a block. */
function prefixed(okPrefix: string, payload: string): string {
  const inline = !okPrefix || okPrefix.endsWith("\n") || !OPENS_ON_A_BLOCK.test(payload);
  return inline ? okPrefix + payload : `${okPrefix.trimEnd()}\n\n${payload}`;
}

/** Write a crew's completion: `<okPrefix><payload>` as a markdown block, or the line `✗ <label> failed: …`; nothing
 *  for a success the console already streamed, or the answer would show twice (Orkeon #228). */
export function writeCompleted(
  out: { writeLine(text: string): void; writeBlock(spec: { kind: "markdown"; text: string }): void },
  result: CrewCompletion,
  label: string,
  okPrefix = "",
): void {
  if (result.success && result.streamed === true) return;
  if (result.success) out.writeBlock({ kind: "markdown", text: prefixed(okPrefix, String(result.payload)) });
  else out.writeLine("✗ " + label + " failed: " + (result.error ?? "unknown"));
}

/** `writeCompleted` for what a program wrote and no model did: a transcript, a count. Markdown would change it (the
 *  stars of `*.ts`, the underscores of `__init__.py`), so it stays a line. */
export function writePlainCompleted(
  out: { writeLine(text: string): void },
  result: CrewCompletion,
  label: string,
): void {
  if (result.success && result.streamed === true) return;
  out.writeLine(result.success ? String(result.payload) : "✗ " + label + " failed: " + (result.error ?? "unknown"));
}
