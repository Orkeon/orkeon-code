// The ToolCatalogue adapter: the registered names from a `tools` service served by a
// FakeServiceLocator, the calls through a tools namespace of plain functions, and
// the camelCase naming it reads that namespace with. Run:
//   node --test tests/shared/infrastructure/orkeon/tool-catalogue.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { createToolCalls, createToolCatalogue, toolMemberName } from "../../../../src/shared/infrastructure/orkeon/tool-catalogue.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";
import {
  FOUND_NAMES, MEMBER_NAMES, RAW_CALLS, UNFOUND_NAMES, catalogueOverFake, toolsNamespace,
} from "./tool-catalogue.fixtures.ts";

describe("toolMemberName", () => {
  for (const c of MEMBER_NAMES) {
    it(c.name, () => {
      // Arrange
      const { input } = c;

      // Act
      const member = toolMemberName(input);

      // Assert
      strictEqual(member, c.expected);
    });
  }
});

describe("createToolCatalogue", () => {
  it("names every registered tool as the host registers it, sorted", () => {
    // Arrange
    const { catalogue } = catalogueOverFake();

    // Act
    const names = catalogue.names();

    // Assert
    deepStrictEqual(names, ["file_read", "get-file-contents", "index_status", "listIssues", "search_code", "shell_command"]);
  });

  for (const c of FOUND_NAMES) {
    it(c.name, () => {
      // Arrange
      const { catalogue } = catalogueOverFake();

      // Act
      const found = catalogue.find(c.input);

      // Assert
      strictEqual(found, c.expected);
    });
  }

  for (const name of UNFOUND_NAMES) {
    it(`does not take ${name} for a registered name: Orkeon would refuse it`, () => {
      // Arrange
      const { catalogue } = catalogueOverFake();

      // Act
      const found = catalogue.find(name);

      // Assert
      strictEqual(found, undefined);
    });
  }

  it("calls a tool through its namespace member, with the arguments as given, and resolves to its raw result", async () => {
    // Arrange
    const { catalogue, calls } = catalogueOverFake();

    // Act
    const result = await catalogue.call("shell_command", { command: "ls" });

    // Assert
    deepStrictEqual(result, { Stdout: "ok" });
    deepStrictEqual(calls, [{ command: "ls" }]);
  });

  for (const c of RAW_CALLS) {
    it(c.name, async () => {
      // Arrange
      const { catalogue } = catalogueOverFake();

      // Act
      const result = await catalogue.call(c.tool, c.args);

      // Assert
      deepStrictEqual(result, c.expected);
    });
  }

  it("refuses a name no registered tool answers to", async () => {
    // Arrange
    const { catalogue } = catalogueOverFake();

    // Act
    const act = catalogue.call("get_file_contents", {});

    // Assert
    await rejects(act, /no registered tool 'get_file_contents'/);
  });

  it("lets a failing tool throw its own message", async () => {
    // Arrange
    const { catalogue } = catalogueOverFake();

    // Act
    const act = catalogue.call("file_read", { path: "/x" });

    // Assert
    await rejects(act, /tools\.fileRead failed \[path=\/x\]: not found/);
  });

  it("finds no name in a service that hands out nothing", () => {
    // Arrange
    const catalogue = createToolCatalogue(toolsNamespace().tools, new FakeServiceLocator());

    // Act
    const found = catalogue.find("shell_command");

    // Assert
    strictEqual(found, undefined);
  });

  it("lists no name from a service that hands out nothing", () => {
    // Arrange
    const catalogue = createToolCatalogue(toolsNamespace().tools, new FakeServiceLocator());

    // Act
    const names = catalogue.names();

    // Assert
    deepStrictEqual(names, []);
  });
});

describe("createToolCalls — a crew's calls, by registered name", () => {
  it("calls the camelCase member of the name and passes the result through", async () => {
    // Arrange
    const received: unknown[] = [];
    const calls = createToolCalls({ transcribeAudio: async (input: unknown) => { received.push(input); return "Bonjour."; } });

    // Act
    const result = await calls.call("transcribe_audio", { path: "/audio/a.m4a" });

    // Assert
    strictEqual(result, "Bonjour.");
    deepStrictEqual(received, [{ path: "/audio/a.m4a" }]);
  });

  it("throws for a name the namespace does not expose", async () => {
    // Arrange
    const calls = createToolCalls({});

    // Act
    const act = calls.call("transcribe_audio", {});

    // Assert
    await rejects(act, /no registered tool 'transcribe_audio'/);
  });

  it("passes a failure of the tool on", async () => {
    // Arrange
    const failing = createToolCalls({ listAudio: async () => { throw new Error("server gone"); } });

    // Act
    const act = failing.call("list_audio", {});

    // Assert
    await rejects(act, /server gone/);
  });
});

describe("callText — a call read as text", () => {
  it("answers a tool's text as an ok outcome", async () => {
    // Arrange
    const calls = createToolCalls({ transcribeAudio: async () => "Bonjour." });

    // Act
    const outcome = await calls.callText("transcribe_audio", {});

    // Assert
    deepStrictEqual(outcome, { ok: true, text: "Bonjour." });
  });

  it("answers a failing tool's own message, without the runtime's wrapping, as a failed outcome", async () => {
    // Arrange
    const { catalogue } = catalogueOverFake();

    // Act
    const outcome = await catalogue.callText("file_read", { path: "/x" });

    // Assert
    deepStrictEqual(outcome, { ok: false, failure: "not found" });
  });

  it("answers a name no tool answers to as a failed outcome", async () => {
    // Arrange
    const { catalogue } = catalogueOverFake();

    // Act
    const outcome = await catalogue.callText("get_file_contents", {});

    // Assert
    deepStrictEqual(outcome, { ok: false, failure: "no registered tool 'get_file_contents'" });
  });

  it("reads an object result through its text field", async () => {
    // Arrange
    const calls = createToolCalls({ transcribeAudio: async () => ({ text: "Salut.", language: "fr" }) });

    // Act
    const outcome = await calls.callText("transcribe_audio", {});

    // Assert
    deepStrictEqual(outcome, { ok: true, text: "Salut." });
  });
});
