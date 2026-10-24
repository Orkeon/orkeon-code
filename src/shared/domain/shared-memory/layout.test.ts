// The shared memory's folder layout and collection name (M-2). Run:
//   node --test src/shared/domain/shared-memory/layout.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { candidatePath, checkMemoryDir, entryPath, memoryCollection, memoryLayout, memoryWriteRefusal, memoryWriteRules } from "./layout.ts";
import { ruleDecision } from "../agent-policy/permission.ts";
import { PATH_WRITE_TOOLS } from "../agent-policy/rule-sets.ts";

describe("memoryLayout", () => {
  it("places every file of the layout under /workspace/<memory.dir>", () => {
    deepStrictEqual(memoryLayout(".orkeon/memory"), {
      root: "/workspace/.orkeon/memory",
      candidates: "/workspace/.orkeon/memory/candidates",
      candidatesList: "/workspace/.orkeon/memory/candidates/CANDIDATES.md",
      entries: "/workspace/.orkeon/memory/entries",
      refused: "/workspace/.orkeon/memory/refused.md",
      index: "/workspace/.orkeon/memory/INDEX.md",
      golden: "/workspace/.orkeon/memory/eval/golden.yaml",
      entriesGlob: "/workspace/.orkeon/memory/entries/**/*.md",
    });
    strictEqual(candidatePath(memoryLayout("m"), "x-method-20261024-a"), "/workspace/m/candidates/x-method-20261024-a.md");
    strictEqual(entryPath(memoryLayout("m"), "mistake", "x-mistake-20261024-a"), "/workspace/m/entries/mistake/x-mistake-20261024-a.md");
  });

  it("names one collection per project", () => strictEqual(memoryCollection("orkeon-code"), "memory-orkeon-code"));
});

describe("checkMemoryDir", () => {
  it("normalises a relative folder", () => {
    deepStrictEqual(checkMemoryDir("./.orkeon/memory/"), { ok: true, dir: ".orkeon/memory" });
  });

  it("keeps the agent memory apart: neither it, a folder inside it, nor one that holds it", () => {
    for (const dir of [".orkeon/agent-memory", ".orkeon/agent-memory/shared", ".orkeon"]) {
      strictEqual(checkMemoryDir(dir).ok, false, dir);
    }
    strictEqual(checkMemoryDir(".orkeon/agent-memory-x").ok, true);
  });

  it("refuses a folder under .claude/ or .git/, in any case: a case-insensitive file system reads .Claude as .claude", () => {
    for (const dir of [".claude", ".claude/memory", "./.claude/memory", ".Claude/memory", ".CLAUDE", ".Git/x", ".git"]) {
      deepStrictEqual(checkMemoryDir(dir), { ok: false, reason: "under .claude/ or .git/" }, dir);
    }
    strictEqual(checkMemoryDir("docs/.claude-notes").ok, true);
  });
});

describe("memoryWriteRules", () => {
  it("denies the writing tools under the memory's candidates and entries, however the path is spelt, nothing else", () => {
    const rules = memoryWriteRules(".orkeon/memory");
    strictEqual(rules.length, PATH_WRITE_TOOLS.length * 4 + 2);
    const spellings = [
      "/workspace/.orkeon/memory/entries/decision/x.md", ".orkeon/memory/entries/x.md", ".orkeon/memory/candidates/CANDIDATES.md",
      "./.orkeon/memory/candidates/x.md", "/workspace/./.orkeon/memory/candidates/x.md", "/workspace//.orkeon/memory/candidates/x.md",
      ".orkeon/memory//candidates/x.md", "src/../.orkeon/memory/candidates/x.md", "../workspace/.orkeon/memory/entries/x.md",
    ];
    for (const tool of PATH_WRITE_TOOLS) {
      for (const path of spellings) strictEqual(ruleDecision(rules, tool, { path }), "deny", `${tool} ${path}`);
      for (const path of [".orkeon/memory/refused.md", ".orkeon/memory/INDEX.md", "src/entries/x.md", "my.orkeon/memory/entries/x.md"]) {
        strictEqual(ruleDecision(rules, tool, { path }), undefined, path);
      }
    }
    strictEqual(ruleDecision(rules, "file_read", { path: ".orkeon/memory/entries/x.md" }), undefined);
    strictEqual(ruleDecision(rules, "shell_command", { command: "printf x > .orkeon/memory/candidates/x.md" }), "deny");
    strictEqual(ruleDecision(rules, "shell_command", { command: "cp a.md ./.orkeon/memory/entries/decision/" }), "deny");
    strictEqual(ruleDecision(rules, "shell_command", { command: "cat .orkeon/memory/refused.md" }), undefined);
  });
});

describe("memoryWriteRules - a shell command reaching the folder in steps", () => {
  it("denies a command that names the folder's segments then the leaf, a `cd` between them", () => {
    const rules = memoryWriteRules(".orkeon/memory");
    for (const command of ["cd .orkeon/memory && printf x > entries/a.md", "cd .orkeon && cd memory && cp x candidates/"]) {
      strictEqual(ruleDecision(rules, "shell_command", { command }), "deny", command);
    }
    strictEqual(ruleDecision(rules, "shell_command", { command: "cd .orkeon/memory && cat refused.md" }), undefined);
  });
});

describe("memoryWriteRefusal (the callbacks' check: what the gate cannot read)", () => {
  const refused = (tool: string, input: unknown): boolean => memoryWriteRefusal(".orkeon/memory", tool, input) !== null;

  it("compares a path in any letter case, a case-insensitive file system reading it as the folder", () => {
    for (const path of [".Orkeon/Memory/Entries/x.md", "/workspace/.ORKEON/memory/CANDIDATES/x.md", "./.orkeon//Memory/entries/a/b.md"]) {
      strictEqual(refused("file_write", { path }), true, path);
    }
    strictEqual(refused("file_write", { path: ".orkeon/memory/refused.md" }), false);
    strictEqual(refused("file_read", { path: ".orkeon/memory/entries/x.md" }), false);
    strictEqual(refused("file_write", { path: "src/entries/x.md" }), false);
  });

  it("reads the path of every operation of an edit_batch", () => {
    strictEqual(refused("edit_batch", { operations: [
      { kind: "node_replace", path: "src/a.ts", selector: "x", text: "y" },
      { kind: "ensure_section", path: "/workspace/.orkeon/memory/entries/decision/x.md", selector: "## A", text: "b" },
    ] }), true);
    strictEqual(refused("edit_batch", { operations: [{ kind: "node_replace", path: "src/a.ts", selector: "x", text: "y" }] }), false);
  });

  it("reads structural_rewrite's paths and glob when it writes, never a dry run", () => {
    strictEqual(refused("structural_rewrite", { paths: [".orkeon/memory/entries"], dry_run: false }), true);
    strictEqual(refused("structural_rewrite", { paths: [".orkeon/memory/entries"] }), false, "a dry run by default");
    strictEqual(refused("structural_rewrite", { glob: "**/*.md", dry_run: false }), true, "the whole project reaches it");
    strictEqual(refused("structural_rewrite", { paths: [".orkeon"], dry_run: false }), true);
    strictEqual(refused("structural_rewrite", { glob: "src/**/*.ts", dry_run: false }), false);
    strictEqual(refused("structural_rewrite", { paths: ["src"], glob: "**/*.ts", dry_run: false }), false);
  });

  it("refuses a shell command reaching the folder, in steps or in another letter case", () => {
    for (const command of ["cd .orkeon/memory && printf x > entries/a.md", "cp a.md .Orkeon/Memory/Candidates/", "cd \".orkeon\" && cd memory && mv x entries"]) {
      strictEqual(refused("shell_command", { command }), true, command);
    }
    strictEqual(refused("shell_command", { command: "cat .orkeon/memory/refused.md" }), false);
  });
});
