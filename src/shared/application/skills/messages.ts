// What the suggestion of skills says to the user.
export const SUGGEST_WITHOUT_DECISION_MODEL =
  "skills.suggest is on and the host has no decision model: no skill is suggested (set Orkeon:Decision:Provider, or Orkeon:TypeSafe)";
export const skillsSuggested = (paths: string): string => `skills suggested for this turn: ${paths}`;
