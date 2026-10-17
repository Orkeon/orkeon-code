// Session IO shared by commands and crews: the conversation buffer, the state
// bag and the token budget of the SessionStore port, plus the permission mode a
// session runs in, which reads the state bag and the layered /config.
//
// Built over ports (createSessionIo); the instance wired to the runtime is
// orkeonSessionIo() in shared/infrastructure/orkeon/. The dependency runs one
// way: this module reads the config store, the config store reads only the
// session's state bag (the port), never this module.

import type { SessionStore } from "./ports.ts";
import type { ConfigStore } from "./config-store.ts";
import { PERMISSION_FALLBACK_CONFIG_KEY, isPermissionMode, resolveFallbackMode } from "../domain/permission-modes.ts";
import type { FallbackResolution } from "../domain/permission-modes.ts";
import { DEFAULT_MODE_STATE_KEY } from "../domain/session-keys.ts";

export interface SessionIo extends SessionStore {
  /** Append one entry to the conversation buffer. Throws when the session store
   *  cannot be read or written; best-effort callers catch. */
  appendMessage(role: string, content: string): Promise<void>;
  /** The session-default permission mode set by /mode, or null when unset/invalid
   *  (never throws — callers fall back to "default"). */
  readDefaultPermissionMode(): Promise<string | null>;
  /**
   * Resolves the session fallback permission mode from the `permissions.fallback`
   * config key.
   *
   * Reads the LAYERED value (settings file, overridden by the session bag) since
   * B-6. Going through the layered read is not optional: a value persisted in the
   * file and ignored here would be a setting that reports itself as effective and
   * changes nothing — the failure mode B-6 exists to remove.
   *
   * Anything unreadable yields the built-in fallback: a config store that cannot be
   * read must never be able to LOOSEN the policy. The decision itself is pure
   * (`resolveFallbackMode`); this only fetches its input.
   */
  resolveSessionFallbackMode(): Promise<FallbackResolution>;
  /**
   * The mode a prompt runs in when it carries no explicit "mode:" prefix: the
   * /mode session default if set, otherwise the resolved fallback.
   */
  resolveEffectiveSessionMode(): Promise<{ mode: string; via: string }>;
}

export function createSessionIo(deps: {
  store: SessionStore;
  config: Pick<ConfigStore, "readValue">;
}): SessionIo {
  const { store, config } = deps;

  async function readDefaultPermissionMode(): Promise<string | null> {
    try {
      const v = await store.readState(DEFAULT_MODE_STATE_KEY);
      if (v != null && isPermissionMode(v)) return v;
    } catch { /* session store optional */ }
    return null;
  }

  async function resolveSessionFallbackMode(): Promise<FallbackResolution> {
    let configured: unknown;
    try {
      configured = (await config.readValue(PERMISSION_FALLBACK_CONFIG_KEY)).value;
    } catch { /* absent, malformed or unavailable → built-in */ }
    return resolveFallbackMode(configured);
  }

  return {
    readMessages: () => store.readMessages(),
    writeMessages: (messages) => store.writeMessages(messages),
    reset: () => store.reset(),
    snip: (retain) => store.snip(retain),
    setTitle: (title) => store.setTitle(title),
    readState: (key) => store.readState(key),
    writeState: (key, value) => store.writeState(key, value),
    readBudget: () => store.readBudget(),
    async appendMessage(role, content) {
      const { stored } = await store.readMessages();
      await store.writeMessages([...stored, { role, content }]);
    },
    readDefaultPermissionMode,
    resolveSessionFallbackMode,
    async resolveEffectiveSessionMode() {
      const sessionDefault = await readDefaultPermissionMode();
      if (sessionDefault) return { mode: sessionDefault, via: "session default via /mode" };
      const fallback = await resolveSessionFallbackMode();
      return { mode: fallback.mode, via: fallback.explanation };
    },
  };
}
