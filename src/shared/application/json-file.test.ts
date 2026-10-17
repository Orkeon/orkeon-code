// The hand-editable JSON file over FakeFiles. Run:
//   node_modules/.bin/tsx --test shared/application/json-file.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { readJsonFile, writeJsonFile } from "./json-file.ts";
import { FakeFiles } from "../../../tests/support/fake-files.ts";

const PATH = "/workspace/.orkeon/agents.json";

describe("readJsonFile", () => {
  it("reads an absent file as no value, not malformed", async () => {
    deepStrictEqual(await readJsonFile(new FakeFiles(), PATH), { value: undefined, malformed: false });
  });

  it("reads a blank file as no value, not malformed", async () => {
    const files = new FakeFiles();
    files.files.set(PATH, " \n");
    deepStrictEqual(await readJsonFile(files, PATH), { value: undefined, malformed: false });
  });

  it("reads the parsed value, whatever its shape", async () => {
    const files = new FakeFiles();
    files.files.set(PATH, `{"reviewer":{"role":"r","goal":"g"}}\n`);
    deepStrictEqual(await readJsonFile(files, PATH), { value: { reviewer: { role: "r", goal: "g" } }, malformed: false });
    files.files.set(PATH, `["a"]`);
    deepStrictEqual(await readJsonFile(files, PATH), { value: ["a"], malformed: false });
  });

  it("flags malformed JSON", async () => {
    const files = new FakeFiles();
    files.files.set(PATH, `{"reviewer":`);
    deepStrictEqual(await readJsonFile(files, PATH), { value: undefined, malformed: true });
  });

  it("flags a read that fails for another reason than absence", async () => {
    const files = new FakeFiles();
    files.readErrors.set(PATH, new Error("access denied by mount rights"));
    deepStrictEqual(await readJsonFile(files, PATH), { value: undefined, malformed: true });
  });

  it("reads 'no such file' and 'does not exist' as absent", async () => {
    const files = new FakeFiles();
    for (const message of ["No such file or directory", "path does not exist"]) {
      files.readErrors.set(PATH, new Error(message));
      deepStrictEqual(await readJsonFile(files, PATH), { value: undefined, malformed: false }, message);
    }
  });
});

describe("writeJsonFile", () => {
  it("writes pretty-printed JSON with a final newline", async () => {
    const files = new FakeFiles();
    await writeJsonFile(files, PATH, { reviewer: { role: "r" } });
    deepStrictEqual(files.writes, [{ path: PATH, content: `{\n  "reviewer": {\n    "role": "r"\n  }\n}\n` }]);
  });
});
