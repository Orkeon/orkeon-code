// The reads of the init-verifiers use case over FakeFiles. Run:
//   node --test tests/crews/init-verifiers/application/authoring.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { readCommandsSection } from "../../../../src/crews/init-verifiers/application/authoring.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { COMMANDS_FILES } from "./authoring.fixtures.ts";

describe("readCommandsSection", () => {
  for (const c of COMMANDS_FILES) {
    it(c.name, async () => {
      // Arrange
      const files = new FakeFiles();
      for (const [name, text] of Object.entries(c.files)) files.files.set(`${WORKSPACE}/${name}`, text);

      // Act
      const found = await readCommandsSection(files);

      // Assert
      deepStrictEqual(found, c.expected);
    });
  }
});
