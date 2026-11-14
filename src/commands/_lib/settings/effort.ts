// /effort [<level>|show]: the session's reasoning-effort level. It picks the act() iteration ladder of every later
// /assistant turn and reaches the provider as `act({effort})`. What the session's model takes, and what the runtime
// sends for a level it does not take, are read from the runtime (Orkeon #359, #360), never worked out here: the
// level stored stays the one asked, since the ladder follows it and the model may change.
import type { Chooser, ReasoningReader } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { readLlmProfile } from "../../../shared/application/llm-profile.ts";
import type { SessionIo } from "../../../shared/application/session-io.ts";
import {
  DEFAULT_EFFORT, EFFORT_LEVELS as LEVELS, EFFORT_MAX_ITERATIONS, providerEffort,
} from "../../../shared/domain/agent-policy/behavior-flags.ts";
import type { EffortLevel } from "../../../shared/domain/agent-policy/behavior-flags.ts";
import type { EffortReport, ReasoningCapabilities, ReasoningTarget } from "../../../shared/domain/agent-policy/reasoning.ts";
import { EFFORT_STATE_KEY, MODEL_PREFERENCE_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import type { CommandView } from "../view.ts";
import { optionsOf } from "./choices.ts";
import {
  EFFORT_CHOICE, EFFORT_UNCHANGED, NONE_SENT, THINKING_NOT_REQUESTED, actIterations, effortDropped, effortLowered,
  effortSet, effortShown, effortUnchangedNoneStored, effortUnchecked, effortWarning, effortWarningDevSteps, hostAsks, itTakes, modelTakes, sentAs,
  thinkingAt, unknownEffort,
} from "./messages.ts";
import { markedDefault as defaultLevel } from "../messages.ts";

export interface EffortDeps {
  session: Pick<SessionIo, "readState" | "writeState">;
  /** Where a bare /effort opens a panel, when it can. */
  chooser?: Chooser;
  /** What the session's model takes and what a level becomes on it; absent, or answering nothing: nothing is said. */
  reasoning?: ReasoningReader;
  /** Where the session's `llm.profile` is read: under a profile, its model is the one judged. */
  config?: Pick<ConfigStore, "readValue" | "readFile">;
}

type TargetDeps = { session: Pick<SessionIo, "readState"> } & Pick<EffortDeps, "config">;

/** What the session's turns run on: its `llm.profile`, else its /model override, else the host's own model. */
async function sessionTarget(deps: TargetDeps): Promise<ReasoningTarget> {
  const [model, profile] = await Promise.all([
    deps.session.readState(MODEL_PREFERENCE_STATE_KEY).catch(() => null),
    deps.config === undefined ? null : readLlmProfile(deps.config).then((read) => read.profile),
  ]);
  return { profile, model: (model ?? "").trim() };
}

/** What to say of an effort that does not go as asked; empty when it does, or when the runtime did not say. */
export function effortNote(report: EffortReport | null, capabilities: ReasoningCapabilities | null): string {
  if (report === null || report.notice === null) return "";
  if (report.notice === "unchecked") return effortUnchecked(report.model, report.asked);
  const takes = capabilities !== null && capabilities.known ? itTakes(capabilities.efforts) : "";
  if (report.sent !== null) return effortLowered(report.model, report.asked, report.sent) + takes;
  // A level the model takes is dropped by the provider or the host's settings (its thinking switched off): the
  // model's levels would read as the cause, so they are left out.
  const taken = capabilities !== null && capabilities.efforts.includes(report.asked);
  return effortDropped(report.model, report.asked) + (taken ? "" : takes);
}

/** `effortNote` without the model the table does not know: that one is `show`'s to say, since most hosts serve
 *  some. */
export function effortWarningNote(report: EffortReport | null, capabilities: ReasoningCapabilities | null): string {
  return report?.notice === "unchecked" ? "" : effortNote(report, capabilities);
}

/** The warning lines for the effort the session stored, on what it reaches; empty when no level is stored or the
 *  level goes out as asked, checked or not. The turns of /assistant run on the session's target; under a /model
 *  override the dev steps and the sub-agents still run on the host's own model, so that one is judged too, and
 *  said when its line differs. /model says it after a switch. */
export async function storedEffortWarning(deps: TargetDeps & Pick<EffortDeps, "reasoning">): Promise<string> {
  const { reasoning } = deps;
  if (reasoning === undefined) return "";
  const level = providerEffort(await deps.session.readState(EFFORT_STATE_KEY).catch(() => null));
  if (level === undefined) return "";
  const target = await sessionTarget(deps);
  const overridden = target.profile === null && target.model !== "";
  const targets = overridden ? [target, { profile: null, model: "" }] : [target];
  const [turns, devSteps] = targets.map((each) => effortWarningNote(reasoning.effort(each, level), reasoning.capabilities(each)));
  const lines = [turns === "" ? "" : effortWarning(turns)];
  if (devSteps !== undefined && devSteps !== "" && devSteps !== turns) lines.push(effortWarningDevSteps(devSteps));
  return lines.filter((line) => line !== "").join("\n");
}

/** The thinking line of `show`: the level asked, then what does not go as asked, else the levels the model takes. */
function thinkingShown(stored: EffortLevel | undefined, reasoning: ReasoningReader | undefined, target: ReasoningTarget): string {
  const capabilities = reasoning?.capabilities(target) ?? null;
  const takes = capabilities !== null && capabilities.known ? `; ${modelTakes(capabilities.model, capabilities.efforts)}` : "";
  if (stored === undefined) {
    // The host's own `Llm:Thinking:Effort` goes out on every call all the same.
    const host = reasoning?.effort(target, null) ?? null;
    if (host === null) return THINKING_NOT_REQUESTED + takes;
    const hostNote = effortNote(host, capabilities);
    return hostAsks(host.asked) + (hostNote === "" ? takes : ` — ${hostNote}`);
  }
  const note = effortNote(reasoning?.effort(target, stored) ?? null, capabilities);
  return thinkingAt(stored) + (note === "" ? takes : ` — ${note}`);
}

/** What a level of the panel becomes on the session's model, after its iterations; empty when it goes as asked. */
function becomes(report: EffortReport | null): string {
  if (report === null || report.notice === null || report.notice === "unchecked") return "";
  return report.sent === null ? NONE_SENT : sentAs(report.sent);
}

/** `/effort [<level>|show]`, from the command's raw tokens. No argument opens a panel, or without one shows the level,
 *  as `show` does. */
export async function runEffort(tokens: string[], deps: EffortDeps): Promise<CommandView> {
  const requested = (tokens[0] ?? "").toLowerCase();
  if (!requested || requested === "show") {
    const stored = await deps.session.readState(EFFORT_STATE_KEY).catch(() => null);
    const target = await sessionTarget(deps);
    if (!requested && deps.chooser?.interactive) {
      const answer = await deps.chooser.choose({
        message: EFFORT_CHOICE,
        options: LEVELS.map((level) => ({
          ...optionsOf([level], stored ?? DEFAULT_EFFORT)[0],
          description: actIterations(EFFORT_MAX_ITERATIONS[level]) + becomes(deps.reasoning?.effort(target, level) ?? null),
        })),
      });
      if (!answer) return { text: EFFORT_UNCHANGED };
      // Confirming the level marked changes nothing: with none stored, it would ask the provider for thinking.
      if (answer.value === (stored ?? DEFAULT_EFFORT)) {
        return {
          text: stored ? EFFORT_UNCHANGED : effortUnchangedNoneStored(answer.value),
        };
      }
      return runEffort([answer.value], { ...deps, chooser: undefined });
    }
    const level = stored ?? defaultLevel(DEFAULT_EFFORT);
    const ladder = LEVELS.map((l) => `${l}=${EFFORT_MAX_ITERATIONS[l]}`).join(", ");
    return { text: effortShown(level, ladder, thinkingShown(providerEffort(stored), deps.reasoning, target), LEVELS) };
  }
  if (!LEVELS.includes(requested as (typeof LEVELS)[number])) {
    return { text: unknownEffort(requested, LEVELS) };
  }
  await deps.session.writeState(EFFORT_STATE_KEY, requested);
  // Says what it buys: the iterations, and the provider's thinking at that level; then what the session's model
  // makes of that level, when it does not take it.
  const warning = await storedEffortWarning(deps);
  const text = effortSet(requested, EFFORT_MAX_ITERATIONS[requested as (typeof LEVELS)[number]]);
  return { text: warning === "" ? text : `${text}\n${warning}` };
}
