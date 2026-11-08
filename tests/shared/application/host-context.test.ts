// The host context of a run: launch.json and the path lists of the two settings files. Run:
//   node --test tests/shared/application/host-context.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { IDENTITY_CONTEXT, isIdentityContext, listsOf, readHostContext } from "../../../src/shared/application/host-context.ts";
import { SECRETS_HOST, secretsHost } from "../../support/fixtures/host-context.ts";
import type { HostContext } from "../../../src/shared/application/host-context.ts";
import { CONTEXT_CASES, WINDOWS_LAYOUT, hostHarness } from "./host-context.fixtures.ts";

describe("readHostContext", () => {
  for (const c of CONTEXT_CASES) {
    it(c.name, async () => {
      // Arrange
      const { files, config } = hostHarness(c.contents);

      // Act
      const context = await readHostContext(files, config);

      // Assert
      deepStrictEqual(context, c.expected);
    });
  }
});

describe("isIdentityContext", () => {
  const CASES: readonly { name: string; host: HostContext; expected: boolean }[] = [
    { name: "IDENTITY_CONTEXT", host: IDENTITY_CONTEXT, expected: true },
    { name: "a posix layout without mounts and empty lists", host: { layout: { flavour: "posix", automountRoot: "/mnt", mounts: [] }, lists: { deny: [], allow: [] } }, expected: true },
    { name: "a layout with mounts", host: { layout: WINDOWS_LAYOUT, lists: { deny: [], allow: [] } }, expected: false },
    { name: "a deny list on the identity host", host: { layout: IDENTITY_CONTEXT.layout, lists: { deny: ["/workspace/x"], allow: [] } }, expected: false },
    { name: "an allow list on the identity host", host: { layout: IDENTITY_CONTEXT.layout, lists: { deny: [], allow: ["/workspace/x"] } }, expected: false },
  ];
  for (const c of CASES) {
    it(`tells a context with nothing to do: ${c.name}`, () => {
      // Arrange
      const host = c.host;

      // Act
      const identity = isIdentityContext(host);

      // Assert
      strictEqual(identity, c.expected);
    });
  }
});

describe("listsOf", () => {
  it("gives no list without a source", async () => {
    // Arrange
    const host = undefined;

    // Act
    const lists = await listsOf(host);

    // Assert
    deepStrictEqual(lists, { deny: [], allow: [] });
  });

  it("gives the lists of the source's context", async () => {
    // Arrange
    const host = secretsHost;

    // Act
    const lists = await listsOf(host);

    // Assert
    deepStrictEqual(lists, SECRETS_HOST.lists);
  });
});
