// Saved sessions and buffers /resume reads.
import { HISTORY_ROOT } from "../src/commands/_lib/resume.ts";
import { FakeFiles } from "./support/doubles/fake-files.ts";
import { FakeSessionStore } from "./support/doubles/fake-session-store.ts";

/** A session file as the runtime saves it (FileSessionBufferService). */
export const saved = (title: string | null, messages: number): string => JSON.stringify({
  SessionId: "s", Title: title, State: {},
  Messages: Array.from({ length: messages }, (_, i) => ({ Role: i % 2 ? "assistant" : "user", Content: `m${i}` })),
});

/** The files and the session store runResume reads, empty. */
export function resumeDeps() {
  return { files: new FakeFiles(), session: new FakeSessionStore() };
}

/** The history directory holding `entries` (file name → content), listed in the order given, plus `others`. */
export function historyWith(files: FakeFiles, entries: Readonly<Record<string, string>>, others: readonly string[] = []): void {
  files.listings.set(HISTORY_ROOT, [...Object.keys(entries), ...others]);
  for (const [name, content] of Object.entries(entries)) files.files.set(`${HISTORY_ROOT}/${name}`, content);
}

/** Two saved sessions, the older one untitled, beside a file that is not one. */
export const TWO_SESSIONS = {
  "20261023T080000Z-aaa.json": saved(null, 2),
  "20261024T101500Z-bbb.json": saved("Fix the parser", 5),
};

export const TWO_SESSIONS_TABLE = [
  { id: "bbb", saved: "2026-10-24 10:15 UTC", title: "Fix the parser", messages: "5" },
  { id: "aaa", saved: "2026-10-23 08:00 UTC", title: "(untitled)", messages: "2" },
];

export const TWO_SESSIONS_LINES = [
  "2 saved session(s) of this project, newest first.",
  "To bring one back, quit (/exit), then start `orkeon-code --resume <id>`; `orkeon-code --continue` brings back the session you quit.",
];

/** `count` saved sessions, one a day, the last one the newest. */
export function manySessions(count: number): Record<string, string> {
  return Object.fromEntries(Array.from({ length: count }, (_, i) => [`202610${String(10 + i)}T000000Z-id${i}.json`, saved("t", 1)]));
}
