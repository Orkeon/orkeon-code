// The user's path lists: read, handed to the gate, and held against every spelling. Run:
//   node --test tests/shared/domain/agent-policy/path-rules.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  listedEntries, narrowAllowValue, pathListProblem, pathListRefusal, pathListRules, readPathLists, userConfigRules,
} from "../../../../src/shared/domain/agent-policy/path-rules.ts";
import { checkRule, formatRule, ruleDecision } from "../../../../src/shared/domain/agent-policy/permission.ts";
import {
  EMPTY, LISTED_CASES, NARROW_CASES, NONE, POSIX, PROBLEM_CASES, READ_CASES, REFUSAL_CASES, SECRETS, SECRETS_RULE_COVERAGE, SRC_ONLY,
  USER_CONFIG_COVERAGE,
} from "./path-rules.fixtures.ts";

describe("readPathLists", () => {
  for (const c of READ_CASES) {
    it(`reads the lists as they apply: ${c.name}`, () => {
      // Arrange
      const { user, project, layout } = c;

      // Act
      const lists = readPathLists(user, project, layout);

      // Assert
      deepStrictEqual(lists, c.expected);
    });
  }
});

describe("pathListRules", () => {
  for (const c of SECRETS_RULE_COVERAGE) {
    it(`gives the gate a deny it reads on ${c.name}`, () => {
      // Arrange
      const rules = pathListRules(SECRETS);

      // Act
      const decision = ruleDecision(rules, c.tool, c.input);

      // Assert
      strictEqual(decision, c.covered ? "deny" : undefined);
    });
  }

  it("gives the gate nothing for an allow list alone", () => {
    // Arrange
    const lists = SRC_ONLY;

    // Act
    const rules = pathListRules(lists);

    // Assert
    deepStrictEqual(rules, []);
  });

  it("gives the gate nothing for empty lists", () => {
    // Arrange
    const lists = EMPTY;

    // Act
    const rules = pathListRules(lists);

    // Assert
    deepStrictEqual(rules, []);
  });

  it("writes every rule in the /permissions syntax", () => {
    // Arrange
    const rules = pathListRules(readPathLists({ deny: "/workspace/secrets, /workspace/*.pem" }, NONE, POSIX));

    // Act
    const checked = rules.map((r) => checkRule(formatRule(r)));

    // Assert
    deepStrictEqual(checked, rules.map((rule) => ({ ok: true, rule })));
  });
});

describe("pathListRefusal", () => {
  for (const c of REFUSAL_CASES) {
    it(`judges the call: ${c.name}`, () => {
      // Arrange
      const { lists, layout, tool, input } = c;

      // Act
      const refusal = pathListRefusal(lists, layout, tool, input);

      // Assert
      strictEqual(refusal, c.expected);
    });
  }
});

describe("userConfigRules", () => {
  for (const c of USER_CONFIG_COVERAGE) {
    it(`closes the mount to the model: ${c.name}`, () => {
      // Arrange
      const rules = userConfigRules();

      // Act
      const decision = ruleDecision(rules, c.tool, c.input);

      // Assert
      strictEqual(decision, c.covered ? "deny" : undefined);
    });
  }

  it("writes every rule in the /permissions syntax", () => {
    // Arrange
    const rules = userConfigRules();

    // Act
    const checked = rules.map((r) => checkRule(formatRule(r)));

    // Assert
    deepStrictEqual(checked, rules.map((rule) => ({ ok: true, rule })));
  });
});

describe("pathListProblem", () => {
  for (const c of PROBLEM_CASES) {
    it(`judges the notation of ${JSON.stringify(c.value)}`, () => {
      // Arrange
      const { value } = c;

      // Act
      const problem = pathListProblem(value);

      // Assert
      strictEqual(problem, c.problem);
    });
  }
});

describe("narrowAllowValue", () => {
  for (const c of NARROW_CASES) {
    it(`keeps of a project's paths.allow ${c.name}`, () => {
      // Arrange
      const { project, user } = c;

      // Act
      const narrowed = narrowAllowValue(project, user);

      // Assert
      deepStrictEqual(narrowed, { kept: c.kept, dropped: c.dropped });
    });
  }
});

describe("listedEntries", () => {
  for (const c of LISTED_CASES) {
    it(`shows ${c.name}`, () => {
      // Arrange
      const { patterns } = c;

      // Act
      const listed = listedEntries(patterns);

      // Assert
      deepStrictEqual(listed, c.listed);
    });
  }
});
