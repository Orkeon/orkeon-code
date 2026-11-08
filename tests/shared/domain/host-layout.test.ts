// The host layout a launch.json holds. Run:
//   node --test tests/shared/domain/host-layout.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { IDENTITY_HOST, isIdentityHost, parseHostLayout } from "../../../src/shared/domain/host-layout.ts";
import { PARSE_CASES, WSL_PARSED } from "./host-layout.fixtures.ts";

describe("parseHostLayout", () => {
  for (const c of PARSE_CASES) {
    it(`reads the layout: ${c.name}`, () => {
      // Arrange
      const raw = c.raw;

      // Act
      const { layout } = parseHostLayout(raw);

      // Assert
      deepStrictEqual(layout, c.layout);
    });
  }

  for (const c of PARSE_CASES) {
    it(`names each problem: ${c.name}`, () => {
      // Arrange
      const raw = c.raw;

      // Act
      const { problems } = parseHostLayout(raw);

      // Assert
      deepStrictEqual(problems, c.problems);
    });
  }
});

describe("isIdentityHost", () => {
  const CASES: readonly { name: string; layout: typeof IDENTITY_HOST; expected: boolean }[] = [
    { name: "IDENTITY_HOST", layout: IDENTITY_HOST, expected: true },
    { name: "a posix layout without a mount", layout: { flavour: "posix", automountRoot: "/mnt", mounts: [] }, expected: true },
    { name: "a WSL layout without a mount", layout: { flavour: "wsl", automountRoot: "/mnt", mounts: [] }, expected: false },
    { name: "a layout with mounts", layout: WSL_PARSED, expected: false },
  ];
  for (const c of CASES) {
    it(`tells a layout without a host fact: ${c.name}`, () => {
      // Arrange
      const layout = c.layout;

      // Act
      const identity = isIdentityHost(layout);

      // Assert
      strictEqual(identity, c.expected);
    });
  }
});
