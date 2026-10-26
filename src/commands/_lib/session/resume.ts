// /resume — the sessions of this project the launcher kept, and how to bring one
// back. The runtime saves the conversation when the REPL ends (Persist), outside the
// project; the next start of `orkeon-code` moves it to the project's history and
// starts fresh, and mounts that history read-only on /session-history. A REPL cannot
// swap its own session: `orkeon-code --resume <id>` (or `--continue` for the last
// one) restarts on it. Lives under commands/_lib/ — the loader's SearchPattern is
// "*.cmd.ts", so this file is never loaded as a command.

import type { Files, SessionMessages, SessionStore } from "../../../shared/application/ports.ts";
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
  session: Pick<SessionStore, "readMessages">;
}

export type SessionRow = { id: string; saved: string; title: string; messages: string };

/** `<yyyymmddTHHMMSSZ>-<id>.json`, as the launcher names a saved session. */
const SAVED_NAME = /^(\d{8}T\d{6}Z)-(.+)\.json$/;

/** `20261024T101500Z` as `2026-10-24 10:15 UTC`. */
function savedAt(stamp: string): string {
  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)} ${stamp.slice(9, 11)}:${stamp.slice(11, 13)} UTC`;
}

/** One row per saved session: its id, when it was saved, its title and its number of messages. */
async function readRow(files: ResumeDeps["files"], name: string, stamp: string, id: string): Promise<SessionRow> {
  const row = { id, saved: savedAt(stamp) };
  try {
    const saved = JSON.parse(await files.read(`${HISTORY_ROOT}/${name}`));
    const title = typeof saved?.Title === "string" && saved.Title.trim() ? saved.Title.trim() : "(untitled)";
    const messages = Array.isArray(saved?.Messages) ? String(saved.Messages.length) : "?";
    return { ...row, title, messages };
  } catch (e: any) {
    return { ...row, title: `(unreadable: ${String(e?.message ?? e).split("\n")[0]})`, messages: "?" };
  }
}

/** The saved sessions, newest first, then the current buffer's last turns. */
export async function runResume(deps: ResumeDeps): Promise<CommandView> {
  let names: string[] | null;
  try {
    names = (await deps.files.list(HISTORY_ROOT, MAX_LISTED))
      // A name, or a path when the host lists paths.
      .map((n) => n.replace(/\/$/, "").split("/").pop() ?? "")
      .filter((n) => SAVED_NAME.test(n))
      .sort()
      .reverse();
  } catch {
    names = null;
  }

  const lines: string[] = [];
  let table: SessionRow[] | undefined;
  if (names === null) {
    lines.push(`no saved sessions to list: ${HISTORY_ROOT} is not mounted (start the REPL with orkeon-code).`);
  } else if (names.length === 0) {
    lines.push("no saved session for this project yet: the next start of orkeon-code keeps this one.");
  } else {
    table = [];
    for (const name of names.slice(0, SHOWN_SESSIONS)) {
      const [, stamp, id] = SAVED_NAME.exec(name)!;
      table.push(await readRow(deps.files, name, stamp, id));
    }
    const more = names.length - table.length;
    lines.push(
      `${names.length} saved session(s) of this project, newest first${more > 0 ? ` (${more} more: orkeon-code --resume lists them all)` : ""}.`,
      "To bring one back, quit (/exit), then start `orkeon-code --resume <id>`; `orkeon-code --continue` brings back the session you quit.",
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
