// /doctor — health check: runtime, LLM reachability, tools, mounts
// (baseline 04 §/doctor: "validate the runtime environment, configuration
// integrity, API connectivity, and tool availability; emit a per-check
// pass/fail report").
//
// B-11 deepening. The pre-B-11 version probed three binary versions
// (node/git/dotnet) and stopped, so the four checks the baseline asks for were one:
// nothing looked at the LLM configuration, the tool catalogue or the VFS mounts.
//
// Today's debugging round is the argument for this: a REPL booted with no `Llm`
// section answered every turn with silence, and /doctor — the command whose entire
// job is to say "this host is not going to work" — reported three green rows.
//
// What "LLM" can honestly check from script-land: whether the host reports a model
// at all. Reachability would need a real call, i.e. money and a wait, so the check
// says what it verified and what it did not rather than implying a ping.

import type { Files, SessionMetadata, Shell, Telemetry, ToolCatalogue } from "../../shared/application/ports.ts";
import { CODE_INTEL_TOOLS } from "../../shared/domain/code-intel-contract.ts";
import type { CommandView } from "./view.ts";

/** Tools the coding agent cannot work without — absence is a FAIL, not a note. */
export const ESSENTIAL_TOOLS = ["file_read", "file_write", "shell_command", "directory_read", "session_store"];

export type DoctorRow = { check: string; result: string; detail: string };
export const PASS = "✅";
export const WARN = "⚠";
export const FAIL = "❌";

export interface DoctorDeps {
  shell: Shell;
  telemetry: Pick<Telemetry, "readMetadata">;
  catalogue: Pick<ToolCatalogue, "names">;
  files: Pick<Files, "mounts">;
}

/** Every check, one row each, and the verdict over them. */
export async function runDoctor(deps: DoctorDeps): Promise<CommandView> {
  const { shell, telemetry, catalogue, files } = deps;
  const rows: DoctorRow[] = [];

  // 1. Toolchain (unchanged in intent, now one row per binary with the version).
  for (const p of [
    { tool: "node", cmd: "node --version" },
    { tool: "git", cmd: "git --version" },
    { tool: "dotnet", cmd: "dotnet --version" },
  ]) {
    try {
      const r = await shell.run(p.cmd);
      const ok = r.exitCode === 0;
      rows.push({ check: `toolchain: ${p.tool}`, result: ok ? PASS : FAIL, detail: r.stdout.trim() || "(no output)" });
    } catch (e: any) {
      rows.push({ check: `toolchain: ${p.tool}`, result: FAIL, detail: String(e?.message ?? e).split("\n")[0] });
    }
  }

  // 2. LLM configuration — the check that was missing when it was needed.
  const md = await telemetry.readMetadata().catch((): SessionMetadata => ({}));
  const model = (md.model ?? "").trim();
  const declared = md.availableModels ?? [];
  rows.push({
    check: "llm: model configured",
    result: model ? PASS : FAIL,
    detail: model
      ? `${model} (not pinged — a reachability test costs a real call)`
      : "the host reports NO model: expect every /assistant turn to no-op. Check the `Llm` section of the settings file.",
  });
  rows.push({
    check: "llm: declared catalogue",
    result: declared.length > 0 ? PASS : WARN,
    detail: declared.length > 0
      ? declared.join(", ")
      : "no Llm:AvailableModels — /model cannot offer a choice or flag an unserved name",
  });

  // 3. Tool catalogue.
  const available = new Set(catalogue.names());
  const missingEssential = ESSENTIAL_TOOLS.filter((t) => !available.has(t));
  rows.push({
    check: "tools: essential",
    result: missingEssential.length === 0 ? PASS : FAIL,
    detail: missingEssential.length === 0
      ? `${available.size} registered, all ${ESSENTIAL_TOOLS.length} essentials present`
      : `MISSING: ${missingEssential.join(", ")}`,
  });
  const missingIntel = CODE_INTEL_TOOLS.filter((t) => !available.has(t));
  rows.push({
    check: "tools: code intelligence",
    result: missingIntel.length === 0 ? PASS : WARN,
    detail: missingIntel.length === 0
      ? `all ${CODE_INTEL_TOOLS.length} present`
      : `absent: ${missingIntel.join(", ")} — the agent falls back to reading files`,
  });

  // 4. VFS mounts — /workspace read-write is the precondition for everything.
  try {
    const list = await files.mounts();
    const described = list.map((m) => `${m.path}(${m.rights ?? "?"})`);
    const workspace = list.find((m) => m.path === "/workspace");
    const hasWorkspace = workspace !== undefined
      && String(workspace.rights ?? "").toLowerCase().includes("w");
    rows.push({
      check: "vfs: mounts",
      result: hasWorkspace ? PASS : FAIL,
      // /workspace read-WRITE is the precondition for everything the agent does;
      // a read-only mount would fail every edit with a permissions error later.
      detail: (described.join(" ") || "(none)") +
        (hasWorkspace ? "" : "  ← /workspace is missing or not writable"),
    });
  } catch (e: any) {
    rows.push({ check: "vfs: mounts", result: WARN, detail: `list_mounts unavailable: ${String(e?.message ?? e).split("\n")[0]}` });
  }

  const failed = rows.filter((r) => r.result === FAIL).length;
  const warned = rows.filter((r) => r.result === WARN).length;
  return {
    table: rows,
    text: failed > 0
      ? `${failed} check(s) FAILED, ${warned} warning(s) — the host is not fully usable.`
      : warned > 0
        ? `all checks passed, ${warned} warning(s).`
        : "all checks passed.",
  };
}
