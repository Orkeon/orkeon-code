// /skills (commands/_lib/skills.ts) over FakeSessionStore and FakeFiles: list,
// attach and detach, their refusals and usage lines. Run:
//   node --test tests/commands-skills.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { runSkills } from "../src/commands/_lib/skills.ts";
import { SKILLS_STATE_KEY } from "../src/shared/domain/session-keys.ts";
import { FakeFiles } from "./support/fake-files.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";

const SKILL = "/workspace/docs/release.md";

function setup() {
  const session = new FakeSessionStore();
  const files = new FakeFiles();
  files.files.set(SKILL, "# Release playbook");
  const run = (...tokens: string[]) => runSkills(tokens, { session, files });
  const attached = (): unknown => JSON.parse(session.state.get(SKILLS_STATE_KEY) ?? "null");
  return { session, files, run, attached };
}

describe("/skills list", () => {
  it("says none are attached, with the usage (the default sub-command)", async () => {
    deepStrictEqual(await setup().run(), {
      text: "no skills attached. usage: /skills attach <workspace path to a .md playbook>",
    });
  });

  it("tables the attached paths, numbered", async () => {
    const { session, run } = setup();
    session.state.set(SKILLS_STATE_KEY, JSON.stringify([SKILL, "/workspace/b.md"]));
    deepStrictEqual(await run("list"), { table: [{ n: 1, path: SKILL }, { n: 2, path: "/workspace/b.md" }] });
  });
});

describe("/skills attach", () => {
  it("attaches a readable file once", async () => {
    const { run, attached } = setup();
    deepStrictEqual(await run("attach", SKILL), { text: `skill attached: ${SKILL} (1 attached; /reset-session clears).` });
    deepStrictEqual(await run("attach", SKILL), { text: `skill attached: ${SKILL} (1 attached; /reset-session clears).` });
    deepStrictEqual(attached(), [SKILL]);
  });

  it("refuses a file it cannot read, and asks for a path", async () => {
    const { run, attached } = setup();
    deepStrictEqual(await run("attach", "/workspace/gone.md"), {
      text: "cannot attach '/workspace/gone.md' — the file is not readable in the mounted workspace.",
    });
    deepStrictEqual(await run("attach"), { text: "usage: /skills attach <path>" });
    strictEqual(attached(), null);
  });
});

describe("/skills detach", () => {
  it("detaches by number", async () => {
    const { session, run, attached } = setup();
    session.state.set(SKILLS_STATE_KEY, JSON.stringify([SKILL, "/workspace/b.md"]));
    deepStrictEqual(await run("detach", "1"), { text: `skill detached: ${SKILL}` });
    deepStrictEqual(attached(), ["/workspace/b.md"]);
  });

  it("refuses a number out of range, with the range", async () => {
    const { session, run } = setup();
    deepStrictEqual(await run("detach", "1"), { text: "usage: /skills detach <1-1>" });
    session.state.set(SKILLS_STATE_KEY, JSON.stringify([SKILL, "/workspace/b.md"]));
    deepStrictEqual(await run("detach", "3"), { text: "usage: /skills detach <1-2>" });
    deepStrictEqual(await run("detach", "x"), { text: "usage: /skills detach <1-2>" });
  });
});

describe("/skills — anything else", () => {
  it("answers the usage line", async () => {
    deepStrictEqual(await setup().run("load"), { text: "usage: /skills [list|attach <path>|detach <n>]" });
  });
});
