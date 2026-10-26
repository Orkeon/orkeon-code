// The day of a date as the dated marks write it. Pure, no IO: the date comes from the Clock port.

/** The UTC day of `d`, as YYYY-MM-DD. */
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
