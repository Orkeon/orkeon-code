// The host layout read from /user-config/launch.json over FakeFiles. Run:
//   node --test tests/shared/application/host-layout-store.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { HOST_LAYOUT_FILE_PATH, onceHostLayout, readHostLayout } from "../../../src/shared/application/host-layout-store.ts";
import { FakeFiles } from "../../support/doubles/fake-files.ts";
import { READ_CASES, WSL_FILE } from "./host-layout-store.fixtures.ts";

describe("readHostLayout", () => {
  for (const c of READ_CASES) {
    it(c.name, async () => {
      // Arrange
      const files = new FakeFiles();
      c.files(files);

      // Act
      const read = await readHostLayout(files);

      // Assert
      deepStrictEqual(read, c.expected);
    });
  }

  it("reads the file at its path on the user configuration mount", async () => {
    // Arrange
    const files = new FakeFiles();

    // Act
    await readHostLayout(files);

    // Assert
    deepStrictEqual(files.reads, [HOST_LAYOUT_FILE_PATH]);
  });
});

describe("onceHostLayout", () => {
  it("reads the file once for every call", async () => {
    // Arrange
    const files = new FakeFiles();
    files.files.set(HOST_LAYOUT_FILE_PATH, WSL_FILE);
    const read = onceHostLayout(() => readHostLayout(files));

    // Act
    const [first, second] = await Promise.all([read(), read()]);

    // Assert
    strictEqual(files.reads.length, 1);
    strictEqual(first, second);
  });
});
