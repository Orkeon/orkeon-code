// Checks on the question sections.
import { ok } from "node:assert";

/** The empty open-questions section is gone and the decisions stand before the section that followed. */
export function assertRewrittenInPlace(text: string): void {
  ok(!text.includes("## 12. Open questions"), "the empty open-questions section is still there");
  ok(text.indexOf("## 13. Decisions") < text.indexOf("## 14. After"), "the decisions do not stand before § 14");
}
