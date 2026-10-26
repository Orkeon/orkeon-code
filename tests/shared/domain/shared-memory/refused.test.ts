// The refused motifs file: parsing, appending, topics and project names. Run:
//   node --test tests/shared/domain/shared-memory/refused.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import {
  REFUSED_FILE, TOPIC_PATTERN, appendRefused, parseRefused, projectFromRemote, refusedLine, topicOf,
} from "../../../../src/shared/domain/shared-memory/refused.ts";
import {
  BAD_LINES, EMPTY_REMOTES, LONG_TOPICS, NEW_FILE, REMOTES, TOPICS, TWO_MOTIFS, headerOnly, motif,
} from "./refused.fixtures.ts";

describe("parseRefused", () => {
  it("reads nothing from the header-only file", () => {
    // Arrange
    const text = headerOnly();

    // Act
    const list = parseRefused(text);

    // Assert
    deepStrictEqual(list, { motifs: [], problems: [] });
  });

  it("reads a four-part line and re-joins a motif holding the separator", () => {
    // Arrange
    const text = TWO_MOTIFS;

    // Act
    const list = parseRefused(text);

    // Assert
    deepStrictEqual(list.motifs, [
      { topic: "abc", project: "p", date: "2026-10-22", motif: "x", line: 5 },
      { topic: "d-e", project: "p", date: "2026-01-01", motif: "one | two", line: 6 },
    ]);
    deepStrictEqual(list.problems, []);
  });

  it("reports the bad lines", () => {
    // Arrange
    const text = BAD_LINES;

    // Act
    const list = parseRefused(text);

    // Assert
    deepStrictEqual(list.motifs, []);
    deepStrictEqual(list.problems.map((p) => p.line), [1, 2, 3]);
    strictEqual(list.problems[0].message, 'line 1: not "topic | project | date | motif"');
  });
});

describe("appendRefused and refusedLine", () => {
  it("writes the header for a new file", () => {
    // Arrange
    const existing = null;

    // Act
    const text = appendRefused(existing, motif);

    // Assert
    strictEqual(text, NEW_FILE);
  });

  it("keeps the file at .orkeon/memory/refused.md", () => {
    // Arrange
    const expected = ".orkeon/memory/refused.md";

    // Act
    const file = REFUSED_FILE;

    // Assert
    strictEqual(file, expected);
  });

  it("appends one line to an existing file, adding a missing final line break", () => {
    // Arrange
    const existing = "x";

    // Act
    const text = appendRefused(existing, motif);

    // Assert
    strictEqual(text, `x\n${refusedLine(motif)}\n`);
  });

  it("appends a second motif to a new file, both read back", () => {
    // Arrange
    const existing = appendRefused(null, motif);

    // Act
    const text = appendRefused(existing, { ...motif, topic: "b" });

    // Assert
    strictEqual(parseRefused(text).motifs.length, 2);
  });

  it("escapes pipes and line breaks", () => {
    // Arrange
    const escaped = { ...motif, project: "a|b", motif: "open|done\nnext" };

    // Act
    const line = refusedLine(escaped);

    // Assert
    strictEqual(line, "refusal-paths-untested | a/b | 2026-10-22 | open/done next");
  });

  it("cuts the motif at 200 characters", () => {
    // Arrange
    const long = { ...motif, motif: "m".repeat(250) };

    // Act
    const line = refusedLine(long);

    // Assert
    strictEqual(line.split(" | ")[3], "m".repeat(199) + "…");
  });
});

describe("topicOf", () => {
  for (const c of TOPICS) {
    it(`folds and joins words with dashes: ${c.name}`, () => {
      // Arrange
      const { text } = c;

      // Act
      const topic = topicOf(text);

      // Assert
      strictEqual(topic, c.expected);
    });
  }

  it("gives a topic of the pattern for a text padded with dashes and punctuation", () => {
    // Arrange
    const text = "  --Hello, World!--  ";

    // Act
    const topic = topicOf(text);

    // Assert
    strictEqual(TOPIC_PATTERN.test(topic), true);
  });

  for (const c of LONG_TOPICS) {
    it(`cuts at the last dash within 60 characters, or hard at 60: ${c.name}`, () => {
      // Arrange
      const { text } = c;

      // Act
      const topic = topicOf(text);

      // Assert
      strictEqual(topic, c.expected);
    });
  }

  it("falls back on a hash for text with no letter or digit", () => {
    // Arrange
    const text = "— ! —";

    // Act
    const topic = topicOf(text);

    // Assert
    strictEqual(/^motif-[0-9a-f]{8}$/.test(topic), true);
  });

  it("gives the same hash for the same text", () => {
    // Arrange
    const first = topicOf("— ! —");

    // Act
    const second = topicOf("— ! —");

    // Assert
    strictEqual(second, first);
  });
});

describe("projectFromRemote", () => {
  for (const c of REMOTES) {
    it(`takes the last segment, cleaned: ${c.name}`, () => {
      // Arrange
      const remote = c.text;

      // Act
      const project = projectFromRemote(remote);

      // Assert
      strictEqual(project, c.expected);
    });
  }

  for (const remote of EMPTY_REMOTES) {
    it(`gives null when nothing is left: ${JSON.stringify(remote)}`, () => {
      // Arrange
      const given = remote;

      // Act
      const project = projectFromRemote(given);

      // Assert
      strictEqual(project, null);
    });
  }
});
