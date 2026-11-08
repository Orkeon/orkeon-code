// The host layer around an act's callbacks: the spellings brought back before the call and in the result, the path
// lists judging the canonical call, the inner callbacks seeing the canonical call and result. Run:
//   node --test tests/shared/application/dev/tool-callbacks.host.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { hostCallbacks } from "../../../../src/shared/application/dev/tool-callbacks.ts";
import { IDENTITY_CONTEXT } from "../../../../src/shared/application/host-context.ts";
import { FakeActCallbacks } from "../../../support/doubles/fake-act-callbacks.ts";
import {
  CANONICAL_READ, CANONICAL_RESULT, CANONICAL_SHELL, CANONICAL_TEXT, DISK_RESULT, DISK_TEXT, HOST, HOST_NO_LISTS, LISTS_ONLY,
  PLAIN_READ, SECRET_DENY, SECRET_READ, WINDOWS_READ, WINDOWS_SHELL,
} from "./tool-callbacks.host.fixtures.ts";

describe("hostCallbacks — the identity", () => {
  it("leaves the inner callbacks as they are on the identity context", () => {
    // Arrange
    const inner = new FakeActCallbacks();

    // Act
    const callbacks = hostCallbacks(inner, IDENTITY_CONTEXT);

    // Assert
    strictEqual(callbacks, inner);
  });

  it("gives no callbacks on the identity context without inner ones", () => {
    // Arrange
    const inner = undefined;

    // Act
    const callbacks = hostCallbacks(inner, IDENTITY_CONTEXT);

    // Assert
    strictEqual(callbacks, undefined);
  });

  it("wraps an act for the lists alone on a host without mounts", async () => {
    // Arrange
    const callbacks = hostCallbacks(undefined, LISTS_ONLY)!;

    // Act
    const verdict = await callbacks.onToolCall({ name: "file_read", input: { path: "/workspace/secrets/k" } });

    // Assert
    deepStrictEqual(verdict, { deny: "file_read on '/workspace/secrets/k' is refused by paths.deny '/workspace/secrets/*'" });
  });
});

describe("hostCallbacks — onToolCall", () => {
  it("rewrites a call spelled on the disk to its canonical input, without inner callbacks", async () => {
    // Arrange
    const callbacks = hostCallbacks(undefined, HOST_NO_LISTS)!;

    // Act
    const verdict = await callbacks.onToolCall(WINDOWS_READ);

    // Assert
    deepStrictEqual(verdict, { input: CANONICAL_READ.input });
  });

  it("rewrites the words of a shell command spelled on the disk", async () => {
    // Arrange
    const callbacks = hostCallbacks(undefined, HOST_NO_LISTS)!;

    // Act
    const verdict = await callbacks.onToolCall(WINDOWS_SHELL);

    // Assert
    deepStrictEqual(verdict, { input: CANONICAL_SHELL.input });
  });

  it("allows a canonical call as it is, without inner callbacks", async () => {
    // Arrange
    const callbacks = hostCallbacks(undefined, HOST_NO_LISTS)!;

    // Act
    const verdict = await callbacks.onToolCall(PLAIN_READ);

    // Assert
    strictEqual(verdict, "allow");
  });

  it("refuses a call the lists deny, in its disk spelling, before the inner callbacks", async () => {
    // Arrange
    const inner = new FakeActCallbacks();
    const callbacks = hostCallbacks(inner, HOST)!;

    // Act
    const verdict = await callbacks.onToolCall(SECRET_READ);

    // Assert
    deepStrictEqual(verdict, { deny: SECRET_DENY });
    deepStrictEqual(inner.calls, []);
  });

  it("hands the inner callbacks the canonical call", async () => {
    // Arrange
    const inner = new FakeActCallbacks();
    const callbacks = hostCallbacks(inner, HOST)!;

    // Act
    await callbacks.onToolCall(WINDOWS_READ);

    // Assert
    deepStrictEqual(inner.calls, [CANONICAL_READ]);
  });

  it("turns an inner allow into the canonical input when the spelling changed", async () => {
    // Arrange
    const inner = new FakeActCallbacks();
    const callbacks = hostCallbacks(inner, HOST)!;

    // Act
    const verdict = await callbacks.onToolCall(WINDOWS_READ);

    // Assert
    deepStrictEqual(verdict, { input: CANONICAL_READ.input });
  });

  it("keeps an inner allow when the spelling did not change", async () => {
    // Arrange
    const inner = new FakeActCallbacks();
    const callbacks = hostCallbacks(inner, HOST)!;

    // Act
    const verdict = await callbacks.onToolCall(PLAIN_READ);

    // Assert
    strictEqual(verdict, "allow");
  });

  it("keeps an inner refusal", async () => {
    // Arrange
    const inner = new FakeActCallbacks();
    inner.verdict = { deny: "dev-plan: refused" };
    const callbacks = hostCallbacks(inner, HOST)!;

    // Act
    const verdict = await callbacks.onToolCall(WINDOWS_READ);

    // Assert
    deepStrictEqual(verdict, { deny: "dev-plan: refused" });
  });

  it("keeps an inner rewrite, canonicalised once more", async () => {
    // Arrange
    const inner = new FakeActCallbacks();
    inner.verdict = { input: { path: "C:\\ici est\\mon repertoire\\src\\resolved.ts" } };
    const callbacks = hostCallbacks(inner, HOST)!;

    // Act
    const verdict = await callbacks.onToolCall(PLAIN_READ);

    // Assert
    deepStrictEqual(verdict, { input: { path: "/workspace/src/resolved.ts" } });
  });
});

describe("hostCallbacks — onToolResult", () => {
  it("replaces a text result whose disk spellings changed, without inner callbacks", async () => {
    // Arrange
    const callbacks = hostCallbacks(undefined, HOST_NO_LISTS)!;

    // Act
    const answer = await callbacks.onToolResult(CANONICAL_SHELL, DISK_TEXT);

    // Assert
    deepStrictEqual(answer, { context: CANONICAL_TEXT });
  });

  it("replaces a structured result by the JSON of its canonical strings", async () => {
    // Arrange
    const callbacks = hostCallbacks(undefined, HOST_NO_LISTS)!;

    // Act
    const answer = await callbacks.onToolResult(CANONICAL_SHELL, DISK_RESULT);

    // Assert
    deepStrictEqual(answer, { context: JSON.stringify(CANONICAL_RESULT) });
  });

  it("leaves a result without a disk spelling to the runtime", async () => {
    // Arrange
    const callbacks = hostCallbacks(undefined, HOST_NO_LISTS)!;

    // Act
    const answer = await callbacks.onToolResult(PLAIN_READ, "const a = 1;");

    // Assert
    strictEqual(answer, undefined);
  });

  it("hands the inner callbacks the canonical call and the canonical result", async () => {
    // Arrange
    const inner = new FakeActCallbacks();
    const callbacks = hostCallbacks(inner, HOST)!;

    // Act
    await callbacks.onToolResult(WINDOWS_READ, DISK_RESULT);

    // Assert
    deepStrictEqual(inner.results, [{ call: CANONICAL_READ, result: CANONICAL_RESULT }]);
  });

  it("canonicalises the context the inner callbacks answer", async () => {
    // Arrange
    const inner = new FakeActCallbacks();
    inner.resultAnswer = { context: `${DISK_TEXT}\n[post-tool hook #1 exited 2]` };
    const callbacks = hostCallbacks(inner, HOST)!;

    // Act
    const answer = await callbacks.onToolResult(PLAIN_READ, "x");

    // Assert
    deepStrictEqual(answer, { context: `${CANONICAL_TEXT}\n[post-tool hook #1 exited 2]` });
  });

  it("replaces a changed result when the inner callbacks answer nothing", async () => {
    // Arrange
    const inner = new FakeActCallbacks();
    const callbacks = hostCallbacks(inner, HOST)!;

    // Act
    const answer = await callbacks.onToolResult(PLAIN_READ, DISK_TEXT);

    // Assert
    deepStrictEqual(answer, { context: CANONICAL_TEXT });
  });

  it("answers nothing for an unchanged result when the inner callbacks answer nothing", async () => {
    // Arrange
    const inner = new FakeActCallbacks();
    const callbacks = hostCallbacks(inner, HOST)!;

    // Act
    const answer = await callbacks.onToolResult(PLAIN_READ, "const a = 1;");

    // Assert
    strictEqual(answer, undefined);
  });
});
