// The sources and candidates the write gate is tested on.
import type { EntryType } from "../../../../src/shared/domain/shared-memory/entry.ts";

export interface SourceKindCase {
  name: string;
  source: string;
  kind: string | undefined;
}

/** A source of each kind, and two that name none. */
export const SOURCE_KINDS: readonly SourceKindCase[] = [
  { name: "an audit", source: "audit:shop/SHOP-VERIFY-F1.md", kind: "audit" },
  { name: "a human", source: "human:2026-10-22 memory_push", kind: "human" },
  { name: "a verdict", source: "verdict:plan", kind: "verdict" },
  { name: "an unknown prefix", source: "someone: else", kind: undefined },
  { name: "an audit naming no file", source: "audit:", kind: undefined },
];

export interface AdmittedCase {
  name: string;
  type: EntryType;
  source: string;
}

/** Candidates the gate admits: a human any type, an audit of three batches a mistake, an audit a structure, a verdict a method. */
export const ADMITTED: readonly AdmittedCase[] = [
  { name: "a human's decision", type: "decision", source: "human:2026-10-22 x" },
  { name: "a human's code structure", type: "code-structure", source: "human:2026-10-22 x" },
  { name: "a human's method", type: "method", source: "human:2026-10-22 x" },
  { name: "a human's mistake", type: "mistake", source: "human:2026-10-22 x" },
  { name: "a mistake three audits back", type: "mistake", source: "audit:a/A-VERIFY-F1.md, b/B-VERIFY-F2.md, c/C-VERIFY-F1.md" },
  { name: "a code structure one audit backs", type: "code-structure", source: "audit:a/A-VERIFY-F1.md" },
  { name: "a method a verdict backs", type: "method", source: "verdict:plan" },
];

export interface RefusedCase extends AdmittedCase {
  /** A piece of the problem the gate names. */
  problem: string;
}

/** Candidates the gate refuses, with a piece of the problem it names. */
export const REFUSED: readonly RefusedCase[] = [
  { name: "a mistake one audit seen twice backs", type: "mistake", source: "audit:a/A-VERIFY-F1.md, a/A-VERIFY-F1.md", problem: "this one 1" },
  { name: "a decision an audit backs", type: "decision", source: "audit:a/A-VERIFY-F1.md", problem: "not decision" },
  { name: "a mistake a verdict backs", type: "mistake", source: "verdict:plan", problem: "method or decision" },
  { name: "a method of an unknown source", type: "method", source: "a guess", problem: "not verdict:" },
];

export interface ConfirmationCase {
  name: string;
  source: string;
  auto: boolean;
  asks: boolean;
}

/** Whether the operator is asked, by source and by the auto-admission switch. */
export const CONFIRMATIONS: readonly ConfirmationCase[] = [
  { name: "does not ask for an audit-backed candidate when auto-admission is on", source: "audit:a/A-VERIFY-F1.md", auto: true, asks: false },
  { name: "asks for an audit-backed candidate when auto-admission is off", source: "audit:a/A-VERIFY-F1.md", auto: false, asks: true },
  { name: "asks for a human's candidate even with auto-admission on", source: "human:2026-10-22 x", auto: true, asks: true },
  { name: "asks for a verdict's candidate even with auto-admission on", source: "verdict:plan", auto: true, asks: true },
];
