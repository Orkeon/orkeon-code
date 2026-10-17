/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// The runtime's `tools` global as this code calls it.
//
// The generated typings (crews/.orkeon/orkeon.d.ts, `OrkeonTools`, still so in
// Orkeon 1.0.0-rc.6) name fileRead, fileWrite and directoryRead, without
// file_read's `max_length`, and reach every other tool through an index signature
// whose input is `never`: a call to session_store or shell_command does not
// type-check against them.
// `CalledTools` is the narrow local declaration of the tools this code calls, with
// the inputs it passes. Every result is `unknown`: its field casing varies
// (PascalCase from .NET-bridged types, snake_case from the others), so only the
// adapters of this folder read it, through tool-results.ts.

/** session_store, one input shape per operation this code sends. */
export type SessionStoreInput =
  | { operation: "read_messages" | "get_metadata" | "reset" }
  | { operation: "write_messages"; messages: readonly unknown[] }
  | { operation: "get_state"; key: string }
  | { operation: "set_state"; key: string; value: string | null }
  | { operation: "set_title"; title: string };

/** memory_store, one input shape per operation this code sends. */
export type MemoryStoreInput =
  | { operation: "list"; category?: string }
  | { operation: "add"; category: string; content: string }
  | { operation: "get" | "delete"; id: number };

/** progress_report: a progress line, or the release of its slot (`done`). */
export interface ProgressReportInput {
  label: string;
  step?: number;
  total?: number;
  percent?: number;
  message?: string;
  done?: boolean;
}

export interface CalledTools {
  fileRead(input: { path: string; max_length?: number }): Promise<unknown>;
  fileWrite(input: { path: string; content: string }): Promise<unknown>;
  directoryRead(input: { path: string; max_results?: number }): Promise<unknown>;
  shellCommand(input: { command: string; working_directory?: string }): Promise<unknown>;
  sessionStore(input: SessionStoreInput): Promise<unknown>;
  sessionSnip(input: { retain_count: number }): Promise<unknown>;
  sessionStats(): Promise<unknown>;
  sessionCost(): Promise<unknown>;
  tokenBudget(): Promise<unknown>;
  memoryStore(input: MemoryStoreInput): Promise<unknown>;
  progressReport(input: ProgressReportInput): Promise<unknown>;
  listMounts(): Promise<unknown>;
  indexStatus(input: Record<string, never>): Promise<unknown>;
  indexCodebase(input: { root_path: string }): Promise<unknown>;
  codebaseMap(input: { level: string; include_metrics?: boolean }): Promise<unknown>;
  dependencyGraph(input: { scope: string; max_nodes?: number; include_mermaid?: boolean }): Promise<unknown>;
  packageSummary(input: { fqn: string }): Promise<unknown>;
}

/** The `tools` global: the generated typings plus the local declarations above. */
export type RuntimeTools = OrkeonTools & CalledTools;
