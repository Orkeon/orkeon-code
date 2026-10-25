// The hand-editable JSON file over FakeFiles. Run:
//   node --test src/shared/application/json-file.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { readJsonFile, writeJsonFile } from "./json-file.ts";
import { FakeFiles } from "../../../tests/support/doubles/fake-files.ts";
import { ABSENT_MESSAGES, PARSED_SHAPES, PATH } from "./json-file.fixtures.ts";

describe("readJsonFile", () => {
  it("reads an absent file as no value, not malformed", async () => {
    // Arrange
    const files = new FakeFiles();

    // Act
    const read = await readJsonFile(files, PATH);

    // Assert
    deepStrictEqual(read, { value: undefined, malformed: false });
  });

  it("reads a blank file as no value, not malformed", async () => {
    // Arrange
    const files = new FakeFiles();
    files.files.set(PATH, " \n");

    // Act
    const read = await readJsonFile(files, PATH);

    // Assert
    deepStrictEqual(read, { value: undefined, malformed: false });
  });

  for (const shape of PARSED_SHAPES) {
    it(`reads the parsed value, whatever its shape: ${shape.name}`, async () => {
      // Arrange
      const files = new FakeFiles();
      files.files.set(PATH, shape.content);

      // Act
      const read = await readJsonFile(files, PATH);

      // Assert
      deepStrictEqual(read, { value: shape.value, malformed: false });
    });
  }

  it("flags malformed JSON", async () => {
    // Arrange
    const files = new FakeFiles();
    files.files.set(PATH, `{"reviewer":`);

    // Act
    const read = await readJsonFile(files, PATH);

    // Assert
    deepStrictEqual(read, { value: undefined, malformed: true });
  });

  it("flags a read that fails for another reason than absence", async () => {
    // Arrange
    const files = new FakeFiles();
    files.readErrors.set(PATH, new Error("access denied by mount rights"));

    // Act
    const read = await readJsonFile(files, PATH);

    // Assert
    deepStrictEqual(read, { value: undefined, malformed: true });
  });

  for (const message of ABSENT_MESSAGES) {
    it(`reads '${message}' as absent`, async () => {
      // Arrange
      const files = new FakeFiles();
      files.readErrors.set(PATH, new Error(message));

      // Act
      const read = await readJsonFile(files, PATH);

      // Assert
      deepStrictEqual(read, { value: undefined, malformed: false }, message);
    });
  }
});

describe("writeJsonFile", () => {
  it("writes pretty-printed JSON with a final newline", async () => {
    // Arrange
    const files = new FakeFiles();

    // Act
    await writeJsonFile(files, PATH, { reviewer: { role: "r" } });

    // Assert
    deepStrictEqual(files.writes, [{ path: PATH, content: `{\n  "reviewer": {\n    "role": "r"\n  }\n}\n` }]);
  });
});
