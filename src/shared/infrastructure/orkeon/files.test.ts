// The Files adapter over FakeTools file_read / file_write / directory_read. Run:
//   node --test src/shared/infrastructure/orkeon/files.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { createFiles } from "./files.ts";
import { FakeTools } from "../../../../tests/support/fake-tools.ts";

describe("createFiles — read", () => {
  it("reads `content`", async () => {
    const tools = new FakeTools();
    tools.replies.fileRead = { content: "hello" };
    strictEqual(await createFiles(tools).read("/workspace/a.txt"), "hello");
    deepStrictEqual(tools.inputsOf("fileRead"), [{ path: "/workspace/a.txt" }]);
  });

  it("passes max_length only when a length is asked for", async () => {
    const tools = new FakeTools();
    tools.replies.fileRead = { content: "#" };
    strictEqual(await createFiles(tools).read("/workspace/skill.md", 1), "#");
    deepStrictEqual(tools.inputsOf("fileRead"), [{ path: "/workspace/skill.md", max_length: 1 }]);
  });

  it("reads `Content` (PascalCase) and `text`", async () => {
    const tools = new FakeTools();
    tools.replies.fileRead = { Content: "pascal" };
    strictEqual(await createFiles(tools).read("/a"), "pascal");
    tools.replies.fileRead = { text: "plain" };
    strictEqual(await createFiles(tools).read("/a"), "plain");
  });

  it("rethrows a failed read with the runtime's message", async () => {
    const tools = new FakeTools();
    tools.replies.fileRead = new Error("tools.fileRead failed [path=/a]: file not found");
    await rejects(createFiles(tools).read("/a"), /file not found/);
  });
});

describe("createFiles — write and list", () => {
  it("writes the path and content as given", async () => {
    const tools = new FakeTools();
    await createFiles(tools).write("/output/r.md", "# report\n");
    deepStrictEqual(tools.inputsOf("fileWrite"), [{ path: "/output/r.md", content: "# report\n" }]);
  });

  it("lists files and directories of the PascalCase listing, capped by the tool's max_results", async () => {
    const tools = new FakeTools();
    tools.replies.directoryRead = {
      Files: [{ Name: "package.json", Path: "/workspace/package.json" }],
      Directories: [{ Name: "src", Path: "/workspace/src" }],
    };
    deepStrictEqual(await createFiles(tools).list("/workspace", 80), ["package.json", "src"]);
    // DirectoryReadRequest has Path, Recursive, Pattern and MaxResults; the tools
    // bind snake_case keys, so `max_entries` was ignored and the cap was 500.
    deepStrictEqual(tools.inputsOf("directoryRead"), [{ path: "/workspace", max_results: 80 }]);
  });

  it("lists the snake_case and legacy `entries` shapes", async () => {
    const tools = new FakeTools();
    tools.replies.directoryRead = { files: [{ name: "a.ts" }], directories: [], entries: ["b.ts"] };
    deepStrictEqual(await createFiles(tools).list("/workspace", 10), ["a.ts", "b.ts"]);
  });
});

describe("createFiles — mounts", () => {
  it("reads the PascalCase mount table as the tool emits it", async () => {
    const tools = new FakeTools();
    tools.replies.listMounts = { Mounts: [{ Path: "/workspace", Rights: "rw" }, { Path: "/crews", Rights: "r" }] };
    deepStrictEqual(await createFiles(tools).mounts(), [
      { path: "/workspace", rights: "rw" },
      { path: "/crews", rights: "r" },
    ]);
    deepStrictEqual(tools.inputsOf("listMounts"), [undefined]);
  });

  it("reads the lower-case shapes, and a mount without rights", async () => {
    const tools = new FakeTools();
    tools.replies.listMounts = { mounts: [{ virtual_path: "/tmp" }, { path: "/output", rights: "ReadWrite" }] };
    deepStrictEqual(await createFiles(tools).mounts(), [
      { path: "/tmp", rights: undefined },
      { path: "/output", rights: "ReadWrite" },
    ]);
  });

  it("lists no mount from an empty result, and lets a failed call throw", async () => {
    const tools = new FakeTools();
    deepStrictEqual(await createFiles(tools).mounts(), []);
    tools.replies.listMounts = new Error("list_mounts is not registered");
    await rejects(createFiles(tools).mounts(), /not registered/);
  });
});
