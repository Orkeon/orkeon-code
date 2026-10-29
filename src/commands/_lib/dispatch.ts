// Presentation helpers shared by the slash-command handlers. Kept under
// commands/_lib/ — the loader's SearchPattern is "*.cmd.ts", so this file is
// never loaded as a command (it is only bundled into the handlers that import
// it). No domain logic here; just the control-plane glue (SPEC §2). The entry
// point wires the crew host and the permission gate from its context
// (createCrewHost(ctx.services), createPermissionRules(ctx.services)) and hands
// them over with the command's log.

import type { CrewHost, CrewLaunchOptions, PermissionRules, ToolCatalogue } from "../../shared/application/ports.ts";
import type { ConfigStore } from "../../shared/application/config-store.ts";
import type { SessionIo } from "../../shared/application/session-io.ts";
import { configuredNames, resolveExtraTools } from "../../shared/application/extra-tools.ts";
import { syncPermissionRules } from "../../shared/application/permission-rules.ts";
import { readMemoryDir } from "../../shared/application/shared-memory/memory-settings.ts";
import { memoryWriteRules } from "../../shared/domain/shared-memory/layout.ts";
import { formatRule } from "../../shared/domain/agent-policy/permission.ts";
import { chainDepthLine, chainDepthRefusal } from "../../shared/domain/agents/chain.ts";
import { exclusiveLine, exclusiveRefusal } from "../../shared/domain/agents/exclusive.ts";
import { errorText } from "../../shared/domain/prelude.ts";
import type { EpilogueCall, PreludeCall } from "../../shared/domain/prelude.ts";
import type { StartOutput } from "../../shared/domain/session-start.ts";
import { SPEAK_TOOL, VOICE_REPLY_CONFIG_KEY, voiceReplyEpilogue, voiceReplyOn } from "../../shared/domain/speech.ts";
import {
  EXTRA_TOOLS_CONFIG_KEY, EXTRA_TOOL_ENTRY_RULE, formatExtraTool,
} from "../../shared/domain/agent-policy/extra-tools.ts";

/** The command's log as the runtime hands it to a command: a line and its details. */
export interface CommandLog {
  info(message: string, data?: object): void;
  warn(message: string, data?: object): void;
}

/** What a crew launch needs: the host that runs crews and the command's log. */
export interface LaunchDeps {
  crews: Pick<CrewHost, "launch">;
  log: Pick<CommandLog, "info">;
}

/** A crew's completion, as an async command's `completed` receives it; `intent` names the crew that answered,
 *  `streamed` says the console already showed the answer as it was generated (Orkeon #228). */
export interface CrewCompletion {
  success: boolean;
  intent?: string;
  payload?: string;
  error?: string;
  streamed?: boolean;
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
  catalogue: Pick<ToolCatalogue, "find">;
  gate: PermissionRules;
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
 *    then the built-in denies on the shared memory's candidates and entries.
 * A `prelude` (a tool call the crew makes before the turn: /transcribe --then,
 * /voice --go) rides along as it is. With voice.reply on, an epilogue has the crew read the
 * answer aloud with the speech server's speak, when the host registers it. The start
 * script's output (`sessionStart`, the first turn of a session) rides along too.
 */
export async function launchMainLoop(
  deps: MainLoopLaunchDeps,
  input: { prompt: string; permissionMode: string | null; prelude?: PreludeCall; sessionStart?: StartOutput | null },
): Promise<LaunchResult> {
  const { session, log } = deps;
  const resolved = input.permissionMode === null ? await session.resolveEffectiveSessionMode() : null;
  const permissionMode = resolved ? resolved.mode : input.permissionMode;

  const extras = await resolveExtraTools(deps);
  for (const tool of extras.missing) {
    log.warn(
      `extra tool '${tool.name}' is not registered by the host and is left out ` +
        "(its MCP server did not connect, its plugin did not load, or the name is mistyped)",
    );
  }
  for (const entry of extras.invalid) {
    log.warn(`${EXTRA_TOOLS_CONFIG_KEY}: '${entry}' is ignored (${EXTRA_TOOL_ENTRY_RULE})`);
  }
  if (extras.unreadable !== undefined) {
    log.warn(`${EXTRA_TOOLS_CONFIG_KEY} could not be read (${extras.unreadable}): no extra tool this turn`);
  }

  const builtIn = memoryWriteRules((await readMemoryDir(deps.config)).dir);
  const sync = await syncPermissionRules({ session, gate: deps.gate, extraNames: configuredNames(extras), builtIn });
  for (const rule of sync.overridden) {
    log.warn(`permission rule '${formatRule(rule)}' is left out of the gate: no tool of the model writes the shared memory's candidates or entries`);
  }
  for (const rule of sync.dormant) {
    log.warn(
      `permission rule '${rule}' is dormant: ${EXTRA_TOOLS_CONFIG_KEY} does not list its tool, the gate does not get it`,
    );
  }
  if (sync.invalid.length > 0) {
    log.warn(`${sync.invalid.length} stored permission entr(ies) are not rules and were ignored`);
  }
  if (!sync.applied) log.warn("the host keeps no session rules: the gate decides each call from the mode alone");
  const epilogue = await voiceReply(deps);
  return launchCrew(
    deps,
    "main-loop",
    {
      prompt: input.prompt,
      permissionMode,
      ...(resolved ? { permissionModeVia: resolved.via } : {}),
      permissionRules: sync.rules.map(formatRule),
      extraTools: extras.present.map(formatExtraTool),
      ...(input.prelude ? { prelude: input.prelude } : {}),
      ...(epilogue ? { epilogue } : {}),
      ...(input.sessionStart ? { sessionStart: input.sessionStart } : {}),
    },
    {
      permissionMode, permissionRules: sync.rules.length, extraTools: extras.present.length,
      ...(input.prelude ? { prelude: input.prelude.tool } : {}),
      ...(epilogue ? { epilogue: epilogue.tool } : {}),
      ...(input.sessionStart ? { sessionStartLines: input.sessionStart.lines.length } : {}),
    },
  );
}

/** The epilogue voice.reply asks for: speak under its registered name when the setting
 *  is on and the host registers it; none otherwise, with a warning when it is on. */
async function voiceReply(deps: Pick<MainLoopLaunchDeps, "config" | "catalogue" | "log">): Promise<EpilogueCall | undefined> {
  let value: string | undefined;
  try {
    value = (await deps.config.readValue(VOICE_REPLY_CONFIG_KEY)).value;
  } catch (error) {
    deps.log.warn(`${VOICE_REPLY_CONFIG_KEY} could not be read (${errorText(error)}): the answer is not read aloud this turn`);
    return undefined;
  }
  if (!voiceReplyOn(value)) return undefined;
  const speak = deps.catalogue.find(SPEAK_TOOL);
  if (speak === undefined) {
    deps.log.warn(
      `${VOICE_REPLY_CONFIG_KEY} is on but the host registers no '${SPEAK_TOOL}': the answer is not read aloud ` +
        "(start orkeon-code with ORKEON_CODE_AUDIO_DIR and ORKEON_CODE_VOICE=1)",
    );
    return undefined;
  }
  return voiceReplyEpilogue(speak);
}

/** Write a crew-completion line: `<okPrefix><payload>` or `✗ <label> failed: …`; nothing for a success the console
 *  already streamed, or the answer would show twice (Orkeon #228). */
export function writeCompleted(
  out: { writeLine(text: string): void },
  result: CrewCompletion,
  label: string,
  okPrefix = "",
): void {
  if (result.success && result.streamed === true) return;
  out.writeLine(
    result.success
      ? okPrefix + result.payload
      : "✗ " + label + " failed: " + (result.error ?? "unknown"),
  );
}
