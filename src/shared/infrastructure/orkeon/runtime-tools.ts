/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// The runtime's `tools` global as this code calls it.
//
// Every built-in tool is declared by the generated typings (crews/.orkeon/orkeon.d.ts,
// `OrkeonBuiltInTools`, which `OrkeonTools` extends — Orkeon #125): the input the tool
// deserializes and the result it hands back, in the tool's own snake_case. The adapters
// of this folder take `Pick<OrkeonTools, ...>`. This file keeps only the shapes this
// code passes that are STRICTER than the generated input: one union member per
// operation where the tool declares a bare `operation?: string`, so a misspelled
// operation fails at the call. Each shape is declared through `Fits`, which refuses
// it at `tsc` when a key is not one the tool declares (renamed on the .NET side) or a
// type does not fit; an operation VALUE is not checked (the tool declares none).
// Results are still read through tool-results.ts: see there for the casing.

/** The input the generated typings declare for a built-in tool. */
type Input<K extends keyof OrkeonBuiltInTools> = NonNullable<Parameters<OrkeonBuiltInTools[K]>[0]>;

/** The keys of every member of a union, not only the common ones. */
type Keys<T> = T extends unknown ? keyof T : never;

/** The generated input of `K`, where a key `T` names that the tool does not declare takes `never`. */
type Exact<K extends keyof OrkeonBuiltInTools, T> =
  Input<K> & { [P in Exclude<Keys<T>, keyof Input<K>>]: never };

/** A local shape of the input of tool `K`, refused at its declaration when it stops fitting the generated one. */
type Fits<T extends Exact<K, T>, K extends keyof OrkeonBuiltInTools> = T;

/** session_store, one input shape per operation this code sends. */
export type SessionStoreInput = Fits<
  | { operation: "read_messages" | "get_metadata" | "reset" }
  | { operation: "write_messages"; messages: readonly unknown[] }
  | { operation: "append_message"; role: string; content: string }
  | { operation: "get_state"; key: string }
  | { operation: "get_state"; keys: readonly string[] }
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

/** batch_anchors, the closure of a set of anchors by FQN. */
export type BatchAnchorsClosureInput = Fits<{ action: "closure"; fqns: readonly string[] }, "batchAnchors">;
