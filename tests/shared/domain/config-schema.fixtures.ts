// Stored maps, values and expected resolutions for the /config key space tests.

/** A layer of the configuration: the project file, the session bag or the user settings. */
export type Layer = Record<string, unknown>;

/** Each key and its consumers, as `/config list` prints them under "read by". */
export const CONSUMERS: Record<string, string> = {
  "permissions.fallback": "/assistant (main-loop crew), /commit, /mode, /permissions",
  "review.lenses": "/review (code-review crew)",
  "advisor.model": "/advisor (advisor crew)",
  "commit.requireConfirm": "/commit",
  spinnerVerbs: "the orkeon-repl TUI status line (read by the host)",
  "tools.extra": "/assistant and /summary (the tools offered), /permissions (rules may name them)",
  "voice.reply": "/assistant, /summary, /transcribe --then, /voice send and /voice --go (each answer read aloud)",
  "answer.language": "/assistant, /summary, /transcribe --then, /voice send and /voice --go (the main loop's prompt)",
  "compaction.trigger": "/assistant (the automatic compaction at the head and the tail of a turn), /usage",
  "dev.workDir": "/dev-status (the work folder it reads), /commit (the work folder it leaves out)",
  "dev.prAuto": "/commit (the pull request of the branch)",
  "memory.dir": "/memory-admit, /assistant (the memory_recall and memory_push tools)",
  "memory.project": "/memory-admit, /assistant (the memory_recall and memory_push tools)",
  "memory.autoAdmitAudited": "/memory-admit",
};

/** Blank values: never stored as a setting. */
export const BLANK_VALUES: readonly string[] = ["", "   "];

/** Values of tools.extra in its notation. */
export const VALID_TOOLS_EXTRA: readonly string[] = ["transcribe_audio:read, search_issues", "search-issues:write"];

/** The refusal of a tools.extra value naming a bad class, a built-in tool and a tool twice. */
export const TOOLS_EXTRA_REFUSAL = "'a:read, b:exec, file_write:read, a' is not valid for 'tools.extra': each entry is " +
  "<name>[:read|:write], a tool that is not built in, named once; not: b:exec, file_write:read, a";

/** Stored values that are no string. */
export const NON_STRING_VALUES: readonly unknown[] = [42, true, {}, [], null];

/** Maps holding no unknown key. */
export const CLEAN_MAPS: readonly { readonly name: string; readonly map: Layer | null }[] = [
  { name: "a map of known keys", map: { "permissions.fallback": "plan" } },
  { name: "no map", map: null },
];

/** A map writing two known keys nested, and one unknown. */
export const NESTED_MAP: Layer = {
  permissions: { fallback: "bypassPermissions" },
  tools: { extra: "search_issues" },
  legacy: { thing: "x" },
};

/** Maps holding no nested known key. */
export const NOT_NESTED_MAPS: readonly { readonly name: string; readonly map: Layer | null }[] = [
  { name: "a flat map with a scalar residue", map: { "permissions.fallback": "plan", legacy: "x" } },
  { name: "no map", map: null },
];

/** The modes a project file may set. */
export const PROJECT_MODES: readonly string[] = ["default", "plan", "acceptEdits"];

/** Modes wider than a project may set, and a value that is none. */
export const WIDER_PROJECT_MODES: readonly string[] = ["bypassPermissions", "dontAsk", "nonsense"];

export interface LayeredCase {
  readonly name: string;
  readonly file: Layer;
  readonly user: Layer;
  readonly session?: Layer;
  readonly value: string | undefined;
}

/** A project's fallback against the user's: the narrower wins, an unknown user value stays the user's. */
export const FALLBACK_AGAINST_USER: readonly LayeredCase[] = [
  { name: "keeps the user's dontAsk over a project's default", file: { "permissions.fallback": "default" }, user: { "permissions.fallback": "dontAsk" }, value: "dontAsk" },
  { name: "takes a project's plan over the user's default", file: { "permissions.fallback": "plan" }, user: { "permissions.fallback": "default" }, value: "plan" },
  { name: "takes a project's acceptEdits when the user sets none", file: { "permissions.fallback": "acceptEdits" }, user: {}, value: "acceptEdits" },
  { name: "keeps the user's value it cannot rank over a project's acceptEdits", file: { "permissions.fallback": "acceptEdits" }, user: { "permissions.fallback": "typo" }, value: "typo" },
];

/** A tool kept read only when both lists say read. */
export const READ_ONLY_TOOLS: readonly LayeredCase[] = [
  { name: "makes a tool the project leaves unclassed write, though the user says read", file: { "tools.extra": "a" }, user: { "tools.extra": "a:read" }, value: "a:write" },
  { name: "makes a tool write when the user says write", file: { "tools.extra": "a:read" }, user: { "tools.extra": "a:write" }, value: "a:write" },
  { name: "keeps a tool read when both lists say read", file: { "tools.extra": "a:read" }, user: { "tools.extra": "a:read" }, value: "a:read" },
];

/** Tools listed twice by the project: once one entry is dropped, so is its twin. */
export const TWIN_ENTRIES: readonly LayeredCase[] = [
  {
    name: "drops both entries of a tool spelt in two cases the user does not list",
    file: { "tools.extra": "evil_tool:write, Evil_Tool:read" },
    user: { "tools.extra": "other:read" },
    value: undefined,
  },
  { name: "keeps a twin the user lists, as write", file: { "tools.extra": "a:write, a:read" }, user: { "tools.extra": "a:read" }, value: "a:write" },
  {
    name: "keeps a built-in tool's entry beside a listed tool",
    file: { "tools.extra": "a, file_read:read" },
    user: { "tools.extra": "a" },
    value: "a:write, file_read:read",
  },
];

/** memory.* keys the schema does not declare. */
export const UNDECLARED_MEMORY_KEYS: readonly string[] = ["memory.typo", "memory.Dir", "memory.autoAdmit", "memory"];

/** Relative folders inside the project, outside the agent memory's. */
export const VALID_MEMORY_DIRS: readonly string[] = [".orkeon/memory", "docs/memory", "./.orkeon/shared/"];

/** Folders memory.dir refuses, and what the refusal says. */
export const REFUSED_MEMORY_DIRS: readonly { readonly dir: string; readonly why: string }[] = [
  { dir: "/shared-memory", why: "an absolute path" },
  { dir: "../other/memory", why: "'..'" },
  { dir: ".claude/memory", why: "under .claude/ or .git/" },
  { dir: ".git/memory", why: "under .claude/ or .git/" },
  { dir: ".orkeon/agent-memory", why: "agent memory" },
  { dir: ".orkeon/agent-memory/x", why: "agent memory" },
  { dir: ".orkeon", why: "agent memory" },
  { dir: "./", why: "an empty folder" },
];

/** Values of memory.project and memory.autoAdmitAudited, and whether each is taken. */
export const MEMORY_VALUES: readonly { readonly key: string; readonly value: string; readonly ok: boolean }[] = [
  { key: "memory.project", value: "orkeon-code", ok: true },
  { key: "memory.project", value: "Orkeon Code", ok: false },
  { key: "memory.project", value: "orkeon_code", ok: false },
  { key: "memory.project", value: "-x", ok: false },
  { key: "memory.autoAdmitAudited", value: "true", ok: true },
  { key: "memory.autoAdmitAudited", value: "yes", ok: false },
];

/** Keys a project file sets true only when the user settings do (QL-06). */
export const USER_GATED_KEYS: readonly string[] = ["dev.prAuto", "memory.autoAdmitAudited"];
