// /resume (commands/_lib/session/resume.ts) over FakeFiles and FakeSessionStore: the saved
// sessions of /session-history newest first, the restart that brings one back, and
// the current buffer's last turns. Run:
//   node --test tests/commands/_lib/session/resume.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { NO_SWITCH, SHOWN_SESSIONS, chooseSaved, runResume } from "../../../../src/commands/_lib/session/resume.ts";
import { LOADED_SESSION_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import {
  ARCHIVE,
  CHOICE_CASES,
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

describe("/resume — the session loaded in place is marked", () => {
  it("marks the row this session was loaded from", async () => {
    // Arrange
    const deps = resumeDeps();
    historyWith(deps.files, TWO_SESSIONS);
    deps.session.state.set(LOADED_SESSION_STATE_KEY, "20261023T080000Z-aaa.json");

    // Act
    const view = await runResume(deps);

    // Assert
    strictEqual((view.table as Array<{ title: string }>)[1].title, "(untitled) (this session)");
  });
});

describe("/resume <n | id> — the choice", () => {
  for (const c of CHOICE_CASES) {
    it(`names the file of ${c.name}`, () => {
      // Arrange
      const names = Object.keys(TWO_SESSIONS).sort().reverse();

      // Act
      const chosen = chooseSaved(names, c.choice);

      // Assert
      deepStrictEqual(chosen, c.expected);
    });
  }

  it("refuses a start of an id that matches more than one session", () => {
    // Arrange
    const names = ["20261024T101500Z-abc2.json", "20261023T080000Z-abc1.json"];

    // Act
    const chosen = chooseSaved(names, "abc");

    // Assert
    deepStrictEqual(chosen, { refused: "more than one saved session starts with 'abc': give more of its id." });
  });
});

describe("/resume <n | id> — the load in place (Orkeon #227)", () => {
  it("archives the session of now beside its own file, then loads the chosen one, and says so", async () => {
    // Arrange
    const deps = resumeDeps();
    historyWith(deps.files, TWO_SESSIONS);

    // Act
    const view = await runResume(deps, "aaa");

    // Assert
    deepStrictEqual(
      [deps.switch.saves, deps.switch.loads, view.text],
      [[undefined, ARCHIVE], ["/session-history/20261023T080000Z-aaa.json"],
        `loaded aaa (5 message(s)): the next turn continues it. The session you left is archived at ${ARCHIVE}; the next start of orkeon-code moves it to the history.`],
    );
  });

  it("remembers the file it loaded in the loaded session's state", async () => {
    // Arrange
    const deps = resumeDeps();
    historyWith(deps.files, TWO_SESSIONS);

    // Act
    await runResume(deps, "1");

    // Assert
    strictEqual(deps.session.state.get(LOADED_SESSION_STATE_KEY), "20261024T101500Z-bbb.json");
  });

  it("says the session is unchanged when the load is refused, the archive kept", async () => {
    // Arrange
    const deps = resumeDeps();
    historyWith(deps.files, TWO_SESSIONS);
    deps.switch.loadFailure = new Error("session.load: /session-history/20261023T080000Z-aaa.json is not a session file\nat Facade");

    // Act
    const view = await runResume(deps, "aaa");

    // Assert
    strictEqual(view.text,
      `could not load aaa: session.load: /session-history/20261023T080000Z-aaa.json is not a session file. This session is unchanged; its archive ${ARCHIVE} stays.`);
  });

  it("loads nothing when the archive cannot be written", async () => {
    // Arrange
    const deps = resumeDeps();
    historyWith(deps.files, TWO_SESSIONS);
    deps.switch.saveFailure = new Error("session.save: /sessions is read-only");

    // Act
    const view = await runResume(deps, "aaa");

    // Assert
    deepStrictEqual([deps.switch.loads, view.text], [[], "could not load aaa: session.save: /sessions is read-only. This session is unchanged."]);
  });

  it("says how to switch when the host does not persist the session", async () => {
    // Arrange
    const deps = { ...resumeDeps(), switch: undefined };
    historyWith(deps.files, TWO_SESSIONS);

    // Act
    const view = await runResume(deps, "aaa");

    // Assert
    strictEqual(view.text, NO_SWITCH);
  });

  it("refuses an unknown choice without touching the session", async () => {
    // Arrange
    const deps = resumeDeps();
    historyWith(deps.files, TWO_SESSIONS);

    // Act
    const view = await runResume(deps, "zzz");

    // Assert
    deepStrictEqual([deps.switch.saves, view.text], [[], "no saved session 'zzz' (/resume lists them)."]);
  });

  it("says there is nothing to load when the project has no saved session", async () => {
    // Arrange
    const deps = resumeDeps();

    // Act
    const view = await runResume(deps, "1");

    // Assert
    strictEqual(view.text, "no saved session to load: this project has none yet.");
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
