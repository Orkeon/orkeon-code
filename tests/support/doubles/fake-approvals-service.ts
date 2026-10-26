// FakeApprovalsService: orkeon-repl's `approvals` service (PendingApprovals of the CLI typings),
// to test the adapter. `waiting` is what list() answers, as the host would give it.
import type { PendingApproval, PendingApprovals } from "../../../src/commands/.orkeon/orkeon-cli.d.ts";

export class FakeApprovalsService implements PendingApprovals {
  waiting: PendingApproval[] = [];

  list(): readonly PendingApproval[] {
    return this.waiting;
  }
}
