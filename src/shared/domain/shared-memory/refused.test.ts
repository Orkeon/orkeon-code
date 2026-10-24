// The refused motifs file: parsing, appending, topics and project names. Run:
//   node --test src/shared/domain/shared-memory/refused.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import {
  REFUSED_FILE, REFUSED_HEADER, TOPIC_PATTERN, appendRefused, parseRefused, projectFromRemote, refusedLine, topicOf,
} from "./refused.ts";

const motif = { topic: "refusal-paths-untested", project: "orkeon-code", date: "2026-10-22", motif: "Refusal paths go untested" };

describe("parseRefused", () => {
  it("reads nothing from the header-only file", () => {
    deepStrictEqual(parseRefused(appendRefused(null, motif).split("\n").slice(0, 4).join("\n")), { motifs: [], problems: [] });
  });

  it("reads a four-part line and re-joins a motif holding the separator", () => {
    const list = parseRefused(`# Refused motifs\n\n${REFUSED_HEADER}\n\nabc | p | 2026-10-22 | x\nd-e | p | 2026-01-01 | one | two\n`);
    deepStrictEqual(list.motifs, [
      { topic: "abc", project: "p", date: "2026-10-22", motif: "x", line: 5 },
      { topic: "d-e", project: "p", date: "2026-01-01", motif: "one | two", line: 6 },
    ]);
    deepStrictEqual(list.problems, []);
  });

  it("reports the bad lines", () => {
    const list = parseRefused("Bad Topic | p | 2026-10-22 | x\nabc | p | 22/10/2026 | x\nabc | p | 2026-10-22\n");
    deepStrictEqual(list.motifs, []);
    deepStrictEqual(list.problems.map((p) => p.line), [1, 2, 3]);
    strictEqual(list.problems[0].message, 'line 1: not "topic | project | date | motif"');
  });
});

describe("appendRefused and refusedLine", () => {
  it("writes the header for a new file", () => {
    strictEqual(appendRefused(null, motif),
      `# Refused motifs\n\n${REFUSED_HEADER}\n\nrefusal-paths-untested | orkeon-code | 2026-10-22 | Refusal paths go untested\n`);
    strictEqual(REFUSED_FILE, ".orkeon/memory/refused.md");
  });

  it("appends one line to an existing file, adding a missing final line break", () => {
    strictEqual(appendRefused("x", motif), `x\n${refusedLine(motif)}\n`);
    strictEqual(parseRefused(appendRefused(appendRefused(null, motif), { ...motif, topic: "b" })).motifs.length, 2);
  });

  it("escapes pipes and line breaks and cuts the motif at 200 characters", () => {
    strictEqual(refusedLine({ ...motif, project: "a|b", motif: "open|done\nnext" }),
      "refusal-paths-untested | a/b | 2026-10-22 | open/done next");
    const long = refusedLine({ ...motif, motif: "m".repeat(250) }).split(" | ")[3];
    strictEqual(long, "m".repeat(199) + "…");
  });
});

describe("topicOf", () => {
  it("folds and joins words with dashes", () => {
    strictEqual(topicOf("Refusal paths go untested"), "refusal-paths-go-untested");
    strictEqual(topicOf("Règle d'or: pas de I/O"), "regle-d-or-pas-de-i-o");
    strictEqual(TOPIC_PATTERN.test(topicOf("  --Hello, World!--  ")), true);
  });

  it("cuts at the last dash within 60 characters, or hard at 60", () => {
    const words = topicOf(Array(20).fill("abcdefg").join(" "));
    strictEqual(words, Array(7).fill("abcdefg").join("-"));
    strictEqual(topicOf("x".repeat(80)), "x".repeat(60));
  });

  it("falls back on a hash for text with no letter or digit", () => {
    strictEqual(/^motif-[0-9a-f]{8}$/.test(topicOf("— ! —")), true);
    strictEqual(topicOf("— ! —"), topicOf("— ! —"));
  });
});

describe("projectFromRemote", () => {
  it("takes the last segment, cleaned", () => {
    strictEqual(projectFromRemote("https://github.com/Orkeon/orkeon-code.git"), "orkeon-code");
    strictEqual(projectFromRemote("git@host:team/My_Repo.git"), "my-repo");
    strictEqual(projectFromRemote(" https://host/x/Proj/ \n"), "proj");
  });

  it("gives null when nothing is left", () => {
    strictEqual(projectFromRemote(""), null);
    strictEqual(projectFromRemote("https://host/__/"), null);
  });
});
