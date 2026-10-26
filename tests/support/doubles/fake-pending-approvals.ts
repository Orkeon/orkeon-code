// FakePendingApprovals: the PendingApprovals port. `pending` is what the host shows waiting,
// in the order the next answer settles them; `reads` counts the lists asked; `failure`, when
// set, is thrown by list() (a host whose service is broken).
import type { PendingApproval, PendingApprovals } from "../../../src/shared/application/ports.ts";

export class FakePendingApprovals implements PendingApprovals {
  pending: PendingApproval[] = [];
  reads = 0;
  failure: Error | null = null;

  list(): readonly PendingApproval[] {
    this.reads++;
    if (this.failure !== null) throw this.failure;
    return this.pending;
  }
}
