// Test sources the shape check is run on.

/** A test laid out Arrange, Act, Assert. */
export const AAA_TEST = `
it("adds", () => {
  // Arrange
  const a = 1;

  // Act
  const sum = add(a, 2);

  // Assert
  strictEqual(sum, 3);
});
`;

/** A test that calls and checks on one line, with no section. */
export const BARE_TEST = `
it("adds", () => {
  strictEqual(add(1, 2), 3);
});
`;

/** A test that acts twice. */
export const TWO_ACTS_TEST = `
it("adds", () => {
  // Arrange
  const a = 1;
  // Act
  const one = add(a, 2);
  // Assert
  strictEqual(one, 3);
  // Act
  const two = add(a, 3);
  // Assert
  strictEqual(two, 4);
});
`;

/** A test whose Assert comes before its Act. */
export const OUT_OF_ORDER_TEST = `
it("adds", () => {
  // Arrange
  const a = 1;
  // Assert
  // Act
  strictEqual(add(a, 2), 3);
});
`;

/** Tests built in a loop over a table, the second one bare, inside a describe; and an async test(). */
export const LOOP_TESTS = `
describe("add", () => {
  for (const c of CASES) {
    it(\`adds \${c.name}\`, () => {
      // Arrange
      const { a, b } = c;
      // Act
      const sum = add(a, b);
      // Assert
      strictEqual(sum, c.sum);
    });
  }
  test("adds zero", async () => {
    strictEqual(add(0, 0), 0);
  });
});
`;

/** Calls that declare no test: a todo, a describe, a helper named like a test with no body. */
export const NOT_TESTS = `
it.todo("later");
describe("add", () => {});
it("named only");
`;
