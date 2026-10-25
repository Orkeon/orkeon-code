// Where verification skills live and how /verify asks for them.
// Run: node --test src/shared/domain/verifiers.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { buildVerifyRequest, safeZoneName, verifierPath, VERIFIERS_DIR } from "./verifiers.ts";
import { assertMentions } from "../../../tests/support/assertions/text.ts";

describe("verification skills", () => {
  it("name a zone by its slug", () => {
    // Arrange
    const zone = "Web UI";

    // Act
    const name = safeZoneName(zone);

    // Assert
    strictEqual(name, "web-ui");
  });

  it("name a zone's file after its slug", () => {
    // Arrange
    const zone = "Web UI";

    // Act
    const path = verifierPath(zone);

    // Assert
    strictEqual(path, `${VERIFIERS_DIR}/verify-web-ui.md`);
  });

  it("ask for one zone's skill, run step by step and reported as written", () => {
    // Arrange
    const zone = " api ";

    // Act
    const one = buildVerifyRequest(zone);

    // Assert
    assertMentions(one, [verifierPath("api"), "compare what you observe with the skill's Pass section"]);
  });

  it("ask for every skill when no zone is named", () => {
    // Arrange
    const zone = "";

    // Act
    const all = buildVerifyRequest(zone);

    // Assert
    assertMentions(all, [`every verification skill under ${VERIFIERS_DIR}/`]);
  });

  it("say there is no skill rather than improvise a check", () => {
    // Arrange
    const zone = "";

    // Act
    const all = buildVerifyRequest(zone);

    // Assert
    assertMentions(all, ["suggest /init-verifiers instead of improvising a check"]);
  });
});
