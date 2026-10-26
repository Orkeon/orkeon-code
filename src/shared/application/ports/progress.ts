// The progress port: the host's progress line, best effort.
// Types only, re-exported by ../ports.ts.

export interface ProgressSpec {
  /** Headline of the operation, e.g. "Compacting conversation". */
  label: string;
  /** Current step (1-based) for step-wise operations. */
  step?: number;
  /** Total step count, when known. */
  total?: number;
  /** Completion ratio in [0, 100]. */
  percent?: number;
  /** Current-phase line, e.g. "extracting memories". */
  message?: string;
}

/** The host's progress line. Best effort by contract: progress is decoration, so
 *  neither call ever throws, and a host without a progress channel ignores both. */
export interface Progress {
  report(spec: ProgressSpec): Promise<void>;
  /** Release the progress slot of `label`. */
  done(label: string): Promise<void>;
}
