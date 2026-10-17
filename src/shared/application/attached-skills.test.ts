// The attached /skills over FakeSessionStore and FakeFiles. Run:
//   node --test src/shared/application/attached-skills.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { readAttachedSkills } from "./attached-skills.ts";
import { SKILLS_STATE_KEY } from "../domain/session-keys.ts";
import { FakeFiles } from "../../../tests/support/fake-files.ts";
import { FakeSessionStore } from "../../../tests/support/fake-session-store.ts";

function setup(registry: string | null) {
  const session = new FakeSessionStore();
  if (registry !== null) session.state.set(SKILLS_STATE_KEY, registry);
  return { session, files: new FakeFiles() };
}

describe("readAttachedSkills", () => {
  it("reads each attached path with its content, in attachment order", async () => {
    const { session, files } = setup(`["/workspace/b.md","/workspace/a.md"]`);
    files.files.set("/workspace/a.md", "# A");
    files.files.set("/workspace/b.md", "# B");
    deepStrictEqual(await readAttachedSkills(session, files), [
      { path: "/workspace/b.md", content: "# B" },
      { path: "/workspace/a.md", content: "# A" },
    ]);
  });

  it("drops a skill whose file has gone, cannot be read or is blank", async () => {
    const { session, files } = setup(`["/workspace/gone.md","/workspace/locked.md","/workspace/blank.md","/workspace/ok.md"]`);
    files.readErrors.set("/workspace/locked.md", new Error("access denied"));
    files.files.set("/workspace/blank.md", "  \n");
    files.files.set("/workspace/ok.md", "# OK");
    deepStrictEqual(await readAttachedSkills(session, files), [{ path: "/workspace/ok.md", content: "# OK" }]);
  });

  it("skips registry entries that are not paths", async () => {
    const { session, files } = setup(`["", null, "/workspace/a.md"]`);
    files.files.set("/workspace/a.md", "# A");
    deepStrictEqual(await readAttachedSkills(session, files), [{ path: "/workspace/a.md", content: "# A" }]);
  });

  it("reads nothing from an unset, malformed or unreadable registry", async () => {
    deepStrictEqual(await readAttachedSkills(setup(null).session, new FakeFiles()), []);
    deepStrictEqual(await readAttachedSkills(setup("[oops").session, new FakeFiles()), []);
    const { session, files } = setup(`["/workspace/a.md"]`);
    session.failure = new Error("no session_store tool");
    deepStrictEqual(await readAttachedSkills(session, files), []);
  });
});
