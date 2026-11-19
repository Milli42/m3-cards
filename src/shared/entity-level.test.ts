import { describe, it, expect } from "vitest";
import type { HassEntity } from "../types";
import { entityLevel } from "./entity-level";

function entity(entity_id: string, attributes: HassEntity["attributes"], state = "on"): HassEntity {
  return { entity_id, state, attributes, last_changed: "", last_updated: "" };
}

describe("entityLevel", () => {
  it("retains the light brightness service and minimum", () => {
    const level = entityLevel(entity("light.desk", { supported_color_modes: ["brightness"], brightness: 128 }));
    expect(level).toMatchObject({ domain: "light", service: "turn_on", field: "brightness_pct", value: 50, step: 5 });
    expect(level?.snap(0)).toBe(1);
  });

  it("detects fan speed through SET_SPEED or a percentage attribute", () => {
    expect(entityLevel(entity("fan.office", { supported_features: 3 }))).toBeDefined();
    expect(entityLevel(entity("fan.office", { percentage: null }))).toBeDefined();
    expect(entityLevel(entity("fan.office", { supported_features: 2 }))).toBeUndefined();
  });

  it("snaps a three-speed fan to its reported fractional steps", () => {
    const level = entityLevel(entity("fan.office", { percentage_step: 33.33, percentage: 66 }, "off"));
    expect(level).toMatchObject({ domain: "fan", service: "set_percentage", field: "percentage", value: 0, step: 33.33 });
    expect(level?.snap(0)).toBe(33.33);
    expect(level?.snap(53)).toBe(66.66);
    expect(level?.snap(90)).toBe(100);
    expect(level?.snap(100)).toBe(100);
  });

  it("uses the on-state fan percentage and integer steps when no step is reported", () => {
    const level = entityLevel(entity("fan.office", { percentage: 45 }));
    expect(level?.value).toBe(45);
    expect(level?.snap(45.6)).toBe(46);
  });
});
