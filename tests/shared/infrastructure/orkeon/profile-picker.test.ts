// The ProfilePicker adapters over the runtime's System One pick. Run:
//   node --test tests/shared/infrastructure/orkeon/profile-picker.test.ts
import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";

import { createLlmProfilePicker, createServicesProfilePicker } from "../../../../src/shared/infrastructure/orkeon/profile-picker.ts";
import { FakePickService } from "../../../support/doubles/fake-pick-service.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";
import {
  ALL_BOUNDS, CANCELLATIONS, DEFAULT_SPELLINGS, LOCATOR_GONE, MISTYPED_PICK, MODEL_PICK, NO_PICK_WIRED, OPTIONS, REFUSED_FLOOR, REFUSED_LADDER, REQUEST, UNREAD,
  llmWhosePickThrows, pickerOverLlm, pickerOverServices,
} from "./profile-picker.fixtures.ts";

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

  for (const spelling of DEFAULT_SPELLINGS) {
    it(`reads the runtime's default profile, spelled ${JSON.stringify(spelling)}, as the host's default model`, async () => {
      // Arrange
      const { service, picker } = pickerOverServices();
      service.reply = { profile: { value: spelling, reason: "no-answer", picked: null, probability: null } };

      // Act
      const answer = await picker.pick(REQUEST, OPTIONS);

      // Assert
      deepStrictEqual(answer, { value: null, reason: "no-answer", picked: null, probability: null });
    });
  }

  it("reads a pick and a probability of the wrong type as absent", async () => {
    // Arrange
    const { service, picker } = pickerOverServices();
    service.reply = MISTYPED_PICK;

    // Act
    const answer = await picker.pick(REQUEST, OPTIONS);

    // Assert
    deepStrictEqual(answer, { value: "small", reason: "model", picked: null, probability: null });
  });

  it("sends the floor with the other bounds", async () => {
    // Arrange
    const { service, picker } = pickerOverServices();

    // Act
    await picker.pick(REQUEST, ALL_BOUNDS);

    // Assert
    deepStrictEqual(service.calls[0].options, { profile: { ladder: ["small", "medium", "large"], floor: "medium", ceiling: "large", fallback: "large" } });
  });

  it("looks the service up at each pick, not when it is created", async () => {
    // Arrange
    const services = new FakeServiceLocator();
    const picker = createServicesProfilePicker(services);
    services.services.set("pick", new FakePickService());

    // Act
    const answer = await picker.pick(REQUEST, OPTIONS);

    // Assert
    deepStrictEqual(answer, MODEL_PICK);
  });

  it("answers nothing when the service has no pick to call", async () => {
    // Arrange
    const services = new FakeServiceLocator();
    services.services.set("pick", {});

    // Act
    const answer = await createServicesProfilePicker(services).pick(REQUEST, OPTIONS);

    // Assert
    strictEqual(answer, null);
  });

  it("answers the runtime's message as a refusal when it refuses an option", async () => {
    // Arrange
    const { service, picker } = pickerOverServices();
    service.failure = new Error(REFUSED_LADDER);

    // Act
    const answer = await picker.pick(REQUEST, OPTIONS);

    // Assert
    deepStrictEqual(answer, { refused: REFUSED_LADDER });
  });

  it("answers a refusal, and throws nothing, when the lookup of the service throws", async () => {
    // Arrange
    const { services, picker } = pickerOverServices();
    services.failure = new Error(LOCATOR_GONE);

    // Act
    const answer = await picker.pick(REQUEST, OPTIONS);

    // Assert
    deepStrictEqual(answer, { refused: LOCATOR_GONE });
  });

  for (const c of CANCELLATIONS) {
    it(`${c.name}, from the pick service`, async () => {
      // Arrange
      const { service, picker } = pickerOverServices();
      service.failure = c.failure;

      // Act
      const answer = await picker.pick(REQUEST, OPTIONS);

      // Assert
      strictEqual(answer, null);
    });
  }

  it("answers the runtime's sentence as a refusal when the pick service rejects with it", async () => {
    // Arrange
    const { service, picker } = pickerOverServices();
    service.failure = new Error(NO_PICK_WIRED);

    // Act
    const answer = await picker.pick(REQUEST, OPTIONS);

    // Assert
    deepStrictEqual(answer, { refused: NO_PICK_WIRED });
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

  it("sends ctx.llm.pick the request, and the options as the profile part", async () => {
    // Arrange
    const { service, picker } = pickerOverLlm();

    // Act
    await picker.pick(REQUEST, ALL_BOUNDS);

    // Assert
    deepStrictEqual(service.calls, [
      { request: REQUEST, options: { profile: { ladder: ["small", "medium", "large"], floor: "medium", ceiling: "large", fallback: "large" } } },
    ]);
  });

  it("answers the runtime's message as a refusal when ctx.llm.pick throws", async () => {
    // Arrange
    const { service, picker } = pickerOverLlm();
    service.failure = new Error(REFUSED_FLOOR);

    // Act
    const answer = await picker.pick(REQUEST, OPTIONS);

    // Assert
    deepStrictEqual(answer, { refused: REFUSED_FLOOR });
  });

  it("answers a refusal, and throws nothing, when ctx.llm.pick cannot be read", async () => {
    // Arrange
    const picker = createLlmProfilePicker(llmWhosePickThrows());

    // Act
    const answer = await picker.pick(REQUEST, OPTIONS);

    // Assert
    deepStrictEqual(answer, { refused: LOCATOR_GONE });
  });

  it("answers nothing, and no refusal, when ctx.llm.pick says the host wires no pick", async () => {
    // Arrange
    const { service, picker } = pickerOverLlm();
    service.failure = { toString: () => NO_PICK_WIRED };

    // Act
    const answer = await picker.pick(REQUEST, OPTIONS);

    // Assert
    strictEqual(answer, null);
  });

  for (const c of CANCELLATIONS) {
    it(`${c.name}, from ctx.llm.pick`, async () => {
      // Arrange
      const { service, picker } = pickerOverLlm();
      service.failure = c.failure;

      // Act
      const answer = await picker.pick(REQUEST, OPTIONS);

      // Assert
      strictEqual(answer, null);
    });
  }
});
