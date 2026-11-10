// The material project-init's domain renders for the model: the header of the package map.

/** The header of the package map: the count of packages, and the bound when the map reached it. */
export function packageMapHeader(count: number, max: number | null): string {
  const bound = max !== null ? `, the map shows at most ${max} packages` : "";
  return `${count} package(s)${bound}, each with the packages it depends on:`;
}

/** What the cut line of the package map names. */
export const PACKAGE_MAP_LABEL = "the package map";
