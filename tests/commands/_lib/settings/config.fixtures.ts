// The settings files, session maps and harness the /config tests run over (a config store on FakeFiles and
// FakeSessionStore), with the texts /config answers that run past a line.
import { runConfig } from "../../../../src/commands/_lib/settings/config.ts";
import type { CommandView } from "../../../../src/commands/_lib/view.ts";
import { CONFIG_FILE_PATH, USER_CONFIG_FILE_PATH, createConfigStore } from "../../../../src/shared/application/config-store.ts";
import { CONFIG_KEYS } from "../../../../src/shared/domain/config-schema.ts";
import { CONFIG_MAP_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeReasoningReader } from "../../../support/doubles/fake-reasoning-reader.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";

export const KEY = "advisor.model";

export const NOT_JSON = "{ not json";

/** The end of every note on a value the user settings narrow. */
export const TAIL = "A setting of your own goes in the orkeonCode block of the user settings file (the one the launcher reads).";

export const MALFORMED_REFUSAL =
  `refusing to write: ${CONFIG_FILE_PATH} exists but could not be parsed, and overwriting it ` +
  "would discard whatever it holds. Fix or delete it, then retry.";

export const NESTED_WARNING =
  '⚠ written nested, so nothing reads them: permissions.fallback — a settings file holds each key flat ' +
  '("permissions.fallback": …).';

export const BYPASS_IGNORED =
  `permissions.fallback = bypassPermissions [file] — persisted in ${CONFIG_FILE_PATH}.\n` +
  "↳ ignored: 'bypassPermissions': a project file may set only default, plan or acceptEdits; another mode comes " +
  `from the user settings (orkeonCode) or /mode. ${TAIL}`;

export const WIDER_FALLBACK_NOTE =
  `\n↳ ignored: 'acceptEdits': it is wider than the user settings' 'plan' (orkeonCode); a project file may only narrow it. ${TAIL}`;

export const UNLISTED_TOOL_NOTE = `\n↳ ignored: 'deploy_prod:write': the user settings do not allow (orkeonCode tools.extra, or *). ${TAIL}`;

export const UNPARSED_USER_SETTINGS_NOTE =
  `\n↳ ignored: 'deploy_prod:write': the user settings do not allow (orkeonCode tools.extra, or *). ` +
  `The user settings (${USER_CONFIG_FILE_PATH}) could not be parsed: none applies. ${TAIL}`;

/** The user settings: a fallback of plan, and one extra tool. */
export const NARROW_USER_SETTINGS = { "permissions.fallback": "plan", "tools.extra": "search_issues" };

export interface ConfigHarness {
  files: FakeFiles;
  store: FakeSessionStore;
  /** What the runtime says of the models; nothing unless a test fills it. */
  reasoning: FakeReasoningReader;
  /** Runs `/config <tokens…>`. */
  run(...tokens: string[]): Promise<CommandView>;
  /** The project settings file as stored, `{}` when absent. */
  fileMap(): unknown;
  /** The session overrides as stored, `{}` when absent. */
  sessionMap(): unknown;
}

export interface ConfigSeed {
  /** The project settings file: an object stored as JSON, or a raw text. */
  file?: object | string;
  /** The session overrides. */
  session?: object;
  /** The user settings file: an object stored as JSON, or a raw text. */
  user?: object | string;
}

const asText = (value: object | string): string => (typeof value === "string" ? value : JSON.stringify(value));

/** /config over a config store on FakeFiles and FakeSessionStore, seeded with `seed`. */
export function configHarness(seed: ConfigSeed = {}): ConfigHarness {
  const files = new FakeFiles();
  const store = new FakeSessionStore();
  if (seed.file !== undefined) files.files.set(CONFIG_FILE_PATH, asText(seed.file));
  if (seed.user !== undefined) files.files.set(USER_CONFIG_FILE_PATH, asText(seed.user));
  if (seed.session !== undefined) store.state.set(CONFIG_MAP_STATE_KEY, JSON.stringify(seed.session));
  const reasoning = new FakeReasoningReader();
  const deps = { config: createConfigStore({ files, session: store }), session: store, reasoning };
  return {
    files,
    store,
    reasoning,
    run: (...tokens) => runConfig(tokens, deps),
    fileMap: () => JSON.parse(files.files.get(CONFIG_FILE_PATH) ?? "{}"),
    sessionMap: () => JSON.parse(store.state.get(CONFIG_MAP_STATE_KEY) ?? "{}"),
  };
}

/** KEY in the file, review.lenses in the session. */
export const LAYERED_SEED: ConfigSeed = { file: { [KEY]: "file-model" }, session: { "review.lenses": "security" } };

/** The table /config list answers for LAYERED_SEED: every declared key with its value and layer. */
export function layeredTable(): Array<{ key: string; value: string; source: string }> {
  return CONFIG_KEYS.map((s) => ({
    key: s.key,
    value: s.key === KEY ? "file-model" : s.key === "review.lenses" ? "security" : "(unset)",
    source: s.key === KEY ? "file" : s.key === "review.lenses" ? "session" : "unset",
  }));
}

export const LIST_TEXT = `file: ${CONFIG_FILE_PATH} — session overrides it until /clear.`;

export interface SetRefusalCase {
  name: string;
  tokens: string[];
  text: string;
}

export const SET_REFUSAL_CASES: readonly SetRefusalCase[] = [
  {
    name: "refuses an invalid value with the allowed set",
    tokens: ["set", "commit.requireConfirm", "maybe"],
    text: "'maybe' is not valid for 'commit.requireConfirm'. Allowed: true, false",
  },
  { name: "refuses a key without a value", tokens: ["set", KEY], text: `'${KEY}' needs a value.` },
];

export const UNNARROWED_SET_CASES: readonly SetRefusalCase[] = [
  {
    name: "adds nothing when the value applies",
    tokens: ["set", "permissions.fallback", "acceptEdits"],
    text: `permissions.fallback = acceptEdits [file] — persisted in ${CONFIG_FILE_PATH}.`,
  },
  {
    name: "adds nothing with --session, which the user settings do not narrow",
    tokens: ["set", "--session", "permissions.fallback", "bypassPermissions"],
    text: "permissions.fallback = bypassPermissions [session] — overrides the file until /clear.",
  },
];

const MEDIUM_LOWERED_WARNING = "⚠ effort: 'medium' is sent to glm-5.3 as 'low' (it takes low, high, max).";

/** What `/config set --session llm.profile large` answers when `large` sends the stored `medium` as `low`. */
export const PROFILE_SET_LOWERED_TEXT = `llm.profile = large [session] — overrides the file until /clear.\n${MEDIUM_LOWERED_WARNING}`;

/** What `/config unset --session llm.profile` answers when the host's own model sends the stored `medium` as `low`. */
export const PROFILE_UNSET_LOWERED_TEXT = `llm.profile session override removed (the file value applies again).\n${MEDIUM_LOWERED_WARNING}`;
