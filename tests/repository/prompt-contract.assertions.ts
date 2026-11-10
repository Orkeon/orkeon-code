// Checks on the rendered prompts of the catalogue.
import { ok } from "node:assert";
import { MATERIAL_MARK } from "../support/fixtures/prompt-catalogue.ts";
import type { RenderedPrompt } from "../support/fixtures/prompt-catalogue.ts";
import type { TurnPrompt } from "../../src/crews/main-loop/application/turn-context.ts";
import { IDENTIFIERS_WITH_DIGITS } from "./prompt-contract.fixtures.ts";

/** Each header holds no digit but the playbook's scope identifiers, and stays within `ceiling` characters. */
export function assertHeadersDigitFreeUnder(headers: readonly { mode: string; system: string }[], ceiling: number): void {
  for (const { mode, system } of headers) {
    const prose = system.replace(IDENTIFIERS_WITH_DIGITS, "");
    ok(!/\d/.test(prose), `${mode}: a digit in the header (${prose.match(/.{20}\d.{10}/)?.[0]})`);
    ok(system.length <= ceiling, `${mode}: ${system.length} > ${ceiling}`);
  }
}

/** No section of any prompt matches one of `markers`. */
export function assertNoMarker(catalogue: readonly RenderedPrompt[], markers: readonly RegExp[]): void {
  for (const prompt of catalogue) {
    for (const section of prompt.sections) {
      for (const marker of markers) {
        ok(!marker.test(section.text), `${prompt.id} ${prompt.name}, ${section.title}: matches ${marker}`);
      }
    }
  }
}

/** Every system section is non-empty and free of the sample material, and there are at least `least` of them. */
export function assertInstructionsApart(catalogue: readonly RenderedPrompt[], least: number): void {
  let pairs = 0;
  for (const prompt of catalogue) {
    for (const section of prompt.sections.filter((s) => s.role === "system")) {
      ok(section.text.trim().length > 0, `${prompt.id} ${section.title} is empty`);
      ok(!section.text.includes(MATERIAL_MARK), `${prompt.id} ${section.title} holds the sample material`);
      pairs++;
    }
  }
  ok(pairs >= least, `only ${pairs} system messages rendered`);
}

/** Every section of every prompt has a non-empty text. */
export function assertNoEmptySection(catalogue: readonly RenderedPrompt[]): void {
  for (const prompt of catalogue) {
    for (const section of prompt.sections) ok(section.text.trim().length > 0, `${prompt.id} ${section.title}`);
  }
}

/** Each of `volatile` is in the turn's context, and in neither its header nor its request. */
export function assertVolatileInContext(turn: TurnPrompt, volatile: readonly string[]): void {
  for (const v of volatile) {
    ok(turn.context.includes(v), `'${v}' is missing from the context`);
    ok(!turn.system.includes(v), `'${v}' leaked into the header`);
    ok(!turn.request.includes(v), `'${v}' leaked into the request`);
  }
}

/** The turn's request opens on its heading and carries `request` once; the context does not carry it. */
export function assertRequestAlone(turn: TurnPrompt, request: string): void {
  ok(turn.request.startsWith("## Request\n"), `the request does not open on its heading: ${turn.request.slice(0, 40)}`);
  ok(turn.request.split(request).length - 1 === 1, "the request does not travel once in the prompt");
  ok(!turn.context.includes(request), "the request also travels in the context");
  ok(turn.context.length > 0, "the context is empty while every block is filled");
}
