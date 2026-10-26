// The clock port: the time now, read by infrastructure alone.
// Types only, re-exported by ../ports.ts.

/** The time now: the only way the application reads the clock (orkeonClock in wiring.ts, FakeClock in tests). */
export type Clock = () => Date;
