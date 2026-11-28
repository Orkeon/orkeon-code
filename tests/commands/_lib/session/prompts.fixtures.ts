// The rules of the carry-out request (docs/turn.md, "The approval of a plan") and the marker each leaves in it.
export const CARRY_OUT_RULES: readonly { readonly name: string; readonly markers: readonly string[] }[] = [
  { name: "says the plan of the last answer is approved", markers: ["approve the plan of your last answer"] },
  { name: "asks for the whole plan, now", markers: ["Carry it out now, whole"] },
  { name: "says the session is no longer read-only", markers: ["no longer read-only"] },
  { name: "asks to write the files and run the commands the plan names", markers: ["write the files and run the commands"] },
  { name: "asks for a report of what was done and what was checked", markers: ["what was done and what was checked"] },
];
