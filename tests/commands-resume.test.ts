// /resume (commands/_lib/resume.ts) over FakeFiles and FakeSessionStore: the saved
// sessions of /session-history newest first, the restart that brings one back, and
// the current buffer's last turns. Run:
//   node --test tests/commands-resume.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { HISTORY_ROOT, SHOWN_SESSIONS, runResume } from "../src/commands/_lib/resume.ts";
import { FakeFiles } from "./support/fake-files.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";

/** A session file as the runtime saves it (FileSessionBufferService). */
const saved = (title: string | null, messages: number) => JSON.stringify({
  SessionId: "s", Title: title, State: {},
  Messages: Array.from({ length: messages }, (_, i) => ({ Role: i % 2 ? "assistant" : "user", Content: `m${i}` })),
});

function setup() {
  const files = new FakeFiles();
  const session = new FakeSessionStore();
  return { files, session, run: () => runResume({ files, session }) };
}

describe("/resume — the saved sessions", () => {
  it("lists them newest first, with the date, the title and the number of messages, and says how to bring one back", async () => {
    const { files, run } = setup();
    files.listings.set(HISTORY_ROOT, ["20261023T080000Z-aaa.json", "20261024T101500Z-bbb.json", "notes.txt"]);
    files.files.set(`${HISTORY_ROOT}/20261023T080000Z-aaa.json`, saved(null, 2));
    files.files.set(`${HISTORY_ROOT}/20261024T101500Z-bbb.json`, saved("Fix the parser", 5));
    const view = await run();
    deepStrictEqual(view.table, [
      { id: "bbb", saved: "2026-10-24 10:15 UTC", title: "Fix the parser", messages: "5" },
      { id: "aaa", saved: "2026-10-23 08:00 UTC", title: "(untitled)", messages: "2" },
    ]);
    deepStrictEqual(view.lines, [
      "2 saved session(s) of this project, newest first.",
      "To bring one back, quit (/exit), then start `orkeon-code --resume <id>`; `orkeon-code --continue` brings back the session you quit.",
    ]);
  });

  it("reads the newest ones only, and names the others", async () => {
    const { files, run } = setup();
    const names = Array.from({ length: SHOWN_SESSIONS + 2 }, (_, i) => `202610${String(10 + i)}T000000Z-id${i}.json`);
    files.listings.set(HISTORY_ROOT, names);
    for (const n of names) files.files.set(`${HISTORY_ROOT}/${n}`, saved("t", 1));
    const view = await run();
    strictEqual((view.table as object[]).length, SHOWN_SESSIONS);
    strictEqual((view.table as Array<{ id: string }>)[0].id, `id${SHOWN_SESSIONS + 1}`);
    ok(view.lines![0].includes("(2 more: orkeon-code --resume lists them all)"), view.lines![0]);
  });

  it("shows an unreadable file as such", async () => {
    const { files, run } = setup();
    files.listings.set(HISTORY_ROOT, ["20261024T101500Z-bad.json"]);
    files.files.set(`${HISTORY_ROOT}/20261024T101500Z-bad.json`, "{ not json");
    const [row] = (await run()).table as Array<{ title: string; messages: string }>;
    ok(row.title.startsWith("(unreadable: "), row.title);
    strictEqual(row.messages, "?");
  });

  it("says so when there is none, or when the history is not mounted", async () => {
    const { files, run } = setup();
    deepStrictEqual((await run()).lines, ["no saved session for this project yet: the next start of orkeon-code keeps this one."]);
    strictEqual((await run()).table, undefined);
    files.list = async () => { throw new Error("no mount for /session-history"); };
    deepStrictEqual((await run()).lines,
      ["no saved sessions to list: /session-history is not mounted (start the REPL with orkeon-code)."]);
  });
});

describe("/resume — the current session", () => {
  it("ends with the buffer's last three turns, or says it is empty", async () => {
    const { session, run } = setup();
    strictEqual((await run()).text, "this session's buffer is empty.");
    session.messages = [1, 2, 3, 4].map((i) => ({ role: "user", content: `turn ${i}` }));
    strictEqual((await run()).text, "this session: 4 message(s) in the buffer. Last turns:\n  user: turn 2\n  user: turn 3\n  user: turn 4");
  });

  it("reads an empty buffer when the session store fails", async () => {
    const { session, run } = setup();
    session.failure = new Error("no session tools");
    strictEqual((await run()).text, "this session's buffer is empty.");
  });
});
