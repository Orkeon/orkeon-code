// FakeTools: a stand-in for the runtime's `tools` global, to test the adapters of
// src/shared/infrastructure/orkeon/. Each tool answers `replies[<tool>]`: a value,
// or a function of the input; an Error reply is thrown, as the runtime throws a
// failed call. A tool with no reply answers `{}`. Every call lands in `calls`.
// Replies are written in whichever casing a test needs: snake_case like the JS
// tools, PascalCase like the .NET-bridged ones.
import type {
  CalledTools, MemoryStoreInput, ProgressReportInput, SessionStoreInput,
} from "../../src/shared/infrastructure/orkeon/runtime-tools.ts";

type FakedTool = "fileRead" | "fileWrite" | "directoryRead" | "listMounts" | "shellCommand"
  | "sessionStore" | "sessionSnip" | "tokenBudget" | "sessionCost" | "sessionStats" | "memoryStore" | "progressReport"
  | "indexStatus" | "indexCodebase" | "codebaseMap" | "dependencyGraph" | "packageSummary";

export class FakeTools implements Pick<CalledTools, FakedTool> {
  replies: Partial<Record<FakedTool, unknown>> = {};
  calls: Array<{ tool: FakedTool; input: unknown }> = [];

  /** The inputs of every call to `tool`, in order. */
  inputsOf(tool: FakedTool): unknown[] {
    return this.calls.filter((c) => c.tool === tool).map((c) => c.input);
  }

  async answer(tool: FakedTool, input: unknown): Promise<unknown> {
    this.calls.push({ tool, input });
    const reply = this.replies[tool];
    const value = typeof reply === "function" ? reply(input) : reply;
    if (value instanceof Error) throw value;
    return value ?? {};
  }

  fileRead(input: { path: string; max_length?: number }) { return this.answer("fileRead", input); }
  fileWrite(input: { path: string; content: string }) { return this.answer("fileWrite", input); }
  directoryRead(input: { path: string; max_results?: number }) { return this.answer("directoryRead", input); }
  listMounts() { return this.answer("listMounts", undefined); }
  shellCommand(input: { command: string; working_directory?: string }) { return this.answer("shellCommand", input); }
  sessionStore(input: SessionStoreInput) { return this.answer("sessionStore", input); }
  sessionSnip(input: { retain_count: number }) { return this.answer("sessionSnip", input); }
  tokenBudget() { return this.answer("tokenBudget", undefined); }
  sessionCost() { return this.answer("sessionCost", undefined); }
  sessionStats() { return this.answer("sessionStats", undefined); }
  memoryStore(input: MemoryStoreInput) { return this.answer("memoryStore", input); }
  progressReport(input: ProgressReportInput) { return this.answer("progressReport", input); }
  indexStatus(input: Record<string, never>) { return this.answer("indexStatus", input); }
  indexCodebase(input: { root_path: string }) { return this.answer("indexCodebase", input); }
  codebaseMap(input: { level: string; include_metrics?: boolean }) { return this.answer("codebaseMap", input); }
  dependencyGraph(input: { scope: string; max_nodes?: number; include_mermaid?: boolean }) { return this.answer("dependencyGraph", input); }
  packageSummary(input: { fqn: string }) { return this.answer("packageSummary", input); }
}
