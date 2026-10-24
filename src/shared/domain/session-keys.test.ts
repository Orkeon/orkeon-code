// Every session state-bag key and its string value. A stored session and the
// runtime read these values, so changing one is a breaking change, never a
// refactoring: this test makes it a deliberate edit.
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import * as keys from "./session-keys.ts";

describe("session state-bag keys", () => {
  it("pins every key's string value", () => {
    deepStrictEqual({ ...keys }, {
      OUTPUT_STYLE_STATE_KEY: "output_style",
      HOOKS_STATE_KEY: "hooks_registry",
      SKILLS_STATE_KEY: "skills_attached",
      EFFORT_STATE_KEY: "reasoning_effort",
      PASSES_STATE_KEY: "reasoning_passes",
      FAST_MODE_STATE_KEY: "fast_mode",
      PROACTIVE_STATE_KEY: "proactive_suggestions",
      MODEL_PREFERENCE_STATE_KEY: "model_preference",
      DEFAULT_MODE_STATE_KEY: "default_permission_mode",
      PERMISSION_RULES_STATE_KEY: "permission_rules",
      CONFIG_MAP_STATE_KEY: "config_map",
      TASKS_STATE_KEY: "task_list",
      AUTOCOMPACT_BREAKER_STATE_KEY: "autocompact_consecutive_failures",
      WORKFLOW_ACTIVE_STATE_KEY: "workflow_active",
      AGENT_INSTANCES_STATE_PREFIX: "agent_instances:",
      AGENT_REQUEST_STATE_PREFIX: "agent_request:",
    });
  });

  it("names the session-default mode as the host does", () => {
    // Orkeon.Constants.Cli SessionStateKeys.DefaultPermissionMode: the REPL console
    // shows this key and cycles it on Shift+Tab, so /mode must write that very key.
    strictEqual(keys.DEFAULT_MODE_STATE_KEY, "default_permission_mode");
  });

  it("gives every key its own value", () => {
    const values = Object.values(keys);
    deepStrictEqual(values.filter((v, i) => values.indexOf(v) !== i), []);
  });
});
