// The Files adapter over FakeTools file_read / file_write / directory_read. Run:
//   node --test src/shared/infrastructure/orkeon/files.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { createFiles } from "./files.ts";
import { FakeTools } from "../../../../tests/support/fake-tools.ts";
import { OTHER_CONTENTS, ROOT, ROOTED_CALLS } from "./files.fixtures.ts";

describe("createFiles — read", () => {
  it("reads `content`", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.fileRead = { content: "hello" };

    // Act
    const text = await createFiles(tools).read("/workspace/a.txt");

    // Assert
    strictEqual(text, "hello");
    deepStrictEqual(tools.inputsOf("fileRead"), [{ path: "/workspace/a.txt" }]);
  });

  it("passes max_length only when a length is asked for", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.fileRead = { content: "#" };

    // Act
    const text = await createFiles(tools).read("/workspace/skill.md", 1);

    // Assert
    strictEqual(text, "#");
    deepStrictEqual(tools.inputsOf("fileRead"), [{ path: "/workspace/skill.md", max_length: 1 }]);
  });

  for (const c of OTHER_CONTENTS) {
    it(c.name, async () => {
      // Arrange
      const tools = new FakeTools();
      tools.replies.fileRead = c.reply;

      // Act
      const text = await createFiles(tools).read("/a");

      // Assert
      strictEqual(text, c.expected);
    });
  }

  it("rethrows a failed read with the runtime's message", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.fileRead = new Error("tools.fileRead failed [path=/a]: file not found");

    // Act
    const act = createFiles(tools).read("/a");

    // Assert
    await rejects(act, /file not found/);
  });
});

describe("createFiles — write and list", () => {
  it("writes the path and content as given", async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    await createFiles(tools).write("/output/r.md", "# report\n");

    // Assert
    deepStrictEqual(tools.inputsOf("fileWrite"), [{ path: "/output/r.md", content: "# report\n" }]);
  });

  it("lists files and directories of the PascalCase listing, capped by the tool's max_results", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.directoryRead = {
      Files: [{ Name: "package.json", Path: "/workspace/package.json" }],
      Directories: [{ Name: "src", Path: "/workspace/src" }],
    };

    // Act
    const names = await createFiles(tools).list("/workspace", 80);

    // Assert
    deepStrictEqual(names, ["package.json", "src"]);
    // DirectoryReadRequest has Path, Recursive, Pattern and MaxResults; the tools
    // bind snake_case keys, so `max_entries` was ignored and the cap was 500.
    deepStrictEqual(tools.inputsOf("directoryRead"), [{ path: "/workspace", max_results: 80 }]);
  });

  it("lists the snake_case and legacy `entries` shapes", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.directoryRead = { files: [{ name: "a.ts" }], directories: [], entries: ["b.ts"] };

    // Act
    const names = await createFiles(tools).list("/workspace", 10);

    // Assert
    deepStrictEqual(names, ["a.ts", "b.ts"]);
  });
});

describe("createFiles — mounts", () => {
  it("reads the mount table as the tool emits it", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.listMounts = {
      success: true,
      mounts: [
        { virtual_path: "/workspace", access: "rw", overrides: [] },
        { virtual_path: "/crews", access: "ro", overrides: [] },
      ],
    };

    // Act
    const mounts = await createFiles(tools).mounts();

    // Assert
    deepStrictEqual(mounts, [{ path: "/workspace", rights: "rw" }, { path: "/crews", rights: "ro" }]);
    deepStrictEqual(tools.inputsOf("listMounts"), [undefined]);
  });

  it("reads a mount without access as unknown rights", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.listMounts = { mounts: [{ virtual_path: "/tmp" }, { virtual_path: "/output", access: "rwnd" }] };

    // Act
    const mounts = await createFiles(tools).mounts();

    // Assert
    deepStrictEqual(mounts, [{ path: "/tmp", rights: undefined }, { path: "/output", rights: "rwnd" }]);
  });

  it("lists no mount from an empty result", async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    const mounts = await createFiles(tools).mounts();

    // Assert
    deepStrictEqual(mounts, []);
  });

  it("lets a failed mounts call throw", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.listMounts = new Error("list_mounts is not registered");

    // Act
    const act = createFiles(tools).mounts();

    // Assert
    await rejects(act, /not registered/);
  });
});

describe("createFiles — under a working root", () => {
  for (const c of ROOTED_CALLS) {
    it(c.name, async () => {
      // Arrange
      const tools = new FakeTools();
      tools.replies.fileRead = { content: "x" };

      // Act
      await c.call(createFiles(tools, ROOT));

      // Assert
      deepStrictEqual(tools.calls.map((call) => (call.input as { path: string }).path), [c.path]);
    });
  }

  it("reads exactly as before without a root", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.fileRead = { content: "x" };

    // Act
    await createFiles(tools).read("/workspace/src/a.ts");

    // Assert
    deepStrictEqual(tools.calls.map((c) => c.input), [{ path: "/workspace/src/a.ts" }]);
  });

  it("writes exactly as before with an undefined root", async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    await createFiles(tools, undefined).write("/workspace/a", "y");

    // Assert
    deepStrictEqual(tools.calls.map((c) => c.input), [{ path: "/workspace/a", content: "y" }]);
  });
});
