// Unit tests for the shared secret detection. Run:
//   node --test src/shared/domain/secret-patterns.test.ts
// The sample secrets are made-up and assembled from pieces, so no scanner reads them as real.
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { SECRET_PATTERNS, secretLikePaths, secretPatternsIn } from "./secret-patterns.ts";
import { cases, join, ORDINARY_PATHS, SECRET_PATHS, TWO_PATTERNS_THREE_HITS } from "./secret-patterns.fixtures.ts";

describe("secretLikePaths", () => {
  it("flags env files, key and certificate stores, private keys and credentials files", () => {
    // Arrange
    const paths = SECRET_PATHS;

    // Act
    const flagged = secretLikePaths(paths);

    // Assert
    deepStrictEqual(flagged, [".env", "app/.env.production", "certs/server.pem", "deploy/id_rsa", "credentials.json", "keys/x.p12"]);
  });

  it("lets the examples, public keys and ordinary code through", () => {
    // Arrange
    const paths = ORDINARY_PATHS;

    // Act
    const flagged = secretLikePaths(paths);

    // Assert
    deepStrictEqual(flagged, []);
  });
});

describe("SECRET_PATTERNS", () => {
  it("names the nine patterns in their order", () => {
    // Arrange
    const expected = cases.map((c) => c.name);

    // Act
    const names = SECRET_PATTERNS.map((p) => p.name);

    // Assert
    deepStrictEqual(names, expected);
  });

  for (const c of cases) {
    it(`${c.name}: matches a sample`, () => {
      // Arrange
      const { hit } = c;

      // Act
      const found = secretPatternsIn(hit);

      // Assert
      deepStrictEqual(found, [c.name]);
    });

    it(`${c.name}: lets a near miss through`, () => {
      // Arrange
      const { miss } = c;

      // Act
      const found = secretPatternsIn(miss);

      // Assert
      deepStrictEqual(found, []);
    });
  }

  it("also matches the second GitHub token form", () => {
    // Arrange
    const token = join("github_pat_", "A1_".repeat(8));

    // Act
    const found = secretPatternsIn(token);

    // Assert
    deepStrictEqual(found, ["GitHub token"]);
  });
});

describe("secretPatternsIn", () => {
  it("names each matching pattern once, in SECRET_PATTERNS order", () => {
    // Arrange
    const text = TWO_PATTERNS_THREE_HITS;

    // Act
    const found = secretPatternsIn(text);

    // Assert
    deepStrictEqual(found, ["AWS access key id", "assigned secret"]);
  });

  it("is empty for ordinary prose", () => {
    // Arrange
    const text = "A use case reaches the store through its port.";

    // Act
    const found = secretPatternsIn(text);

    // Assert
    strictEqual(found.length, 0);
  });
});
