// /resume (commands/_lib/session/resume.ts) over FakeFiles and FakeSessionStore: the saved
// sessions of /session-history newest first, the restart that brings one back, and
// the current buffer's last turns. Run:
//   node --test src/commands/_lib/session/resume.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { SHOWN_SESSIONS, runResume } from "../../../../src/commands/_lib/session/resume.ts";
import {
  historyWith,
  manySessions,
  resumeDeps,
  TWO_SESSIONS,
  TWO_SESSIONS_LINES,
  TWO_SESSIONS_TABLE,
} from "./resume.fixtures.ts";

describe("/resume — the saved sessions", () => {
  it("lists them newest first, with the date, the title and the number of messages, and says how to bring one back", async () => {
    // Arrange
    const deps = resumeDeps();
    historyWith(deps.files, TWO_SESSIONS, ["notes.txt"]);

    // Act
    const view = await runResume(deps);

    // Assert
    deepStrictEqual(view.table, TWO_SESSIONS_TABLE);
    deepStrictEqual(view.lines, TWO_SESSIONS_LINES);
  });

  it("reads the newest ones only, and names the others", async () => {
    // Arrange
    const deps = resumeDeps();
    historyWith(deps.files, manySessions(SHOWN_SESSIONS + 2));

    // Act
    const view = await runResume(deps);

    // Assert
    strictEqual((view.table as object[]).length, SHOWN_SESSIONS);
    strictEqual((view.table as Array<{ id: string }>)[0].id, `id${SHOWN_SESSIONS + 1}`);
    ok(view.lines![0].includes("(2 more: orkeon-code --resume lists them all)"), view.lines![0]);
  });

  it("shows an unreadable file as such", async () => {
    // Arrange
    const deps = resumeDeps();
    historyWith(deps.files, { "20261024T101500Z-bad.json": "{ not json" });

    // Act
    const view = await runResume(deps);

    // Assert
    const [row] = view.table as Array<{ title: string; messages: string }>;
    ok(row.title.startsWith("(unreadable: "), row.title);
    strictEqual(row.messages, "?");
  });

  it("says so when there is none", async () => {
    // Arrange
    const deps = resumeDeps();

    // Act
    const view = await runResume(deps);

    // Assert
    deepStrictEqual(view.lines, ["no saved session for this project yet: the next start of orkeon-code keeps this one."]);
    strictEqual(view.table, undefined);
  });

  it("says so when the history is not mounted", async () => {
    // Arrange
    const deps = resumeDeps();
    deps.files.list = async () => { throw new Error("no mount for /session-history"); };

    // Act
    const view = await runResume(deps);

    // Assert
    deepStrictEqual(view.lines,
      ["no saved sessions to list: /session-history is not mounted (start the REPL with orkeon-code)."]);
  });
});

describe("/resume — the current session", () => {
  it("says the buffer is empty", async () => {
    // Arrange
    const deps = resumeDeps();

    // Act
    const view = await runResume(deps);

    // Assert
    strictEqual(view.text, "this session's buffer is empty.");
  });

  it("ends with the buffer's last three turns", async () => {
    // Arrange
    const deps = resumeDeps();
    deps.session.messages = [1, 2, 3, 4].map((i) => ({ role: "user", content: `turn ${i}` }));

    // Act
    const view = await runResume(deps);

    // Assert
    strictEqual(view.text, "this session: 4 message(s) in the buffer. Last turns:\n  user: turn 2\n  user: turn 3\n  user: turn 4");
  });

  it("reads an empty buffer when the session store fails", async () => {
    // Arrange
    const deps = resumeDeps();
    deps.session.failure = new Error("no session tools");

    // Act
    const view = await runResume(deps);

    // Assert
    strictEqual(view.text, "this session's buffer is empty.");
  });
});
