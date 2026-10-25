// /agents (commands/_lib/agents.ts) over FakeFiles and FakeCrewHost: every
// sub-command, its refusals and its usage lines. Run:
//   node --test src/commands/_lib/agents.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { AGENTS_FILE_PATH, AGENTS_USAGE, SAVED_AGENTS_NOTE } from "./agents.ts";
import {
  INVALID_DEFINITION_CASES,
  MALFORMED_REFUSAL,
  NOT_JSON,
  REMOVE_REFUSAL_CASES,
  UNPARSED_REFUSAL,
  UNPARSED_WARNING,
  UNREADABLE,
  UNREADABLE_REGISTRY_CASES,
  agentsHarness,
  testerListView,
} from "./agents.fixtures.ts";

describe("/agents list", () => {
  it("names every step that runs a built-in charter as a child", () => {
    // Arrange
    const steps = "children of /dev-spec, /dev-change, /dev-plan and /dev-verify";

    // Act
    const note = SAVED_AGENTS_NOTE;

    // Assert
    ok(note.includes(steps), note);
  });

  it("tables the discovered crews and the saved agents (the default sub-command)", async () => {
    // Arrange
    const { run } = agentsHarness({ tester: { role: "QA", goal: "find bugs", tools: [] } });

    // Act
    const view = await run();

    // Assert
    deepStrictEqual(view, testerListView());
  });

  it("answers `list` with the same table and text as the default sub-command", async () => {
    // Arrange
    const { run } = agentsHarness({ tester: { role: "QA", goal: "find bugs", tools: [] } });

    // Act
    const view = await run("list");

    // Assert
    deepStrictEqual(view, testerListView());
  });

  it("reports the entries it ignored", async () => {
    // Arrange
    const { run } = agentsHarness({ half: { role: "QA" } });

    // Act
    const view = await run("list");

    // Assert
    strictEqual(view.text!.split("\n")[1], "⚠ 1 stored entr(y/ies) ignored — missing role or goal: half");
  });

  it("reports a file it could not parse", async () => {
    // Arrange
    const { run } = agentsHarness(NOT_JSON);

    // Act
    const view = await run("list");

    // Assert
    strictEqual(view.text!.split("\n")[1], UNPARSED_WARNING);
  });
});

describe("/agents — a registry entry that cannot be read", () => {
  // Valid JSON, but a field no String() can convert: the registry could not be
  // parsed, exactly as with invalid JSON, and nothing writes over it.
  it("lists it as a file that could not be parsed, and writes nothing", async () => {
    // Arrange
    const { files, run } = agentsHarness(UNREADABLE);

    // Act
    const view = await run("list");

    // Assert
    strictEqual(view.text!.split("\n")[1], UNPARSED_WARNING);
    deepStrictEqual(files.writes, []);
  });

  for (const c of UNREADABLE_REGISTRY_CASES) {
    it(`${c.name}, and writes nothing`, async () => {
      // Arrange
      const { files, run } = agentsHarness(UNREADABLE);

      // Act
      const view = await run(...c.tokens);

      // Assert
      deepStrictEqual(view, { text: c.text });
      deepStrictEqual(files.writes, []);
    });
  }
});

describe("/agents show", () => {
  it("shows a saved agent and its tools, whatever the case of its name", async () => {
    // Arrange
    const { run } = agentsHarness({ tester: { role: "QA", goal: "find bugs", tools: ["file_read"] }, writer: { role: "Docs", goal: "write" } });

    // Act
    const view = await run("show", "Tester");

    // Assert
    deepStrictEqual(view, { text: "tester\n  role : QA\n  goal : find bugs\n  tools: file_read" });
  });

  it("shows the crew's tools for a saved agent that names none", async () => {
    // Arrange
    const { run } = agentsHarness({ tester: { role: "QA", goal: "find bugs", tools: ["file_read"] }, writer: { role: "Docs", goal: "write" } });

    // Act
    const view = await run("show", "writer");

    // Assert
    strictEqual(view.text!.split("\n")[3], "  tools: (inherited from the crew)");
  });

  it("names a built-in crew as such", async () => {
    // Arrange
    const { run } = agentsHarness();

    // Act
    const view = await run("show", "main-loop");

    // Assert
    deepStrictEqual(view, {
      text: "'main-loop' is a built-in crew (crews/main-loop/), not a saved agent — see its crew.ork.ts.",
    });
  });

  it("names an unknown name as unknown", async () => {
    // Arrange
    const { run } = agentsHarness();

    // Act
    const view = await run("show", "ghost");

    // Assert
    deepStrictEqual(view, { text: "no saved agent 'ghost'. /agents list shows what there is." });
  });
});

describe("/agents add and edit", () => {
  it("saves `<name> <role> | <goal>`", async () => {
    // Arrange
    const { run, stored } = agentsHarness();

    // Act
    const view = await run("add", "Tester", "Senior", "QA", "|", "find", "bugs");

    // Assert
    deepStrictEqual(view, { text: `agent 'tester' saved in ${AGENTS_FILE_PATH}.` });
    deepStrictEqual(stored(), { tester: { role: "Senior QA", goal: "find bugs", tools: [] } });
  });

  it("replaces a saved agent on an edit, a `|` past the first kept in the goal", async () => {
    // Arrange
    const { run, stored } = agentsHarness();
    await run("add", "Tester", "Senior", "QA", "|", "find", "bugs");

    // Act
    const view = await run("edit", "tester", "QA", "|", "find", "more|bugs");

    // Assert
    deepStrictEqual(view, { text: `agent 'tester' replaced in ${AGENTS_FILE_PATH}.` });
    deepStrictEqual(stored(), { tester: { role: "QA", goal: "find more|bugs", tools: [] } });
  });

  for (const c of INVALID_DEFINITION_CASES) {
    it(`${c.name}, and writes nothing`, async () => {
      // Arrange
      const { files, run } = agentsHarness();

      // Act
      const view = await run(...c.tokens);

      // Assert
      deepStrictEqual(view, { text: c.text });
      deepStrictEqual(files.writes, []);
    });
  }

  it("refuses to write over a file it could not parse", async () => {
    // Arrange
    const { files, run } = agentsHarness(NOT_JSON);

    // Act
    const view = await run("add", "tester", "QA", "|", "find bugs");

    // Assert
    deepStrictEqual(view, { text: MALFORMED_REFUSAL });
    deepStrictEqual(files.writes, []);
  });
});

describe("/agents remove and delete", () => {
  it("removes a saved agent", async () => {
    // Arrange
    const { run, stored } = agentsHarness({ tester: { role: "QA", goal: "g" }, writer: { role: "Docs", goal: "g" } });

    // Act
    const view = await run("remove", "tester");

    // Assert
    deepStrictEqual(view, { text: `agent 'tester' removed from ${AGENTS_FILE_PATH}.` });
    deepStrictEqual(Object.keys(stored() as object), ["writer"]);
  });

  it("removes the last saved agent with `delete`", async () => {
    // Arrange
    const { run, stored } = agentsHarness({ tester: { role: "QA", goal: "g" }, writer: { role: "Docs", goal: "g" } });
    await run("remove", "tester");

    // Act
    const view = await run("delete", "writer");

    // Assert
    deepStrictEqual(view, { text: `agent 'writer' removed from ${AGENTS_FILE_PATH}.` });
    deepStrictEqual(stored(), {});
  });

  for (const c of REMOVE_REFUSAL_CASES) {
    it(`${c.name}, and writes nothing`, async () => {
      // Arrange
      const { files, run } = agentsHarness();

      // Act
      const view = await run(...c.tokens);

      // Assert
      deepStrictEqual(view, { text: c.text });
      deepStrictEqual(files.writes, []);
    });
  }

  it("refuses to write over a file it could not parse", async () => {
    // Arrange
    const { run } = agentsHarness(NOT_JSON);

    // Act
    const view = await run("remove", "tester");

    // Assert
    deepStrictEqual(view, { text: UNPARSED_REFUSAL });
  });
});

describe("/agents — anything else", () => {
  it("answers the usage line", async () => {
    // Arrange
    const { run } = agentsHarness();

    // Act
    const view = await run("launch");

    // Assert
    deepStrictEqual(view, { text: AGENTS_USAGE });
  });
});
