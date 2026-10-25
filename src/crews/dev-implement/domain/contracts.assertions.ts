// Checks on the RED and GREEN briefs.
import { ok } from "node:assert";
import { NODE_EDIT_RULE, NODE_READ_RULE } from "../../../shared/domain/dev/reading-rule.ts";

/** `text` holds every one of `parts`. */
export function assertMentions(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(text.includes(part), `the brief does not say ${JSON.stringify(part)}:\n${text}`);
}

/** `text` gives the node read and edit rules, and no longer the old rule against writing a file whole. */
export function assertNodeRules(text: string): void {
  ok(text.includes(`- ${NODE_READ_RULE}`), "node read rule");
  ok(text.includes(`- ${NODE_EDIT_RULE}`), "node edit rule");
  ok(!text.includes("never by writing it whole with file_write"), "the old editing rule is gone");
}

/** The carried section of `text` comes before its rules. */
export function assertCarriedBeforeRules(text: string): void {
  ok(text.indexOf("## In this brief") < text.indexOf("## Rules"), "the carried section is not before ## Rules");
}
