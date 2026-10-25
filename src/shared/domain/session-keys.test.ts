// Every session state-bag key and its string value. A stored session and the
// runtime read these values, so changing one is a breaking change, never a
// refactoring: this test makes it a deliberate edit.
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import * as keys from "./session-keys.ts";
import { KEY_VALUES } from "./session-keys.fixtures.ts";

describe("session state-bag keys", () => {
  it("pins every key's string value", () => {
    // Arrange
    const module = keys;

    // Act
    const values = { ...module };

    // Assert
    deepStrictEqual(values, KEY_VALUES);
  });

  it("names the session-default mode as the host does", () => {
    // Orkeon.Constants.Cli SessionStateKeys.DefaultPermissionMode: the REPL console
    // shows this key and cycles it on Shift+Tab, so /mode must write that very key.
    // Arrange
    const module = keys;

    // Act
    const key = module.DEFAULT_MODE_STATE_KEY;

    // Assert
    strictEqual(key, "default_permission_mode");
  });

  it("gives every key its own value", () => {
    // Arrange
    const values = Object.values(keys);

    // Act
    const duplicates = values.filter((v, i) => values.indexOf(v) !== i);

    // Assert
    deepStrictEqual(duplicates, []);
  });
});
