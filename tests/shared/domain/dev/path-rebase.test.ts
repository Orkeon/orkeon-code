// The logical /workspace of a batch, rebased on its working root and back. Run:
//   node --test src/shared/domain/dev/path-rebase.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { briefToRoot, fromRoot, mapStrings, textFromRoot, textToRoot, toRoot } from "../../../../src/shared/domain/dev/path-rebase.ts";
import {
  AT_A_DOT, BRIEF, BRIEF_ON_ROOT, FENCED_BRIEF, FENCED_BRIEF_ON_ROOT, FROM_ROOT_KEPT, FROM_ROOT_MAPPED, FROM_ROOT_TEXTS,
  IN_COMMANDS, MIXED_TEXT, MIXED_TEXT_ON_ROOT, QUOTED_BRIEF, QUOTED_BRIEF_ON_ROOT, ROOT, TO_ROOT_KEPT, TO_ROOT_MAPPED,
  TO_ROOT_NO_ROOT, VALUE, VALUE_ON_ROOT,
} from "./path-rebase.fixtures.ts";

describe("toRoot", () => {
  for (const c of TO_ROOT_MAPPED) {
    it(`maps /workspace and a path under it onto the root: ${c.name}`, () => {
      // Arrange
      const { input, root } = c;

      // Act
      const path = toRoot(input, root);

      // Assert
      strictEqual(path, c.expected);
    });
  }

  for (const p of TO_ROOT_KEPT) {
    it(`keeps a path already under the root, a relative path, another mount and a look-alike: ${p}`, () => {
      // Arrange
      const input = p;

      // Act
      const path = toRoot(input, ROOT);

      // Assert
      strictEqual(path, p);
    });
  }

  for (const c of TO_ROOT_NO_ROOT) {
    it(`is the identity without a root: ${c.name}`, () => {
      // Arrange
      const { input, root } = c;

      // Act
      const path = toRoot(input, root);

      // Assert
      strictEqual(path, c.expected);
    });
  }
});

describe("fromRoot", () => {
  for (const c of FROM_ROOT_MAPPED) {
    it(`maps the root and a path under it back to /workspace: ${c.name}`, () => {
      // Arrange
      const { input, root } = c;

      // Act
      const path = fromRoot(input, root);

      // Assert
      strictEqual(path, c.expected);
    });
  }

  for (const c of FROM_ROOT_KEPT) {
    it(`keeps anything else, and is the identity without a root: ${c.name}`, () => {
      // Arrange
      const { input, root } = c;

      // Act
      const path = fromRoot(input, root);

      // Assert
      strictEqual(path, c.expected);
    });
  }
});

describe("textToRoot", () => {
  it("maps every /workspace path of a text, and leaves one already under the root", () => {
    // Arrange
    const text = MIXED_TEXT;

    // Act
    const mapped = textToRoot(text, ROOT);

    // Assert
    strictEqual(mapped, MIXED_TEXT_ON_ROOT);
  });

  for (const c of IN_COMMANDS) {
    it(`maps a path inside a command and after a separator: ${c.name}`, () => {
      // Arrange
      const { input, root } = c;

      // Act
      const mapped = textToRoot(input, root);

      // Assert
      strictEqual(mapped, c.expected);
    });
  }

  for (const c of AT_A_DOT) {
    it(`maps a path that ends a sentence, and keeps a name that goes on after a dot: ${c.name}`, () => {
      // Arrange
      const { input, root } = c;

      // Act
      const mapped = textToRoot(input, root);

      // Assert
      strictEqual(mapped, c.expected);
    });
  }

  it("maps the root that ends a sentence back to /workspace", () => {
    // Arrange
    const text = `in ${ROOT}.`;

    // Act
    const mapped = textFromRoot(text, ROOT);

    // Assert
    strictEqual(mapped, "in /workspace.");
  });

  it("leaves a text without a root as it is", () => {
    // Arrange
    const text = "/workspace/a";

    // Act
    const mapped = textToRoot(text, undefined);

    // Assert
    strictEqual(mapped, "/workspace/a");
  });
});

describe("briefToRoot", () => {
  it("maps the paths a brief names, plain or in backticks, as textToRoot does", () => {
    // Arrange
    const brief = BRIEF;

    // Act
    const mapped = briefToRoot(brief, ROOT);

    // Assert
    strictEqual(mapped, BRIEF_ON_ROOT);
  });

  it("keeps a quoted /workspace (a constant of the code)", () => {
    // Arrange
    const brief = QUOTED_BRIEF;

    // Act
    const mapped = briefToRoot(brief, ROOT);

    // Assert
    strictEqual(mapped, QUOTED_BRIEF_ON_ROOT);
  });

  it("keeps everything inside a fenced block", () => {
    // Arrange
    const brief = FENCED_BRIEF;

    // Act
    const mapped = briefToRoot(brief, ROOT);

    // Assert
    strictEqual(mapped, FENCED_BRIEF_ON_ROOT);
  });

  it("leaves a brief without a root as it is", () => {
    // Arrange
    const brief = "/workspace/a";

    // Act
    const mapped = briefToRoot(brief, undefined);

    // Assert
    strictEqual(mapped, "/workspace/a");
  });
});

describe("textFromRoot", () => {
  for (const c of FROM_ROOT_TEXTS) {
    it(`maps every path under the root of a text back to /workspace: ${c.name}`, () => {
      // Arrange
      const { input, root } = c;

      // Act
      const mapped = textFromRoot(input, root);

      // Assert
      strictEqual(mapped, c.expected);
    });
  }
});

describe("mapStrings", () => {
  it("maps every string of a value, keys and other values kept", () => {
    // Arrange
    const map = (s: string): string => textToRoot(s, ROOT);

    // Act
    const mapped = mapStrings(VALUE, map);

    // Assert
    deepStrictEqual(mapped, VALUE_ON_ROOT);
  });

  it("maps a value that is a string", () => {
    // Arrange
    const map = (s: string): string => textToRoot(s, ROOT);

    // Act
    const mapped = mapStrings("/workspace", map);

    // Assert
    strictEqual(mapped, ROOT);
  });
});
