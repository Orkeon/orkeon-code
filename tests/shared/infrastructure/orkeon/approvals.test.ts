// The PendingApprovals adapter over a FakeApprovalsService served by a FakeServiceLocator (Orkeon #198). Run:
//   node --test tests/shared/infrastructure/orkeon/approvals.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { createPendingApprovals } from "../../../../src/shared/infrastructure/orkeon/approvals.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";
import { HOST_APPROVALS, approvalsOverFake } from "./approvals.fixtures.ts";

describe("createPendingApprovals", () => {
  it("answers no approval on a host without the approvals service", () => {
    // Arrange
    const approvals = createPendingApprovals(new FakeServiceLocator());

    // Act
    const waiting = approvals.list();

    // Assert
    deepStrictEqual(waiting, []);
  });

  it("reads each approval waiting from the service, field by field", () => {
    // Arrange
    const { service, approvals } = approvalsOverFake();
    service.waiting = HOST_APPROVALS;

    // Act
    const waiting = approvals.list();

    // Assert
    deepStrictEqual(waiting, HOST_APPROVALS);
  });

  it("answers an empty list once the operator has answered", () => {
    // Arrange
    const { service, approvals } = approvalsOverFake();
    service.waiting = [];

    // Act
    const waiting = approvals.list();

    // Assert
    deepStrictEqual(waiting, []);
  });
});
