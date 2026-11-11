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
import {
  EXTRA_TOOLS_CONFIG_KEY, extraToolsProblem, formatExtraTool, parseExtraTools,
} from "./agent-policy/extra-tools.ts";
import { sameToolName } from "./agent-policy/permission.ts";
import { VOICE_REPLY_CONFIG_KEY } from "./speech.ts";
import { ANSWER_LANGUAGE_CONFIG_KEY } from "./agent-policy/output-styles.ts";
import { COMPACTION_TRIGGER_CONFIG_KEY, compactionTriggerProblem } from "./compaction-thresholds.ts";
import { PRUNE_CONFIG_KEY } from "./context-prune.ts";
import { ROUTE_AGENTS_CONFIG_KEY, ROUTE_LADDER_CONFIG_KEY, ladderProblem } from "./agents/model-route.ts";
import { DEV_WORK_DIR_CONFIG_KEY, workFolderProblem } from "./dev/work-folder.ts";
import { DEV_PR_AUTO_CONFIG_KEY } from "./git/close.ts";
import { LLM_PROFILE_CONFIG_KEY, llmProfileProblem } from "./llm-profile.ts";
import {
  MEMORY_AUTO_ADMIT_CONFIG_KEY, MEMORY_DIR_CONFIG_KEY, MEMORY_PROJECT_CONFIG_KEY, memoryDirProblem, memoryProjectProblem,
} from "./shared-memory/layout.ts";
import {
  PATHS_ALLOW_CONFIG_KEY, PATHS_DENY_CONFIG_KEY, narrowAllowValue, pathListProblem,
} from "./agent-policy/path-rules.ts";
import {
  ADVISOR_MODEL_DOC, ANSWER_LANGUAGE_DOC, AUTO_ADMIT_FROM_USER, COMMIT_REQUIRE_CONFIRM_DOC, COMPACTION_TRIGGER_DOC,
  DEV_PR_AUTO_DOC, DEV_WORK_DIR_DOC, EXTRA_TOOLS_DOC, EXTRA_TOOLS_NOT_ALLOWED, invalidValue, LLM_PROFILE_DOC,
  MEMORY_AUTO_ADMIT_DOC, MEMORY_DIR_DOC, MEMORY_PROJECT_DOC, needsAValue, notAllowedValue, PATHS_ALLOW_DOC,
  PATHS_ALLOW_OUTSIDE_USER, PATHS_DENY_DOC, PERMISSION_FALLBACK_DOC, PR_AUTO_FROM_USER, PRUNE_DOC, PROJECT_FALLBACK_TOO_WIDE,
  REVIEW_LENSES_DOC, ROUTE_AGENTS_DOC, ROUTE_LADDER_DOC, SPINNER_VERBS_DOC, unknownConfigKey, VOICE_REPLY_DOC, widerThanUserFallback,
} from "./messages.ts";

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
    ...PERMISSION_FALLBACK_DOC,
    allowed: PERMISSION_MODES,
  },
  {
    key: "review.lenses",
    ...REVIEW_LENSES_DOC,
  },
  {
    key: "advisor.model",
    ...ADVISOR_MODEL_DOC,
  },
  {
    key: LLM_PROFILE_CONFIG_KEY,
    ...LLM_PROFILE_DOC,
    problem: llmProfileProblem,
  },
  {
    key: "commit.requireConfirm",
    ...COMMIT_REQUIRE_CONFIRM_DOC,
    allowed: ["true", "false"],
  },
  {
    key: "spinnerVerbs",
    ...SPINNER_VERBS_DOC,
  },
  {
    key: EXTRA_TOOLS_CONFIG_KEY,
    ...EXTRA_TOOLS_DOC,
    problem: extraToolsProblem,
  },
  {
    key: VOICE_REPLY_CONFIG_KEY,
    ...VOICE_REPLY_DOC,
    allowed: ["on", "off"],
  },
  {
    key: ANSWER_LANGUAGE_CONFIG_KEY,
    ...ANSWER_LANGUAGE_DOC,
  },
  {
    key: COMPACTION_TRIGGER_CONFIG_KEY,
    ...COMPACTION_TRIGGER_DOC,
    problem: compactionTriggerProblem,
  },
  {
    key: PRUNE_CONFIG_KEY,
    ...PRUNE_DOC,
    allowed: ["on", "off"],
  },
  {
    key: ROUTE_AGENTS_CONFIG_KEY,
    ...ROUTE_AGENTS_DOC,
    allowed: ["on", "off"],
  },
  {
    key: ROUTE_LADDER_CONFIG_KEY,
    ...ROUTE_LADDER_DOC,
    problem: ladderProblem,
  },
  {
    key: DEV_WORK_DIR_CONFIG_KEY,
    ...DEV_WORK_DIR_DOC,
    problem: workFolderProblem,
  },
  {
    key: DEV_PR_AUTO_CONFIG_KEY,
    ...DEV_PR_AUTO_DOC,
    allowed: ["true", "false"],
  },
  {
    key: MEMORY_DIR_CONFIG_KEY,
    ...MEMORY_DIR_DOC,
    problem: memoryDirProblem,
  },
  {
    key: MEMORY_PROJECT_CONFIG_KEY,
    ...MEMORY_PROJECT_DOC,
    problem: memoryProjectProblem,
  },
  {
    key: MEMORY_AUTO_ADMIT_CONFIG_KEY,
    ...MEMORY_AUTO_ADMIT_DOC,
    allowed: ["true", "false"],
  },
  {
    key: PATHS_DENY_CONFIG_KEY,
    ...PATHS_DENY_DOC,
    problem: pathListProblem,
  },
  {
    key: PATHS_ALLOW_CONFIG_KEY,
    ...PATHS_ALLOW_DOC,
    problem: pathListProblem,
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
    return ignore(PROJECT_FALLBACK_TOO_WIDE);
  }
  if (user !== undefined && modeWidth(project) > modeWidth(user)) {
    return ignore(widerThanUserFallback(user));
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
      ? { ignored: { value: dropped.join(", "), reason: EXTRA_TOOLS_NOT_ALLOWED } }
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
    ignored: { value: project, reason: AUTO_ADMIT_FROM_USER },
  };
}

/** The project's dev.prAuto: 'true' opens a pull request without asking, so it applies only when the user's says 'true'. */
function narrowPrAuto(project: string, user: string | undefined): Narrowed {
  if (project !== "true" || user === "true") return { value: project, fallThrough: false };
  return {
    value: undefined, fallThrough: true,
    ignored: { value: project, reason: PR_AUTO_FROM_USER },
  };
}

/** The project's paths.deny adds to the user's: both apply, the effective value is the two lists. */
function narrowPathDeny(project: string, user: string | undefined): Narrowed {
  return { value: user === undefined ? project : `${user}, ${project}`, fallThrough: false };
}

/** The project's paths.allow: its entries within the user's list, the others set aside (narrowAllowValue); none kept,
 *  the user's list applies. */
function narrowPathAllow(project: string, user: string | undefined): Narrowed {
  const { kept, dropped } = narrowAllowValue(project, user);
  return {
    value: kept.length > 0 ? kept.join(", ") : undefined,
    fallThrough: kept.length === 0,
    ...(dropped.length > 0
      ? { ignored: { value: dropped.join(", "), reason: PATHS_ALLOW_OUTSIDE_USER } }
      : {}),
  };
}

/** The project value as it applies over the user's: narrowed for the keys that widen, added for paths.deny. */
function narrowProject(key: string, project: string, user: string | undefined): Narrowed {
  if (key === PATHS_DENY_CONFIG_KEY) return narrowPathDeny(project, user);
  if (key === PATHS_ALLOW_CONFIG_KEY) return narrowPathAllow(project, user);
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
      reason: unknownConfigKey(String(key ?? ""), knownConfigKeys()),
    };
  }
  const v = String(value ?? "").trim();
  if (v.length === 0) return { ok: false, reason: needsAValue(spec.key) };
  if (spec.allowed && !spec.allowed.includes(v)) {
    return {
      ok: false,
      reason: notAllowedValue(v, spec.key, spec.allowed),
    };
  }
  const problem = spec.problem?.(v);
  if (problem !== undefined) return { ok: false, reason: invalidValue(v, spec.key, problem) };
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
 * `memory.autoAdmitAudited` 'true' only when the user settings say 'true', its `paths.allow`
 * only within the user's list; its `paths.deny` adds to the user's. What it loses is returned
 * as `ignored`. The user map is a required argument: a caller that forgets
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
