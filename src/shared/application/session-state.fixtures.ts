// Raw values of the state bag, for the session-state tests.

/** Stored values that are not a JSON array: each reads as []. */
export const NOT_ARRAYS: readonly string[] = ["", "[oops", `{"a":1}`, "null", "3"];

/** Stored values that are not a JSON object: each reads as {}. */
export const NOT_OBJECTS: readonly string[] = ["", "{oops", `["a"]`, "null", `"text"`];

/** A value written to the state bag. */
export const HOOKS_VALUE = [{ event: "pre", command: "npm test" }];
