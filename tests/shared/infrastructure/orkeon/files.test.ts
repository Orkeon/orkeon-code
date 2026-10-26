// The Files adapter over FakeTools file_read / file_write / directory_read. Run:
//   node --test src/shared/infrastructure/orkeon/files.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { createFiles } from "../../../../src/shared/infrastructure/orkeon/files.ts";
import { FakeTools } from "../../../support/doubles/fake-tools.ts";
import { OTHER_CONTENTS, ROOT, ROOTED_CALLS } from "./files.fixtures.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("createFiles — read", () => {
  it("reads `content`", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.fileRead = { content: "hello" };

    // Act
    const text = await createFiles(tools).read(`${WORKSPACE}/a.txt`);

    // Assert
    strictEqual(text, "hello");
    deepStrictEqual(tools.inputsOf("fileRead"), [{ path: `${WORKSPACE}/a.txt` }]);
  });

  it("passes max_length only when a length is asked for", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.fileRead = { content: "#" };

    // Act
    const text = await createFiles(tools).read(`${WORKSPACE}/skill.md`, 1);

    // Assert
    strictEqual(text, "#");
    deepStrictEqual(tools.inputsOf("fileRead"), [{ path: `${WORKSPACE}/skill.md`, max_length: 1 }]);
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

  it("rethrows a failed read with the tool's own message, without the runtime's wrapping", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.fileRead = new Error("tools.fileRead failed [path=/a]: file not found");

    // Act
    const act = createFiles(tools).read("/a");

    // Assert
    await rejects(act, (e: Error) => e.message === "file not found");
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
      Files: [{ Name: "package.json", Path: `${WORKSPACE}/package.json` }],
      Directories: [{ Name: "src", Path: `${WORKSPACE}/src` }],
    };

    // Act
    const names = await createFiles(tools).list(WORKSPACE, 80);

    // Assert
    deepStrictEqual(names, ["package.json", "src"]);
    // DirectoryReadRequest has Path, Recursive, Pattern and MaxResults; the tools
    // bind snake_case keys, so `max_entries` was ignored and the cap was 500.
    deepStrictEqual(tools.inputsOf("directoryRead"), [{ path: WORKSPACE, max_results: 80 }]);
  });

  it("lists the snake_case and legacy `entries` shapes", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.directoryRead = { files: [{ name: "a.ts" }], directories: [], entries: ["b.ts"] };

    // Act
    const names = await createFiles(tools).list(WORKSPACE, 10);

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
        { virtual_path: WORKSPACE, access: "rw", overrides: [] },
        { virtual_path: "/crews", access: "ro", overrides: [] },
      ],
    };

    // Act
    const mounts = await createFiles(tools).mounts();

    // Assert
    deepStrictEqual(mounts, [{ path: WORKSPACE, rights: "rw" }, { path: "/crews", rights: "ro" }]);
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
    await createFiles(tools).read(`${WORKSPACE}/src/a.ts`);

    // Assert
    deepStrictEqual(tools.calls.map((c) => c.input), [{ path: `${WORKSPACE}/src/a.ts` }]);
  });

  it("writes exactly as before with an undefined root", async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    await createFiles(tools, undefined).write(`${WORKSPACE}/a`, "y");

    // Assert
    deepStrictEqual(tools.calls.map((c) => c.input), [{ path: `${WORKSPACE}/a`, content: "y" }]);
  });
});
