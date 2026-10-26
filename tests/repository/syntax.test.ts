// The syntax readers the repository rules are built on: clock reads, ports, the methods of a double, derived doubles.
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";
import { classMethods, clockReads, derivedDoubles, portNames } from "./syntax.ts";
import {
  CLOCK_AND_TIMER_READS, CLOCK_READS, CLOCK_SOURCE, DERIVED_DOUBLES, DERIVED_SOURCE, DOUBLE_METHODS, DOUBLE_SOURCE,
  METHODS, NOT_DERIVED_SOURCE, PICKED_DOUBLES, PICKED_SOURCE, PORTS, PORTS_SOURCE, linesOf,
} from "./syntax.fixtures.ts";

describe("syntax: clock reads", () => {
  it("sees new Date() with no argument, Date() and Date.now(), and no date built from a value", () => {
    // Arrange
    const source = CLOCK_SOURCE;

    // Act
    const hits = clockReads("a.ts", source, false);

    // Assert
    deepStrictEqual(linesOf(hits), CLOCK_READS);
  });

  it("sees the calls of setTimeout, setInterval and setImmediate too when asked for the timers", () => {
    // Arrange
    const source = CLOCK_SOURCE;

    // Act
    const hits = clockReads("a.ts", source, true);

    // Assert
    deepStrictEqual(linesOf(hits), CLOCK_AND_TIMER_READS);
  });
});

describe("syntax: ports and doubles", () => {
  it("names the exported interfaces and object types that hold a function, not the types of data", () => {
    // Arrange
    const source = PORTS_SOURCE;

    // Act
    const ports = portNames("ports.ts", source);

    // Assert
    deepStrictEqual([...ports], ["Shell", "Logger"]);
  });

  it("lists the methods a double declares or inherits in its module, not the fields a test sets", () => {
    // Arrange
    const source = DOUBLE_SOURCE;

    // Act
    const methods = classMethods("fake-files.ts", source);

    // Assert
    deepStrictEqual([...methods].map(([name, m]) => [name, [...m]]), DOUBLE_METHODS);
  });

  it("sees a double derived by a class, by a method replaced on an instance, or by an object literal typed as a port", () => {
    // Arrange
    const source = DERIVED_SOURCE;

    // Act
    const hits = derivedDoubles("a.fixtures.ts", source, PORTS, METHODS);

    // Assert
    deepStrictEqual(linesOf(hits), DERIVED_DOUBLES);
  });

  it("flags an object literal typed Pick<Port, …>, or Partial, Omit, Readonly or Required of a port", () => {
    // Arrange
    const source = PICKED_SOURCE;

    // Act
    const hits = derivedDoubles("a.fixtures.ts", source, PORTS, METHODS);

    // Assert
    deepStrictEqual(linesOf(hits), PICKED_DOUBLES);
  });

  it("leaves alone a field of a fake set, a type of data, an error class and an object of no port", () => {
    // Arrange
    const source = NOT_DERIVED_SOURCE;

    // Act
    const hits = derivedDoubles("a.fixtures.ts", source, PORTS, METHODS);

    // Assert
    deepStrictEqual(hits, []);
  });
});
