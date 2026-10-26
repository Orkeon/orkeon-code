// The proposals model of /dev-learn: ids, the proposals.json file, the lines a decision
// prints. Run:
//   node --test src/shared/domain/dev/learn-proposals.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { sha1Hex } from "../../../../src/shared/domain/sha1.ts";
import {
  LEARN_FOLDER_PATTERN, PROPOSALS_JSON, PROPOSALS_MD, acceptLines, deployedHarnessPath, learnFolderName, motifId,
  parseProposalsFile, patchLines, serializeProposalsFile,
} from "../../../../src/shared/domain/dev/learn-proposals.ts";
import {
  DEPLOYED_PATHS, FILE, HARNESS_ACCEPT, HARNESS_MOTIF, HARNESS_PATCH, NOT_DEPLOYED, NOT_LEARN_FOLDERS, REPO_ACCEPT,
  REPO_MOTIF, REPO_PATCH, TEN_DIGIT_ID_FILE, WRONG_SHAPES,
} from "./learn-proposals.fixtures.ts";
import { assertNotJsonProblem } from "./learn-proposals.assertions.ts";

describe("names", () => {
  it("the learn folder is named after its date", () => {
    // Arrange
    const date = "2026-10-22";

    // Act
    const name = learnFolderName(date);

    // Assert
    strictEqual(name, "learn-2026-10-22");
  });

  it("the learn folder pattern knows a learn folder", () => {
    // Arrange
    const name = "learn-2026-10-22";

    // Act
    const matches = LEARN_FOLDER_PATTERN.test(name);

    // Assert
    strictEqual(matches, true);
  });

  for (const name of NOT_LEARN_FOLDERS) {
    it(`the learn folder pattern refuses ${name}`, () => {
      // Arrange
      const candidate = name;

      // Act
      const matches = LEARN_FOLDER_PATTERN.test(candidate);

      // Assert
      strictEqual(matches, false, name);
    });
  }

  it("the learn folder's two files", () => {
    // Arrange
    const expected = ["proposals.json", "PROPOSALS.md"];

    // Act
    const files = [PROPOSALS_JSON, PROPOSALS_MD];

    // Assert
    deepStrictEqual(files, expected);
  });
});

describe("motifId", () => {
  it("is 8 hex digits of the SHA-1 of the axis and the sorted rows", () => {
    // Arrange
    const rows = ["68abc1ec48", "0b1c2d3e4f", "9a8b7c6d5e"];

    // Act
    const id = motifId("Test", rows);

    // Assert
    strictEqual(/^[0-9a-f]{8}$/.test(id), true);
    strictEqual(id, sha1Hex("Test|0b1c2d3e4f,68abc1ec48,9a8b7c6d5e").slice(0, 8));
  });

  it("is the same whatever the row order", () => {
    // Arrange
    const id = motifId("Test", ["68abc1ec48", "0b1c2d3e4f", "9a8b7c6d5e"]);

    // Act
    const reordered = motifId("Test", ["9a8b7c6d5e", "68abc1ec48", "0b1c2d3e4f"]);

    // Assert
    strictEqual(reordered, id);
  });

  it("differs for another axis", () => {
    // Arrange
    const id = motifId("Test", ["68abc1ec48", "0b1c2d3e4f", "9a8b7c6d5e"]);

    // Act
    const other = motifId("Plan", ["68abc1ec48", "0b1c2d3e4f", "9a8b7c6d5e"]);

    // Assert
    strictEqual(other === id, false);
  });
});

describe("parseProposalsFile", () => {
  it("serializes one-space indented with a final line break", () => {
    // Arrange
    const file = FILE;

    // Act
    const text = serializeProposalsFile(file);

    // Assert
    strictEqual(text, JSON.stringify(FILE, null, 1) + "\n");
  });

  it("round trips through serializeProposalsFile", () => {
    // Arrange
    const text = serializeProposalsFile(FILE);

    // Act
    const r = parseProposalsFile(text);

    // Assert
    deepStrictEqual(r, { ok: true, file: FILE });
  });

  it("invalid JSON is a one-line problem", () => {
    // Arrange
    const text = "{";

    // Act
    const r = parseProposalsFile(text);

    // Assert
    assertNotJsonProblem(r);
  });

  for (const c of WRONG_SHAPES) {
    it(`names the first field of the wrong shape: ${c.field}`, () => {
      // Arrange
      const text = JSON.stringify(c.value);

      // Act
      const r = parseProposalsFile(text);

      // Assert
      deepStrictEqual(r, { ok: false, problem: `${c.field} has the wrong shape` }, c.field);
    });
  }

  it("accepts a 10-digit motif id (collision fallback)", () => {
    // Arrange
    const text = JSON.stringify(TEN_DIGIT_ID_FILE);

    // Act
    const r = parseProposalsFile(text);

    // Assert
    strictEqual(r.ok, true);
  });
});

describe("deployedHarnessPath", () => {
  for (const c of DEPLOYED_PATHS) {
    it(`maps a pack's claude folder onto .claude/ of the checkout: ${c.path}`, () => {
      // Arrange
      const { path } = c;

      // Act
      const deployed = deployedHarnessPath(path);

      // Assert
      strictEqual(deployed, c.deployed);
    });
  }

  for (const path of NOT_DEPLOYED) {
    it(`any other path gives null: ${JSON.stringify(path)}`, () => {
      // Arrange
      const candidate = path;

      // Act
      const deployed = deployedHarnessPath(candidate);

      // Assert
      strictEqual(deployed, null, path);
    });
  }
});

describe("patchLines and acceptLines", () => {
  it("a harness owner: the patch for the orkeon-workshop repository", () => {
    // Arrange
    const motif = HARNESS_MOTIF;

    // Act
    const lines = patchLines(motif);

    // Assert
    deepStrictEqual(lines, HARNESS_PATCH);
  });

  it("a harness owner: the accept lines send the patch to the orkeon-workshop repository", () => {
    // Arrange
    const motif = HARNESS_MOTIF;

    // Act
    const lines = acceptLines(motif);

    // Assert
    deepStrictEqual(lines, HARNESS_ACCEPT);
  });

  it("a repository owner: the change to make in a batch", () => {
    // Arrange
    const motif = REPO_MOTIF;

    // Act
    const lines = patchLines(motif);

    // Assert
    deepStrictEqual(lines, REPO_PATCH);
  });

  it("a repository owner: the accept lines send the change to a batch", () => {
    // Arrange
    const motif = REPO_MOTIF;

    // Act
    const lines = acceptLines(motif);

    // Assert
    deepStrictEqual(lines, REPO_ACCEPT);
  });
});
