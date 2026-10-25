// Settings the lens selection is read from, for the selectLenses tests.

/** A `review.lenses` setting that names no lens: each must select all three. */
export const UNSET_SETTINGS: readonly { name: string; value: string | null | undefined }[] = [
  { name: "undefined", value: undefined },
  { name: "null", value: null },
  { name: "empty", value: "" },
  { name: "blank", value: "   " },
  { name: "only commas", value: ",," },
];
