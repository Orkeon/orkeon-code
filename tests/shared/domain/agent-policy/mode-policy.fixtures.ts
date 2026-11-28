// The values the mode policy table is checked against.
import type { ToolClass } from "../../../../src/shared/domain/agent-policy/mode-policy.ts";

/** The tool classes in catalogue order. */
export const CLASS_ORDER: readonly ToolClass[] = ["read", "shellReads", "network", "edit", "shell", "extra"];

/** The classes of a writing mode: every one but the shell for its reads, since it holds the shell for every call. */
export const WRITING_CLASSES: readonly ToolClass[] = ["read", "network", "edit", "shell", "extra"];

/** The classes a read-only mode may hold: the local reads and the shell's. */
export const READ_ONLY_CLASSES: readonly ToolClass[] = ["read", "shellReads"];

/** The classes of each read-only mode, and why. */
export const READ_ONLY_POLICY_CASES: readonly { mode: string; classes: readonly ToolClass[]; why: string }[] = [
  { mode: "plan", classes: ["read", "shellReads"], why: "its gate lets the shell's reads through and reads no allow rule" },
  { mode: "dontAsk", classes: ["read"], why: "its gate honours allow rules, so the shell stays out" },
];

/** Names no permission mode has: empty, unknown, another case, prototype keys. */
export const UNKNOWN_MODES: readonly string[] = ["", "yolo", "Plan", "constructor", "toString"];
