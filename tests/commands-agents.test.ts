// /agents (commands/_lib/agents.ts) over FakeFiles and FakeCrewHost: every
// sub-command, its refusals and its usage lines. Run:
//   node --test tests/commands-agents.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { AGENTS_FILE_PATH, AGENTS_USAGE, runAgents } from "../src/commands/_lib/agents.ts";
import { describeAgentRows } from "../src/shared/domain/agent-registry.ts";
import { FakeCrewHost } from "./support/fake-crew-host.ts";
import { FakeFiles } from "./support/fake-files.ts";

const NOT_DISPATCHED = "saved agents are storage only — this host cannot dispatch one (spawn_agent is not registered).";
const MALFORMED_REFUSAL =
  `refusing to write: ${AGENTS_FILE_PATH} exists but could not be parsed, and overwriting ` +
  "it would discard whatever it holds. Fix or delete it, then retry.";

function setup() {
  const files = new FakeFiles();
  const crews = new FakeCrewHost();
  crews.crews = ["main-loop", "code-review"];
  const run = (...tokens: string[]) => runAgents(tokens, { files, crews });
  const stored = () => JSON.parse(files.files.get(AGENTS_FILE_PATH) ?? "{}");
  const seed = (registry: object) => files.files.set(AGENTS_FILE_PATH, JSON.stringify(registry));
  return { files, crews, run, stored, seed };
}

describe("/agents list", () => {
  it("tables the discovered crews and the saved agents (the default sub-command)", async () => {
    const { run, seed } = setup();
    seed({ tester: { role: "QA", goal: "find bugs", tools: [] } });
    const view = await run();
    deepStrictEqual(view.table, describeAgentRows(["main-loop", "code-review"], [
      { name: "tester", role: "QA", goal: "find bugs", tools: [] },
    ]));
    strictEqual(view.text, `file: ${AGENTS_FILE_PATH} (survives /clear)\n${NOT_DISPATCHED}`);
    deepStrictEqual(await run("list"), view);
  });

  it("reports the entries it ignored, and a file it could not parse", async () => {
    const { files, run, seed } = setup();
    seed({ half: { role: "QA" } });
    strictEqual((await run("list")).text!.split("\n")[1], "⚠ 1 stored entr(y/ies) ignored — missing role or goal: half");
    files.files.set(AGENTS_FILE_PATH, "{ not json");
    strictEqual((await run("list")).text!.split("\n")[1], `⚠ ${AGENTS_FILE_PATH} could not be parsed; it is left untouched.`);
  });
});

describe("/agents — a registry entry that cannot be read", () => {
  // Valid JSON, but a field no String() can convert: the registry could not be
  // parsed, exactly as with invalid JSON, and nothing writes over it.
  const UNREADABLE = '{"bob":{"role":{"toString":1,"valueOf":1},"goal":"g"}}';

  it("lists it as a file that could not be parsed, shows nothing and refuses to write", async () => {
    const { files, run } = setup();
    files.files.set(AGENTS_FILE_PATH, UNREADABLE);
    strictEqual((await run("list")).text!.split("\n")[1], `⚠ ${AGENTS_FILE_PATH} could not be parsed; it is left untouched.`);
    deepStrictEqual(await run("show", "bob"), { text: "no saved agent 'bob'. /agents list shows what there is." });
    deepStrictEqual(await run("add", "tester", "QA", "|", "find bugs"), { text: MALFORMED_REFUSAL });
    deepStrictEqual(await run("remove", "bob"), { text: `refusing to write: ${AGENTS_FILE_PATH} could not be parsed.` });
    deepStrictEqual(files.writes, []);
  });
});

describe("/agents show", () => {
  it("shows a saved agent, its tools or the crew's", async () => {
    const { run, seed } = setup();
    seed({ tester: { role: "QA", goal: "find bugs", tools: ["file_read"] }, writer: { role: "Docs", goal: "write" } });
    deepStrictEqual(await run("show", "Tester"), {
      text: "tester\n  role : QA\n  goal : find bugs\n  tools: file_read",
    });
    strictEqual((await run("show", "writer")).text!.split("\n")[3], "  tools: (inherited from the crew)");
  });

  it("names a built-in crew as such, and an unknown name as unknown", async () => {
    const { run } = setup();
    deepStrictEqual(await run("show", "main-loop"), {
      text: "'main-loop' is a built-in crew (crews/main-loop/), not a saved agent — see its crew.ork.ts.",
    });
    deepStrictEqual(await run("show", "ghost"), { text: "no saved agent 'ghost'. /agents list shows what there is." });
  });
});

describe("/agents add and edit", () => {
  it("saves `<name> <role> | <goal>`, then replaces it on a second add or an edit", async () => {
    const { run, stored } = setup();
    deepStrictEqual(await run("add", "Tester", "Senior", "QA", "|", "find", "bugs"), {
      text: `agent 'tester' saved in ${AGENTS_FILE_PATH}.`,
    });
    deepStrictEqual(stored(), { tester: { role: "Senior QA", goal: "find bugs", tools: [] } });
    deepStrictEqual(await run("edit", "tester", "QA", "|", "find", "more|bugs"), {
      text: `agent 'tester' replaced in ${AGENTS_FILE_PATH}.`,
    });
    deepStrictEqual(stored(), { tester: { role: "QA", goal: "find more|bugs", tools: [] } });
  });

  it("refuses an invalid definition with the usage line, and writes nothing", async () => {
    const { files, run } = setup();
    deepStrictEqual(await run("add", "tester", "QA"), { text: `agent 'tester' needs a goal\n${AGENTS_USAGE}` });
    deepStrictEqual(await run("add"), {
      text: `'' is not a valid agent name (lowercase letters, digits and '-', starting with a letter)\n${AGENTS_USAGE}`,
    });
    deepStrictEqual(files.writes, []);
  });

  it("refuses to write over a file it could not parse", async () => {
    const { files, run } = setup();
    files.files.set(AGENTS_FILE_PATH, "{ not json");
    deepStrictEqual(await run("add", "tester", "QA", "|", "find bugs"), { text: MALFORMED_REFUSAL });
    deepStrictEqual(files.writes, []);
  });
});

describe("/agents remove and delete", () => {
  it("removes a saved agent", async () => {
    const { run, seed, stored } = setup();
    seed({ tester: { role: "QA", goal: "g" }, writer: { role: "Docs", goal: "g" } });
    deepStrictEqual(await run("remove", "tester"), { text: `agent 'tester' removed from ${AGENTS_FILE_PATH}.` });
    deepStrictEqual(Object.keys(stored()), ["writer"]);
    deepStrictEqual(await run("delete", "writer"), { text: `agent 'writer' removed from ${AGENTS_FILE_PATH}.` });
    deepStrictEqual(stored(), {});
  });

  it("asks for a name, and refuses a built-in crew or an unknown name", async () => {
    const { files, run } = setup();
    deepStrictEqual(await run("remove"), { text: AGENTS_USAGE });
    deepStrictEqual(await run("remove", "Code-Review"), {
      text: "'Code-Review' is a built-in crew — it is not stored here and cannot be removed with /agents.",
    });
    deepStrictEqual(await run("remove", "ghost"), { text: "no saved agent 'ghost'." });
    deepStrictEqual(files.writes, []);
  });

  it("refuses to write over a file it could not parse", async () => {
    const { files, run } = setup();
    files.files.set(AGENTS_FILE_PATH, "{ not json");
    deepStrictEqual(await run("remove", "tester"), { text: `refusing to write: ${AGENTS_FILE_PATH} could not be parsed.` });
  });
});

describe("/agents — anything else", () => {
  it("answers the usage line", async () => {
    deepStrictEqual(await setup().run("launch"), { text: AGENTS_USAGE });
  });
});
