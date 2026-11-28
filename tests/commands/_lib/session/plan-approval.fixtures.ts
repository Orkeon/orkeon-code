// The session service the plan approval runs over, a chooser answering it, and the deps a turn of /assistant is
// launched over.
import { createConfigStore } from "../../../../src/shared/application/config-store.ts";
import { createSessionIo } from "../../../../src/shared/application/session-io.ts";
import { FakeChooser } from "../../../support/doubles/fake-chooser.ts";
import { FakeCrewHost } from "../../../support/doubles/fake-crew-host.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakePermissionRules } from "../../../support/doubles/fake-permission-rules.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { FakeToolCatalogue } from "../../../support/doubles/fake-tool-catalogue.ts";
import { DEFAULT_MODE_STATE_KEY, PLAN_TURN_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";

/** A session in `mode` (none stored when absent), whose last turn was a plan turn when `planTurn`; a chooser
 *  answering `answer`. */
export function approvalSetup(options: { mode?: string; planTurn?: boolean; answer?: string | null } = {}) {
  const store = new FakeSessionStore();
  if (options.mode !== undefined) store.state.set(DEFAULT_MODE_STATE_KEY, options.mode);
  if (options.planTurn ?? true) store.state.set(PLAN_TURN_STATE_KEY, "true");
  const config = createConfigStore({ files: new FakeFiles(), session: store });
  const session = createSessionIo({ store, config });
  const chooser = new FakeChooser();
  chooser.answers = [options.answer ?? null];
  return { store, config, session, chooser, deps: { session, chooser } };
}

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
  return { store, crews, deps };
}

export const SUCCESS = { success: true, payload: "1. Rename parseArgs in src/args.ts.\n2. Run the tests." };
export const FAILURE = { success: false, payload: "" };

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

/** The modes a turn is noted from, and what the state bag then holds. */
export const NOTED: readonly { readonly name: string; readonly prefix: string | null; readonly session?: string; readonly held: string | undefined }[] = [
  { name: "notes a turn prefixed plan", prefix: "plan", held: "true" },
  { name: "notes a turn without a prefix in a session in plan mode", prefix: null, session: "plan", held: "true" },
  { name: "notes nothing for a turn prefixed with a writing mode in a session in plan mode", prefix: "default", session: "plan", held: undefined },
  { name: "notes nothing for a turn without a prefix in a session that writes", prefix: null, session: "acceptEdits", held: undefined },
];

/** The turns of /assistant and whether the crew is told its plan is approved after it. */
export const APPROVAL_TOLD: readonly { readonly name: string; readonly prefix: string | null; readonly interactive: boolean; readonly told: boolean }[] = [
  { name: "tells a plan turn on a console with panels that its plan is approved after it", prefix: "plan", interactive: true, told: true },
  { name: "promises no approval to a plan turn on a console without panels", prefix: "plan", interactive: false, told: false },
  { name: "promises no approval to a turn that writes", prefix: "acceptEdits", interactive: true, told: false },
];

export const KEPT = "plan kept as it is: nothing changed. Say what it should change, or /plan to leave plan mode.";
export const NOT_OFFERED =
  "plan mode: nothing changed. To carry the plan out, leave plan mode (/plan, or /mode acceptEdits) and ask for it.";
