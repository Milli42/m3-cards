import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeAssistant } from "./types";
import { LIGHTS_OVERVIEW_COLOR_OFF, LIGHTS_OVERVIEW_FAN_COLOR } from "./const";
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
    ["on", "#7F33CA", "#333333", undefined],
    ["on", undefined, undefined, undefined],
    ["off", "#7F33CA", "#333333", 35],
    ["off", undefined, undefined, undefined],
  ])("colors the slider for fan state %s with fan_color %s and off_color %s", async (state, fanColor, offColor, tileTintOpacity) => {
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
      off_color: offColor,
      fan_color: fanColor,
      tile_tint_opacity: tileTintOpacity,
    });
    Reflect.set(card, "_fanPopup", true);
    card.hass = {
      states: {
        "fan.office": { entity_id: "fan.office", state, attributes: { percentage: 45 } },
      },
    } as unknown as HomeAssistant;

    const findStyle = (value: unknown, prefix: string): string | undefined => {
      if (typeof value === "string" && value.startsWith(prefix)) return value;
      if (Array.isArray(value)) return value.map((item) => findStyle(item, prefix)).find(Boolean);
      if (value && typeof value === "object" && "values" in value) {
        const values = value.values;
        if (Array.isArray(values) && values.length === 3 && Array.isArray(values[0]) && typeof values[2] === "function") {
          return findStyle(values[0].map(values[2] as (tile: unknown) => unknown), prefix);
        }
        return findStyle(values, prefix);
      }
    };
    const rendered = card.render();
    const sliderStyle = findStyle(rendered, "--slider-color:");
    if (state === "on") {
      expect(sliderStyle).toBe(
        `--slider-color: ${fanColor ?? LIGHTS_OVERVIEW_FAN_COLOR}; --slider-track-color: color-mix(in srgb, var(--slider-color) 20%, transparent); --brightness: 45%;`,
      );
    } else {
      const tileStyle = findStyle(rendered, `--tile-color: ${offColor ?? LIGHTS_OVERVIEW_COLOR_OFF};`);
      expect(tileStyle).toBeDefined();
      const tint = tileStyle?.split("; background: ")[1]?.slice(0, -1);
      expect(tint).toBeTruthy();
      expect(sliderStyle).toBe(`--slider-color: ${tint}; --slider-track-color: ${tint}; --brightness: 0%;`);
    }
  });
});
