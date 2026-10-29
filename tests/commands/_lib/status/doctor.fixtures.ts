// The host /doctor checks (FakeShell, FakeTelemetry, FakeToolCatalogue, FakeFiles and a config reader), healthy by
// default, and the table it answers for it.
import { CODE_VERSION_DETAIL, ESSENTIAL_TOOLS, PASS } from "../../../../src/commands/_lib/status/doctor.ts";
import { ORKEON_RUNTIME_PIN } from "../../../../src/commands/_lib/status/meta.ts";
import { FakeRuntimeInfo } from "../../../support/doubles/fake-runtime-info.ts";
import type { DoctorRow } from "../../../../src/commands/_lib/status/doctor.ts";
import type { CommandView } from "../../../../src/commands/_lib/view.ts";
import type { ConfigResolution } from "../../../../src/shared/domain/config-schema.ts";
import { CODE_INTEL_TOOLS } from "../../../../src/shared/domain/code-intel-contract.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeShell } from "../../../support/doubles/fake-shell.ts";
import { FakeTelemetry } from "../../../support/doubles/fake-telemetry.ts";
import { FakeToolCatalogue } from "../../../support/doubles/fake-tool-catalogue.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

/** The runtime a healthy host runs: the sources at the pinned commit. */
export const PINNED_RUNTIME = { version: "1.0.0-rc.6", commit: ORKEON_RUNTIME_PIN, channel: "source" };

/** A host where every check passes; `ignored` sets aside a project value per key, `deps` is what runDoctor takes. */
export function doctorHost() {
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
  files.mountTable = [{ path: WORKSPACE, rights: "rw" }, { path: "/crews", rights: "ro" }];
  const runtime = new FakeRuntimeInfo();
  runtime.info = { ...PINNED_RUNTIME };
  const ignored = new Map<string, ConfigResolution["ignored"]>();
  const config = {
    readValue: async (key: string): Promise<ConfigResolution> =>
      ({ key, value: undefined, source: "unset", ...(ignored.has(key) ? { ignored: ignored.get(key) } : {}) }),
  };
  return { shell, telemetry, catalogue, files, runtime, ignored, deps: { shell, telemetry, catalogue, files, config, runtime } };
}

/** The rows of a /doctor view, by check. */
export function rowsOf(view: CommandView): Map<string, DoctorRow> {
  return new Map((view.table as DoctorRow[]).map((r) => [r.check, r]));
}

/** The table of a healthy host: every check passes, one row each, in order. */
export function healthyTable(): DoctorRow[] {
  const tools = new Set([...ESSENTIAL_TOOLS, ...CODE_INTEL_TOOLS]).size;
  return [
    { check: "version", result: PASS, detail: `${CODE_VERSION_DETAIL}; Orkeon 1.0.0-rc.6+${ORKEON_RUNTIME_PIN} (source), the pin of .orkeon-version` },
    { check: "toolchain: node", result: PASS, detail: "v24.1.0" },
    { check: "toolchain: git", result: PASS, detail: "git version 2.47.0" },
    { check: "toolchain: dotnet", result: PASS, detail: "10.0.100" },
    { check: "llm: model configured", result: PASS, detail: "kimi-k3 (not pinged — a reachability test costs a real call)" },
    { check: "llm: declared catalogue", result: PASS, detail: "kimi-k3, deepseek-chat" },
    { check: "tools: essential", result: PASS, detail: `${tools} registered, all ${ESSENTIAL_TOOLS.length} essentials present` },
    { check: "tools: code intelligence", result: PASS, detail: `all ${CODE_INTEL_TOOLS.length} present` },
    { check: "vfs: mounts", result: PASS, detail: `${WORKSPACE}(rw) /crews(ro)` },
    { check: "sessions: outside the project", result: PASS, detail: "nothing in .orkeon/sessions" },
    { check: "settings: project file", result: PASS, detail: "widens nothing" },
  ];
}

export const NO_MODEL_DETAIL =
  "the host reports NO model: expect every /assistant turn to no-op. Check the `Llm` section of the settings file.";
