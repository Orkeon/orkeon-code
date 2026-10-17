// Where verification skills live and how /verify asks for them.
// Run: node --test src/shared/domain/verifiers.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import { buildVerifyRequest, safeZoneName, verifierPath, VERIFIERS_DIR } from "./verifiers.ts";

describe("verification skills", () => {
  it("name a zone's file after its slug", () => {
    strictEqual(safeZoneName("Web UI"), "web-ui");
    strictEqual(verifierPath("Web UI"), `${VERIFIERS_DIR}/verify-web-ui.md`);
  });
  it("ask for one zone's skill, or every skill, run step by step and reported as written", () => {
    const one = buildVerifyRequest(" api ");
    ok(one.includes(verifierPath("api")), one);
    ok(one.includes("compare what you observe with the skill's Pass section"));
    ok(buildVerifyRequest("").includes(`every verification skill under ${VERIFIERS_DIR}/`));
  });
  it("say there is no skill rather than improvise a check", () => {
    ok(buildVerifyRequest("").includes("suggest /init-verifiers instead of improvising a check"));
  });
});
