// The pending-approvals port: the tool approvals waiting for the operator, read by a command (/tasks).
// Types only, re-exported by ../ports.ts.

/** One tool approval waiting for the operator, as the host's status line shows it. */
export interface PendingApproval {
  /** The ticket of the background task that asks (`t1`); null outside a task. */
  taskId: string | null;
  /** The command that runs that task (`dev-batches`); null outside a task. */
  command: string | null;
  /** The tool the call names (`shell_command`). */
  tool: string;
  /** The call's input, cut as the status line cuts it. */
  input: string;
}

/** The approvals waiting for the operator. Read-only: the operator answers them; each `list()` reads what waits
 *  at that moment, and a host that keeps no approvals answers none. */
export interface PendingApprovals {
  list(): readonly PendingApproval[];
}
