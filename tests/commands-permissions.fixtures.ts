// The harness /permissions runs over (the session service on FakeSessionStore, a config store on FakeFiles, the
// host gate's rules on FakePermissionRules, the host's tools on FakeToolCatalogue), the lines it shows that run
// past one, the refusals of `add`, and the sessions a dormant rule is tested in.
import { PERMISSIONS_USAGE, runPermissions } from "../src/commands/_lib/permissions.ts";
import { USER_CONFIG_FILE_PATH, createConfigStore } from "../src/shared/application/config-store.ts";
import { createSessionIo } from "../src/shared/application/session-io.ts";
import { RULEABLE_TOOLS, readRule } from "../src/shared/domain/agent-policy/permission.ts";
import type { PermissionRule } from "../src/shared/domain/agent-policy/permission.ts";
import { gateLine as memoryGateLine } from "../src/shared/domain/agent-policy/permission.ts";
import { DEFAULT_MEMORY_DIR, memoryWriteRules } from "../src/shared/domain/shared-memory/layout.ts";
import { PERMISSION_RULES_STATE_KEY } from "../src/shared/domain/session-keys.ts";
import { FakeFiles } from "./support/fake-files.ts";
import { FakePermissionRules } from "./support/fake-permission-rules.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";
import { FakeToolCatalogue } from "./support/fake-tool-catalogue.ts";
import { WORKSPACE } from "../src/shared/domain/dev/path-rebase.ts";

/** The built-in denies every sync adds after the session's rules: no model tool writes the memory's candidates or entries. */
export const MEMORY_LINES = memoryWriteRules(DEFAULT_MEMORY_DIR).map(memoryGateLine);
export const MEMORY_GATE = MEMORY_LINES.map((line) => `add ${line}`);

export const NO_GATE_RULES =
  "⚠ the host keeps no session rules (orkeon-repl does): the gate decides each call from the mode alone.";

/** The third line of the enforcement block: the dev crews' tool callback. */
export const CALLBACK = [
  "                       3) dev crews' callback (/dev-spec, /dev-change, /dev-plan, /dev-implement,",
  "                          /dev-batches, /dev-verify, a /tasks repair), after the gate allowed a call:",
  "                          the step's rule sets and a role's roots again, glob/grep/count_pattern by",
  "                          their whole input, the act's mode when the host has no gate, then the",
  "                          pre-tool and post-tool hooks (/hooks); it can refuse, never allow more",
];

/** The closing lines of the enforcement block when the host says its gate is on. */
export const GATE_ON = [
  "                       the gate is on (Orkeon:Security:PermissionGate:Enabled, the host says): the rules",
  "                       and the modes above hold at each call",
];

/** The same lines when the host says its gate is off: the surface above is not enforced. */
export const GATE_OFF = [
  "⚠ the gate is OFF (Orkeon:Security:PermissionGate:Enabled is not true, the host says): no rule above",
  "                       is enforced and nothing asks",
];

/** The closing lines when the host cannot say (no session rules). */
export const GATE_SETTING = [
  "                       the gate runs only when Orkeon:Security:PermissionGate:Enabled is true, which",
  "                       the launcher sets: off, no rule above is enforced and nothing asks",
];

/** What /permissions says about a dormant rule. */
export const dormant = (rule: string) =>
  `⚠ rule ${rule} is dormant: its tool is neither built in nor listed in tools.extra. It is kept, not handed to ` +
  "the gate, and applies again once the tool is listed (/permissions remove deletes it).";

/** A rule read from its line, as /permissions add reads it. */
export const R = (line: string): PermissionRule => readRule(line)!;

/** The line /permissions show adds while a dev step's rule sets are in the gate. */
export const SETS_HELD =
  "⚠ the gate also holds the rule sets of the last dev step: the next /assistant turn or rule change hands it the " +
  "session's rules alone.";
export const OTHER_RULES = "⚠ the gate holds other rules than the session: the next change or /assistant hands it these.";

export const NOT_A_RULE_TEXT = "⚠ 1 stored entry is not a rule (bogus): kept as written, ignored; /permissions clear removes them.";

export const GRAMMAR = { text: `invalid rule: expected <deny|allow> <tool> [<argument>=<pattern>].\n${PERMISSIONS_USAGE}` };

export const USAGE_TEXT =
  "usage: /permissions [show] | add <deny|allow> <tool> [<argument>=<pattern>] | " +
  "remove <deny|allow> <tool> [<argument>=<pattern>] | list | clear";

/** /permissions over fresh fakes, with readers and writers of the stored rules and of `tools.extra`. */
export function permissionsHarness() {
  const files = new FakeFiles();
  const store = new FakeSessionStore();
  const gate = new FakePermissionRules();
  const config = createConfigStore({ files, session: store });
  const session = createSessionIo({ store, config });
  const catalogue = new FakeToolCatalogue();
  const run = (...tokens: string[]) => runPermissions(tokens, { session, gate, config, catalogue });
  const rules = (): unknown => JSON.parse(store.state.get(PERMISSION_RULES_STATE_KEY) ?? "null");
  const seedRules = (...stored: string[]) => store.state.set(PERMISSION_RULES_STATE_KEY, JSON.stringify(stored));
  /** Configures `tools.extra` in the user settings and registers `registered` with the host. */
  const extraTools = async (setting: string, ...registered: string[]) => {
    files.files.set(USER_CONFIG_FILE_PATH, JSON.stringify({ "tools.extra": setting }));
    for (const name of registered) catalogue.tools.set(name, "");
  };
  return { files, store, gate, catalogue, run, rules, seedRules, extraTools };
}

/** /permissions over a session and a gate given, its config file unreadable. */
export function unreadableConfigRun(store: FakeSessionStore, gate: FakePermissionRules) {
  const files = new FakeFiles();
  files.readErrors.set(`${WORKSPACE}/.orkeon/config.json`, new Error("permission denied"));
  const config = createConfigStore({ files, session: store });
  const session = createSessionIo({ store, config });
  return (...tokens: string[]) => runPermissions(tokens, { session, gate, config, catalogue: new FakeToolCatalogue() });
}

export const REFUSED_ADD_CASES: readonly { name: string; tokens: string[]; expected: { text: string } }[] = [
  { name: "a text that is not a rule", tokens: ["add", "permit", "file_read"], expected: GRAMMAR },
  { name: "an argument without its `=`", tokens: ["add", "allow", "shell_command", "npm", "test"], expected: GRAMMAR },
  { name: "an argument without its pattern", tokens: ["add", "allow", "shell_command", "command="], expected: GRAMMAR },
  {
    name: "an unknown tool",
    tokens: ["add", "deny", "nope"],
    expected: { text: `invalid rule: 'nope' is no tool a rule may name: one of ${RULEABLE_TOOLS.join(", ")}.\n${PERMISSIONS_USAGE}` },
  },
  {
    name: "an argument the tool does not take",
    tokens: ["add", "allow", "shell_command", "cmd=npm", "test*"],
    expected: {
      text: "invalid rule: 'shell_command' has no argument 'cmd': it takes command, working_directory, " +
        `timeout_seconds, action, job_id, tail_lines.\n${PERMISSIONS_USAGE}`,
    },
  },
];

export const NO_SUCH_RULE_CASES: readonly { name: string; tokens: string[]; text: string }[] = [
  { name: "a rule of the opposite effect", tokens: ["remove", "allow", "file_read"], text: "no such rule: allow file_read." },
  { name: "a whole-tool rule when only a pattern rule holds that effect", tokens: ["remove", "allow", "shell_command"], text: "no such rule: allow shell_command." },
];

export const REMOVE_SEED = ["deny:file_read", "deny:shell_command", "allow shell_command command=npm test*"];

/** A session with search_issues registered and gone_tool configured only, a rule on each. */
export async function extraRulesSession() {
  const h = permissionsHarness();
  await h.extraTools("search_issues gone_tool:read", "search_issues");
  await h.run("add", "deny", "search_issues", "query=secret*");
  await h.run("add", "allow", "gone_tool");
  return h;
}

/** A session where create_issue had a rule, then left tools.extra for transcribe_audio. */
export async function leftToolsExtraSession() {
  const h = permissionsHarness();
  await h.extraTools("create_issue", "create_issue");
  await h.run("add", "deny", "create_issue");
  // create_issue leaves tools.extra: the rule stays stored, out of the gate, and says so.
  await h.extraTools("transcribe_audio:read", "transcribe_audio");
  return h;
}

/** That session after a rule on http_api came and went, and file_write was allowed. */
export async function dormantRuleSession() {
  const h = await leftToolsExtraSession();
  await h.run("add", "deny", "http_api");
  await h.run("remove", "deny", "http_api");
  await h.run("add", "allow", "file_write");
  return h;
}
