// /memory-admit (M-4): parsing, the list, a refusal, one confirmation per candidate, the headless
// refusal and auto-admission of an audited candidate. Run: node --test src/commands/_lib/memory/memory-admit.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert";

import { parseMemoryAdmitArgs } from "./memory-admit.ts";
import { entryText } from "../../../../tests/support/fixtures/memory-entries.ts";
import {
  ACCEPTED_ARGS_CASES,
  CANCELLED_ANSWERS,
  NO_ANSWERS,
  REFUSED_ARGS_CASES,
  admitHarness,
  admittedIds,
  audited,
  layout,
  method,
  oneBatch,
} from "./memory-admit.fixtures.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

describe("parseMemoryAdmitArgs", () => {
  for (const c of ACCEPTED_ARGS_CASES) {
    it(c.name, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseMemoryAdmitArgs(tokens);

      // Assert
      deepStrictEqual(parsed, c.expected);
    });
  }

  for (const c of REFUSED_ARGS_CASES) {
    it(c.name, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseMemoryAdmitArgs(tokens);

      // Assert
      ok(!parsed.ok);
    });
  }
});

describe("runMemoryAdmit", () => {
  it("imports the harness's agent memory into candidates and asks nothing", async () => {
    // Arrange
    const { files, lines, asked, run } = admitHarness();
    files.files.set(`${WORKSPACE}/.claude/agent-memory/dev-auditor/MEMORY.md`, "- Name the port before the adapter\n");

    // Act
    const result = await run({ kind: "import" });

    // Assert
    const message = (result as { message?: string }).message ?? "";
    ok(message.includes("1 candidate(s) written: shop-method-20261024-name-the-port-before-the-adapter"), message);
    ok(files.files.has(`${layout.candidates}/shop-method-20261024-name-the-port-before-the-adapter.md`));
    deepStrictEqual(asked, []);
    deepStrictEqual(lines, []);
  });

  it("lists the pending candidates", async () => {
    // Arrange
    const { run } = admitHarness();

    // Act
    const r = await run({ kind: "list" });

    // Assert
    ok("message" in r && r.message.includes(method.id) && r.message.includes(audited.id));
  });

  it("asks once per candidate and hands the yes to the crew", async () => {
    // Arrange
    const { run, asked, lines } = admitHarness({}, [true, false]);

    // Act
    const r = await run({ kind: "admit", ids: [] });

    // Assert
    deepStrictEqual(admittedIds(r), [method.id]);
    strictEqual(asked.length, 2);
    ok(lines.some((l) => l.includes("applies when: a module does the thing")));
    ok(lines.includes("  left as a candidate"));
  });

  for (const c of NO_ANSWERS) {
    it(`admits nothing in a session that cannot prompt: ${c.name}`, async () => {
      // Arrange
      const { run } = admitHarness({}, [c.answer]);

      // Act
      const r = await run({ kind: "admit", ids: [] });

      // Assert
      ok("refused" in r && r.refused.includes("cannot prompt"));
    });
  }

  for (const c of CANCELLED_ANSWERS) {
    it(`keeps a confirmed admission when a later question is cancelled: ${c.name}`, async () => {
      // Arrange
      const { run, asked } = admitHarness({}, [true, c.answer]);

      // Act
      const r = await run({ kind: "admit", ids: [] });

      // Assert
      strictEqual(asked.length, 2);
      strictEqual(admittedIds(r).length, 1);
      ok((r as any).refusedQuestions.includes("got no answer"), JSON.stringify(r));
      strictEqual((r as any).refusedQuestions.includes("cannot prompt"), false);
    });
  }

  it("admits an audited candidate unasked when memory.autoAdmitAudited is true", async () => {
    // Arrange
    const { run, asked } = admitHarness({ "memory.autoAdmitAudited": "true" }, []);

    // Act
    const r = await run({ kind: "admit", ids: [audited.id] });

    // Assert
    deepStrictEqual(admittedIds(r), [audited.id]);
    strictEqual(asked.length, 0);
    ok(/^[0-9a-f]{40}$/.test((r as any).admit[0].sha1));
  });

  it("asks about an audited mistake of fewer than three batches, and keeps the unasked ones headless", async () => {
    // Arrange
    const { run, files, asked } = admitHarness({ "memory.autoAdmitAudited": "true" }, [new Error("no console")]);
    files.files.set(`${layout.candidates}/${oneBatch.id}.md`, entryText(oneBatch));

    // Act
    const r = await run({ kind: "admit", ids: [] });

    // Assert
    deepStrictEqual(admittedIds(r), [audited.id]);
    ok((r as any).refusedQuestions.includes("cannot prompt"));
    strictEqual(asked.length, 1);
  });

  it("names an id that is not pending", async () => {
    // Arrange
    const { run, lines } = admitHarness();

    // Act
    const r = await run({ kind: "admit", ids: ["shop-method-20261022-absent"] });

    // Assert
    deepStrictEqual(r, { message: "Nothing admitted." });
    ok(lines[0].includes("not a pending candidate"));
  });

  it("says when nothing is pending", async () => {
    // Arrange
    const empty = admitHarness();
    empty.files.files.clear();

    // Act
    const none = await empty.run({ kind: "admit", ids: [] });

    // Assert
    ok("message" in none && none.message.startsWith("No pending candidate"));
  });

  it("refuses a candidate here, without the crew", async () => {
    // Arrange
    const { run, files } = admitHarness();

    // Act
    const r = await run({ kind: "refuse", id: method.id, motif: "too local" });

    // Assert
    ok("message" in r && r.message === `refused ${method.id}`);
    ok(files.files.get(layout.refused)!.includes("contract-first | shop | 2026-10-24 | too local"));
  });

  it("refuses to refuse a candidate refused already", async () => {
    // Arrange
    const { run } = admitHarness();
    await run({ kind: "refuse", id: method.id, motif: "too local" });

    // Act
    const again = await run({ kind: "refuse", id: method.id });

    // Assert
    ok("refused" in again);
  });
});
