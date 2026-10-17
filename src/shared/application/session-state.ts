// JSON values of the session's state bag, over the SessionStore port. The bag
// holds strings, so a list or a map is stored as JSON; every reader of one goes
// through here so that they all agree on what an unusable value reads as.

import type { SessionStore } from "./ports.ts";

/** The parsed value of `key`; undefined when unset, malformed, or when the
 *  session store is unavailable (a host without the session tools). */
async function readJson(session: Pick<SessionStore, "readState">, key: string): Promise<unknown> {
  try {
    const raw = await session.readState(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

/** A JSON-array state value; unset, malformed, not an array or unreadable → []. */
export async function readJsonArray(session: Pick<SessionStore, "readState">, key: string): Promise<unknown[]> {
  const value = await readJson(session, key);
  return Array.isArray(value) ? value : [];
}

/** A JSON-object state value; unset, malformed, not an object or unreadable → {}. */
export async function readJsonObject(
  session: Pick<SessionStore, "readState">,
  key: string,
): Promise<Record<string, unknown>> {
  const value = await readJson(session, key);
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Persist a JSON state value. */
export async function writeJson(session: Pick<SessionStore, "writeState">, key: string, value: unknown): Promise<void> {
  await session.writeState(key, JSON.stringify(value));
}
