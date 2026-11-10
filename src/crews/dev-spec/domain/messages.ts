// The messages of dev-spec's domain: the problems the check of a spec answer reports, which the model reads back on
// a re-ask and the person in the refusal (ADR 0026).

/** Words of a technical document, never of a business spec (the template's business purity), each with what it is. */
export const TECHNICAL: ReadonlyArray<[RegExp, string]> = [
  [/`/, "a code mark (`)"],
  [/\b[A-Za-z_][A-Za-z0-9_]*\(\)/, "a call such as name()"],
  [/\b[\w-]+\.(ts|tsx|js|mjs|cs|py|java|go|rs|rb|php|json|ya?ml|sql|xml|csproj)\b/i, "a file name"],
  [/\bHTTP\b|\b[1-5]\d\d (OK|Not Found|Bad Request|Unauthorized|Forbidden)\b/, "an HTTP status"],
  [/\bexit code\b/i, "an exit code"],
  [/\bstack trace\b/i, "a stack trace"],
  [/\bendpoints?\b/i, "an endpoint"],
  [/\b(class|interface|enum|DTO|repository pattern|framework)\b/, "a type or a framework"],
];

// ── The problems of a spec answer ───────────────────────────────────────

export const cellSpansLines = (name: string, row: number, key: string): string => `${name} ${row}: ${key} is one line, no '|'`;
export const NO_SUMMARY = "summary: two or three sentences: what, for whom, why";
export const NO_CONTEXT = "context: the problem, for whom, the cost of doing nothing";
export const NO_USE_CASE = "useCases: at least one use case";
export const tooManyUseCases = (max: number): string => `useCases: at most ${max}`;
export const noActor = (id: string): string => `${id}: no actor`;
export const noIntent = (id: string): string => `${id}: no intent`;
export const noWhere = (id: string): string => `${id}: no Where: the surface and the moment the actor meets it`;
export const scenarioSteps = (id: string, max: number): string => `${id}: the nominal scenario has 1 to ${max} steps`;
export const fieldSpansLines = (id: string): string => `${id}: a field or a step spans lines`;
export const tooManyRules = (max: number): string => `rules: at most ${max}`;
export const noOrigin = (id: string): string =>
  `${id}: no origin (regulation, standard, practice, product choice, existing behaviour)`;
export const severityIs = (id: string): string => `${id}: severity is blocking, warning or informational`;
export const appliesToNamesIds = (id: string): string => `${id}: appliesTo names UC-nn ids or cross-cutting`;
export const appliesToUnknown = (id: string, target: string): string => `${id}: appliesTo '${target}' is no use case of the answer`;
export const dataSourceIs = (datum: string, sources: string): string => `data '${datum}': source is ${sources}`;
export const dataImportanceIs = (datum: string, importance: string): string => `data '${datum}': importance is ${importance}`;
export const tooManyRows = (name: string, max: number): string => `${name}: at most ${max} rows`;
export const OVERVIEW_IS_FLOWCHART = "overview: the lines of one mermaid flowchart, without the fence, or \"\"";
export const termUsedNowhere = (term: string): string => `vocabulary: '${term}' is used nowhere else`;
export const businessPurity = (what: string, hit: string): string => `business purity: ${what} in "${hit}"; say it in business words`;
