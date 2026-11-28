// The deps a turn of /assistant is launched over, and those the plan approval runs over: the same, with a chooser
// answering it.
import { createConfigStore } from "../../../../src/shared/application/config-store.ts";
import { createSessionIo } from "../../../../src/shared/application/session-io.ts";
import { FakeChooser } from "../../../support/doubles/fake-chooser.ts";
import { FakeCrewHost } from "../../../support/doubles/fake-crew-host.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakePermissionRules } from "../../../support/doubles/fake-permission-rules.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { FakeToolCatalogue } from "../../../support/doubles/fake-tool-catalogue.ts";
import { PLAN_TURN_STATE } from "../../../../src/commands/_lib/session/plan-approval.ts";
import { DEFAULT_MODE_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";

/** The deps a turn of /assistant is launched over, in a session in `mode` (none stored when absent). */
export function assistantLaunchSetup(mode?: string) {
  const store = new FakeSessionStore();
  if (mode !== undefined) store.state.set(DEFAULT_MODE_STATE_KEY, mode);
  const config = createConfigStore({ files: new FakeFiles(), session: store });
  const crews = new FakeCrewHost();
  const deps = {
    session: createSessionIo({ store, config }), config, catalogue: new FakeToolCatalogue(), crews,
    gate: new FakePermissionRules(), log: new FakeLogger(),
  };
  return { store, config, crews, deps };
}

/** The launch deps of a session in `mode` (none stored when absent), with a chooser answering `answer`. */
export function approvalSetup(options: { mode?: string; answer?: string | null } = {}) {
  const { store, config, crews, deps: launch } = assistantLaunchSetup(options.mode);
  const chooser = new FakeChooser();
  chooser.answers = [options.answer ?? null];
  return { store, config, crews, chooser, deps: { ...launch, chooser } };
}

/** The refusal the runtime throws for a launch past the chain depth limit. */
export const CHAIN_LIMIT_ERROR = "chain depth 8 reached (MaxChainDepth 8, /assistant)";

/** The host's refusal of a second exclusive turn, and the line /assistant shows for it. */
export const TURN_RUNNING_ERROR = "crew 'main-loop' already running (ticket t1)";
export const TURN_RUNNING =
  "a turn is running (t1): this line was not sent. Wait for its answer, or stop it with Esc Esc, then type the line again.";

const PLAN = "1. Rename parseArgs in src/args.ts.\n2. Run the tests.";

/** The completion of a plan turn that succeeded with a plan. */
export const SUCCESS = { success: true, payload: PLAN, state: PLAN_TURN_STATE };
/** The completion of a plan turn that failed. */
export const FAILURE = { success: false, payload: "", state: PLAN_TURN_STATE };
/** The completion of a turn whose launch attached no state. */
export const NO_STATE = { success: true, payload: PLAN };

/** States a completion may receive that are not a plan turn's. */
export const FOREIGN_STATES: readonly { readonly name: string; readonly state: unknown }[] = [
  { name: "a string", state: "plan" },
  { name: "null", state: null },
  { name: "an object without the field", state: { mode: "plan" } },
  { name: "an object whose field is not true", state: { planTurn: "true" } },
  { name: "an array", state: [true] },
];

/** Successful turns that left no plan to approve. */
export const NO_ANSWER: readonly { readonly name: string; readonly payload: string | undefined }[] = [
  { name: "an empty answer", payload: "" },
  { name: "a blank answer", payload: "  \n " },
  { name: "no answer at all", payload: undefined },
];

/** The answers that carry the plan out, each the mode of the turn that follows. */
export const APPROVALS: readonly string[] = ["acceptEdits", "default"];

/** The answers that leave the plan as it is. */
export const REFUSALS: readonly { readonly name: string; readonly answer: string | null }[] = [
  { name: "the answer to keep planning", answer: "plan" },
  { name: "the panel left", answer: null },
];

/** The turns of /assistant and whether their launch attaches the plan turn's state. */
export const ATTACHED: readonly { readonly name: string; readonly prefix: string | null; readonly session?: string; readonly planTurn: boolean }[] = [
  { name: "attaches the plan turn's state to a turn prefixed plan", prefix: "plan", planTurn: true },
  { name: "attaches the plan turn's state to a turn without a prefix in a session in plan mode", prefix: null, session: "plan", planTurn: true },
  { name: "attaches no state to a turn prefixed with a writing mode in a session in plan mode", prefix: "default", session: "plan", planTurn: false },
  { name: "attaches no state to a turn without a prefix in a session that writes", prefix: null, session: "acceptEdits", planTurn: false },
];

/** The turns of /assistant and whether the crew is told its plan is approved after it. */
export const APPROVAL_TOLD: readonly { readonly name: string; readonly prefix: string | null; readonly interactive: boolean; readonly told: boolean }[] = [
  { name: "tells a plan turn on a console with panels that its plan is approved after it", prefix: "plan", interactive: true, told: true },
  { name: "promises no approval to a plan turn on a console without panels", prefix: "plan", interactive: false, told: false },
  { name: "promises no approval to a turn that writes", prefix: "acceptEdits", interactive: true, told: false },
];

export const NOT_CARRIED_OUT = "plan not carried out: the session stays in 'plan'.";
export const MODE_NOT_KEPT =
  "⚠ the session's mode could not be set to 'acceptEdits': it stays in 'plan'; this turn runs in 'acceptEdits' all the same.";

export const KEPT ="plan kept as it is: nothing changed. Say what it should change, or /plan to leave plan mode.";
export const NOT_OFFERED =
  "plan mode: nothing changed. To carry the plan out, leave plan mode (/plan, or /mode acceptEdits) and ask for it.";
