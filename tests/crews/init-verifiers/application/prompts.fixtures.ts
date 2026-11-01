// The rules of the verification skill outline, each with the words that carry it,
// and the material the prompts are rendered over.
import type { VerifierMaterial } from "../../../../src/crews/init-verifiers/application/prompts.ts";

export interface SkillRuleCase {
  name: string;
  markers: readonly string[];
}

export const SKILL_RULES: readonly SkillRuleCase[] = [
  {
    name: "outlines a skill that ends on an observable signal and invents no command",
    markers: ["## Prerequisites", "## Steps", "## Pass", "## Report", "Use only commands the facts show"],
  },
  {
    name: "names a manifest, the Commands section and a CI step as the only sources of a command",
    markers: [
      "a script or target of a manifest", "a line of the Commands section", "a step of a CI workflow",
      "Write no command none of them shows",
    ],
  },
  {
    name: "starts a part that keeps running without blocking, waits for its readiness signal and stops it",
    markers: ["started without blocking the step", "a stated readiness signal", "stopped at the end"],
  },
  {
    name: "points a step that writes, deletes or calls the network at a scratch target, or says it cannot be checked",
    markers: ["writes, deletes or calls the network", "a scratch folder or a dry-run flag", "cannot be checked safely"],
  },
  {
    name: "names, beside the success signal, the observations that mean failure",
    markers: ["the one or two observations that mean it failed"],
  },
  {
    name: "ends a failed check in the report and leaves the fix to a separate request",
    markers: ["A failed check ends in this report", "a fix is a separate request", "never edits code to make a step pass"],
  },
];

/** A project with a manifest and a Commands section. */
export const MATERIAL: VerifierMaterial = {
  manifests: "pyproject.toml:\ntest = \"pytest -q\"",
  commands: { file: "AGENTS.md", section: "## Commands\n\nmake check" },
};

/** The rendering of MATERIAL, in full. */
export const MATERIAL_TEXT = [
  "<manifests>",
  "pyproject.toml:\ntest = \"pytest -q\"",
  "</manifests>",
  "",
  "<commands-section file=\"AGENTS.md\">",
  "## Commands\n\nmake check",
  "</commands-section>",
].join("\n");

/** A project with no manifest, no CI workflow and no Commands section. */
export const BARE: VerifierMaterial = { manifests: "", commands: null };

export const BARE_TEXT = "<manifests>\n(none)\n</manifests>\n\nCommands section: (none)";
