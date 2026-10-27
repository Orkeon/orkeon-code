// /resume — the sessions of this project the launcher kept, and the one to bring back. The runtime
// saves the conversation after each turn and when the REPL ends (Persist), outside the project; the
// next start of `orkeon-code` moves it to the project's history and starts fresh, and mounts that
// history read-only on /session-history. `/resume` lists them; `/resume <n | id>` loads one in place
// (Orkeon #227): the session of now is saved to an archive beside its own file first (the launcher
// moves it to the history at the next start), then the chosen file replaces the buffer, the state bag,
// the id and the title. `orkeon-code --resume <id>` (or `--continue` for the last one) does the same
// at start. Lives under commands/_lib/ — the loader's SearchPattern is "*.cmd.ts", so this file is
// never loaded as a command.

import type { Clock, Files, SessionMessages, SessionStore, SessionSwitch } from "../../../shared/application/ports.ts";
import { LOADED_SESSION_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import type { CommandView } from "../view.ts";

/** Where the launcher mounts the project's saved sessions. */
export const HISTORY_ROOT = "/session-history";
/** The newest sessions read and shown; the launcher's --resume lists them all. */
export const SHOWN_SESSIONS = 10;
/** The names listed at most (the launcher keeps 50 by default). */
const MAX_LISTED = 500;
const TAIL_TURNS = 3;

export interface ResumeDeps {
  files: Pick<Files, "read" | "list">;
  session: Pick<SessionStore, "readMessages" | "readState" | "writeState">;
  /** The session saved and loaded in place; absent when the host does not persist the session. */
  switch?: SessionSwitch;
  clock: Clock;
}

export type SessionRow = { id: string; saved: string; title: string; messages: string };

/** `<yyyymmddTHHMMSSZ>-<id>.json`, as the launcher names a saved session. */
const SAVED_NAME = /^(\d{8}T\d{6}Z)-(.+)\.json$/;

/** What the listing says under the table. */
export const HOW_TO_RESUME =
  "`/resume <number or id>` brings one back in place of this session, which is archived; " +
  "`orkeon-code --resume <id>` does the same at start, `orkeon-code --continue` brings back the session you quit.";

/** What a host that does not persist the session leaves `/resume <n|id>` with. */
export const NO_SWITCH =
  "cannot switch in place: the REPL runs without a persisted session (Orkeon:Cli:Session:Persist off); " +
  "quit (/exit), then start `orkeon-code --resume <id>`.";

/** `20261024T101500Z` as `2026-10-24 10:15 UTC`. */
function savedAt(stamp: string): string {
  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)} ${stamp.slice(9, 11)}:${stamp.slice(11, 13)} UTC`;
}

/** The time now as the launcher stamps a saved session, `20261024T101500Z`. */
export function stampOf(clock: Clock): string {
  return clock().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
}

/** One row per saved session: its id, when it was saved, its title and its number of messages. */
async function readRow(files: ResumeDeps["files"], name: string, stamp: string, id: string, current: boolean): Promise<SessionRow> {
  const row = { id, saved: savedAt(stamp) };
  const mark = current ? " (this session)" : "";
  try {
    const saved = JSON.parse(await files.read(`${HISTORY_ROOT}/${name}`));
    const title = typeof saved?.Title === "string" && saved.Title.trim() ? saved.Title.trim() : "(untitled)";
    const messages = Array.isArray(saved?.Messages) ? String(saved.Messages.length) : "?";
    return { ...row, title: title + mark, messages };
  } catch (e: any) {
    return { ...row, title: `(unreadable: ${String(e?.message ?? e).split("\n")[0]})${mark}`, messages: "?" };
  }
}

/** The saved sessions' file names, newest first; null when the history is not mounted. */
async function savedNames(files: ResumeDeps["files"]): Promise<string[] | null> {
  try {
    return (await files.list(HISTORY_ROOT, MAX_LISTED))
      // A name, or a path when the host lists paths.
      .map((n) => n.replace(/\/$/, "").split("/").pop() ?? "")
      .filter((n) => SAVED_NAME.test(n))
      .sort()
      .reverse();
  } catch {
    return null;
  }
}

const idOf = (name: string): string => SAVED_NAME.exec(name)![2];

/** The file `choice` names: a number of the shown list, else the start of an id that matches one session. */
export function chooseSaved(names: readonly string[], choice: string): { name: string } | { refused: string } {
  const shown = names.slice(0, SHOWN_SESSIONS);
  if (/^[1-9]\d{0,3}$/.test(choice)) {
    const n = Number(choice);
    if (n <= shown.length) return { name: shown[n - 1] };
  }
  const matches = names.filter((name) => idOf(name).startsWith(choice));
  if (matches.length === 1) return { name: matches[0] };
  if (matches.length > 1) return { refused: `more than one saved session starts with '${choice}': give more of its id.` };
  return { refused: `no saved session '${choice}' (/resume lists them).` };
}

/** Load `name` in place: the session of now archived beside its own file first, then the swap. */
async function loadSaved(deps: ResumeDeps, name: string): Promise<CommandView> {
  const id = idOf(name);
  if (deps.switch === undefined) return { text: NO_SWITCH };
  let archive = "";
  try {
    const own = await deps.switch.save();
    archive = `${own.slice(0, own.lastIndexOf("/") + 1)}${stampOf(deps.clock)}-archived.json`;
    await deps.switch.save(archive);
    const count = await deps.switch.load(`${HISTORY_ROOT}/${name}`);
    await deps.session.writeState(LOADED_SESSION_STATE_KEY, name).catch(() => undefined);
    return {
      text: `loaded ${id} (${count} message(s)): the next turn continues it. ` +
        `The session you left is archived at ${archive}; the next start of orkeon-code moves it to the history.`,
    };
  } catch (e: any) {
    const reason = String(e?.message ?? e).split("\n")[0];
    return { text: `could not load ${id}: ${reason}. This session is unchanged${archive ? `; its archive ${archive} stays` : ""}.` };
  }
}

/** The saved sessions, newest first, then the current buffer's last turns; with `choice`, that one loaded in place. */
export async function runResume(deps: ResumeDeps, choice?: string): Promise<CommandView> {
  const names = await savedNames(deps.files);
  const wanted = choice?.trim() ?? "";

  if (wanted.length > 0) {
    if (names === null) return { text: `no saved session to load: ${HISTORY_ROOT} is not mounted (start the REPL with orkeon-code).` };
    if (names.length === 0) return { text: "no saved session to load: this project has none yet." };
    const chosen = chooseSaved(names, wanted);
    return "refused" in chosen ? { text: chosen.refused } : loadSaved(deps, chosen.name);
  }

  const lines: string[] = [];
  let table: SessionRow[] | undefined;
  if (names === null) {
    lines.push(`no saved sessions to list: ${HISTORY_ROOT} is not mounted (start the REPL with orkeon-code).`);
  } else if (names.length === 0) {
    lines.push("no saved session for this project yet: the next start of orkeon-code keeps this one.");
  } else {
    const loadedFrom = await deps.session.readState(LOADED_SESSION_STATE_KEY).catch(() => null);
    table = [];
    for (const name of names.slice(0, SHOWN_SESSIONS)) {
      const [, stamp, id] = SAVED_NAME.exec(name)!;
      table.push(await readRow(deps.files, name, stamp, id, name === loadedFrom));
    }
    const more = names.length - table.length;
    lines.push(
      `${names.length} saved session(s) of this project, newest first${more > 0 ? ` (${more} more: orkeon-code --resume lists them all)` : ""}.`,
      HOW_TO_RESUME,
    );
  }

  const { messages } = await deps.session.readMessages()
    .catch((): SessionMessages => ({ stored: [], messages: [] }));
  const tail = messages.slice(-TAIL_TURNS)
    .map((m) => `  ${m.role}: ${m.content.slice(0, 200)}${m.content.length > 200 ? "…" : ""}`);
  const text = messages.length === 0
    ? "this session's buffer is empty."
    : `this session: ${messages.length} message(s) in the buffer. Last turns:\n${tail.join("\n")}`;
  return { lines, table, text };
}
