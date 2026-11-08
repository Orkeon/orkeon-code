// The run's host context, bound by the wiring and read once; the identity unbound or when the read fails. Run:
//   node --test tests/shared/infrastructure/orkeon/host-context.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { bindHostContext, orkeonHostContext } from "../../../../src/shared/infrastructure/orkeon/host-context.ts";
import { IDENTITY_CONTEXT } from "../../../../src/shared/application/host-context.ts";
import { WINDOWS_HOST, windowsHost } from "../../../support/fixtures/host-context.ts";

describe("orkeonHostContext", () => {
  it("reads the identity when nothing is bound", async () => {
    // Arrange
    bindHostContext(undefined);

    // Act
    const context = await orkeonHostContext();

    // Assert
    strictEqual(context, IDENTITY_CONTEXT);
  });

  it("reads the bound reader's context", async () => {
    // Arrange
    bindHostContext(windowsHost);

    // Act
    const context = await orkeonHostContext();

    // Assert
    strictEqual(context, WINDOWS_HOST);
  });

  it("reads once for every call", async () => {
    // Arrange
    let reads = 0;
    bindHostContext(async () => { reads += 1; return WINDOWS_HOST; });

    // Act
    await Promise.all([orkeonHostContext(), orkeonHostContext()]);

    // Assert
    strictEqual(reads, 1);
  });

  it("reads the identity when the read fails", async () => {
    // Arrange
    bindHostContext(async () => { throw new Error("the global tools.fileRead was reached"); });

    // Act
    const context = await orkeonHostContext();

    // Assert
    strictEqual(context, IDENTITY_CONTEXT);
  });

  it("reads again after a new reader is bound", async () => {
    // Arrange
    bindHostContext(windowsHost);
    await orkeonHostContext();
    bindHostContext(async () => IDENTITY_CONTEXT);

    // Act
    const context = await orkeonHostContext();

    // Assert
    strictEqual(context, IDENTITY_CONTEXT);
  });
});
