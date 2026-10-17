// The CrewMemory adapter over a FakeAgentContext. Run:
//   node --test src/shared/infrastructure/orkeon/crew-memory.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { createCrewMemory } from "./crew-memory.ts";
import { FakeAgentContext } from "../../../../tests/support/fake-agent-context.ts";

describe("createCrewMemory", () => {
  it("keeps a value in the crew's memory under its key", async () => {
    const ctx = new FakeAgentContext();
    await createCrewMemory(ctx).store("commit_message", "fix(api): handle null");
    deepStrictEqual([...ctx.crewMemory], [["commit_message", "fix(api): handle null"]]);
  });
});
