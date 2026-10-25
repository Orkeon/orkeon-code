// The deps a dev step starts over (FakePermissionRules, FakeSessionStore holding the session's rules, a config store
// on FakeFiles, FakeToolCatalogue), and the inputs the step helpers are tested on.
import type { DevStep } from "../../shared/domain/dev/step-rules.ts";
import { createConfigStore } from "../../shared/application/config-store.ts";
import { PERMISSION_RULES_STATE_KEY } from "../../shared/domain/session-keys.ts";
import { FakeFiles } from "../../../tests/support/doubles/fake-files.ts";
import { FakePermissionRules } from "../../../tests/support/doubles/fake-permission-rules.ts";
import { FakeSessionStore } from "../../../tests/support/doubles/fake-session-store.ts";
import { FakeToolCatalogue } from "../../../tests/support/doubles/fake-tool-catalogue.ts";
import { WORKSPACE } from "../../shared/domain/vfs.ts";

/** The deps of startDevStep, the session holding the rules `stored` (none stored when empty). */
export function stepDeps(...stored: string[]) {
  const session = new FakeSessionStore();
  if (stored.length > 0) session.state.set(PERMISSION_RULES_STATE_KEY, JSON.stringify(stored));
  const gate = new FakePermissionRules();
  const config = createConfigStore({ files: new FakeFiles(), session });
  const catalogue = new FakeToolCatalogue();
  return { session, gate, config, catalogue };
}

/** A /hooks registry of two hooks. */
export const HOOKS_REGISTRY = [{ event: "pre-tool", command: "bash pre.sh {tool}" }, { event: "stop", command: "bash s.sh" }];

export const HOOKS_CASES: readonly { name: string; step: DevStep; stored: string | null; expected: unknown[] }[] = [
  { name: "returns no /hooks registry when it is unset", step: "dev-plan", stored: null, expected: [] },
  { name: "returns the /hooks registry for the crew's input, as stored", step: "dev-verify", stored: JSON.stringify(HOOKS_REGISTRY), expected: HOOKS_REGISTRY },
  { name: "returns no /hooks registry when it is malformed", step: "dev-plan", stored: "{not json", expected: [] },
];

export const NO_SESSION_RULES_WARNING =
  "warning: the host keeps no session rules: /dev-plan's rule sets are not in the host's gate, the crew's callback alone checks them.";

export const LEFT_OUT_ALLOW_WARNING =
  "warning: the session's rule 'allow shell_command command=*git push*' is left out of the gate during /dev-plan: " +
  "the step denies the same calls.";

export const MEMORY_RECALL_CASES: readonly { name: string; stored: string[]; input: object }[] = [
  { name: "hands the crew no memoryRecall key without a session rule on memory_recall", stored: [], input: { hooks: [] } },
  {
    name: "hands the crew memoryRecall: false when a session rule denies every call of memory_recall",
    stored: ["deny memory_recall"],
    input: { hooks: [], memoryRecall: false },
  },
  {
    name: "hands the crew no memoryRecall key when a session rule denies only some calls of memory_recall",
    stored: ["deny memory_recall query=secret*"],
    input: { hooks: [] },
  },
];

export const VERIFY_STEP_CASES: readonly { name: string; gateOnly: boolean; expected: string | null }[] = [
  { name: "runs no step for /dev-verify --gate-only", gateOnly: true, expected: null },
  { name: "runs the dev-verify step for /dev-verify", gateOnly: false, expected: "dev-verify" },
];

export const ACTIVE_WORKFLOW_CASES: readonly {
  name: string;
  input: { batch: string; plan: string | null };
  expected: { code: string | null; phase: string };
}[] = [
  { name: "takes the code from the token", input: { batch: "F2", plan: "demo" }, expected: { code: "demo", phase: "F2" } },
  { name: "takes the code from a plan path's folder", input: { batch: "F2", plan: "workbench/demo/DEMO-PLAN.md" }, expected: { code: "demo", phase: "F2" } },
  {
    name: "takes the code from an absolute plan path's folder",
    input: { batch: "F2", plan: `${WORKSPACE}/todo/demo/DEMO-PLAN.md` },
    expected: { code: "demo", phase: "F2" },
  },
  { name: "takes no code from a plan path without a folder", input: { batch: "F3", plan: "DEMO-PLAN.md" }, expected: { code: null, phase: "F3" } },
  { name: "takes no code without a plan", input: { batch: "F3", plan: null }, expected: { code: null, phase: "F3" } },
];

/** A session whose state bag cannot be written. */
export function failingStateSession(): FakeSessionStore {
  const session = new FakeSessionStore();
  session.writeState = async () => {
    throw new Error("no state bag");
  };
  return session;
}

export const WRITING_MODE_CASES: readonly { name: string; mode: string; step: string }[] = [
  { name: "lets a writing step run in the default mode", mode: "default", step: "dev-spec" },
  { name: "lets a writing step run in acceptEdits", mode: "acceptEdits", step: "dev-plan" },
];

export const REFUSED_MODE_CASES: readonly { name: string; mode: string; step: string; expected: string }[] = [
  {
    name: "refuses a read-only mode",
    mode: "plan",
    step: "dev-plan",
    expected: "✗ refused: the session mode plan is read-only, and /dev-plan writes files: /mode default, then run it again",
  },
  {
    name: "refuses a mode that could not be read",
    mode: "",
    step: "dev-change",
    expected: "✗ refused: the session mode could not be read, and /dev-change writes files: run it again",
  },
  {
    name: "refuses a mode it does not know",
    mode: "bogus",
    step: "dev-spec",
    expected: "✗ refused: the session mode bogus is not one Orkeon Code knows, and /dev-spec writes files: /mode default, then run it again",
  },
];

/** A session-mode reader answering `mode`, or failing with it when it is an error. */
export function modeReader(mode: string | Error) {
  return {
    resolveEffectiveSessionMode: async () => {
      if (mode instanceof Error) throw mode;
      return { mode, via: "test" };
    },
  };
}

export const READ_MODE_REFUSAL_CASES: readonly { name: string; mode: string | Error; fragment: string }[] = [
  { name: "refuses a read-only mode it reads", mode: "plan", fragment: "plan is read-only" },
  { name: "refuses when the read fails", mode: new Error("no session"), fragment: "could not be read" },
];
