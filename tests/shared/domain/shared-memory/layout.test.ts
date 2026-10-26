// The shared memory's folder layout and collection name (M-2). Run:
//   node --test tests/shared/domain/shared-memory/layout.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { candidatePath, checkMemoryDir, entryPath, memoryCollection, memoryLayout, memoryWriteRefusal, memoryWriteRules } from "../../../../src/shared/domain/shared-memory/layout.ts";
import { ruleDecision } from "../../../../src/shared/domain/agent-policy/permission.ts";
import { PATH_WRITE_TOOLS } from "../../../../src/shared/domain/agent-policy/rule-sets.ts";
import {
  AGENT_MEMORY_DIRS, EDIT_BATCH_REFUSALS, FREE_PATHS, HARNESS_DIRS, MEMORY_DIR, ORKEON_MEMORY_LAYOUT, PATH_REFUSALS,
  PROTECTED_SPELLINGS, REWRITE_REFUSALS, SHELL_REFUSALS, SHELL_RULES, SHELL_WORDS_ELSEWHERE,
} from "./layout.fixtures.ts";
import type { RefusalCase } from "./layout.fixtures.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("memoryLayout", () => {
  it(`places every file of the layout under ${WORKSPACE}/<memory.dir>`, () => {
    // Arrange
    const dir = ".orkeon/memory";

    // Act
    const layout = memoryLayout(dir);

    // Assert
    deepStrictEqual(layout, ORKEON_MEMORY_LAYOUT);
  });

  it("places a candidate under the candidates folder", () => {
    // Arrange
    const layout = memoryLayout("m");

    // Act
    const path = candidatePath(layout, "x-method-20261024-a");

    // Assert
    strictEqual(path, `${WORKSPACE}/m/candidates/x-method-20261024-a.md`);
  });

  it("places an entry under the folder of its type", () => {
    // Arrange
    const layout = memoryLayout("m");

    // Act
    const path = entryPath(layout, "mistake", "x-mistake-20261024-a");

    // Assert
    strictEqual(path, `${WORKSPACE}/m/entries/mistake/x-mistake-20261024-a.md`);
  });

  it("names one collection per project", () => {
    // Arrange
    const project = "orkeon-code";

    // Act
    const collection = memoryCollection(project);

    // Assert
    strictEqual(collection, "memory-orkeon-code");
  });
});

describe("checkMemoryDir", () => {
  it("normalises a relative folder", () => {
    // Arrange
    const dir = "./.orkeon/memory/";

    // Act
    const check = checkMemoryDir(dir);

    // Assert
    deepStrictEqual(check, { ok: true, dir: ".orkeon/memory" });
  });

  for (const dir of AGENT_MEMORY_DIRS) {
    it(`keeps the agent memory apart: refuses ${dir}`, () => {
      // Arrange
      const asked = dir;

      // Act
      const check = checkMemoryDir(asked);

      // Assert
      strictEqual(check.ok, false, dir);
    });
  }

  it("accepts a folder whose name only starts like the agent memory's", () => {
    // Arrange
    const dir = ".orkeon/agent-memory-x";

    // Act
    const check = checkMemoryDir(dir);

    // Assert
    strictEqual(check.ok, true);
  });

  for (const dir of HARNESS_DIRS) {
    it(`refuses ${dir}: under .claude/ or .git/ in any case, a case-insensitive file system reads .Claude as .claude`, () => {
      // Arrange
      const asked = dir;

      // Act
      const check = checkMemoryDir(asked);

      // Assert
      deepStrictEqual(check, { ok: false, reason: "under .claude/ or .git/" }, dir);
    });
  }

  it("accepts a folder whose name only starts with .claude", () => {
    // Arrange
    const dir = "docs/.claude-notes";

    // Act
    const check = checkMemoryDir(dir);

    // Assert
    strictEqual(check.ok, true);
  });
});

describe("memoryWriteRules", () => {
  it("makes four path rules per writing tool and two shell rules", () => {
    // Arrange
    const dir = MEMORY_DIR;

    // Act
    const rules = memoryWriteRules(dir);

    // Assert
    strictEqual(rules.length, PATH_WRITE_TOOLS.length * 4 + 2);
  });

  for (const path of PROTECTED_SPELLINGS) {
    it(`denies every writing tool under the candidates and entries, spelt ${path}`, () => {
      // Arrange
      const rules = memoryWriteRules(MEMORY_DIR);

      // Act
      const decisions = PATH_WRITE_TOOLS.map((tool) => ruleDecision(rules, tool, { path }));

      // Assert
      deepStrictEqual(decisions, PATH_WRITE_TOOLS.map(() => "deny"), path);
    });
  }

  for (const path of FREE_PATHS) {
    it(`decides nothing for a writing tool on ${path}`, () => {
      // Arrange
      const rules = memoryWriteRules(MEMORY_DIR);

      // Act
      const decisions = PATH_WRITE_TOOLS.map((tool) => ruleDecision(rules, tool, { path }));

      // Assert
      deepStrictEqual(decisions, PATH_WRITE_TOOLS.map(() => undefined), path);
    });
  }

  it("decides nothing for a read under the entries", () => {
    // Arrange
    const rules = memoryWriteRules(MEMORY_DIR);

    // Act
    const decision = ruleDecision(rules, "file_read", { path: ".orkeon/memory/entries/x.md" });

    // Assert
    strictEqual(decision, undefined);
  });

  for (const c of SHELL_RULES) {
    it(`${c.name}: ${c.command}`, () => {
      // Arrange
      const rules = memoryWriteRules(MEMORY_DIR);

      // Act
      const decision = ruleDecision(rules, "shell_command", { command: c.command });

      // Assert
      strictEqual(decision, c.decision);
    });
  }
});

describe("memoryWriteRules - the shell rule names the folder as a path", () => {
  for (const command of SHELL_WORDS_ELSEWHERE) {
    it(`leaves a command naming the words elsewhere to run: the steps of a \`cd\` are the callback's (memoryWriteRefusal): ${command}`, () => {
      // Arrange
      const rules = memoryWriteRules(MEMORY_DIR);

      // Act
      const decision = ruleDecision(rules, "shell_command", { command });

      // Assert
      strictEqual(decision, undefined);
    });
  }
});

describe("memoryWriteRefusal (the callbacks' check: what the gate cannot read)", () => {
  const groups: Array<[string, readonly RefusalCase[]]> = [
    ["compares a path in any letter case, a case-insensitive file system reading it as the folder", PATH_REFUSALS],
    ["reads the path of every operation of an edit_batch", EDIT_BATCH_REFUSALS],
    ["reads structural_rewrite's paths and glob when it writes, never a dry run", REWRITE_REFUSALS],
    ["refuses a shell command reaching the folder, in steps or in another letter case", SHELL_REFUSALS],
  ];
  for (const [behaviour, cases] of groups) {
    for (const c of cases) {
      it(`${behaviour}: ${c.name} is ${c.refused ? "refused" : "let through"}`, () => {
        // Arrange
        const { tool, input } = c;

        // Act
        const refusal = memoryWriteRefusal(MEMORY_DIR, tool, input);

        // Assert
        strictEqual(refusal !== null, c.refused, `${tool} ${JSON.stringify(input)}`);
      });
    }
  }
});
