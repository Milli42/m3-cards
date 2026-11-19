import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeAssistant } from "./types";
import { LIGHTS_OVERVIEW_FAN_COLOR } from "./const";
import { resolveThemeColor } from "./shared/color-config";

function tileColors(value: unknown): string[] {
  if (typeof value === "string" && value.startsWith("--tile-color:")) {
    return [value.split(";")[0]];
  }
  if (Array.isArray(value)) return value.flatMap(tileColors);
  if (value && typeof value === "object" && "values" in value) return tileColors(value.values);
  return [];
}

describe("Lights Overview fan color", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [undefined, LIGHTS_OVERVIEW_FAN_COLOR],
    ["primary", resolveThemeColor("primary")],
    ["#7F33CA", "#7F33CA"],
  ])("uses fan_color %s independently of the light color", async (fanColor, expected) => {
    vi.stubGlobal("window", new EventTarget());
    const { M3LightsOverviewCard } = await import("./m3-lights-overview-card");
    class TestCard extends M3LightsOverviewCard {
      public render() {
        return super.render();
      }
    }
    const card = new TestCard();
    card.setConfig({
      type: "custom:m3-lights-overview-card",
      rooms: [{ name: "Office", entities: ["light.office"] }],
      on_color: "#FFAA00",
      fan_color: fanColor,
    });
    card.hass = {
      states: {
        "light.office": { entity_id: "light.office", state: "on", attributes: {} },
        "fan.office": { entity_id: "fan.office", state: "on", attributes: {} },
      },
    } as unknown as HomeAssistant;
    expect(tileColors(card.render())).toEqual([
      `--tile-color: ${expected}`,
      "--tile-color: #FFAA00",
    ]);
  });
});

describe("Lights Overview fan speed slider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["on", "#7F33CA", "#7F33CA", "45%"],
    ["off", "#7F33CA", "#7F33CA", "0%"],
    ["off", undefined, LIGHTS_OVERVIEW_FAN_COLOR, "0%"],
  ])("uses the fan color with fan state %s and fan_color %s", async (state, fanColor, expected, level) => {
    vi.stubGlobal("window", new EventTarget());
    const { M3LightsOverviewCard } = await import("./m3-lights-overview-card");
    class TestCard extends M3LightsOverviewCard {
      public render() {
        return super.render();
      }
    }
    const card = new TestCard();
    card.setConfig({
      type: "custom:m3-lights-overview-card",
      rooms: [{ name: "Fans", entities: ["fan.office"] }],
      view: "entities",
      show_fans: false,
      show_brightness_slider: true,
      on_color: "#FFAA00",
      off_color: "#333333",
      fan_color: fanColor,
    });
    Reflect.set(card, "_fanPopup", true);
    card.hass = {
      states: {
        "fan.office": { entity_id: "fan.office", state, attributes: { percentage: 45 } },
      },
    } as unknown as HomeAssistant;

    const findSliderStyle = (value: unknown): string | undefined => {
      if (typeof value === "string" && value.startsWith("--slider-color:")) return value;
      if (Array.isArray(value)) return value.map(findSliderStyle).find(Boolean);
      if (value && typeof value === "object" && "values" in value) {
        const values = value.values;
        if (Array.isArray(values) && values.length === 3 && Array.isArray(values[0]) && typeof values[2] === "function") {
          return findSliderStyle(values[0].map(values[2] as (tile: unknown) => unknown));
        }
        return findSliderStyle(values);
      }
    };
    expect(findSliderStyle(card.render())).toBe(`--slider-color: ${expected}; --brightness: ${level};`);
  });
});
