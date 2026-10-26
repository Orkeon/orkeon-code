// Unit tests for the tool-result normaliser (snake AND Pascal casing), a result
// as text and a failure as the tool's own message. Run:
//   node --test tests/shared/infrastructure/orkeon/tool-results.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok, rejects } from "node:assert";

import {
  pick, shOut, shErr, shCode, fileContent, asArray, entryNames, failureText, ownMessage, resultText, withToolMessage,
} from "../../../../src/shared/infrastructure/orkeon/tool-results.ts";
import {
  ARRAYS, CAPTURED_FILE_READ, CAPTURED_SESSION_STATS, CONTENTS, ENTRY_NAMES, EXIT_CODES, FAILURE_TEXTS, OWN_MESSAGE,
  PICKS, RESULT_TEXTS, SESSION_STATS_COUNTERS, STDERRS, STDOUTS, TWO_LINE_FAILURE, TWO_LINE_MESSAGE,
  MULTI_LINE_FAILURE, MULTI_LINE_MESSAGE,
} from "./tool-results.fixtures.ts";

describe("pick", () => {
  it("falls through to a Pascal-cased candidate", () => {
    // Arrange
    const object = { Messages: [1] };

    // Act
    const value = pick(object, "messages", "Messages");

    // Assert
    deepStrictEqual(value, [1]);
  });

  for (const c of PICKS) {
    it(c.name, () => {
      // Arrange
      const { object, names } = c;

      // Act
      const value = pick(object, ...names);

      // Assert
      strictEqual(value, c.expected);
    });
  }
});

describe("shell result accessors (snake + Pascal)", () => {
  for (const c of STDOUTS) {
    it(`shOut reads ${c.name}`, () => {
      // Arrange
      const { result } = c;

      // Act
      const out = shOut(result);

      // Assert
      strictEqual(out, c.expected);
    });
  }

  for (const c of STDERRS) {
    it(`shErr reads ${c.name}`, () => {
      // Arrange
      const { result } = c;

      // Act
      const err = shErr(result);

      // Assert
      strictEqual(err, c.expected);
    });
  }

  for (const c of EXIT_CODES) {
    it(`shCode reads ${c.name}`, () => {
      // Arrange
      const { result } = c;

      // Act
      const code = shCode(result);

      // Assert
      strictEqual(code, c.expected);
    });
  }
});

describe("fileContent", () => {
  for (const c of CONTENTS) {
    it(`reads ${c.name}`, () => {
      // Arrange
      const { result } = c;

      // Act
      const content = fileContent(result);

      // Assert
      strictEqual(content, c.expected);
    });
  }
});

describe("asArray", () => {
  for (const c of ARRAYS) {
    it(c.name, () => {
      // Arrange
      const { result } = c;

      // Act
      const array = asArray(result);

      // Assert
      deepStrictEqual(array, c.expected);
    });
  }
});

describe("entryNames", () => {
  for (const c of ENTRY_NAMES) {
    it(c.name, () => {
      // Arrange
      const { result } = c;

      // Act
      const names = entryNames(result);

      // Assert
      deepStrictEqual(names, c.expected);
    });
  }
});

// ── B-14: pinned against payloads captured from LIVE calls (2026-08-05) ───
//
// The shims above were written from the tool sources. These cases come from what
// the tools actually returned in this host, read with `/debug-tool-call <tool>
// {json}`. The distinction matters: a shim that reads a field the tool does not
// emit returns "" or 0 and the caller reports an empty success — the exact failure
// that made the first code-intel probe claim "indexed 0 files" on a working index.

describe("live-verified payload shapes", () => {
  it("file_read returns { content, file_info } — fileContent reads it", () => {
    // Arrange
    const captured = CAPTURED_FILE_READ;

    // Act
    const content = fileContent(captured);

    // Assert
    ok(content.startsWith("# sample-repo"), `content read: ${JSON.stringify(content)}`);
  });

  it("file_read returns { content, file_info } — pick reads its file_info", () => {
    // Arrange
    const captured = CAPTURED_FILE_READ;

    // Act
    const info = pick(captured, "file_info", "FileInfo");

    // Assert
    strictEqual(info.size, 206);
  });

  for (const c of SESSION_STATS_COUNTERS) {
    it(`session_stats returns snake_case counters: ${c.name}`, () => {
      // Arrange
      const captured = CAPTURED_SESSION_STATS;

      // Act
      const counter = pick(captured, ...c.names);

      // Assert
      strictEqual(counter, 0);
    });
  }

  // Pinned deliberately: this is the silent-failure shape. Nothing here can stop
  // it, so the lesson lives in the readers (see code-intel-contract.ts), which
  // are pinned against captured payloads instead of guessed names.
  it("a shim asked for a field the tool does not emit returns the empty value: fileContent", () => {
    // Arrange
    const result = { body: "wrong field name" };

    // Act
    const content = fileContent(result);

    // Assert
    strictEqual(content, "");
  });

  it("a shim asked for a field the tool does not emit returns the empty value: shOut", () => {
    // Arrange
    const result = { output: "wrong field name" };

    // Act
    const out = shOut(result);

    // Assert
    strictEqual(out, "");
  });
});

describe("resultText", () => {
  for (const c of RESULT_TEXTS) {
    it(c.name, () => {
      // Arrange
      const { raw } = c;

      // Act
      const text = resultText(raw);

      // Assert
      strictEqual(text, c.text);
    });
  }
});

describe("failureText", () => {
  for (const c of FAILURE_TEXTS) {
    it(c.name, () => {
      // Arrange
      const { error } = c;

      // Act
      const text = failureText(error);

      // Assert
      strictEqual(text, c.text);
    });
  }
});

describe("ownMessage", () => {
  it("keeps every line of a wrapped failure", () => {
    // Arrange
    const error = new Error(MULTI_LINE_FAILURE);

    // Act
    const text = ownMessage(error);

    // Assert
    strictEqual(text, MULTI_LINE_MESSAGE);
  });
});

describe("withToolMessage", () => {
  it("rethrows a failure with the tool's own message, without the runtime's wrapping", async () => {
    // Arrange
    const call = async () => { throw new Error(`tools.fileRead failed [path=/a]: Error executing tool file_read: ${OWN_MESSAGE}`); };

    // Act
    const act = withToolMessage(call);

    // Assert
    await rejects(act, (e: Error) => e.message === OWN_MESSAGE);
  });

  it("rethrows a two-line failure with its second line", async () => {
    // Arrange
    const call = async () => { throw new Error(TWO_LINE_FAILURE); };

    // Act
    const act = withToolMessage(call);

    // Assert
    await rejects(act, (e: Error) => e.message === TWO_LINE_MESSAGE);
  });
});
