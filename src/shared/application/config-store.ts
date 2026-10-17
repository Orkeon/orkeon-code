// Two-layer /config store (B-6): a VFS settings file that survives everything,
// and the session state bag that overrides it until /reset-session.
//
// The original persists `/config` to a settings file (baseline 04 §/config);
// The first version had only the session bag, so nothing set with `/config` outlived a
// `/reset-session` — including `permissions.fallback`, whose entire purpose is to
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

function asMap(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

export interface ConfigView {
  entries: ConfigResolution[];
  /** Keys stored by the pre-schema free-form map; reported, never deleted. */
  unknown: string[];
  fileMalformed: boolean;
}

export interface ConfigStore {
  /**
   * Reads the settings file. An absent file is the normal first state; a malformed
   * one yields `{}` and a flag, because overwriting a file we could not parse would
   * destroy whatever it did contain.
   */
  readFile(): Promise<{ map: Record<string, unknown>; malformed: boolean }>;
  /** Writes the settings file (pretty-printed — a human edits this by hand too). */
  writeFile(map: Record<string, unknown>): Promise<void>;
  /** Reads the session override map. */
  readSession(): Promise<Record<string, unknown>>;
  /** Writes the session override map. */
  writeSession(map: Record<string, unknown>): Promise<void>;
  /** The effective configuration: file, overridden by session. */
  readView(): Promise<ConfigView>;
  /** The effective value of one key, layered. */
  readValue(key: string): Promise<ConfigResolution>;
}

export function createConfigStore(deps: {
  files: Files;
  session: Pick<SessionStore, "readState" | "writeState">;
}): ConfigStore {
  const { files, session } = deps;

  async function readFile(): Promise<{ map: Record<string, unknown>; malformed: boolean }> {
    const { value, malformed } = await readJsonFile(files, CONFIG_FILE_PATH);
    return { map: asMap(value), malformed };
  }

  const readSession = (): Promise<Record<string, unknown>> => readJsonObject(session, CONFIG_MAP_STATE_KEY);

  return {
    readFile,
    writeFile: (map) => writeJsonFile(files, CONFIG_FILE_PATH, map),
    readSession,
    writeSession: (map) => writeJson(session, CONFIG_MAP_STATE_KEY, map),
    async readView() {
      const [{ map: file, malformed }, overrides] = await Promise.all([readFile(), readSession()]);
      return {
        entries: layerConfig(file, overrides),
        unknown: [...new Set([...unknownStoredKeys(file), ...unknownStoredKeys(overrides)])].sort(),
        fileMalformed: malformed,
      };
    },
    async readValue(key) {
      const [{ map: file }, overrides] = await Promise.all([readFile(), readSession()]);
      return resolveConfigEntry(key, file, overrides);
    },
  };
}
