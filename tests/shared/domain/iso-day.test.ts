// The UTC day of a date. Run:
//   node --test src/shared/domain/iso-day.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { isoDay } from "../../../src/shared/domain/iso-day.ts";

describe("isoDay", () => {
  it("gives the UTC day of a date late in the evening", () => {
    // Arrange
    const evening = new Date("2026-10-24T23:30:00-02:00");

    // Act
    const day = isoDay(evening);

    // Assert
    strictEqual(day, "2026-10-25");
  });
});
