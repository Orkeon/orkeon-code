// Checks on the planner's prompt.
import { ok } from "node:assert";

import type { DesignRule } from "../../../../src/shared/domain/dev/design-rules.ts";

/** `text` matches none of the host's words. */
export function assertNoHostWord(text: string, vocabulary: readonly RegExp[]): void {
  for (const m of vocabulary) ok(!m.test(text), `matches ${m}`);
}

/** `text` holds one line per design rule id: its name, when it applies and when it is set aside. */
export function assertDesignRuleLines(text: string, ids: readonly string[]): void {
  const close = "(, not when .+\\.|; it applies to every change it names\\.)";
  for (const id of ids) ok(new RegExp(`^${id} — .+\\. Applies when .+${close}$`, "m").test(text), id);
}

/** The line of `rule` in `text` closes on `close`, and names nothing a sheet records. */
export function assertRuleLineCloses(text: string, rule: DesignRule, close: string): void {
  const line = text.split("\n").find((l) => l.startsWith(`${rule.id} — `));
  ok(line !== undefined, `no line for ${rule.id}`);
  ok(line.endsWith(close), `${rule.id} ends ${JSON.stringify(line.slice(-80))}, not ${JSON.stringify(close)}`);
  ok(!/Records |the sheet names/.test(line), `${rule.id} still names what the sheet records: ${line}`);
}
