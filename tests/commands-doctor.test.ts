// /doctor (commands/_lib/doctor.ts) over FakeShell, FakeTelemetry,
// FakeToolCatalogue and FakeFiles: each check's pass, warning and failure, and the
// verdict line. Run:
//   node --test tests/commands-doctor.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { ESSENTIAL_TOOLS, FAIL, PASS, WARN, runDoctor } from "../src/commands/_lib/doctor.ts";
import type { DoctorRow } from "../src/commands/_lib/doctor.ts";
import { CODE_INTEL_TOOLS } from "../src/shared/domain/code-intel-contract.ts";
import { FakeFiles } from "./support/fake-files.ts";
import { FakeShell } from "./support/fake-shell.ts";
import { FakeTelemetry } from "./support/fake-telemetry.ts";
import { FakeToolCatalogue } from "./support/fake-tool-catalogue.ts";

/** A host where every check passes. */
function setup() {
  const shell = new FakeShell();
  shell.results = {
    "node --version": { stdout: "v24.1.0\n" },
    "git --version": { stdout: "git version 2.47.0\n" },
    "dotnet --version": { stdout: "10.0.100\n" },
  };
  const telemetry = new FakeTelemetry();
  telemetry.metadata = { model: "kimi-k3", availableModels: ["kimi-k3", "deepseek-chat"] };
  const catalogue = new FakeToolCatalogue();
  for (const t of [...ESSENTIAL_TOOLS, ...CODE_INTEL_TOOLS]) catalogue.tools.set(t, {});
  const files = new FakeFiles();
  files.mountTable = [{ path: "/workspace", rights: "rw" }, { path: "/crews", rights: "ro" }];
  const run = async () => {
    const view = await runDoctor({ shell, telemetry, catalogue, files });
    const rows = new Map((view.table as DoctorRow[]).map((r) => [r.check, r]));
    return { view, rows };
  };
  return { shell, telemetry, catalogue, files, run };
}

describe("/doctor — a healthy host", () => {
  it("passes every check, one row each, in order", async () => {
    const { shell, run } = setup();
    const { view } = await run();
    const tools = new Set([...ESSENTIAL_TOOLS, ...CODE_INTEL_TOOLS]).size;
    deepStrictEqual(view.table, [
      { check: "toolchain: node", result: PASS, detail: "v24.1.0" },
      { check: "toolchain: git", result: PASS, detail: "git version 2.47.0" },
      { check: "toolchain: dotnet", result: PASS, detail: "10.0.100" },
      { check: "llm: model configured", result: PASS, detail: "kimi-k3 (not pinged — a reachability test costs a real call)" },
      { check: "llm: declared catalogue", result: PASS, detail: "kimi-k3, deepseek-chat" },
      { check: "tools: essential", result: PASS, detail: `${tools} registered, all ${ESSENTIAL_TOOLS.length} essentials present` },
      { check: "tools: code intelligence", result: PASS, detail: `all ${CODE_INTEL_TOOLS.length} present` },
      { check: "vfs: mounts", result: PASS, detail: "/workspace(rw) /crews(ro)" },
    ]);
    strictEqual(view.text, "all checks passed.");
    deepStrictEqual(shell.commands, ["node --version", "git --version", "dotnet --version"]);
  });
});

describe("/doctor — failures and warnings", () => {
  it("fails a binary that exits non-zero or cannot run", async () => {
    const { shell, run } = setup();
    shell.results["git --version"] = { stdout: "", exitCode: 127 };
    shell.errors["dotnet --version"] = new Error("command refused: dotnet\nat ShellTool");
    const { rows } = await run();
    deepStrictEqual(rows.get("toolchain: git"), { check: "toolchain: git", result: FAIL, detail: "(no output)" });
    deepStrictEqual(rows.get("toolchain: dotnet"), { check: "toolchain: dotnet", result: FAIL, detail: "command refused: dotnet" });
  });

  it("fails a host that reports no model, and warns on an empty catalogue", async () => {
    const { telemetry, run } = setup();
    telemetry.failure = new Error("no session tools");
    const { rows } = await run();
    strictEqual(rows.get("llm: model configured")!.result, FAIL);
    strictEqual(rows.get("llm: model configured")!.detail,
      "the host reports NO model: expect every /assistant turn to no-op. Check the `Llm` section of the settings file.");
    deepStrictEqual(rows.get("llm: declared catalogue"), {
      check: "llm: declared catalogue", result: WARN,
      detail: "no Llm:AvailableModels — /model cannot offer a choice or flag an unserved name",
    });
  });

  it("fails a missing essential tool, and warns on missing code intelligence", async () => {
    const { catalogue, run } = setup();
    catalogue.tools.delete("shell_command");
    catalogue.tools.delete(CODE_INTEL_TOOLS[0]);
    const { rows } = await run();
    deepStrictEqual(rows.get("tools: essential"), { check: "tools: essential", result: FAIL, detail: "MISSING: shell_command" });
    deepStrictEqual(rows.get("tools: code intelligence"), {
      check: "tools: code intelligence", result: WARN,
      detail: `absent: ${CODE_INTEL_TOOLS[0]} — the agent falls back to reading files`,
    });
  });

  it("passes a /workspace the host spells rwnd (writable, no delete)", async () => {
    const { files, run } = setup();
    files.mountTable = [{ path: "/workspace", rights: "rwnd" }];
    deepStrictEqual((await run()).rows.get("vfs: mounts"), { check: "vfs: mounts", result: PASS, detail: "/workspace(rwnd)" });
  });

  it("fails a read-only or absent /workspace, and shows unknown rights as '?'", async () => {
    const { files, run } = setup();
    files.mountTable = [{ path: "/workspace", rights: "ro" }, { path: "/tmp" }];
    deepStrictEqual((await run()).rows.get("vfs: mounts"), {
      check: "vfs: mounts", result: FAIL, detail: "/workspace(ro) /tmp(?)  ← /workspace is missing or not writable",
    });
    // Rights outside the mount grammar (the enum's own name) are not read as writable.
    files.mountTable = [{ path: "/workspace", rights: "Write" }];
    strictEqual((await run()).rows.get("vfs: mounts")!.result, FAIL);
    files.mountTable = [];
    strictEqual((await run()).rows.get("vfs: mounts")!.detail, "(none)  ← /workspace is missing or not writable");
  });

  it("warns when the mounts cannot be listed", async () => {
    const { files, run } = setup();
    files.mountsFailure = new Error("listMounts is not a function\nstack");
    deepStrictEqual((await run()).rows.get("vfs: mounts"), {
      check: "vfs: mounts", result: WARN, detail: "list_mounts unavailable: listMounts is not a function",
    });
  });
});

describe("/doctor — the verdict", () => {
  it("counts the failures and the warnings", async () => {
    const { telemetry, files, run } = setup();
    telemetry.metadata = { model: "kimi-k3" };
    strictEqual((await run()).view.text, "all checks passed, 1 warning(s).");
    files.mountsFailure = new Error("unavailable");
    telemetry.metadata = {};
    strictEqual((await run()).view.text, "1 check(s) FAILED, 2 warning(s) — the host is not fully usable.");
  });
});
