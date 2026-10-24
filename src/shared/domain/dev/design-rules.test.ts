// Unit tests for the design-rule ids and their wording. Run:
//   node --test src/shared/domain/dev/design-rules.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { DESIGN_RULES, DESIGN_RULE_IDS, isDesignRuleId } from "./design-rules.ts";

interface Marker { source: string; flags: string }
const MARKERS = fileURLToPath(new URL("../../../../scripts/provenance-markers.json", import.meta.url));

describe("DESIGN_RULE_IDS", () => {
  it("holds the 17 ids in order", () => {
    deepStrictEqual([...DESIGN_RULE_IDS], [
      "DDD-01", "DDD-02", "DDD-03", "DDD-04", "DDD-05", "DDD-06", "DDD-07", "DDD-08", "DDD-09", "DDD-10", "DDD-11",
      "APP-01", "APP-02", "APP-03", "APP-04", "APP-05", "PERF-01",
    ]);
  });
  it("isDesignRuleId knows exactly those", () => {
    strictEqual(isDesignRuleId("APP-05"), true);
    strictEqual(isDesignRuleId("PERF-02"), false);
    strictEqual(isDesignRuleId("ddd-01"), false);
  });
});

describe("DESIGN_RULES", () => {
  const markers = (JSON.parse(readFileSync(MARKERS, "utf8")) as { markers: Marker[]; promptMarkers: Marker[] });
  it("lists the rules in DESIGN_RULE_IDS order, each in the family its id names", () => {
    deepStrictEqual(DESIGN_RULES.map((r) => r.id), [...DESIGN_RULE_IDS]);
    for (const r of DESIGN_RULES) strictEqual(r.family, r.id.split("-")[0]);
  });
  it("fills every field but notApplicableWhen, and keeps each behaviour within 200 characters", () => {
    for (const r of DESIGN_RULES) {
      for (const v of [r.behaviour, r.appliesWhen, r.records]) ok(v.trim() !== "", `${r.id}: an empty field`);
      ok(r.behaviour.length <= 200, `${r.id}: behaviour is ${r.behaviour.length} characters`);
    }
    strictEqual(DESIGN_RULES[0].notApplicableWhen, "");
    ok(DESIGN_RULES.slice(1).every((r) => r.notApplicableWhen !== ""));
  });
  it("holds no provenance or prompt marker", () => {
    const text = DESIGN_RULES.map((r) => Object.values(r).join("\n")).join("\n");
    for (const m of [...markers.markers, ...markers.promptMarkers]) {
      ok(!new RegExp(m.source, m.flags).test(text), `marker ${m.source}`);
    }
  });
});
