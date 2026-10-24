// Two-layer /config store (B-6): a VFS settings file that survives everything,
// and the session state bag that overrides it until /clear. Under both, the user
// settings the launcher mounts read-only (LI-6): the project file widens nothing past them.
//
// The original persists `/config` to a settings file (baseline 04 §/config);
// The first version had only the session bag, so nothing set with `/config` outlived a
// `/clear` — including `permissions.fallback`, whose entire purpose is to
// state a durable posture.
//
// Built over the Files and SessionStore ports (createConfigStore); the instance
// wired to the runtime is orkeonConfigStore() in shared/infrastructure/orkeon/.

import type { Files, SessionStore } from "./ports.ts";
import { layerConfig, resolveConfigEntry, unknownStoredKeys } from "../domain/config-schema.ts";
import type { ConfigResolution } from "../domain/config-schema.ts";
import { CONFIG_MAP_STATE_KEY } from "../domain/session-keys.ts";
import { readJsonFile, writeJsonFile } from "./json-file.ts";
import { readJsonObject, writeJson } from "./session-state.ts";

/** The persisted settings file. Under /workspace so it lives with the repo. */
export const CONFIG_FILE_PATH = "/workspace/.orkeon/config.json";

/**
 * The user's settings: the `orkeonCode` block of the user settings file, which the
 * launcher writes at each start to a folder it mounts here read-only. Outside the
 * project, so a cloned repository cannot ship it; the project file widens nothing
 * past it (QL-06, config-schema.ts layerConfig). A script reads neither the host
 * settings nor the environment (V-04), so the launcher hands the block over as a file.
 */
export const USER_CONFIG_FILE_PATH = "/user-config/config.json";

function asMap(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

export interface ConfigView {
  entries: ConfigResolution[];
  /** Keys stored by the pre-schema free-form map; reported, never deleted. */
  unknown: string[];
  fileMalformed: boolean;
  /** The user settings file could not be read or parsed: no user setting applies. */
  userMalformed: boolean;
}

export interface ConfigStore {
  /**
   * Reads the settings file. An absent file is the normal first state; a malformed
   * one yields `{}` and a flag, because overwriting a file we could not parse would
   * destroy whatever it did contain.
   */
  readFile(): Promise<{ map: Record<string, unknown>; malformed: boolean }>;
  /** Reads the user settings file, read-only: a failed read is an absent file, content
   *  that does not parse is malformed. */
  readUserFile(): Promise<{ map: Record<string, unknown>; malformed: boolean }>;
  /** Writes the settings file (pretty-printed — a human edits this by hand too). */
  writeFile(map: Record<string, unknown>): Promise<void>;
  /** Reads the session override map. */
  readSession(): Promise<Record<string, unknown>>;
  /** Writes the session override map. */
  writeSession(map: Record<string, unknown>): Promise<void>;
  /** The effective configuration: user settings, overridden by the project file
   *  (which widens nothing past them), overridden by the session. */
  readView(): Promise<ConfigView>;
  /** The effective value of one key, layered. */
  readValue(key: string): Promise<ConfigResolution>;
}

export function createConfigStore(deps: {
  files: Files;
  session: Pick<SessionStore, "readState" | "writeState">;
}): ConfigStore {
  const { files, session } = deps;

  async function readMap(path: string): Promise<{ map: Record<string, unknown>; malformed: boolean }> {
    const { value, malformed } = await readJsonFile(files, path);
    return { map: asMap(value), malformed };
  }
  const readFile = () => readMap(CONFIG_FILE_PATH);
  // The user file is the launcher's, mounted read-only: nothing here ever writes it, so a
  // read that fails (no mount, an older launcher) is the absent layer, not data to guard.
  async function readUserFile(): Promise<{ map: Record<string, unknown>; malformed: boolean }> {
    let content: string;
    try {
      content = (await files.read(USER_CONFIG_FILE_PATH)).trim();
    } catch {
      return { map: {}, malformed: false };
    }
    if (content.length === 0) return { map: {}, malformed: false };
    try {
      return { map: asMap(JSON.parse(content)), malformed: false };
    } catch {
      return { map: {}, malformed: true };
    }
  }

  const readSession = (): Promise<Record<string, unknown>> => readJsonObject(session, CONFIG_MAP_STATE_KEY);

  return {
    readFile,
    readUserFile,
    writeFile: (map) => writeJsonFile(files, CONFIG_FILE_PATH, map),
    readSession,
    writeSession: (map) => writeJson(session, CONFIG_MAP_STATE_KEY, map),
    async readView() {
      const [{ map: file, malformed }, overrides, user] = await Promise.all([readFile(), readSession(), readUserFile()]);
      return {
        entries: layerConfig(file, overrides, user.map),
        unknown: [...new Set([file, overrides, user.map].flatMap(unknownStoredKeys))].sort(),
        fileMalformed: malformed,
        userMalformed: user.malformed,
      };
    },
    async readValue(key) {
      const [{ map: file }, overrides, { map: user }] = await Promise.all([readFile(), readSession(), readUserFile()]);
      return resolveConfigEntry(key, file, overrides, user);
    },
  };
}
