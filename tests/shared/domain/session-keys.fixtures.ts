// Every session state-bag key and the string value a stored session holds.

export const KEY_VALUES = {
  OUTPUT_STYLE_STATE_KEY: "output_style",
  HOOKS_STATE_KEY: "hooks_registry",
  SKILLS_STATE_KEY: "skills_attached",
  EFFORT_STATE_KEY: "reasoning_effort",
  PASSES_STATE_KEY: "reasoning_passes",
  LOADED_SESSION_STATE_KEY: "resume_loaded_from",
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
};
