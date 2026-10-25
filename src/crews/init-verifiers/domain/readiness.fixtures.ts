// The zone names safeZoneName is tested on.

export interface ZoneNameCase {
  name: string;
  zone: string;
  safe: string;
}

export const ZONE_NAMES: readonly ZoneNameCase[] = [
  { name: "a name with capitals, blanks and brackets", zone: "Unit Tests (API)", safe: "unit-tests-api-" },
  { name: "a name already safe", zone: "e2e", safe: "e2e" },
];
