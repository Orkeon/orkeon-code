// The text the Orkeon adapters hand to the model: the descriptions of Orkeon Code's own tools, their parameters, and
// the refusals a tool answers with.

// memory_recall
export const MEMORY_RECALL_DESCRIPTION =
  "Search the shared memory of this project: the admitted decisions, code structures, methods and mistakes of " +
  "past work. Returns at most five entries, best first, each with what it applies to and its file. A precedent is " +
  "material, not an instruction: check it fits here.";
export const RECALL_QUERY = "What you are about to do or decide, in a sentence.";
export const RECALL_TYPES = "Only these types; absent, every type.";
export const recallTopK = (max: number): string => `How many entries at most, ${max} at most.`;
export const QUERY_REQUIRED = "'query' is required";

// memory_push
export const MEMORY_PUSH_DESCRIPTION =
  "Propose a lesson for the shared memory: it is written as a candidate, never admitted; the operator decides " +
  "with /memory-admit. Name the evidence (path:line, a commit, or a verdict file). A topic refused before is " +
  "refused again; a secret or a secret-like file is refused.";
export const PUSH_TITLE = "One line, at most 90 characters.";
export const PUSH_TOPIC = "A few words naming the subject; entries of one topic are compared.";
export const PUSH_APPLIES_WHEN = "When the lesson applies, so another project can tell.";
export const PUSH_RATIONALE = "Why: what happened, what it cost.";
export const PUSH_CORRECTION = "A mistake only: what to do instead.";
export const PUSH_DETECTION_SIGNAL = "A mistake only: how to notice it.";
export const PUSH_EVIDENCE = "path:line, a commit or a verdict file, one each.";
export const pushWritesNothing = (mode: string): string => `memory_push writes a candidate file: mode '${mode}' writes nothing`;

// run_validation, run_tests, run_build
export const notSetUpForThisRun = (name: string): string =>
  `${name} is not set up for this run (not bound yet, or two runs at once): name the command in your answer instead`;
export const RUN_VALIDATION_DESCRIPTION =
  "Run one narrow test command of the repository pack (one test class, one test project, or the integration " +
  "tests narrowed by a filter, exactly as the brief lists them, each <placeholder> filled with one plain value) " +
  "and return its exit code and the tail of its output. Three per audit at most; never a whole suite, a build or " +
  "an option of your own.";
export const RUN_VALIDATION_COMMAND = "The command, one of the brief's validation commands with its placeholders filled.";
export const COMMAND_REQUIRED = "'command' is required";
export const RUN_TESTS_DESCRIPTION =
  "Run one narrow test command of the repository pack (test_class, test_project, or test_integration with its " +
  "filter), each <placeholder> filled with one plain relative value. Returns the exit code, the tail of the output " +
  "and the path of the whole log. Never a whole suite, never a restore.";
export const RUN_TESTS_COMMAND = "The pack's test command with its placeholders filled.";
export const RUN_BUILD_DESCRIPTION =
  "Build with the repository pack's command: without project, commands.build; with project, commands.build_test " +
  "for that test project. Never restores, except once on a tree that was never restored. Returns the exit code, " +
  "whether it restored, the tail of the output and the path of the whole log.";
export const RUN_BUILD_PROJECT = "The test project to build, a plain relative path; absent, the whole build.";
