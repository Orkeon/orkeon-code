// Pure /config key space and layering — no IO.
//
// B-6: the original's `/config` operates over a VALIDATED key space with
// settings-file persistence (baseline 04 §/config). Exp07's was a free-form
// session map: any key was accepted, nothing survived `/clear`, and a
// typo'd key was indistinguishable from a real one — it was simply stored and
// never read by anything.
//
// A typo mattering silently is not hypothetical here: B-2 introduced
// `permissions.fallback`, whose whole job is to loosen or tighten the session's
// permission posture. `/config set permissions.fallbck bypassPermissions` used to
// report success and change nothing.

import { PERMISSION_FALLBACK_CONFIG_KEY, PERMISSION_MODES } from "./permission-modes.ts";
import { EXTRA_TOOLS_CONFIG_KEY, extraToolsProblem, formatExtraTool, parseExtraTools } from "./agent-policy/extra-tools.ts";
import { sameToolName } from "./agent-policy/permission.ts";
import { VOICE_REPLY_CONFIG_KEY } from "./speech.ts";
import { ANSWER_LANGUAGE_CONFIG_KEY } from "./agent-policy/output-styles.ts";
import { COMPACTION_TRIGGER_CONFIG_KEY, compactionTriggerProblem } from "./compaction-thresholds.ts";
import { DEV_WORK_DIR_CONFIG_KEY, workFolderProblem } from "./dev/work-folder.ts";
import { DEV_PR_AUTO_CONFIG_KEY } from "./git/close.ts";
import { LLM_PROFILE_CONFIG_KEY, llmProfileProblem } from "./llm-profile.ts";
import {
  MEMORY_AUTO_ADMIT_CONFIG_KEY, MEMORY_DIR_CONFIG_KEY, MEMORY_PROJECT_CONFIG_KEY, memoryDirProblem, memoryProjectProblem,
} from "./shared-memory/layout.ts";

export interface ConfigKeySpec {
  key: string;
  description: string;
  /** Allowed values; omitted = any non-empty string. */
  allowed?: readonly string[];
  /** Why a value is refused, for a key whose values have a notation; undefined = valid. */
  problem?: (value: string) => string | undefined;
  /** Who reads the value, as the user meets it — the commands, and the crew when
   *  one reads it — so `/config keys` can say what a setting changes. */
  consumedBy: string;
}

/**
 * The declared key space. Adding a key here is what makes it settable — and the
 * point is that the list is short and every entry names its consumer. A key
 * nothing reads is a key that should not be settable.
 */
export const CONFIG_KEYS: readonly ConfigKeySpec[] = [
  {
    key: PERMISSION_FALLBACK_CONFIG_KEY,
    description:
      "Permission mode for a session where neither /mode nor a 'mode:' prefix set one. " +
      "Omitted = 'default' (asks on writes, like the original).",
    allowed: PERMISSION_MODES,
    consumedBy: "/assistant (main-loop crew), /commit, /mode, /permissions",
  },
  {
    key: "review.lenses",
    description:
      "Comma-separated review lenses for /review (correctness, security, style). " +
      "Omitted = all three.",
    consumedBy: "/review (code-review crew)",
  },
  {
    key: "advisor.model",
    description:
      "Model used for the secondary opinion of /advisor. Omitted = the session's own " +
      "model, which makes the review a self-review and worth far less.",
    consumedBy: "/advisor (advisor crew)",
  },
  {
    key: LLM_PROFILE_CONFIG_KEY,
    description:
      "The host profile the agents of every crew run on: an LLM profile (Llm:Profiles:<name>) or a decision " +
      "profile (Orkeon:Decision:Profiles:<name>, a decision model such as Jev in front of one), e.g. 'guarded'. " +
      "A name the host does not declare fails the launch, listing the profiles it knows. Omitted = the host's " +
      "default model.",
    problem: llmProfileProblem,
    consumedBy: "/assistant, /review, /commit, /advisor, /memory admit, the dev steps and every other command that launches a crew (the model its agents run on)",
  },
  {
    key: "commit.requireConfirm",
    description:
      "'false' lets /commit launch without a confirmation prompt. Omitted = 'true' " +
      "(a confirmation is required; see B-1).",
    allowed: ["true", "false"],
    consumedBy: "/commit",
  },
  {
    key: "spinnerVerbs",
    description:
      "Comma-separated verbs the TUI status line rotates through while a turn runs " +
      "(tweakcc vocabulary: 'thinking verbs'), e.g. 'Reticulating, Percolating'. " +
      "Omitted = the built-in Orkeon gerunds.",
    consumedBy: "the orkeon-repl TUI status line (read by the host)",
  },
  {
    key: EXTRA_TOOLS_CONFIG_KEY,
    description:
      "Tools of an MCP server or a plugin the assistant may use, e.g. 'transcribe_audio:read, " +
      "search_issues': each <name>[:read|:write], write when the class is left out, so plan " +
      "and dontAsk offer only the read ones. A name the host does not register is left out " +
      "with a warning. Omitted = none.",
    problem: extraToolsProblem,
    consumedBy: "/assistant and /summary (the tools offered), /permissions (rules may name them)",
  },
  {
    key: VOICE_REPLY_CONFIG_KEY,
    description:
      "'on' reads every answer of the assistant aloud, through the speech MCP server's speak " +
      "(the launcher's ORKEON_CODE_VOICE=1 opens the speaker); code blocks and tables are not read. " +
      "Omitted = 'off'.",
    allowed: ["on", "off"],
    consumedBy: "/assistant, /summary, /transcribe --then, /voice send and /voice --go (each answer read aloud)",
  },
  {
    key: ANSWER_LANGUAGE_CONFIG_KEY,
    description:
      "The language the assistant answers in, e.g. 'French', unless the user writes in another one. " +
      "Omitted = the language of each request.",
    consumedBy: "/assistant, /summary, /transcribe --then, /voice send and /voice --go (the main loop's prompt)",
  },
  {
    key: COMPACTION_TRIGGER_CONFIG_KEY,
    description:
      "The token count at which the automatic compaction runs, e.g. '90000' or '90k'. Omitted = the " +
      "context window minus the room one turn needs.",
    problem: compactionTriggerProblem,
    consumedBy: "/assistant (the automatic compaction at the head and the tail of a turn), /usage",
  },
  {
    key: DEV_WORK_DIR_CONFIG_KEY,
    description:
      "The work folder of the dev workflow, relative to the checkout, e.g. 'backstage/tasks'. Omitted = the " +
      "repository pack's layout.work, else 'workbench'. A folder absent from the checkout falls back to 'workbench'.",
    problem: workFolderProblem,
    consumedBy: "/dev-status (the work folder it reads), /commit (the work folder it leaves out)",
  },
  {
    key: DEV_PR_AUTO_CONFIG_KEY,
    description:
      "'true' asks /commit to open the pull request of a pushed branch, as --pr does: through the github tool when " +
      "it is registered and the permission gate lets it, else the gh pr create command is printed. Omitted = 'false': " +
      "the command is printed. Set in the user settings; a project file may only narrow it to 'false'.",
    allowed: ["true", "false"],
    consumedBy: "/commit (the pull request of the branch)",
  },
  {
    key: MEMORY_DIR_CONFIG_KEY,
    description:
      "The folder of the shared memory, relative to the project: its candidates, admitted entries and refused " +
      "topics. Omitted = '.orkeon/memory'. Never the agent memory's '.orkeon/agent-memory'.",
    problem: memoryDirProblem,
    consumedBy: "/memory-admit, /assistant (the memory_recall and memory_push tools)",
  },
  {
    key: MEMORY_PROJECT_CONFIG_KEY,
    description:
      "The project name the shared memory's entries carry and its index is named after (memory-<project>), " +
      "e.g. 'orkeon-code'. Omitted = the name of the origin remote, else 'local'.",
    problem: memoryProjectProblem,
    consumedBy: "/memory-admit, /assistant (the memory_recall and memory_push tools)",
  },
  {
    key: MEMORY_AUTO_ADMIT_CONFIG_KEY,
    description:
      "'true' lets /memory-admit admit a candidate an audit verdict backs without asking. Omitted = 'false': " +
      "every candidate is confirmed. A project file may set it to 'true' only when the user settings do.",
    allowed: ["true", "false"],
    consumedBy: "/memory-admit",
  },
];

/** Where an effective value came from: the session bag, the project's settings file
 *  (`file`), the user settings the launcher mounts read-only (`user`), or nowhere. */
export type ConfigSource = "session" | "file" | "user" | "unset";

export interface ConfigResolution {
  key: string;
  value: string | undefined;
  source: ConfigSource;
  /** The project file's value, or the part of it, set aside because a project file
   *  widens nothing (QL-06), and why. */
  ignored?: { value: string; reason: string };
}

/** The modes a project file may set as the fallback; a wider one comes from the user. */
export const PROJECT_FALLBACK_MODES: readonly string[] = ["default", "plan", "acceptEdits"];

/** What a project value leaves in force once narrowed: the value that applies (undefined
 *  = none, the user's then applies only when `fallThrough`), and what was set aside. */
interface Narrowed {
  value: string | undefined;
  fallThrough: boolean;
  ignored?: { value: string; reason: string };
}

/** How far a fallback mode lets a session act without asking: the read-only modes
 *  first. A mode that is not one ranks as `default`, which it resolves to. */
const MODE_WIDTH: Readonly<Record<string, number>> = {
  plan: 0, dontAsk: 0, default: 1, acceptEdits: 2, bypassPermissions: 3,
};
const modeWidth = (mode: string): number => MODE_WIDTH[mode] ?? MODE_WIDTH.default;

/** The project's fallback: one of PROJECT_FALLBACK_MODES, and never wider than the
 *  mode the user settings set (with none, QL-06 lets it set acceptEdits). */
function narrowFallback(project: string, user: string | undefined): Narrowed {
  const ignore = (reason: string): Narrowed => ({ value: undefined, fallThrough: true, ignored: { value: project, reason } });
  if (!PROJECT_FALLBACK_MODES.includes(project)) {
    return ignore("a project file may set only default, plan or acceptEdits; another mode comes from the " +
      "user settings (orkeonCode) or /mode");
  }
  if (user !== undefined && modeWidth(project) > modeWidth(user)) {
    return ignore(`it is wider than the user settings' '${user}' (orkeonCode); a project file may only narrow it`);
  }
  return { value: project, fallThrough: false };
}

const ALL_TOOLS = "*";

/** The entries of a `tools.extra` value, `*` apart. */
function userToolEntries(user: string | undefined): { all: boolean; rest: string[] } {
  const entries = String(user ?? "").split(/[\s,]+/).filter((e) => e.length > 0);
  return { all: entries.includes(ALL_TOOLS), rest: entries.filter((e) => e !== ALL_TOOLS) };
}

/** The project's extra tools the user lists too (or every one, under `*`), each `read`
 *  only when both lists say `read` — a read tool is the wider grant, offered in plan and
 *  dontAsk too — and `write` under `*`, which grants the tools, not their class; the
 *  others set aside. An entry that does not parse stays, as written, for the reader to
 *  warn about, unless it names a tool the project lists in a valid entry: a second
 *  entry of a dropped tool would parse once its twin is gone. Never the user's list in
 *  place of the project's: narrowing a list never widens it. */
function narrowExtraTools(project: string, user: string | undefined): Narrowed {
  const { all, rest } = userToolEntries(user);
  const allowed = parseExtraTools(rest).tools;
  const { tools, invalid } = parseExtraTools(project);
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const tool of tools) {
    const listed = allowed.find((t) => sameToolName(t.name, tool.name));
    if (listed === undefined && !all) {
      dropped.push(formatExtraTool(tool));
      continue;
    }
    const read = listed?.access === "read" && tool.access === "read";
    kept.push(formatExtraTool({ name: tool.name, access: read ? "read" : "write" }));
  }
  // `evil:write, evil:read`: the read twin is invalid only while the write one stands.
  const named = (entry: string): boolean => tools.some((t) => sameToolName(t.name, entry.split(":", 1)[0]));
  const value = [...kept, ...invalid.filter((entry) => !named(entry))];
  return {
    value: value.length > 0 ? value.join(", ") : undefined,
    fallThrough: false,
    ...(dropped.length > 0
      ? { ignored: { value: dropped.join(", "), reason: "the user settings do not allow (orkeonCode tools.extra, or *)" } }
      : {}),
  };
}

/** The user's value as it applies: `tools.extra` without its `*`, which grants, names no tool. */
function userValue(key: string, user: string): string | undefined {
  if (key !== EXTRA_TOOLS_CONFIG_KEY) return user;
  const { rest } = userToolEntries(user);
  return rest.length > 0 ? rest.join(", ") : undefined;
}

/** The project's memory.autoAdmitAudited: 'true' asks nothing, so it applies only when the user's says 'true'. */
function narrowAutoAdmit(project: string, user: string | undefined): Narrowed {
  if (project !== "true" || user === "true") return { value: project, fallThrough: false };
  return {
    value: undefined, fallThrough: true,
    ignored: { value: project, reason: "admitting without asking comes from the user settings (orkeonCode); a project file may only narrow it" },
  };
}

/** The project's dev.prAuto: 'true' opens a pull request without asking, so it applies only when the user's says 'true'. */
function narrowPrAuto(project: string, user: string | undefined): Narrowed {
  if (project !== "true" || user === "true") return { value: project, fallThrough: false };
  return {
    value: undefined, fallThrough: true,
    ignored: { value: project, reason: "opening a pull request without asking comes from the user settings (orkeonCode); a project file may only narrow it" },
  };
}

/** The project value as it applies over the user's: narrowed for the keys that widen. */
function narrowProject(key: string, project: string, user: string | undefined): Narrowed {
  if (key === DEV_PR_AUTO_CONFIG_KEY) return narrowPrAuto(project, user);
  if (key === PERMISSION_FALLBACK_CONFIG_KEY) return narrowFallback(project, user);
  if (key === EXTRA_TOOLS_CONFIG_KEY) return narrowExtraTools(project, user);
  if (key === MEMORY_AUTO_ADMIT_CONFIG_KEY) return narrowAutoAdmit(project, user);
  return { value: project, fallThrough: false };
}

export function configKeySpec(key: unknown): ConfigKeySpec | undefined {
  const k = String(key ?? "").trim();
  return CONFIG_KEYS.find((s) => s.key === k);
}

export function isKnownConfigKey(key: unknown): boolean {
  return configKeySpec(key) !== undefined;
}

/** The valid-key list, for the rejection message (acceptance 1). */
export function knownConfigKeys(): string[] {
  return CONFIG_KEYS.map((s) => s.key);
}

export interface ValueVerdict {
  ok: boolean;
  /** Why not, naming the allowed values when the key constrains them. */
  reason: string;
}

/**
 * Validates a value against its key's spec.
 *
 * An unknown KEY is rejected with the whole list, because the useful reply to a
 * typo is the nearby correct spelling. An invalid VALUE is rejected with that
 * key's allowed set, for the same reason.
 */
export function validateConfigEntry(key: unknown, value: unknown): ValueVerdict {
  const spec = configKeySpec(key);
  if (!spec) {
    return {
      ok: false,
      reason: `unknown config key '${String(key ?? "")}'. Valid keys: ${knownConfigKeys().join(", ")}`,
    };
  }
  const v = String(value ?? "").trim();
  if (v.length === 0) return { ok: false, reason: `'${spec.key}' needs a value.` };
  if (spec.allowed && !spec.allowed.includes(v)) {
    return {
      ok: false,
      reason: `'${v}' is not valid for '${spec.key}'. Allowed: ${spec.allowed.join(", ")}`,
    };
  }
  const problem = spec.problem?.(v);
  if (problem !== undefined) return { ok: false, reason: `'${v}' is not valid for '${spec.key}': ${problem}` };
  return { ok: true, reason: "" };
}

/**
 * Layers the session map over the project file's map over the user settings' map, key
 * by key.
 *
 * The session wins where it is set: a `/config set --session` is a deliberate,
 * temporary override of a persisted setting, and `/clear` drops it back to
 * the file value. The project file comes next, but widens nothing (QL-06): its
 * `permissions.fallback` applies only as default, plan or acceptEdits, its
 * `tools.extra` only for the tools the user settings list, its `dev.prAuto` and
 * `memory.autoAdmitAudited` 'true' only when the user settings say 'true'; what it
 * loses is returned as `ignored`. The user map is a required argument: a caller that forgets
 * it must not read a project value unnarrowed. Unknown keys present in any map are
 * NOT returned — they can only be residue from before the schema existed, and
 * surfacing them as effective settings would suggest something reads them.
 */
export function layerConfig(
  fileMap: Record<string, unknown> | null | undefined,
  sessionMap: Record<string, unknown> | null | undefined,
  userMap: Record<string, unknown> | null | undefined,
): ConfigResolution[] {
  return CONFIG_KEYS.map((spec): ConfigResolution => {
    const s = stringValue(sessionMap?.[spec.key]);
    if (s !== undefined) return { key: spec.key, value: s, source: "session" };
    const rawUser = stringValue(userMap?.[spec.key]);
    const user = rawUser === undefined ? undefined : userValue(spec.key, rawUser);
    const fromUser: ConfigResolution = user === undefined
      ? { key: spec.key, value: undefined, source: "unset" }
      : { key: spec.key, value: user, source: "user" };
    const f = stringValue(fileMap?.[spec.key]);
    if (f === undefined) return fromUser;
    const narrowed = narrowProject(spec.key, f, rawUser);
    const ignored = narrowed.ignored === undefined ? {} : { ignored: narrowed.ignored };
    if (narrowed.value !== undefined) return { key: spec.key, value: narrowed.value, source: "file", ...ignored };
    if (narrowed.fallThrough) return { ...fromUser, ...ignored };
    return { key: spec.key, value: undefined, source: "unset", ...ignored };
  });
}

/** A map's value as a setting: a non-blank string, trimmed. */
function stringValue(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}

/** The effective value of one key, or undefined when unset in every layer. */
export function resolveConfigEntry(
  key: string,
  fileMap: Record<string, unknown> | null | undefined,
  sessionMap: Record<string, unknown> | null | undefined,
  userMap: Record<string, unknown> | null | undefined,
): ConfigResolution {
  return layerConfig(fileMap, sessionMap, userMap).find((r) => r.key === key)
    ?? { key, value: undefined, source: "unset" };
}

/**
 * Keys present in a stored map that the schema does not know.
 *
 * Reported rather than deleted: they are someone's data, written when any key was
 * accepted, and silently dropping them on the next write is how a free-form map
 * becomes a schema with data loss in between.
 */
export function unknownStoredKeys(map: Record<string, unknown> | null | undefined): string[] {
  return Object.keys(map ?? {}).filter((k) => !isKnownConfigKey(k)).sort();
}

/**
 * Known keys a stored map holds nested (`{"permissions": {"fallback": "plan"}}`) instead
 * of flat (`{"permissions.fallback": "plan"}`): nothing reads them, so they are named
 * with the flat spelling a hand-written file needs.
 */
export function nestedConfigKeys(map: Record<string, unknown> | null | undefined): string[] {
  const found: string[] = [];
  const walk = (prefix: string, value: unknown): void => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = `${prefix}.${k}`;
      if (isKnownConfigKey(key)) found.push(key);
      else walk(key, v);
    }
  };
  for (const [k, v] of Object.entries(map ?? {})) if (!isKnownConfigKey(k)) walk(k, v);
  return found.sort();
}
