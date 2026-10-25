// /doctor (commands/_lib/doctor.ts) over FakeShell, FakeTelemetry,
// FakeToolCatalogue and FakeFiles: each check's pass, warning and failure, and the
// verdict line. Run:
//   node --test src/commands/_lib/doctor.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual, deepStrictEqual } from "node:assert";

import { FAIL, OLD_SESSIONS_DIR, PASS, VERSION_DETAIL, WARN, runDoctor } from "./doctor.ts";
import { CLI_VERSION, ORKEON_RUNTIME_VERSION } from "./meta.ts";
import { CODE_INTEL_TOOLS } from "../../shared/domain/code-intel-contract.ts";
import { CONFIG_FILE_PATH, createConfigStore } from "../../shared/application/config-store.ts";
import { FakeSessionStore } from "../../../tests/support/doubles/fake-session-store.ts";
import { NO_MODEL_DETAIL, doctorHost, healthyTable, rowsOf } from "./doctor.fixtures.ts";
import { WORKSPACE } from "../../shared/domain/vfs.ts";

describe("/doctor — a healthy host", () => {
  it("passes every check, one row each, in order", async () => {
    // Arrange
    const { shell, deps } = doctorHost();

    // Act
    const view = await runDoctor(deps);

    // Assert
    deepStrictEqual(view.table, healthyTable());
    strictEqual(view.text, "all checks passed.");
    deepStrictEqual(shell.commands, ["node --version", "git --version", "dotnet --version"]);
  });
});

describe("/doctor — a project value set aside", () => {
  it("names nothing when the project file sets no permissions.fallback", async () => {
    // Arrange
    const { shell, telemetry, catalogue, files } = doctorHost();
    const config = createConfigStore({ files, session: new FakeSessionStore() });

    // Act
    const quiet = await runDoctor({ shell, telemetry, catalogue, files, config });

    // Assert
    strictEqual(rowsOf(quiet).get("settings: project file")?.result, PASS);
  });

  it("names a permissions.fallback the project file cannot set, as /permissions does", async () => {
    // Arrange
    const { shell, telemetry, catalogue, files } = doctorHost();
    const config = createConfigStore({ files, session: new FakeSessionStore() });
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ "permissions.fallback": "bypassPermissions" }));

    // Act
    const view = await runDoctor({ shell, telemetry, catalogue, files, config });

    // Assert
    const row = rowsOf(view).get("settings: project file");
    strictEqual(row?.result, WARN);
    ok(row!.detail.startsWith("the project file sets permissions.fallback 'bypassPermissions': ignored, "), row!.detail);
    strictEqual(view.text, "all checks passed, 1 warning(s).");
  });
});

describe("/doctor — failures and warnings", () => {
  it("fails a binary that exits non-zero or cannot run", async () => {
    // Arrange
    const { shell, deps } = doctorHost();
    shell.results["git --version"] = { stdout: "", exitCode: 127 };
    shell.errors["dotnet --version"] = new Error("command refused: dotnet\nat ShellTool");

    // Act
    const rows = rowsOf(await runDoctor(deps));

    // Assert
    deepStrictEqual(rows.get("toolchain: git"), { check: "toolchain: git", result: FAIL, detail: "(no output)" });
    deepStrictEqual(rows.get("toolchain: dotnet"), { check: "toolchain: dotnet", result: FAIL, detail: "command refused: dotnet" });
  });

  it("fails a host that reports no model, and warns on an empty catalogue", async () => {
    // Arrange
    const { telemetry, deps } = doctorHost();
    telemetry.failure = new Error("no session tools");

    // Act
    const rows = rowsOf(await runDoctor(deps));

    // Assert
    strictEqual(rows.get("llm: model configured")!.result, FAIL);
    strictEqual(rows.get("llm: model configured")!.detail, NO_MODEL_DETAIL);
    deepStrictEqual(rows.get("llm: declared catalogue"), {
      check: "llm: declared catalogue", result: WARN,
      detail: "no Llm:AvailableModels — /model cannot offer a choice or flag an unserved name",
    });
  });

  it("fails a missing essential tool, and warns on missing code intelligence", async () => {
    // Arrange
    const { catalogue, deps } = doctorHost();
    catalogue.tools.delete("shell_command");
    catalogue.tools.delete(CODE_INTEL_TOOLS[0]);

    // Act
    const rows = rowsOf(await runDoctor(deps));

    // Assert
    deepStrictEqual(rows.get("tools: essential"), { check: "tools: essential", result: FAIL, detail: "MISSING: shell_command" });
    deepStrictEqual(rows.get("tools: code intelligence"), {
      check: "tools: code intelligence", result: WARN,
      detail: `absent: ${CODE_INTEL_TOOLS[0]} — the agent falls back to reading files`,
    });
  });

  it(`passes a ${WORKSPACE} the host spells rwnd (writable, no delete)`, async () => {
    // Arrange
    const { files, deps } = doctorHost();
    files.mountTable = [{ path: WORKSPACE, rights: "rwnd" }];

    // Act
    const rows = rowsOf(await runDoctor(deps));

    // Assert
    deepStrictEqual(rows.get("vfs: mounts"), { check: "vfs: mounts", result: PASS, detail: `${WORKSPACE}(rwnd)` });
  });

  it(`fails a read-only ${WORKSPACE}, and shows unknown rights as '?'`, async () => {
    // Arrange
    const { files, deps } = doctorHost();
    files.mountTable = [{ path: WORKSPACE, rights: "ro" }, { path: "/tmp" }];

    // Act
    const rows = rowsOf(await runDoctor(deps));

    // Assert
    deepStrictEqual(rows.get("vfs: mounts"), {
      check: "vfs: mounts", result: FAIL, detail: `${WORKSPACE}(ro) /tmp(?)  ← ${WORKSPACE} is missing or not writable`,
    });
  });

  it(`fails a ${WORKSPACE} whose rights are outside the mount grammar`, async () => {
    // Arrange
    // Rights outside the mount grammar (the enum's own name) are not read as writable.
    const { files, deps } = doctorHost();
    files.mountTable = [{ path: WORKSPACE, rights: "Write" }];

    // Act
    const rows = rowsOf(await runDoctor(deps));

    // Assert
    strictEqual(rows.get("vfs: mounts")!.result, FAIL);
  });

  it(`fails an absent ${WORKSPACE}`, async () => {
    // Arrange
    const { files, deps } = doctorHost();
    files.mountTable = [];

    // Act
    const rows = rowsOf(await runDoctor(deps));

    // Assert
    strictEqual(rows.get("vfs: mounts")!.detail, `(none)  ← ${WORKSPACE} is missing or not writable`);
  });

  it("warns when the mounts cannot be listed", async () => {
    // Arrange
    const { files, deps } = doctorHost();
    files.mountsFailure = new Error("listMounts is not a function\nstack");

    // Act
    const rows = rowsOf(await runDoctor(deps));

    // Assert
    deepStrictEqual(rows.get("vfs: mounts"), {
      check: "vfs: mounts", result: WARN, detail: "list_mounts unavailable: listMounts is not a function",
    });
  });
});

describe("/doctor — sessions left in the project", () => {
  it("names a .orkeon/sessions folder of an older start, and leaves it alone", async () => {
    // Arrange
    const { files, deps } = doctorHost();
    files.listings.set(OLD_SESSIONS_DIR, ["code-1a2b3c4d5e6f"]);

    // Act
    const row = rowsOf(await runDoctor(deps)).get("sessions: outside the project")!;

    // Assert
    strictEqual(row.result, WARN);
    ok(row.detail.startsWith(`${WORKSPACE}/.orkeon/sessions holds sessions of an older start, left alone`), row.detail);
    deepStrictEqual(files.writes, []);
  });

  it("passes when the folder cannot be listed (absent)", async () => {
    // Arrange
    const { files, deps } = doctorHost();
    files.list = async () => { throw new Error("directory not found"); };

    // Act
    const rows = rowsOf(await runDoctor(deps));

    // Assert
    strictEqual(rows.get("sessions: outside the project")!.result, PASS);
  });
});

describe("/doctor — the version and the project values set aside (LI-1, LI-6)", () => {
  it("names Code's version and the Orkeon it expects", () => {
    // Arrange
    const expected = `Orkeon expected ${ORKEON_RUNTIME_VERSION}`;

    // Act
    const detail = VERSION_DETAIL;

    // Assert
    ok(detail.includes(CLI_VERSION) && detail.includes(expected), detail);
  });

  it("warns on a project value that would widen, with why it is ignored", async () => {
    // Arrange
    const { ignored, deps } = doctorHost();
    ignored.set("permissions.fallback", { value: "bypassPermissions", reason: "a project file may only narrow it" });

    // Act
    const rows = rowsOf(await runDoctor(deps));

    // Assert
    deepStrictEqual(rows.get("settings: project file"), {
      check: "settings: project file", result: WARN,
      detail: "the project file sets permissions.fallback 'bypassPermissions': ignored, a project file may only narrow it",
    });
  });
});

describe("/doctor — the verdict", () => {
  it("counts the warnings", async () => {
    // Arrange
    const { telemetry, deps } = doctorHost();
    telemetry.metadata = { model: "kimi-k3" };

    // Act
    const view = await runDoctor(deps);

    // Assert
    strictEqual(view.text, "all checks passed, 1 warning(s).");
  });

  it("counts the failures and the warnings", async () => {
    // Arrange
    const { telemetry, files, deps } = doctorHost();
    files.mountsFailure = new Error("unavailable");
    telemetry.metadata = {};

    // Act
    const view = await runDoctor(deps);

    // Assert
    strictEqual(view.text, "1 check(s) FAILED, 2 warning(s) — the host is not fully usable.");
  });
});
