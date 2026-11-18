// The Orkeon Code files /dev-learn may name as an owner are files of this repository: a destination that a move or a
// removal left behind would send a patch to a file nobody has (#117).
import { describe, it } from "node:test";
import { ok } from "node:assert";
import { ORKEON_CODE_DESTINATIONS } from "../../src/crews/dev-learn/domain/markers.ts";
import { isRepositoryFile } from "./learn-destinations.fixtures.ts";

describe("dev-learn's Orkeon Code destinations", () => {
  for (const path of ORKEON_CODE_DESTINATIONS) {
    it(`names a file of this repository: ${path}`, () => {
      // Arrange
      const destination = path;

      // Act
      const exists = isRepositoryFile(destination);

      // Assert
      ok(exists, `${destination} is not a file of this repository`);
    });
  }
});
