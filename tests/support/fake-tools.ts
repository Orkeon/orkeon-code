// FakeTools: a stand-in for the runtime's `tools` global, to test the adapters of
// src/shared/infrastructure/orkeon/. Each tool answers `replies[<tool>]`: a value,
// or a function of the input; an Error reply is thrown, as the runtime throws a
// failed call. A tool with no reply answers `{}`. Every call lands in `calls`.
// Replies are written in whichever casing a test needs: snake_case like the JS
// tools, PascalCase like the .NET-bridged ones.
// Each tool carries the signature the generated typings declare (`OrkeonTools`,
// src/crews/.orkeon/orkeon.d.ts): a parameter renamed on the .NET side fails here
// as it fails the adapters.

type FakedTool = "fileRead" | "fileWrite" | "directoryRead" | "listMounts" | "shellCommand"
  | "sessionStore" | "sessionSnip" | "tokenBudget" | "sessionCost" | "sessionStats" | "memoryStore" | "progressReport"
  | "indexStatus" | "indexCodebase" | "codebaseMap" | "dependencyGraph" | "packageSummary";

/** The generated signature of one built-in tool. */
type Tool<T extends FakedTool> = OrkeonTools[T];

export class FakeTools implements Pick<OrkeonTools, FakedTool> {
  replies: Partial<Record<FakedTool, unknown>> = {};
  calls: Array<{ tool: FakedTool; input: unknown }> = [];

  /** The inputs of every call to `tool`, in order. */
  inputsOf(tool: FakedTool): unknown[] {
    return this.calls.filter((c) => c.tool === tool).map((c) => c.input);
  }

  /** The reply as the test wrote it: the adapters read its fields, the fake vouches for none. */
  async answer(tool: FakedTool, input: unknown): Promise<any> {
    this.calls.push({ tool, input });
    const reply = this.replies[tool];
    const value = typeof reply === "function" ? reply(input) : reply;
    if (value instanceof Error) throw value;
    return value ?? {};
  }

  fileRead: Tool<"fileRead"> = (input) => this.answer("fileRead", input);
  fileWrite: Tool<"fileWrite"> = (input) => this.answer("fileWrite", input);
  directoryRead: Tool<"directoryRead"> = (input) => this.answer("directoryRead", input);
  listMounts: Tool<"listMounts"> = (input) => this.answer("listMounts", input);
  shellCommand: Tool<"shellCommand"> = (input) => this.answer("shellCommand", input);
  sessionStore: Tool<"sessionStore"> = (input) => this.answer("sessionStore", input);
  sessionSnip: Tool<"sessionSnip"> = (input) => this.answer("sessionSnip", input);
  tokenBudget: Tool<"tokenBudget"> = (input) => this.answer("tokenBudget", input);
  sessionCost: Tool<"sessionCost"> = (input) => this.answer("sessionCost", input);
  sessionStats: Tool<"sessionStats"> = (input) => this.answer("sessionStats", input);
  memoryStore: Tool<"memoryStore"> = (input) => this.answer("memoryStore", input);
  progressReport: Tool<"progressReport"> = (input) => this.answer("progressReport", input);
  indexStatus: Tool<"indexStatus"> = (input) => this.answer("indexStatus", input);
  indexCodebase: Tool<"indexCodebase"> = (input) => this.answer("indexCodebase", input);
  codebaseMap: Tool<"codebaseMap"> = (input) => this.answer("codebaseMap", input);
  dependencyGraph: Tool<"dependencyGraph"> = (input) => this.answer("dependencyGraph", input);
  packageSummary: Tool<"packageSummary"> = (input) => this.answer("packageSummary", input);
}
