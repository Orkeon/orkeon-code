// Saved sessions and buffers /resume reads.
import { HISTORY_ROOT, HOW_TO_RESUME } from "../../../../src/commands/_lib/session/resume.ts";
import { FakeClock } from "../../../support/doubles/fake-clock.ts";
import { FakeSessionSwitch } from "../../../support/doubles/fake-session-switch.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";

/** A session file as the runtime saves it (FileSessionBufferService). */
export const saved = (title: string | null, messages: number): string => JSON.stringify({
  SessionId: "s", Title: title, State: {},
  Messages: Array.from({ length: messages }, (_, i) => ({ Role: i % 2 ? "assistant" : "user", Content: `m${i}` })),
});

/** The files and the session store runResume reads, empty, the clock at 2026-10-24T10:00:00Z, and the switch
 *  a persisting host serves. */
export function resumeDeps() {
  const clock = new FakeClock();
  return { files: new FakeFiles(), session: new FakeSessionStore(), switch: new FakeSessionSwitch(), clock: clock.now };
}

/** The archive the session of now goes to, beside the switch's own file, at the clock's instant. */
export const ARCHIVE = "/sessions/proj-1a2b3c/20261024T100000Z-archived.json";

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
  HOW_TO_RESUME,
];

/** The choices of a saved session over TWO_SESSIONS, and the file each names or why it is refused. */
export const CHOICE_CASES: readonly { name: string; choice: string; expected: { name: string } | { refused: string } }[] = [
  { name: "the number of the newest", choice: "1", expected: { name: "20261024T101500Z-bbb.json" } },
  { name: "the number of the oldest", choice: "2", expected: { name: "20261023T080000Z-aaa.json" } },
  { name: "the start of an id", choice: "aa", expected: { name: "20261023T080000Z-aaa.json" } },
  { name: "a whole id", choice: "bbb", expected: { name: "20261024T101500Z-bbb.json" } },
  { name: "a number past the list, read as an id", choice: "3", expected: { refused: "no saved session '3' (/resume lists them)." } },
  { name: "an unknown id", choice: "zzz", expected: { refused: "no saved session 'zzz' (/resume lists them)." } },
];

/** `count` saved sessions, one a day, the last one the newest. */
export function manySessions(count: number): Record<string, string> {
  return Object.fromEntries(Array.from({ length: count }, (_, i) => [`202610${String(10 + i)}T000000Z-id${i}.json`, saved("t", 1)]));
}
