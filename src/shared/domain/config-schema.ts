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
import { EXTRA_TOOLS_CONFIG_KEY, extraToolsProblem } from "./agent-policy/extra-tools.ts";
import { VOICE_REPLY_CONFIG_KEY } from "./speech.ts";
import { ANSWER_LANGUAGE_CONFIG_KEY } from "./agent-policy/output-styles.ts";
import { COMPACTION_TRIGGER_CONFIG_KEY, compactionTriggerProblem } from "./compaction-thresholds.ts";

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
];

/** Where an effective value came from. */
export type ConfigSource = "session" | "file" | "unset";

export interface ConfigResolution {
  key: string;
  value: string | undefined;
  source: ConfigSource;
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
 * Layers the session map over the file map, key by key.
 *
 * The session wins where it is set: a `/config set --session` is a deliberate,
 * temporary override of a persisted setting, and `/clear` drops it back to
 * the file value. Unknown keys present in either map are NOT returned — they can
 * only be residue from before the schema existed, and surfacing them as effective
 * settings would suggest something reads them.
 */
export function layerConfig(
  fileMap: Record<string, unknown> | null | undefined,
  sessionMap: Record<string, unknown> | null | undefined,
): ConfigResolution[] {
  return CONFIG_KEYS.map((spec) => {
    const s = sessionMap?.[spec.key];
    if (typeof s === "string" && s.trim().length > 0) {
      return { key: spec.key, value: s.trim(), source: "session" as const };
    }
    const f = fileMap?.[spec.key];
    if (typeof f === "string" && f.trim().length > 0) {
      return { key: spec.key, value: f.trim(), source: "file" as const };
    }
    return { key: spec.key, value: undefined, source: "unset" as const };
  });
}

/** The effective value of one key, or undefined when unset in both layers. */
export function resolveConfigEntry(
  key: string,
  fileMap: Record<string, unknown> | null | undefined,
  sessionMap: Record<string, unknown> | null | undefined,
): ConfigResolution {
  return layerConfig(fileMap, sessionMap).find((r) => r.key === key)
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
