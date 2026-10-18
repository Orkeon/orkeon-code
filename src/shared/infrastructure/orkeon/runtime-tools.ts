/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// The runtime's `tools` global as this code calls it.
//
// Every built-in tool is declared by the generated typings (crews/.orkeon/orkeon.d.ts,
// `OrkeonBuiltInTools`, which `OrkeonTools` extends — Orkeon #125): the input the tool
// deserializes and the result it hands back, in the tool's own snake_case. The adapters
// of this folder take `Pick<OrkeonTools, ...>`. This file keeps only the shapes this
// code passes that are STRICTER than the generated input: one union member per
// operation where the tool declares a bare `operation?: string`. Each is checked
// assignable to the generated input (`Fits`), so a parameter renamed on the .NET
// side fails `tsc` here instead of the run.
// Results are still read through tool-results.ts: see there for the casing.

/** The input the generated typings declare for a built-in tool. */
type Input<K extends keyof OrkeonBuiltInTools> = NonNullable<Parameters<OrkeonBuiltInTools[K]>[0]>;

/** A local shape of the input of tool `K`, refused at its declaration when it stops fitting the generated one. */
type Fits<T extends Input<K>, K extends keyof OrkeonBuiltInTools> = T;

/** session_store, one input shape per operation this code sends. */
export type SessionStoreInput = Fits<
  | { operation: "read_messages" | "get_metadata" | "reset" }
  | { operation: "write_messages"; messages: readonly unknown[] }
  | { operation: "get_state"; key: string }
  | { operation: "set_state"; key: string; value: string | null }
  | { operation: "set_title"; title: string },
  "sessionStore"
>;

/** memory_store, one input shape per operation this code sends. */
export type MemoryStoreInput = Fits<
  | { operation: "list"; category?: string }
  | { operation: "add"; category: string; content: string }
  | { operation: "get" | "delete"; id: number },
  "memoryStore"
>;

/** progress_report: a progress line, or the release of its slot (`done`). */
export type ProgressReportInput = Fits<{
  label: string;
  step?: number;
  total?: number;
  percent?: number;
  message?: string;
  done?: boolean;
}, "progressReport">;
