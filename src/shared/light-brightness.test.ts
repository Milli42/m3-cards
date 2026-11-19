import { describe, it, expect } from "vitest";
import type { HassEntity } from "../types";
import {
  clampLightBrightnessPercent,
  hasDimmableColorMode,
  isDimmableLight,
  lightBrightnessPercent,
} from "./light-brightness";

function entity(entity_id: string, attributes: HassEntity["attributes"], state = "on"): HassEntity {
  return { entity_id, state, attributes, last_changed: "", last_updated: "" };
}

describe("light brightness", () => {
  it("recognizes a light with a mode other than on/off", () => {
    expect(hasDimmableColorMode(["onoff", "color_temp"])).toBe(true);
    expect(isDimmableLight(entity("light.desk", { supported_color_modes: ["brightness"] }))).toBe(true);
  });

  it("excludes switches, on/off lights and lights with no supported modes", () => {
    expect(isDimmableLight(entity("switch.desk", { supported_color_modes: ["brightness"] }))).toBe(false);
    expect(isDimmableLight(entity("light.desk", { supported_color_modes: ["onoff"] }))).toBe(false);
    expect(isDimmableLight(entity("light.desk", { brightness: 128 }))).toBe(false);
    expect(hasDimmableColorMode([])).toBe(false);
  });

  it("converts on-state brightness to a percentage and displays off as empty", () => {
    expect(lightBrightnessPercent(entity("light.desk", { brightness: 128 }))).toBe(50);
    expect(lightBrightnessPercent(entity("light.desk", { brightness: 255 }))).toBe(100);
    expect(lightBrightnessPercent(entity("light.desk", { brightness: 128 }, "off"))).toBe(0);
    expect(lightBrightnessPercent(entity("light.desk", {}))).toBe(0);
  });

  it("rounds adjustments and keeps them within the turn-on range", () => {
    expect(clampLightBrightnessPercent(0)).toBe(1);
    expect(clampLightBrightnessPercent(34.7)).toBe(35);
    expect(clampLightBrightnessPercent(105)).toBe(100);
  });
});
