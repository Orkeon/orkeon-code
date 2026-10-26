// The failure counts and compaction outcomes the circuit breaker is tested on.
import type { CompactStatus } from "../../../../src/shared/domain/compact-outcome.ts";

export interface BreakerCase {
  name: string;
  failures: number;
  open: boolean;
}

export const BREAKER_CASES: readonly BreakerCase[] = [
  { name: "stays closed at 0 consecutive failures", failures: 0, open: false },
  { name: "stays closed at 2 consecutive failures", failures: 2, open: false },
  { name: "opens at 3 consecutive failures", failures: 3, open: true },
  { name: "stays open at 7 consecutive failures", failures: 7, open: true },
];

export interface FailureCountCase {
  name: string;
  count: number;
  outcome: CompactStatus;
  next: number;
}

export const FAILURE_COUNT_CASES: readonly FailureCountCase[] = [
  { name: "increments from 0 on failed", count: 0, outcome: "failed", next: 1 },
  { name: "increments from 2 on failed", count: 2, outcome: "failed", next: 3 },
  { name: "resets on compacted", count: 2, outcome: "compacted", next: 0 },
  { name: "resets on snipped", count: 2, outcome: "snipped", next: 0 },
  { name: "leaves a count of 0 unchanged on skipped", count: 0, outcome: "skipped", next: 0 },
  { name: "leaves a count of 2 unchanged on skipped", count: 2, outcome: "skipped", next: 2 },
];
