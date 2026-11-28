// The session service the plan approval runs over, and a chooser answering it.
import { createConfigStore } from "../../../../src/shared/application/config-store.ts";
import { createSessionIo } from "../../../../src/shared/application/session-io.ts";
import { FakeChooser } from "../../../support/doubles/fake-chooser.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { DEFAULT_MODE_STATE_KEY, PLAN_TURN_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";

/** A session in `mode` (none stored when absent), whose last turn was a plan turn when `planTurn`; a chooser
 *  answering `answer`. */
export function approvalSetup(options: { mode?: string; planTurn?: boolean; answer?: string | null } = {}) {
  const store = new FakeSessionStore();
  if (options.mode !== undefined) store.state.set(DEFAULT_MODE_STATE_KEY, options.mode);
  if (options.planTurn ?? true) store.state.set(PLAN_TURN_STATE_KEY, "true");
  const session = createSessionIo({ store, config: createConfigStore({ files: new FakeFiles(), session: store }) });
  const chooser = new FakeChooser();
  chooser.answers = [options.answer ?? null];
  return { store, session, chooser, deps: { session, chooser } };
}

export const SUCCESS = { success: true };
export const FAILURE = { success: false };

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

export const KEPT = "plan kept as it is: nothing changed. Say what it should change, or /plan to leave plan mode.";
export const NOT_OFFERED =
  "plan mode: nothing changed. To carry the plan out, leave plan mode (/plan, or /mode acceptEdits) and ask for it.";
