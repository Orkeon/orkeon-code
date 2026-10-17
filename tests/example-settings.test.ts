import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Orkeon judges its settings at the REPL's start and refuses a key it does not know
// inside the sections it declares ("Orkeon:Tools:Shell:_comment is not a setting"):
// the example a user copies must start as it is. Only the root may carry a comment.
const example = JSON.parse(
  readFileSync(new URL("../config/appsettings.example.json", import.meta.url), "utf8"),
);

function commentKeysBelowRoot(node: unknown, path: string[], found: string[]): string[] {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return found;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const here = [...path, key];
    if (path.length > 0 && key.startsWith("_")) found.push(here.join(":"));
    commentKeysBelowRoot(value, here, found);
  }
  return found;
}

test("the example settings carry no comment key inside a section", () => {
  assert.deepEqual(commentKeysBelowRoot(example, [], []), []);
});

test("the example settings carry no API key", () => {
  assert.equal(example.Llm?.ApiKey, undefined);
});
