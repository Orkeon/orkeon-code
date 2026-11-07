// /theme (commands/_lib/settings/theme.ts) over FakeThemeConsole and FakeChooser. Run:
//   node --test tests/commands/_lib/settings/theme.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  DARK_SHOW_TEXT, NO_PALETTES_TEXT, SET_LIGHT_TEXT, UNKNOWN_THEME_TEXT, themeHarness,
} from "./theme.fixtures.ts";

describe("/theme without a panel", () => {
  it("shows the palette", async () => {
    // Arrange
    const { run } = themeHarness();

    // Act
    const view = await run();

    // Assert
    strictEqual(view.text, DARK_SHOW_TEXT);
  });

  it("sets the palette given, whatever its case", async () => {
    // Arrange
    const { console, run } = themeHarness();

    // Act
    const view = await run("LIGHT");

    // Assert
    deepStrictEqual([view.text, console.theme], [SET_LIGHT_TEXT, "light"]);
  });

  it("refuses an unknown palette without asking the console", async () => {
    // Arrange
    const { console, run } = themeHarness();

    // Act
    const view = await run("blue");

    // Assert
    deepStrictEqual([view.text, console.asked], [UNKNOWN_THEME_TEXT, []]);
  });

  it("says a console without palettes has none", async () => {
    // Arrange
    const { console, run } = themeHarness();
    console.theme = null;

    // Act
    const view = await run("light");

    // Assert
    strictEqual(view.text, NO_PALETTES_TEXT);
  });

  it("says so when the console refuses the palette", async () => {
    // Arrange
    const { console, run } = themeHarness();
    console.refuses = true;

    // Act
    const view = await run("light");

    // Assert
    strictEqual(view.text, NO_PALETTES_TEXT);
  });
});

describe("/theme with a panel", () => {
  it("offers the palettes with the one in force marked", async () => {
    // Arrange
    const { chooser, run } = themeHarness();
    chooser.interactive = true;

    // Act
    await run();

    // Assert
    deepStrictEqual(chooser.asked[0].options, [{ value: "dark", current: true }, { value: "light" }, { value: "none" }]);
  });

  it("sets the palette picked", async () => {
    // Arrange
    const { console, chooser, run } = themeHarness();
    chooser.interactive = true;
    chooser.answers = ["light"];

    // Act
    const view = await run();

    // Assert
    deepStrictEqual([view.text, console.theme], [SET_LIGHT_TEXT, "light"]);
  });

  it("keeps the palette when the person leaves", async () => {
    // Arrange
    const { console, chooser, run } = themeHarness();
    chooser.interactive = true;

    // Act
    const view = await run();

    // Assert
    deepStrictEqual([view.text, console.asked], ["theme unchanged: dark.", []]);
  });

  it("opens no panel on a console without palettes", async () => {
    // Arrange
    const { console, chooser, run } = themeHarness();
    console.theme = null;
    chooser.interactive = true;

    // Act
    await run();

    // Assert
    strictEqual(chooser.asked.length, 0);
  });
});
