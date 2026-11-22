// The ProfilePicker adapters over the runtime's System One pick. Run:
//   node --test tests/shared/infrastructure/orkeon/profile-picker.test.ts
import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";

import { createLlmProfilePicker, createServicesProfilePicker } from "../../../../src/shared/infrastructure/orkeon/profile-picker.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";
import { MODEL_PICK, OPTIONS, REQUEST, UNREAD, pickerOverLlm, pickerOverServices } from "./profile-picker.fixtures.ts";

describe("createServicesProfilePicker", () => {
  it("answers nothing on a host that serves no pick", async () => {
    // Arrange
    const picker = createServicesProfilePicker(new FakeServiceLocator());

    // Act
    const answer = await picker.pick(REQUEST, OPTIONS);

    // Assert
    strictEqual(answer, null);
  });

  it("sends the request, and the options as the profile part", async () => {
    // Arrange
    const { service, picker } = pickerOverServices();

    // Act
    await picker.pick(REQUEST, OPTIONS);

    // Assert
    deepStrictEqual(service.calls, [{ request: REQUEST, options: { profile: { ladder: ["small", "large"], ceiling: "large", fallback: "large" } } }]);
  });

  it("leaves out the bounds it is not given", async () => {
    // Arrange
    const { service, picker } = pickerOverServices();

    // Act
    await picker.pick(REQUEST, { ladder: ["small", "large"] });

    // Assert
    deepStrictEqual(service.calls[0].options, { profile: { ladder: ["small", "large"] } });
  });

  it("reads the profile part of the reply", async () => {
    // Arrange
    const { picker } = pickerOverServices();

    // Act
    const answer = await picker.pick(REQUEST, OPTIONS);

    // Assert
    deepStrictEqual(answer, MODEL_PICK);
  });

  it("reads the runtime's default profile as the host's default model", async () => {
    // Arrange
    const { service, picker } = pickerOverServices();
    service.reply = { profile: { value: "default", reason: "no-answer", picked: null, probability: null } };

    // Act
    const answer = await picker.pick(REQUEST, OPTIONS);

    // Assert
    deepStrictEqual(answer, { value: null, reason: "no-answer", picked: null, probability: null });
  });

  it("answers nothing when the runtime refuses an option", async () => {
    // Arrange
    const { service, picker } = pickerOverServices();
    service.failure = new Error("services.get(\"pick\").pick { profile.ladder } 'tiny' is not a profile");

    // Act
    const answer = await picker.pick(REQUEST, OPTIONS);

    // Assert
    strictEqual(answer, null);
  });

  for (const c of UNREAD) {
    it(c.name, async () => {
      // Arrange
      const { service, picker } = pickerOverServices();
      service.reply = c.reply;

      // Act
      const answer = await picker.pick(REQUEST, OPTIONS);

      // Assert
      strictEqual(answer, null);
    });
  }
});

describe("createLlmProfilePicker", () => {
  it("answers nothing for an llm that has no pick", async () => {
    // Arrange
    const picker = createLlmProfilePicker({});

    // Act
    const answer = await picker.pick(REQUEST, OPTIONS);

    // Assert
    strictEqual(answer, null);
  });

  it("reads the profile part of what ctx.llm.pick answers", async () => {
    // Arrange
    const { picker } = pickerOverLlm();

    // Act
    const answer = await picker.pick(REQUEST, OPTIONS);

    // Assert
    deepStrictEqual(answer, MODEL_PICK);
  });

  it("answers nothing when ctx.llm.pick throws", async () => {
    // Arrange
    const { service, picker } = pickerOverLlm();
    service.failure = new Error("ctx.llm.pick { profile.floor } 'large' is above the ceiling 'small'");

    // Act
    const answer = await picker.pick(REQUEST, OPTIONS);

    // Assert
    strictEqual(answer, null);
  });
});
