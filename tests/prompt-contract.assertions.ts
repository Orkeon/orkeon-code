// Checks on the rendered prompts of the catalogue.
import { ok } from "node:assert";
import { MATERIAL_MARK } from "./support/fixtures/prompt-catalogue.ts";
import type { RenderedPrompt } from "./support/fixtures/prompt-catalogue.ts";
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
