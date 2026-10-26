// The approvals the createPendingApprovals tests read: a FakeApprovalsService served as the "approvals" service.
import { createPendingApprovals } from "../../../../src/shared/infrastructure/orkeon/approvals.ts";
import type { PendingApproval } from "../../../../src/commands/.orkeon/orkeon-cli.d.ts";
import { FakeApprovalsService } from "../../../support/doubles/fake-approvals-service.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";

/** A FakeApprovalsService served as the "approvals" service, and the port built over it. */
export function approvalsOverFake() {
  const service = new FakeApprovalsService();
  const services = new FakeServiceLocator();
  services.services.set("approvals", service);
  return { service, approvals: createPendingApprovals(services) };
}

/** What the host shows waiting: a task's shell_command, then a file_write asked outside a task. */
export const HOST_APPROVALS: PendingApproval[] = [
  { taskId: "t1", command: "dev-batches", tool: "shell_command", input: '{"command":"npm test"}' },
  { taskId: null, command: null, tool: "file_write", input: '{"path":"/workspace/a.txt","content":"…' },
];
