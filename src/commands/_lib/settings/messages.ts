// The text the settings commands show the user (ADR 0026): usages, refusals, report lines and hints.
import { USER_CONFIG_FILE_PATH } from "../../../shared/application/config-store.ts";
import { EXTRA_TOOLS_CONFIG_KEY } from "../../../shared/domain/agent-policy/extra-tools.ts";
import { PERMISSION_FALLBACK_CONFIG_KEY } from "../../../shared/domain/permission-modes.ts";
import { RULE_SYNTAX } from "../../../shared/domain/agent-policy/permission.ts";
import type { PermissionMode } from "../../../shared/domain/permission-modes.ts";

// /permissions

export const PERMISSIONS_USAGE =
  `usage: /permissions [show] | add ${RULE_SYNTAX} | remove ${RULE_SYNTAX} | list | clear`;

/** Said when the host keeps no session rules: a rule is stored, nothing enforces it. */
export const NO_GATE_RULES =
  "⚠ the host keeps no session rules (orkeon-repl does): the gate decides each call from the mode alone.";

export const EVERY_CALL = "every call";

export const extraToolsUnreadableWarning = (reason: string): string =>
  `⚠ ${EXTRA_TOOLS_CONFIG_KEY} could not be read (${reason}): no extra tool is known, and the ` +
  "rules on extra tools are dormant.";

export const dormantRule = (rule: string): string =>
  `⚠ rule ${rule} is dormant: its tool is neither built in nor listed in ${EXTRA_TOOLS_CONFIG_KEY}. It is ` +
  "kept, not handed to the gate, and applies again once the tool is listed (/permissions remove deletes it).";

export const invalidStoredEntries = (invalid: readonly string[]): string =>
  `⚠ ${invalid.length} stored entr${invalid.length === 1 ? "y is" : "ies are"} not a rule ` +
  `(${invalid.join(", ")}): kept as written, ignored; /permissions clear removes them.`;

export const fallbackIgnored = (value: string, reason: string): string =>
  `  ↳ ignored          : the project file sets ${PERMISSION_FALLBACK_CONFIG_KEY} '${value}': ` + reason;

export const USER_SETTINGS_UNREADABLE =
  `⚠ the user settings (${USER_CONFIG_FILE_PATH}) could not be read or parsed: no user setting applies.`;

export const nestedKey = (key: string): string =>
  `⚠ ${key} is written nested in a settings file ({"${key.split(".")[0]}": {…}}), so nothing reads it: ` +
  `write it flat, "${key}": ….`;

export const extraToolNotOffered = (value: string, reason: string): string =>
  `⚠ ${EXTRA_TOOLS_CONFIG_KEY} of the project file names ${value}, which ${reason}: ` +
  "not offered.";

export const ruleSetsOfLastStep = (sets: string): string => `rule sets of the last dev step: ${sets}`;

export const memoryGuard = (memoryDir: string, count: number): string =>
  `the shared memory's guard: no tool of the model writes under ${memoryDir}/candidates or ${memoryDir}/entries (${count} rules)`;

export const userConfigGuard = (mount: string, count: number): string =>
  `the user configuration's guard: no tool of the model reads or writes ${mount} (${count} rules)`;

export const pathsDenyGuard = (entries: string, count: number): string =>
  `paths.deny: no tool of the model reads or writes ${entries} (${count} rules)`;

export const SET_BY_MODE = "set by /mode (session state)";

export const modesLine = (modes: string): string =>
  `modes                : ${modes} (bare /mode opens a panel, or cycles without one)`;

export const HOST_KEEPS_NO_RULES = "(the host keeps no session rules)";

/** The enforcement block of /permissions show, before what the host says of its gate. */
export const ENFORCEMENT_LINES: readonly string[] = [
  "enforcement          : 1) catalogue: what the mode offers, less the tools a deny rule covers whole",
  "                       2) host gate, at each call: a matching deny refuses; a matching allow runs",
  "                          without asking (not in plan); else the mode decides, and default and",
  "                          acceptEdits ask you: [y] once / [s] session / [n] no; a background",
  "                          command's question names its task (for [t1]), answered from the main prompt",
  "                       3) dev crews' callback (/dev-spec, /dev-plan, /dev-batches, a /tasks repair),",
  "                          before the gate (2), which then judges the input it returns:",
  "                          the step's rule sets and a role's roots again, glob/grep/count_pattern by",
  "                          their whole input, the act's mode when the host has no gate, then the",
  "                          pre-tool and post-tool hooks (/hooks); it can refuse, never allow more",
];

export const inertRule = (rule: string, mode: string, reason: string): string =>
  `⚠ rule ${rule} has NO effect in '${mode}': ${reason}`;

export const GATE_HOLDS_OTHER_RULES =
  "⚠ the gate holds other rules than the session: the next change or /assistant hands it these.";

export const GATE_HOLDS_RULE_SETS =
  "⚠ the gate also holds the rule sets of the last dev step: the next /assistant turn or rule change hands it the session's rules alone.";

export const GATE_ON_LINES: readonly string[] = [
  "                       the gate is on (Orkeon:Security:PermissionGate:Enabled, the host says): the rules",
  "                       and the modes above hold at each call",
];

export const GATE_OFF_LINES: readonly string[] = [
  "⚠ the gate is OFF (Orkeon:Security:PermissionGate:Enabled is not true, the host says): no rule above",
  "                       is enforced and nothing asks",
];

export const GATE_UNKNOWN_LINES: readonly string[] = [
  "                       the gate runs only when Orkeon:Security:PermissionGate:Enabled is true, which",
  "                       the launcher sets: off, no rule above is enforced and nothing asks",
];

export const NO_PERMISSION_RULES = `no permission rules set. ${PERMISSIONS_USAGE}`;

export const DORMANT_NOT_LISTED = `dormant: not in ${EXTRA_TOOLS_CONFIG_KEY}`;

export const invalidRule = (reason: string): string => `invalid rule: ${reason}.\n${PERMISSIONS_USAGE}`;

export const ruleAdded = (rule: string): string => `rule ${rule} added.`;

export const ruleNoEffect = (mode: string, reason: string): string => `⚠ it has NO effect in '${mode}': ${reason}`;

export const catalogueOfMode = (mode: string, tools: string): string => `catalogue for '${mode}': ${tools}`;

export const INVALID_RULE_GRAMMAR = `invalid rule: expected ${RULE_SYNTAX}.\n${PERMISSIONS_USAGE}`;

export const noSuchRule = (rule: string): string => `no such rule: ${rule}.`;

export const ruleRemoved = (rule: string): string => `rule ${rule} removed.`;

export const ALL_RULES_CLEARED = "all permission rules cleared (the mode decides alone).";

// The lines of /permissions show, each after its label.
export const sessionDefaultLine = (mode: string, readOnly: boolean): string =>
  `session default mode : ${mode} ${readOnly ? "(read-only)" : ""}`;
export const sourceLine = (source: string): string => `  ↳ source           : ${source}`;
export const toolCatalogueLine = (tools: string): string => `tool catalogue       : ${tools || "(empty)"}`;
export const withheldLine = (tools: string): string => `  ↳ withheld by mode : ${tools || "(none)"}`;
export const removedLine = (tools: string): string => `  ↳ removed by rule  : ${tools || "(none)"}`;
export const extraToolsLine = (present: string, missing: readonly string[], invalid: readonly string[]): string =>
  `  ↳ extra tools      : ${present || "(none registered)"}` +
  (missing.length > 0 ? `; not registered: ${missing.join(", ")}` : "") +
  (invalid.length > 0 ? `; ignored: ${invalid.join(", ")}` : "");
export const sessionRulesLine = (rules: string, dormant: readonly string[]): string =>
  `session rules        : ${rules || "(none)"}` + (dormant.length > 0 ? `; dormant: ${dormant.join(", ")}` : "");
export const hostGateLine = (held: string): string => `in the host gate     : ${held || "(none)"}`;

// /advisor

export const advisorModelLine = (model: string, source: string): string => `advisor model: ${model}  [${source}]`;
export const ADVISOR_UNSET =
  "advisor model: (unset) — /advisor review would ask the SESSION's own model, " +
  "which makes it a self-review and worth much less.";
export const declaredModelsLine = (models: readonly string[]): string => `declared models: ${models.join(", ")}`;
export const ADVISOR_USAGE = "usage: /advisor <model> | /advisor off | /advisor review";
export const refusingUnparsed = (path: string): string => `refusing to write: ${path} could not be parsed.`;
export const ADVISOR_DISABLED = "advisor model disabled — /advisor review falls back to the session's own model.";
export const refusingToOverwrite = (path: string): string =>
  `refusing to write: ${path} exists but could not be parsed, and overwriting ` +
  "it would discard whatever it holds. Fix or delete it, then retry.";
export const advisorSet = (model: string, path: string, undeclared: boolean): string =>
  `advisor model set to '${model}' — persisted in ${path}.` +
  (undeclared ? "\n⚠ NOT among the models this host declares; see the log." : "");

// /effort

export const EFFORT_CHOICE = "Reasoning effort for this session";
export const actIterations = (count: number): string => `${count} act() iterations`;
export const EFFORT_UNCHANGED = "reasoning effort unchanged.";
export const effortUnchangedNoneStored = (level: string): string =>
  "reasoning effort unchanged: no level is stored, so the session asks the provider for no thinking " +
  `(/effort ${level} asks for it).`;
export const THINKING_NOT_REQUESTED = "not requested (no level stored)";
/** With no level stored, the level the host's own configuration asks for (`Llm:Thinking:Effort`). */
export const hostAsks = (level: string): string => `not requested by the session; the host asks for '${level}'`;
export const thinkingAt = (level: string): string => `at '${level}' (act effort)`;
export const effortShown = (level: string, ladder: string, thinking: string, levels: readonly string[]): string =>
  `reasoning effort: ${level}\nact() iterations per level: ${ladder}\n` +
  `provider thinking: ${thinking}\n` +
  `usage: /effort [<${levels.join("|")}>|show]`;
/** The levels the session's model takes, after the thinking of `show`. */
export const modelTakes = (model: string, efforts: readonly string[]): string =>
  efforts.length > 0 ? `${model} takes ${efforts.join(", ")}` : `${model} takes no effort level`;
/** What the runtime does with a level that does not go as asked, or that it cannot check (Orkeon #360). The cause
 *  may be the model, the provider or the host's settings: the levels the model takes follow when it is known. */
export const effortLowered = (model: string, asked: string, sent: string): string =>
  `'${asked}' is sent to ${model} as '${sent}'`;
export const itTakes = (efforts: readonly string[]): string =>
  efforts.length > 0 ? ` (it takes ${efforts.join(", ")})` : " (it takes no effort level)";
export const effortDropped = (model: string, asked: string): string => `'${asked}' is not sent to ${model}`;
export const effortUnchecked = (model: string, asked: string): string =>
  `the capability table does not know ${model}: '${asked}' is sent unchecked`;
/** The line under an answer of /effort or /model when the effort does not go as asked. */
export const effortWarning = (note: string): string => `⚠ effort: ${note}.`;
/** The same line for the host's own model under a /model override: the dev steps and the sub-agents run on it. */
export const effortWarningDevSteps = (note: string): string => `⚠ effort, dev steps and sub-agents (the host's model): ${note}.`;
/** Under the thinking line of `show`, the same for the host's own model under a /model override. */
export const thinkingDevSteps = (note: string): string => `\n  dev steps and sub-agents (the host's model): ${note}`;
export const sentAs = (sent: string): string => `, sent as '${sent}'`;
export const NONE_SENT = ", none sent";
export const unknownEffort = (level: string, levels: readonly string[]): string =>
  `unknown level '${level}' — expected one of: ${levels.join(", ")}, show.`;
export const effortSet = (level: string, iterations: number): string =>
  `reasoning effort set to '${level}' — the next /assistant turn gets ` +
  `${iterations} act() iterations and asks the provider for ` +
  `thinking at '${level}' (act effort; the dev steps and their children too). Session-scoped; /clear clears it.`;

// /hooks

/** Where the hooks run, said on every listing: a populated registry is exactly when someone
 *  believes they all run. */
export const HOOKS_STATUS =
  "pre-tool and post-tool hooks run around each tool call the model makes in the dev steps (/dev-spec, " +
  "/dev-plan, /dev-batches) and a /tasks repair (a failing pre-tool hook refuses the call); " +
  "the assistant does not run " +
  "them yet, and no stop hook runs.";
export const NO_HOOKS = `no hooks configured. usage: /hooks add <pre-tool|post-tool|stop> <command>\n${HOOKS_STATUS}`;
export const hooksAddUsage = (events: readonly string[]): string => `usage: /hooks add <${events.join("|")}> <command>`;
export const hookOperatorRefused = (operator: string): string =>
  `refused: the command holds '${operator}', which the shell tool refuses: a hook is one program ` +
  "and its arguments. Put the steps in a script: /hooks add pre-tool node .orkeon/hooks/pre.mjs {tool} {path}";
export const hookAdded = (n: number, event: string): string => `hook #${n} added on '${event}' (/clear clears). ${HOOKS_STATUS}`;
export const hooksRemoveUsage = (max: number): string => `usage: /hooks remove <1-${max}>`;
export const hookRemoved = (n: number): string => `hook #${n} removed.`;
export const HOOKS_USAGE = "usage: /hooks [list|add <event> <command>|remove <n>]";

// /agents

export const AGENTS_USAGE =
  "usage: /agents [list] | add <name> <role> | <goal> | remove <name> | show <name>";

/** What the listing says of the saved agents, and of what runs instead. */
export const SAVED_AGENTS_NOTE =
  "saved agents are storage only — no command runs one; the built-in charters run as children of /dev-spec, /dev-plan and /dev-batches (/tasks).";

export const agentsFileLine = (path: string): string => `file: ${path} (survives /clear)`;
export const droppedAgents = (dropped: readonly string[]): string =>
  `⚠ ${dropped.length} stored entr(y/ies) ignored — missing role or goal: ${dropped.join(", ")}`;
export const fileLeftUntouched = (path: string): string => `⚠ ${path} could not be parsed; it is left untouched.`;
export const savedAgentShown = (name: string, role: string, goal: string, tools: readonly string[]): string =>
  `${name}\n  role : ${role}\n  goal : ${goal}\n` +
  `  tools: ${tools.length > 0 ? tools.join(", ") : "(inherited from the crew)"}`;
export const builtInCrewNotSaved = (name: string): string =>
  `'${name}' is a built-in crew (crews/${name}/), not a saved agent — see its crew.ork.ts.`;
export const noSavedAgentListHint = (name: string): string => `no saved agent '${name}'. /agents list shows what there is.`;
export const withAgentsUsage = (reason: string): string => `${reason}\n${AGENTS_USAGE}`;
export const agentSaved = (name: string, replaced: boolean, path: string): string =>
  `agent '${name}' ${replaced ? "replaced" : "saved"} in ${path}.`;
export const builtInCrewNotRemovable = (name: string): string =>
  `'${name}' is a built-in crew — it is not stored here and cannot be removed with /agents.`;
export const noSavedAgent = (name: string): string => `no saved agent '${name}'.`;
export const agentRemoved = (name: string, path: string): string => `agent '${name}' removed from ${path}.`;

// /config

export const CONFIG_USAGE =
  "usage: /config [list|keys|get <key>|set [--session] <key> <value>|unset [--session] <key>]";
export const configFileLine = (path: string): string => `file: ${path} — session overrides it until /clear.`;
export const unknownStoredKeys = (keys: readonly string[]): string =>
  `⚠ stored but NOT in the key space (pre-B-6 residue, nothing reads them): ${keys.join(", ")}`;
export const nestedKeys = (keys: readonly string[]): string =>
  `⚠ written nested, so nothing reads them: ${keys.join(", ")} — a settings file holds each key flat ` +
  `("${keys[0]}": …).`;
export const configFileMalformed = (path: string): string =>
  `⚠ ${path} could not be parsed — it is left untouched; fix or delete it.`;
export const KEYS_NOTE = "every key names its consumer — a key nothing reads is not settable.";
export const CONFIG_GET_USAGE = "usage: /config get <key>";
export const keyUnset = (key: string, description: string): string => `${key} is unset (${description})`;
export const keyValue = (key: string, value: string, source: string): string => `${key} = ${value}  [${source}]`;
export const sessionValueSet = (key: string, value: string): string =>
  `${key} = ${value} [session] — overrides the file until /clear.`;
export const fileValueSet = (key: string, value: string, path: string): string =>
  `${key} = ${value} [file] — persisted in ${path}.`;
export const userSettingsUnparsed = (path: string): string =>
  ` The user settings (${path}) could not be parsed: none applies.`;
export const valueIgnored = (persisted: string, value: string, reason: string, unread: string): string =>
  `${persisted}\n↳ ignored: '${value}': ${reason}.${unread} A setting of your own goes in ` +
  "the orkeonCode block of the user settings file (the one the launcher reads).";
export const CONFIG_UNSET_USAGE = "usage: /config unset [--session] <key>";
export const noSessionOverride = (key: string): string => `${key} has no session override.`;
export const sessionOverrideRemoved = (key: string): string =>
  `${key} session override removed (the file value applies again).`;
export const keyNotInFile = (key: string, path: string): string => `${key} is not set in ${path}.`;
export const keyRemoved = (key: string, path: string): string => `${key} removed from ${path}.`;

// /mode and /plan

/** What each mode lets a turn do, beside its name in the panel. */
export const MODE_DESCRIPTIONS: Record<PermissionMode, string> = {
  default: "reads run, the rest asks",
  acceptEdits: "reads and file edits run, the rest asks",
  bypassPermissions: "every call runs but what a deny rule refuses",
  plan: "read-only, no edit, network or shell tool",
  dontAsk: "local reads only, nothing asks",
};
export const enteringReadOnly = (mode: string): string =>
  `entering '${mode}': the edit, network and shell tools stripped from the catalogue`;
export const modeApplied = (how: string, mode: string): string =>
  `session default permission mode ${how} '${mode}' ` +
  `(prompts without a "mode:" prefix now run in it; /clear restores 'default').`;
export const MODE_CHOICE = "Permission mode for this session";
export const modeUnchanged = (mode: string): string => `permission mode unchanged: ${mode}.`;
export const MODE_SET_TO = "set to";
export const modeCycled = (from: string): string => `cycled ${from} →`;
export const modeShown = (mode: string, via: string, modes: readonly string[]): string =>
  `session default permission mode: ${mode}\n` +
  `  ↳ ${via}\n` +
  `usage: /mode [<${modes.join("|")}>|show] — bare /mode opens a panel, or cycles without one; ` +
  `an explicit "mode:" prefix on a prompt still wins.`;
export const unknownMode = (mode: string, modes: readonly string[]): string =>
  `unknown mode '${mode}' — expected one of: ${modes.join(", ")}, show.`;
export const PLAN_ON = "plan mode ON — prompts without a \"mode:\" prefix now run read-only. /plan again to leave.";
export const LEAVING_PLAN = "leaving 'plan': session default back to 'default' (asks on writes)";
export const PLAN_OFF =
  "plan mode OFF — the session default is 'default' (asks on writes). " +
  "It is NOT restored to whatever it was before /plan: use /mode to pick another.";

// /model

export const NO_MODEL_REPORTED =
  "not reported by the host — no LLM provider is registered, or the host predates the " +
  "session-metadata fix. Turns will no-op: check that the settings file has an `Llm` section.";
export const declaredCatalogue = (catalogue: string): string => `declared models (* = effective):\n${catalogue}`;
export const modelShown = (
  effective: string, boot: string, override: string, catalogue: string, noCatalogue: string,
): string =>
  `effective model for the next turn: ${effective}\n` +
  `  boot model      : ${boot || NO_MODEL_REPORTED}\n` +
  `  session override: ${override}\n` +
  (catalogue ? `declared models (* = effective):\n${catalogue}\n` : `declared models: ${noCatalogue}\n`) +
  "usage: /model <name> | /model list | /model reset | /model show";
export const overrideNotSent = (model: string): string => `${model} (not sent while llm.profile is set)`;
export const overrideCleared = (boot: string): string => `model override cleared — turns go back to ${boot}.`;
export const OVERRIDE_CLEARED_NO_BOOT = `model override cleared. Boot model: ${NO_MODEL_REPORTED}`;
export const profileWinsOverride = (profile: string, model: string): string =>
  `llm.profile ${profile} is active: the /model override '${model}' is stored but not sent ` +
  "while it is set (unset llm.profile to use it)";
export const modelSetWarned = (model: string, warning: string): string => `model set to '${model}' — ⚠ ${warning}.`;
export const modelSetUndeclared = (model: string, declared: readonly string[]): string =>
  `model set to '${model}' — ⚠ NOT among the models this host declares ` +
  `(${declared.join(", ")}). Applied anyway; see the log. /model list to review.`;
export const modelSet = (model: string): string =>
  `model set to '${model}' — it applies from the next /assistant turn, no relaunch.\n` +
  "It travels over the configured provider, so it must be a model that provider serves; " +
  "/clear (or /model reset) returns to the boot model.";
export const MODEL_CHOICE = "Model for the next turns";
export const MODEL_UNCHANGED = "model unchanged.";
export const profileNamesModel = (profile: string): string =>
  `the one llm.profile ${profile} names (the /model override does not apply)`;
export const NO_EFFECTIVE_MODEL = "(none — see below)";

// /output-style

export const OUTPUT_STYLE_CHOICE = "Answer style for this session";
export const OUTPUT_STYLE_UNCHANGED = "output style unchanged.";
export const outputStyleShown = (style: string, styles: readonly string[]): string =>
  `output style: ${style}\n` +
  `usage: /output-style [<${styles.join("|")}>|show]\n` +
  (style === "default"
    ? "the default adds no block to the prompt — an unconfigured session is byte-identical to before B-7."
    : "the style is injected as a <system-reminder> below the cache boundary, so it never breaks the prefix cache.");
export const unknownStyle = (style: string, styles: readonly string[]): string =>
  `unknown style '${style}' — expected one of: ${styles.join(", ")}, show.`;
export const outputStyleSet = (style: string): string =>
  `output style set to '${style}' — it applies from the next /assistant turn ` +
  "(/clear restores 'default').";

// /skills

export const NO_SKILLS = "no skills attached. usage: /skills attach <workspace path to a .md playbook>";
export const SKILLS_ATTACH_USAGE = "usage: /skills attach <path>";
export const cannotAttach = (path: string): string =>
  `cannot attach '${path}' — the file is not readable in the mounted workspace.`;
export const skillAttached = (path: string, count: number): string =>
  `skill attached: ${path} (${count} attached; /clear clears).`;
export const skillsDetachUsage = (max: number): string => `usage: /skills detach <1-${max}>`;
export const skillDetached = (path: unknown): string => `skill detached: ${path}`;
export const SKILLS_USAGE = "usage: /skills [list|attach <path>|detach <n>|suggest [on|off|why]]";
export const SKILLS_SUGGEST_USAGE = "usage: /skills suggest [on|off|why]";
export const NOTHING_SUGGESTED_YET = "no skill was suggested yet in this session.";
export const suggestStatus = (on: boolean, model: boolean): string =>
  `skills.suggest: ${on ? "on" : "off"}; skills read from .orkeon/skills/*.md and .claude/skills/*/SKILL.md; decision model: ${model ? "present" : "absent, none is suggested"}.`;
export const suggestSet = (on: boolean, model: boolean): string =>
  on
    ? `skills.suggest: on for this session${model ? "" : " (the host has no decision model: none is suggested until it has one)"}; /clear clears it.`
    : "skills.suggest: off for this session; /clear clears it.";
export const noSkillFit = (offered: number): string => `the last turn was offered ${offered} skill(s): none fit its request.`;
export const skillsOffered = (offered: number): string => `suggested to the last turn, among ${offered} skill(s).`;
export const suggestedSkill = (path: string, share: number): string => `${path} (${share.toFixed(2)})`;

// /theme

export const NO_PALETTES = "this console has no palettes.";
export const unknownTheme = (theme: string, themes: readonly string[]): string =>
  `unknown theme '${theme}' — expected one of: ${themes.join(", ")}, show.`;
export const THEME_CHOICE = "Console palette for this session";
export const themeUnchanged = (theme: string): string => `theme unchanged: ${theme}.`;
export const themeShown = (theme: string, themes: readonly string[]): string =>
  `theme: ${theme}\nusage: /theme [<${themes.join("|")}>|show]`;
export const themeSet = (theme: string): string =>
  `theme set to '${theme}' for this session (the setting Orkeon:Cli:Tui:Theme is the start palette).`;

// /fast and /proactive

export const fastNote = (blocks: readonly string[]): string =>
  `while on, /assistant turns omit the ${blocks.join(" and ")} blocks`;
export const PROACTIVE_NOTE = "while on, /assistant answers end with up to three suggested next steps";

// /route
export const ROUTE_USAGE = "usage: /route [on|off|why]";
export const NOTHING_ROUTED_YET = "nothing routed yet in this session.";
export const routeStatus = (on: boolean, ladder: string, model: boolean): string =>
  `route.agents: ${on ? "on" : "off"}; ladder: ${ladder} (cheapest first); decision model: ${model ? "present" : "absent, nothing is routed"}.`;
export const routeSet = (on: boolean, model: boolean): string =>
  on
    ? `route.agents: on for this session${model ? "" : " (the host has no decision model: nothing is routed until it has one)"}; /clear clears it.`
    : "route.agents: off for this session; /clear clears it.";
/** Under the status: what a rung's model takes, or what the stored effort becomes on it. */
export const rungLine = (rung: string, what: string): string => `  ${rung}: ${what}`;
export const routedRecord = (crew: string, profile: string, why: string): string => `${crew} on '${profile}': ${why}`;
