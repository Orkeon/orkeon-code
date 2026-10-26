// /advisor (commands/_lib/settings/advisor.ts): the launch of the review, the setting shown, disabled and set, over a
// config store on FakeFiles, FakeTelemetry and FakeLogger. Run:
//   node --test src/commands/_lib/settings/advisor.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import {
  DECLARED_MODELS, LAUNCH_WORDS, MALFORMED_FILE, UNDECLARED_SET_LINE, UNDECLARED_WARNING, advisorHarness,
} from "./advisor.fixtures.ts";
import { assertMentions } from "../../../../tests/support/assertions/text.ts";
import { CONFIG_FILE_PATH } from "../../../shared/application/config-store.ts";

describe("runAdvisorCommand", () => {
  for (const word of LAUNCH_WORDS) {
    it(`launches the review on '${word}'`, async () => {
      // Arrange
      const { run } = advisorHarness();

      // Act
      const outcome = await run(word);

      // Assert
      deepStrictEqual(outcome, { launch: true });
    });
  }

  it("says an unset advisor makes the review a self-review", async () => {
    // Arrange
    const { run } = advisorHarness();

    // Act
    const outcome = await run();

    // Assert
    assertMentions("lines" in outcome ? outcome.lines.join("\n") : "", ["advisor model: (unset)", "self-review", "usage: /advisor"]);
  });

  it("shows the setting, its source and the declared models", async () => {
    // Arrange
    const { run } = advisorHarness({ file: JSON.stringify({ "advisor.model": "claude-opus" }), models: [...DECLARED_MODELS] });

    // Act
    const outcome = await run("show");

    // Assert
    deepStrictEqual(outcome, {
      lines: [
        "advisor model: claude-opus  [file]",
        "declared models: claude-opus, claude-sonnet",
        "usage: /advisor <model> | /advisor off | /advisor review",
      ],
    });
  });

  it("refuses to disable it over a settings file that does not parse, and writes nothing", async () => {
    // Arrange
    const { files, run } = advisorHarness({ file: MALFORMED_FILE });

    // Act
    const outcome = await run("off");

    // Assert
    deepStrictEqual([outcome, files.writes], [{ lines: [`refusing to write: ${CONFIG_FILE_PATH} could not be parsed.`] }, []]);
  });

  it("disables it by removing the key, the other settings kept", async () => {
    // Arrange
    const { fileMap, run } = advisorHarness({ file: JSON.stringify({ "advisor.model": "claude-opus", "model.default": "x" }) });

    // Act
    await run("off");

    // Assert
    deepStrictEqual(fileMap(), { "model.default": "x" });
  });

  it("writes a model the host does not declare, and warns of it in the log and the answer", async () => {
    // Arrange
    const { fileMap, log, run } = advisorHarness({ models: [...DECLARED_MODELS] });

    // Act
    const outcome = await run("gpt-x");

    // Assert
    deepStrictEqual([fileMap(), log.lines, outcome], [{ "advisor.model": "gpt-x" }, [`warn: ${UNDECLARED_WARNING}`], { lines: [UNDECLARED_SET_LINE] }]);
  });
});
