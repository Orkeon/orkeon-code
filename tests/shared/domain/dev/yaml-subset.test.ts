// Unit tests for the YAML subset reader. Run:
//   node --test src/shared/domain/dev/yaml-subset.test.ts
// The two pack fixtures are copies of the workshop's repo-orkeon and repo-orkeon-workshop
// packs (orkeon-workshop 6873ee2, packs/<name>/references/repo.yaml). Their expected
// values were produced once with PyYAML 6.0, from the repository root:
//   python3 -I -c 'import json,sys,yaml; print(json.dumps(yaml.safe_load(open(sys.argv[1], encoding="utf-8")), ensure_ascii=False, indent=1))' tests/fixtures/dev/<name>.yaml > tests/fixtures/dev/<name>.pyyaml.json
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { formatYamlError } from "../../../../src/shared/domain/dev/yaml-subset.ts";
import { CONSTRUCTS, fixture, PACKS, REFUSALS, refusal, value } from "./yaml-subset.fixtures.ts";

describe("parseYamlSubset on the pack fixtures", () => {
  for (const name of PACKS) {
    it(`${name}.yaml gives what PyYAML gives`, () => {
      // Arrange
      const text = fixture(`${name}.yaml`);
      const expected = JSON.parse(fixture(`${name}.pyyaml.json`));

      // Act
      const read = value(text);

      // Assert
      deepStrictEqual(read, expected);
    });
  }

  it("reads CRLF line endings like LF ones", () => {
    // Arrange
    const text = fixture("repo-orkeon-workshop.yaml");
    const expected = value(text);

    // Act
    const read = value(text.replace(/\n/g, "\r\n"));

    // Assert
    deepStrictEqual(read, expected);
  });
});

describe("parseYamlSubset constructs", () => {
  for (const c of CONSTRUCTS) {
    it(c.name, () => {
      // Arrange
      const { text } = c;

      // Act
      const read = value(text);

      // Assert
      deepStrictEqual(read, c.expected);
    });
  }
});

describe("parseYamlSubset refusals", () => {
  for (const [title, text, line, message] of REFUSALS) {
    it(`refuses ${title}`, () => {
      // Arrange
      const expected = { line, message };

      // Act
      const error = refusal(text);

      // Assert
      deepStrictEqual(error, expected);
    });
  }
});

describe("formatYamlError", () => {
  it("prefixes the path and the line", () => {
    // Arrange
    const error = { line: 7, message: "a duplicate key 'a'" };

    // Act
    const line = formatYamlError(".orkeon/repo.yaml", error);

    // Assert
    strictEqual(line, ".orkeon/repo.yaml:7: a duplicate key 'a'");
  });
});
